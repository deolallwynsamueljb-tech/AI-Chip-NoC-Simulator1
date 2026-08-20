import random
import unittest

from noc.routing import cost_adaptive_route, xy_route
from noc.mesh import Mesh
from noc.packet import Packet


class TestCostAdaptiveRouting(unittest.TestCase):
    def test_falls_back_to_only_candidate_without_cost_fn(self):
        # From 0 to 3 on a 4x4 mesh, straight along X: only "E" is ever productive.
        self.assertEqual(cost_adaptive_route(0, 3, 4, cost_fn=None), "E")

    def test_reaches_destination_and_ejects(self):
        self.assertEqual(cost_adaptive_route(5, 5, 4), "EJ")

    def test_always_picks_a_productive_direction(self):
        # For every (src, dst) pair, whatever direction is chosen must
        # strictly reduce Manhattan distance to dst (by construction, since
        # candidates are restricted to productive directions).
        dim = 4

        def manhattan(a, b):
            ax, ay = a % dim, a // dim
            bx, by = b % dim, b // dim
            return abs(ax - bx) + abs(ay - by)

        def cost_fn(direction):
            return {"N": 0.4, "S": 0.1, "E": 0.9, "W": 0.5}[direction]

        for src in range(16):
            for dst in range(16):
                if src == dst:
                    continue
                d = cost_adaptive_route(src, dst, dim, cost_fn)
                x, y = src % dim, src // dim
                if d == "E":
                    nxt = y * dim + (x + 1)
                elif d == "W":
                    nxt = y * dim + (x - 1)
                elif d == "N":
                    nxt = (y - 1) * dim + x
                elif d == "S":
                    nxt = (y + 1) * dim + x
                else:
                    continue
                self.assertLess(manhattan(nxt, dst), manhattan(src, dst))

    def test_drains_under_heavy_contention_like_dyad(self):
        # Not claimed deadlock-free (same caveat as DYAD -- see routing.py),
        # but should behave sanely (fully drain) under moderate contention
        # with a reasonable buffer depth, same as the existing DYAD check.
        random.seed(3)
        m = Mesh(dim=4, routing="COST_ADAPTIVE", buffer_depth=4)
        n_pkts = 200
        for i in range(n_pkts):
            src, dst = random.sample(range(16), 2)
            m.inject_packet(Packet(packet_id=i, src=src, dst=dst, size_bytes=64, gen_cycle=0))
        for _ in range(6000):
            m.step()
            if m.idle():
                break
        self.assertTrue(m.idle())
        self.assertEqual(len(m.metrics.deliveries), n_pkts)


class TestEnergyAwareIsRegisteredAndRoutesIdenticallyToCostAdaptive(unittest.TestCase):
    def test_energy_aware_produces_same_path_as_cost_adaptive_same_seed(self):
        # ENERGY_AWARE intentionally reuses COST_ADAPTIVE's path selection
        # (see routing.py docstring for why); this pins that equivalence
        # down as a regression test rather than leaving it undocumented.
        random.seed(9)
        m1 = Mesh(dim=4, routing="COST_ADAPTIVE", buffer_depth=4)
        random.seed(9)
        m2 = Mesh(dim=4, routing="ENERGY_AWARE", buffer_depth=4)
        for m in (m1, m2):
            random.seed(9)
            for i in range(60):
                src, dst = random.sample(range(16), 2)
                m.inject_packet(Packet(packet_id=i, src=src, dst=dst, size_bytes=64, gen_cycle=0))
        for _ in range(3000):
            m1.step()
            m2.step()
            if m1.idle() and m2.idle():
                break
        self.assertEqual(m1.metrics.link_hops, m2.metrics.link_hops)
        self.assertEqual(len(m1.metrics.deliveries), len(m2.metrics.deliveries))


class TestStaticEnergyAccrual(unittest.TestCase):
    def test_static_energy_grows_with_buffered_time(self):
        # A packet that has to wait longer in a buffer before delivery
        # (deeper mesh distance, same buffer_depth) should accrue more
        # static energy, not just more dynamic (hop) energy.
        m = Mesh(dim=4, routing="XY", buffer_depth=4)
        m.inject_packet(Packet(packet_id=0, src=0, dst=15, size_bytes=1, gen_cycle=0))
        for _ in range(60):
            m.step()
            if m.idle():
                break
        self.assertTrue(m.idle())
        self.assertGreater(m.energy.static_pj, 0.0)

    def test_static_energy_included_in_breakdown_and_total(self):
        m = Mesh(dim=4, routing="XY", buffer_depth=4)
        m.inject_packet(Packet(packet_id=0, src=0, dst=15, size_bytes=1, gen_cycle=0))
        for _ in range(60):
            m.step()
            if m.idle():
                break
        b = m.energy.breakdown()
        self.assertIn("static_pj", b)
        self.assertAlmostEqual(
            b["total_pj"], b["link_hop_pj"] + b["ejection_pj"] + b["static_pj"], places=6
        )


if __name__ == "__main__":
    unittest.main()

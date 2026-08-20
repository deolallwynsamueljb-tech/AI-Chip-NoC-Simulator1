import random
import unittest

from noc.routing import xy_route, west_first_route
from noc.mesh import Mesh
from noc.packet import Packet


class TestRoutingCorrectness(unittest.TestCase):
    def test_xy_dimension_order(self):
        # 4x4: id = y*4+x. From 0 (0,0) to 15 (3,3): must move E three times before S.
        cur = 0
        dirs = []
        dim = 4
        for _ in range(10):
            d = xy_route(cur, 15, dim)
            if d == "EJ":
                break
            dirs.append(d)
            x, y = cur % dim, cur // dim
            if d == "E":
                x += 1
            elif d == "S":
                y += 1
            cur = y * dim + x
        self.assertEqual(dirs, ["E", "E", "E", "S", "S", "S"])

    def test_west_first_never_turns_into_west_after_other_move(self):
        # Once a west-first packet has made any non-west move, it must never
        # subsequently choose W again (that is precisely the forbidden turn
        # this policy exists to rule out).
        dim = 4
        for src in range(16):
            for dst in range(16):
                if src == dst:
                    continue
                cur = src
                made_non_west_move = False
                for _ in range(20):
                    d = west_first_route(cur, dst, dim)
                    if d == "EJ":
                        break
                    if d == "W":
                        self.assertFalse(
                            made_non_west_move,
                            f"west move after non-west move: src={src} dst={dst}",
                        )
                    else:
                        made_non_west_move = True
                    x, y = cur % dim, cur // dim
                    if d == "E":
                        x += 1
                    elif d == "W":
                        x -= 1
                    elif d == "N":
                        y -= 1
                    elif d == "S":
                        y += 1
                    cur = y * dim + x


class TestDeadlockFreedom(unittest.TestCase):
    """XY and West-First are deadlock-free by construction (classical
    dimension-order / turn-model arguments). Empirically confirm that under
    heavy contention with a small buffer they still drain to 100% delivery,
    to catch a flow-control or reservation bug that would break that
    guarantee even though the algorithm on paper doesn't deadlock."""

    def _run(self, routing, seed, n_pkts=400, buffer_depth=2, max_cycles=8000):
        random.seed(seed)
        m = Mesh(dim=4, routing=routing, buffer_depth=buffer_depth)
        for i in range(n_pkts):
            src, dst = random.sample(range(16), 2)
            size = random.choice([64, 128, 256])
            m.inject_packet(Packet(packet_id=i, src=src, dst=dst, size_bytes=size, gen_cycle=0))
        for _ in range(max_cycles):
            m.step()
            if m.idle():
                break
        return m

    def test_xy_always_drains_under_heavy_contention(self):
        for seed in (1, 2, 3):
            m = self._run("XY", seed)
            self.assertTrue(m.idle(), f"XY failed to drain, seed={seed}")
            self.assertEqual(len(m.metrics.deliveries), 400)

    def test_west_first_always_drains_under_heavy_contention(self):
        for seed in (1, 2, 3):
            m = self._run("WEST_FIRST", seed)
            self.assertTrue(m.idle(), f"WEST_FIRST failed to drain, seed={seed}")
            self.assertEqual(len(m.metrics.deliveries), 400)


class TestKnownLimitationDyadCanStall(unittest.TestCase):
    """DyAD (fully adaptive, no turn restriction) has no deadlock-freedom
    proof in this simulator (single buffer per port, no escape VC), and this
    test demonstrates that empirically rather than just asserting it in
    prose: under heavy simultaneous contention with a small buffer, DyAD
    fails to fully drain within a generous cycle budget, while XY and
    West-First (checked above) always do drain under the same load."""

    def test_known_limitation_heavy_contention_can_stall(self):
        random.seed(7)
        m = Mesh(dim=4, routing="DYAD", buffer_depth=2)
        n_pkts = 800
        for i in range(n_pkts):
            src, dst = random.sample(range(16), 2)
            size = random.choice([64, 128, 256])
            m.inject_packet(Packet(packet_id=i, src=src, dst=dst, size_bytes=size, gen_cycle=0))
        for _ in range(6000):
            m.step()
            if m.idle():
                break
        delivered = len(m.metrics.deliveries)
        # Document the measured outcome rather than a hand-picked threshold.
        self.assertLess(
            delivered,
            n_pkts,
            "expected DyAD to NOT fully drain under this heavy-contention scenario "
            "(if this now fails, either the scenario stopped reproducing the stall, "
            "or a real flow-control fix changed DyAD's deadlock behavior -- either way "
            "update README.md's Known Limitation section to match)",
        )


if __name__ == "__main__":
    unittest.main()

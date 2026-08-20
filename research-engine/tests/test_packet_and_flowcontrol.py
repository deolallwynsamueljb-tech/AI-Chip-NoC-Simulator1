import unittest

from noc.packet import Packet, FlitType, FLIT_PAYLOAD_BYTES
from noc.mesh import Mesh, IN_PORTS


class TestFlitSegmentation(unittest.TestCase):
    def test_single_flit_packet(self):
        p = Packet(packet_id=0, src=0, dst=1, size_bytes=1, gen_cycle=0)
        flits = p.make_flits()
        self.assertEqual(len(flits), 1)
        self.assertEqual(flits[0].ftype, FlitType.SINGLE)

    def test_exact_multiple_of_flit_size(self):
        p = Packet(packet_id=0, src=0, dst=1, size_bytes=4 * FLIT_PAYLOAD_BYTES, gen_cycle=0)
        flits = p.make_flits()
        self.assertEqual(len(flits), 4)
        self.assertEqual(flits[0].ftype, FlitType.HEAD)
        self.assertEqual([f.ftype for f in flits[1:-1]], [FlitType.BODY, FlitType.BODY])
        self.assertEqual(flits[-1].ftype, FlitType.TAIL)

    def test_non_multiple_rounds_up(self):
        p = Packet(packet_id=0, src=0, dst=1, size_bytes=FLIT_PAYLOAD_BYTES + 1, gen_cycle=0)  # needs 2 flits
        flits = p.make_flits()
        self.assertEqual(len(flits), 2)

    def test_flit_src_dst_never_swapped_regression(self):
        """Every flit of a packet must carry the packet's own src/dst, not
        each other's. This is a cheap, high-value invariant to pin down:
        a positional-argument mistake in make_flits() would silently swap
        or corrupt these fields without raising anything, and a packet
        with a corrupted dst would misroute or self-deliver at the source
        without an obvious symptom in aggregate stats."""
        p = Packet(packet_id=5, src=3, dst=12, size_bytes=64, gen_cycle=0)
        for f in p.make_flits():
            self.assertEqual(f.src, 3)
            self.assertEqual(f.dst, 12)
            self.assertEqual(f.packet_id, 5)


class TestSingleDelivery(unittest.TestCase):
    def test_known_path_hop_count(self):
        # node 0 = (0,0), node 15 = (3,3) on a 4x4 mesh -> 3 E hops + 3 S hops = 6 hops (XY)
        m = Mesh(dim=4, routing="XY", buffer_depth=4)
        pkt = Packet(packet_id=0, src=0, dst=15, size_bytes=4 * FLIT_PAYLOAD_BYTES, gen_cycle=0)
        num_flits = pkt.num_flits()
        m.inject_packet(pkt)
        for _ in range(60):
            m.step()
            if m.idle():
                break
        self.assertTrue(m.idle())
        self.assertEqual(len(m.metrics.deliveries), 1)
        self.assertEqual(m.metrics.link_hops, num_flits * 6)
        self.assertEqual(m.metrics.deliveries[0].latency, m.metrics.deliveries[0].delivered_cycle + 1 - 0)

    def test_self_addressed_packet_delivers_immediately(self):
        m = Mesh(dim=4, routing="XY", buffer_depth=4)
        pkt = Packet(packet_id=0, src=5, dst=5, size_bytes=1, gen_cycle=0)
        m.inject_packet(pkt)
        for _ in range(10):
            m.step()
            if m.idle():
                break
        self.assertEqual(len(m.metrics.deliveries), 1)
        self.assertEqual(m.metrics.link_hops, 0)  # never touches a link, only INJ -> EJ


class TestFlowControlInvariants(unittest.TestCase):
    def test_buffers_never_exceed_depth_under_contention(self):
        import random

        random.seed(1)
        depth = 2
        m = Mesh(dim=4, routing="XY", buffer_depth=depth)
        for i in range(150):
            src, dst = random.sample(range(16), 2)
            m.inject_packet(
                Packet(packet_id=i, src=src, dst=dst, size_bytes=random.choice([16, 64, 128]), gen_cycle=0)
            )
        violations = []
        for _ in range(3000):
            m.step()
            for r in m.routers.values():
                for port in IN_PORTS:
                    if len(r.in_buffers[port]) > depth:
                        violations.append((r.node_id, port, len(r.in_buffers[port])))
            if m.idle():
                break
        self.assertEqual(violations, [])
        self.assertTrue(m.idle(), "all 150 packets should drain under XY (deadlock-free)")

    def test_no_flit_or_packet_loss_conservation(self):
        """Every flit that is created must eventually be ejected exactly
        once -- total flits created (sum over packets of num_flits) must
        equal total ejection events when the run drains to idle."""
        import random

        random.seed(2)
        m = Mesh(dim=4, routing="WEST_FIRST", buffer_depth=3)
        total_flits_expected = 0
        n_pkts = 120
        for i in range(n_pkts):
            src, dst = random.sample(range(16), 2)
            size = random.choice([16, 32, 64, 96, 130])
            pkt = Packet(packet_id=i, src=src, dst=dst, size_bytes=size, gen_cycle=0)
            total_flits_expected += pkt.num_flits()
            m.inject_packet(pkt)
        for _ in range(4000):
            m.step()
            if m.idle():
                break
        self.assertTrue(m.idle())
        self.assertEqual(m.metrics.ejections, total_flits_expected)
        self.assertEqual(len(m.metrics.deliveries), n_pkts)


if __name__ == "__main__":
    unittest.main()

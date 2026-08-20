"""Stats collection for one Mesh simulation run."""

from dataclasses import dataclass, field


@dataclass
class DeliveryRecord:
    packet_id: int
    src: int
    dst: int
    latency: int
    delivered_cycle: int
    op: str
    layer: str


class Metrics:
    def __init__(self):
        self.deliveries = []
        self.link_hops = 0
        self.ejections = 0
        self.occupancy_samples = []  # (cycle, total_occupied_slots, total_capacity)

    def record_link_hop(self):
        self.link_hops += 1

    def record_ejection(self):
        self.ejections += 1

    def record_delivery(self, flit, latency, cycle):
        self.deliveries.append(
            DeliveryRecord(flit.packet_id, flit.src, flit.dst, latency, cycle, flit.op, flit.layer)
        )

    def sample_occupancy(self, mesh, cycle, every=10):
        if cycle % every:
            return
        occ = sum(len(r.in_buffers[p]) for r in mesh.routers.values() for p in r.in_buffers)
        cap = sum(r.buffer_depth for r in mesh.routers.values() for _ in r.in_buffers)
        self.occupancy_samples.append((cycle, occ, cap))

    def summary(self, packets_expected):
        n = len(self.deliveries)
        lat = [d.latency for d in self.deliveries]
        completed_cycle = max((d.delivered_cycle for d in self.deliveries), default=0)
        return {
            "packets_delivered": n,
            "packets_expected": packets_expected,
            "delivery_ratio": (n / packets_expected) if packets_expected else float("nan"),
            "avg_latency": (sum(lat) / n) if n else float("nan"),
            "max_latency": max(lat) if lat else float("nan"),
            "min_latency": min(lat) if lat else float("nan"),
            "completed_cycle": completed_cycle,
            "throughput_pkts_per_cycle": (n / completed_cycle) if completed_cycle else 0.0,
            "link_hops": self.link_hops,
            "avg_occupancy_ratio": (
                sum(o / c for _, o, c in self.occupancy_samples) / len(self.occupancy_samples)
                if self.occupancy_samples
                else float("nan")
            ),
        }

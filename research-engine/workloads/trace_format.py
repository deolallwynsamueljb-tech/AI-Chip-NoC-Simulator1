"""Common trace schema shared by every workload generator, plus CSV I/O.

A trace is a flat, time-ordered list of TraceEvent rows. Each row is exactly
one Packet that will later be injected into the mesh at cycle `inject_cycle`
from PE `src` to PE `dst`. Nothing in this file knows about routing or the
mesh -- workload generators only decide WHO talks to WHOM, WHEN, and HOW
MUCH, based on the real architecture of the model they represent.
"""

import csv
from dataclasses import dataclass, asdict

FIELDS = ["inject_cycle", "packet_id", "src", "dst", "size_bytes", "op", "layer"]


@dataclass
class TraceEvent:
    inject_cycle: int
    packet_id: int
    src: int
    dst: int
    size_bytes: int
    op: str
    layer: str


def save_trace(events, path):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for e in events:
            w.writerow(asdict(e))


def load_trace(path):
    events = []
    with open(path, newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            events.append(
                TraceEvent(
                    inject_cycle=int(row["inject_cycle"]),
                    packet_id=int(row["packet_id"]),
                    src=int(row["src"]),
                    dst=int(row["dst"]),
                    size_bytes=int(row["size_bytes"]),
                    op=row["op"],
                    layer=row["layer"],
                )
            )
    return events


def validate_trace(events, dim):
    """Raise AssertionError on any structural problem. Returns a summary dict
    on success so callers can print/log it without a second pass."""
    n = len(events)
    assert n > 0, "trace is empty"
    ids = set()
    for e in events:
        assert 0 <= e.src < dim * dim, f"src {e.src} out of range for dim={dim}"
        assert 0 <= e.dst < dim * dim, f"dst {e.dst} out of range for dim={dim}"
        assert e.src != e.dst, f"packet {e.packet_id} has src == dst == {e.src}"
        assert e.size_bytes > 0, f"packet {e.packet_id} has non-positive size"
        assert e.inject_cycle >= 0, f"packet {e.packet_id} has negative inject_cycle"
        assert e.packet_id not in ids, f"duplicate packet_id {e.packet_id}"
        ids.add(e.packet_id)
    total_bytes = sum(e.size_bytes for e in events)
    unique_pairs = {(e.src, e.dst) for e in events}
    ops = sorted({e.op for e in events})
    return {
        "num_events": n,
        "total_bytes": total_bytes,
        "avg_size_bytes": total_bytes / n,
        "unique_src_dst_pairs": len(unique_pairs),
        "ops": ops,
        "span_cycles": max(e.inject_cycle for e in events) - min(e.inject_cycle for e in events),
    }


def renumber_packet_ids(events, start=0):
    """Return a copy of events with packet_id reassigned 0..N-1 in existing
    order, for merging traces from independently-built generators."""
    out = []
    for i, e in enumerate(events, start=start):
        out.append(TraceEvent(e.inject_cycle, i, e.src, e.dst, e.size_bytes, e.op, e.layer))
    return out


def offset_cycles(events, offset):
    return [TraceEvent(e.inject_cycle + offset, e.packet_id, e.src, e.dst, e.size_bytes, e.op, e.layer) for e in events]

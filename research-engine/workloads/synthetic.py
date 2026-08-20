"""Synthetic uniform-random Bernoulli injection traffic.

Unlike the other four generators (resnet18/bert/gemm/sparse_gemm), this one
is not derived from any real model architecture -- it exists purely to run
the classical NoC evaluation methodology (sweep average/max latency and
throughput against injection rate) that the four architecture-derived traces
can't run, since their traffic volume and timing are fixed by the model they
represent, not by a tunable rate. Every source PE independently injects one
packet per cycle with probability `injection_rate` (a standard Bernoulli
uniform-random traffic model), destined for a uniformly random other PE.
"""

import random

from workloads.trace_format import TraceEvent

DEFAULT_PACKET_SIZE_BYTES = 64


def generate_synthetic_trace(dim=4, injection_rate=0.1, duration_cycles=2000, seed=0, packet_size_bytes=DEFAULT_PACKET_SIZE_BYTES):
    assert 0.0 < injection_rate <= 1.0, "injection_rate must be in (0, 1]"
    rng = random.Random(seed)
    num_pes = dim * dim
    events = []
    pid = 0
    for cycle in range(duration_cycles):
        for src in range(num_pes):
            if rng.random() < injection_rate:
                dst = rng.randrange(num_pes - 1)
                if dst >= src:
                    dst += 1
                events.append(TraceEvent(cycle, pid, src, dst, packet_size_bytes, "SYNTHETIC_UNIFORM", "synthetic"))
                pid += 1
    return events


if __name__ == "__main__":
    import sys
    from workloads.trace_format import save_trace, validate_trace

    rate = float(sys.argv[1]) if len(sys.argv) > 1 else 0.1
    ev = generate_synthetic_trace(dim=4, injection_rate=rate)
    print(validate_trace(ev, dim=4))
    save_trace(ev, sys.argv[2] if len(sys.argv) > 2 else f"traces/synthetic_{rate}.csv")

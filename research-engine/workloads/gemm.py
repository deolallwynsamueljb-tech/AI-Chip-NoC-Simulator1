"""Dense GEMM (C = A x B) communication trace via Cannon's algorithm.

Cannon's algorithm tiles A and B onto a sqrt(P) x sqrt(P) process grid --
with a dim x dim mesh this maps exactly 1:1 onto the physical mesh (p =
dim), which is precisely why Cannon's algorithm is the textbook way to run
GEMM on a 2D mesh interconnect, not an arbitrary choice for this project.

Algorithm (standard form): initial skew -- row i of the A tiles is shifted
left by i, column j of the B tiles is shifted up by j -- then p steps of
{local multiply-accumulate, shift A left by 1, shift B up by 1}. Cannon's
algorithm classically assumes a torus (wraparound links); this simulator's
mesh has no physical wraparound links, so a "wraparound" shift here is
realized as whatever path the active routing policy finds across the plain
mesh (usually the long way around the row/column) rather than a single
dedicated hop. That is a reasonable and common practical substitution --
most manufactured mesh NoCs are not full tori either, for the same layout
cost reasons.

Traffic character: fully deterministic, regular, and neighbor-to-neighbor
(with the wraparound caveat above), giving high, bursty, structured
bandwidth -- a third distinct pattern from CNN's bounded halo exchange and
the transformer's global all-to-all.

`num_repeats` runs the same GEMM shape back-to-back `num_repeats` times,
standing in for a real pipeline issuing several matmuls in sequence (e.g.
consecutive MLP/attention-projection GEMMs), so the trace is long enough to
be a meaningful NoC workload rather than one single tiny burst.
"""

from workloads.trace_format import TraceEvent

BYTES_PER_ELEM = 2  # bf16
COMPUTE_GAP_CYCLES = 8
EVENT_CYCLE_STRIDE = 1


def generate_gemm_trace(dim=4, matrix_size=64, num_repeats=6, start_cycle=0):
    p = dim
    assert matrix_size % p == 0, "matrix_size must divide evenly by dim"
    tile = matrix_size // p
    tile_bytes = max(1, tile * tile * BYTES_PER_ELEM)

    events = []
    pid = 0
    cycle = start_cycle

    for rep in range(num_repeats):
        layer_name = f"gemm_rep{rep}"

        # Initial skew: row i shifted left i times, column j shifted up j times.
        for shift_step in range(1, p):
            for y in range(p):
                if y >= shift_step:
                    for x in range(p):
                        pe = y * p + x
                        dst = y * p + ((x - 1) % p)
                        events.append(TraceEvent(cycle, pid, pe, dst, tile_bytes, "GEMM_SKEW_A", layer_name))
                        pid += 1
            for x in range(p):
                if x >= shift_step:
                    for y in range(p):
                        pe = y * p + x
                        dst = ((y - 1) % p) * p + x
                        events.append(TraceEvent(cycle, pid, pe, dst, tile_bytes, "GEMM_SKEW_B", layer_name))
                        pid += 1
            cycle += EVENT_CYCLE_STRIDE
        cycle += COMPUTE_GAP_CYCLES

        # Main loop: p steps of {local MAC (no traffic), shift A west by 1, shift B north by 1}.
        for _ in range(p):
            for y in range(p):
                for x in range(p):
                    pe = y * p + x
                    dst = y * p + ((x - 1) % p)
                    events.append(TraceEvent(cycle, pid, pe, dst, tile_bytes, "GEMM_SHIFT_A", layer_name))
                    pid += 1
            for x in range(p):
                for y in range(p):
                    pe = y * p + x
                    dst = ((y - 1) % p) * p + x
                    events.append(TraceEvent(cycle, pid, pe, dst, tile_bytes, "GEMM_SHIFT_B", layer_name))
                    pid += 1
            cycle += EVENT_CYCLE_STRIDE
            cycle += COMPUTE_GAP_CYCLES

    return events


if __name__ == "__main__":
    import sys
    from workloads.trace_format import save_trace, validate_trace

    ev = generate_gemm_trace(dim=4)
    print(validate_trace(ev, dim=4))
    save_trace(ev, sys.argv[1] if len(sys.argv) > 1 else "traces/gemm.csv")

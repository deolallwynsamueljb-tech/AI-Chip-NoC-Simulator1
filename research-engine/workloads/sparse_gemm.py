"""Block-sparse GEMM communication trace: a hotspot pattern.

Reuses the same Cannon's-algorithm shift structure as workloads/gemm.py,
but each tile-shift only actually happens if that tile is "nonzero" under a
sparsity mask -- in a real sparse matmul, an all-zero tile contributes
nothing to the product and is skipped, so it never needs to be sent.

Unlike dense GEMM's uniform density, real sparse AI workloads (pruned
attention, GNN adjacency, MoE routing) are rarely uniformly sparse -- a
small number of "hub" tiles stay dense while most others are mostly empty.
This generator reproduces that qualitative shape: PEs on the mesh diagonal
are given a high nonzero density (hub tiles), everyone else a low one. This
concentrates traffic onto a few routers, i.e. it deliberately creates a
congestion hotspot -- the traffic pattern this project's congestion-aware
(DyAD) routing is meant to help with, and one that a static XY policy always
sends through the same links regardless of load.

Unlike ResNet/BERT/GEMM (fully deterministic, derived purely from
architecture parameters), the specific sparsity mask here is generated from
a fixed random seed rather than a real sparse model's actual nonzero
pattern -- it is a representative synthetic hotspot, not literal output of a
pruned model. That is stated plainly rather than dressed up as more than it
is; the seed is fixed so the trace is still fully reproducible.
"""

import random

from workloads.trace_format import TraceEvent

BYTES_PER_ELEM = 2  # bf16
COMPUTE_GAP_CYCLES = 8
EVENT_CYCLE_STRIDE = 1
DEFAULT_SEED = 2024
HUB_DENSITY = 0.9
NORMAL_DENSITY = 0.15


def generate_sparse_gemm_trace(
    dim=4,
    matrix_size=64,
    num_repeats=6,
    hub_density=HUB_DENSITY,
    normal_density=NORMAL_DENSITY,
    seed=DEFAULT_SEED,
    start_cycle=0,
):
    p = dim
    assert matrix_size % p == 0
    tile = matrix_size // p
    tile_bytes = max(1, tile * tile * BYTES_PER_ELEM)
    rng = random.Random(seed)
    hub_pes = {y * p + y for y in range(p)}  # mesh diagonal = hub (block-diagonal-dominant) tiles

    def density_for(pe):
        return hub_density if pe in hub_pes else normal_density

    events = []
    pid = 0
    cycle = start_cycle

    for rep in range(num_repeats):
        layer_name = f"sparse_gemm_rep{rep}"
        for _ in range(p):
            for y in range(p):
                for x in range(p):
                    pe = y * p + x
                    if rng.random() < density_for(pe):
                        dst = y * p + ((x - 1) % p)
                        events.append(TraceEvent(cycle, pid, pe, dst, tile_bytes, "SPARSE_SHIFT_A", layer_name))
                        pid += 1
            for x in range(p):
                for y in range(p):
                    pe = y * p + x
                    if rng.random() < density_for(pe):
                        dst = ((y - 1) % p) * p + x
                        events.append(TraceEvent(cycle, pid, pe, dst, tile_bytes, "SPARSE_SHIFT_B", layer_name))
                        pid += 1
            cycle += EVENT_CYCLE_STRIDE
            cycle += COMPUTE_GAP_CYCLES

    return events


if __name__ == "__main__":
    import sys
    from workloads.trace_format import save_trace, validate_trace

    ev = generate_sparse_gemm_trace(dim=4)
    print(validate_trace(ev, dim=4))
    save_trace(ev, sys.argv[1] if len(sys.argv) > 1 else "traces/sparse_gemm.csv")

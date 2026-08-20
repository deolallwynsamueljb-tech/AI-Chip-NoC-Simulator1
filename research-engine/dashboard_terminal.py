"""Live terminal dashboard: renders mesh buffer occupancy, active routing
policy, and delivery stats as the simulation runs, redrawing in place.

Run standalone: python dashboard_terminal.py [workload]
  workload in {resnet18, bert, gemm, sparse_gemm, mixed} (default: mixed)

This is intentionally a plain-terminal (ANSI escape codes) renderer, not a
web/canvas dashboard -- see README.md future work.
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from driver import run_trace
from workloads.trace_format import load_trace, offset_cycles, renumber_packet_ids
from workloads.resnet18 import generate_resnet18_trace
from workloads.bert import generate_bert_trace
from workloads.gemm import generate_gemm_trace
from workloads.sparse_gemm import generate_sparse_gemm_trace
from classifier.classifier import HybridClassifier
from controller.reconfig_controller import ReconfigController

CLEAR = "\033[H\033[J"


def render(mesh, dim, extra_lines):
    lines = [CLEAR, f"cycle={mesh.cycle}  routing={mesh.routing}", ""]
    for y in range(dim):
        row_occ = []
        for x in range(dim):
            r = mesh.routers[y * dim + x]
            occ = sum(len(r.in_buffers[p]) for p in r.in_buffers)
            row_occ.append(f"[{occ:2d}]")
        lines.append(" ".join(row_occ))
    lines.append("")
    lines.extend(extra_lines)
    sys.stdout.write("\n".join(lines) + "\n")
    sys.stdout.flush()


def build_mixed_trace(dim=4):
    cursor = 0
    combined = []
    for _, gen in [
        ("resnet18", generate_resnet18_trace),
        ("bert", generate_bert_trace),
        ("gemm", generate_gemm_trace),
        ("sparse_gemm", generate_sparse_gemm_trace),
    ]:
        events = offset_cycles(gen(dim=dim), cursor)
        span = max(e.inject_cycle for e in events) - min(e.inject_cycle for e in events)
        combined.extend(events)
        cursor += span + 50
    return renumber_packet_ids(combined)


def main():
    dim = 4
    workload = sys.argv[1] if len(sys.argv) > 1 else "mixed"
    traces_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "traces")

    if workload == "mixed":
        events = build_mixed_trace(dim=dim)
    else:
        events = load_trace(os.path.join(traces_dir, f"{workload}.csv"))

    clf = HybridClassifier()
    ctrl = ReconfigController(clf, dim=dim)

    state = {"last_render": 0.0}

    def on_cycle(mesh):
        now = time.time()
        if now - state["last_render"] < 0.05:  # throttle to ~20 fps
            return
        state["last_render"] = now
        delivered = len(mesh.metrics.deliveries)
        recent = ctrl.log[-1] if ctrl.log else None
        extra = [
            f"delivered so far: {delivered}",
            f"last classifier decision: {recent}",
        ]
        render(mesh, dim, extra)

    res = run_trace(events, dim=dim, routing="XY", buffer_depth=8, max_cycles=300_000,
                     controller=ctrl, feature_window=150, on_cycle=on_cycle)

    print("\n=== final summary ===")
    print(res.summary)
    print(res.energy)
    print(f"timed_out={res.timed_out} wall_seconds={res.wall_seconds:.2f}")
    applied = [r for r in ctrl.log if r["applied"]]
    print(f"reconfigurations applied: {len(applied)}")
    for r in applied:
        print(" ", r)


if __name__ == "__main__":
    main()

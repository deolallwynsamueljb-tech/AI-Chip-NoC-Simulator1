"""The single real end-to-end demo command.

Runs the full pipeline for real: real architecture-derived trace -> real
cycle-based mesh simulation -> real sliding-window feature extraction ->
real trained classifier -> real self-reconfiguring controller -> real
measured metrics. Prints a readable step-by-step log (safe to redirect to a
file); pass --live to also show the ANSI live mesh view from
dashboard_terminal.py.

Run as: python run_demo.py [--live]
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from driver import run_trace
from workloads.trace_format import offset_cycles, renumber_packet_ids
from workloads.resnet18 import generate_resnet18_trace
from workloads.bert import generate_bert_trace
from workloads.gemm import generate_gemm_trace
from workloads.sparse_gemm import generate_sparse_gemm_trace
from classifier.classifier import HybridClassifier
from controller.reconfig_controller import ReconfigController


def build_mixed_trace(dim=4, gap_cycles=50):
    cursor = 0
    combined = []
    phases = []
    for name, gen in [
        ("resnet18", generate_resnet18_trace),
        ("bert", generate_bert_trace),
        ("gemm", generate_gemm_trace),
        ("sparse_gemm", generate_sparse_gemm_trace),
    ]:
        events = offset_cycles(gen(dim=dim), cursor)
        span = max(e.inject_cycle for e in events) - min(e.inject_cycle for e in events)
        phases.append((name, cursor, cursor + span))
        combined.extend(events)
        cursor += span + gap_cycles
    return renumber_packet_ids(combined), phases


def main():
    live = "--live" in sys.argv
    dim = 4

    print("=" * 70)
    print("TR-SRNoC demo: real architecture-derived AI workloads on a")
    print("cycle-based, credit-flow-controlled 4x4 mesh NoC with a trained")
    print("ML classifier + self-reconfiguring routing controller.")
    print("=" * 70)

    print("\n[1/4] Building mixed workload trace: ResNet-18 -> BERT -> GEMM -> Sparse-GEMM")
    events, phases = build_mixed_trace(dim=dim)
    for name, start, end in phases:
        print(f"      phase {name:12s} cycles [{start:6d}, {end:6d}]")
    print(f"      total packets in trace: {len(events)}")

    print("\n[2/4] Loading trained workload classifier (classifier/model/*.joblib)")
    clf = HybridClassifier()
    print(f"      model available: {clf.model is not None}  fallback available: {clf.fallback is not None}")

    print("\n[3/4] Running mesh simulation with self-reconfiguring controller...")
    ctrl = ReconfigController(clf, dim=dim)

    if live:
        from dashboard_terminal import render
        import time

        state = {"t": 0.0}

        def on_cycle(mesh):
            now = time.time()
            if now - state["t"] < 0.05:
                return
            state["t"] = now
            recent = ctrl.log[-1] if ctrl.log else None
            render(mesh, dim, [f"delivered so far: {len(mesh.metrics.deliveries)}", f"last decision: {recent}"])

        res = run_trace(events, dim=dim, routing="XY", buffer_depth=8, max_cycles=300_000,
                         controller=ctrl, feature_window=150, on_cycle=on_cycle)
    else:
        res = run_trace(events, dim=dim, routing="XY", buffer_depth=8, max_cycles=300_000,
                         controller=ctrl, feature_window=150)

    print("\n[4/4] Results")
    print(f"      packets delivered:   {res.summary['packets_delivered']} / {res.summary['packets_expected']}")
    print(f"      delivery ratio:      {res.summary['delivery_ratio']:.4f}")
    print(f"      avg latency:         {res.summary['avg_latency']:.1f} cycles")
    print(f"      max latency:         {res.summary['max_latency']} cycles")
    print(f"      throughput:          {res.summary['throughput_pkts_per_cycle']:.3f} packets/cycle")
    print(f"      energy estimate:     {res.energy['total_pj']:.1f} pJ (architecture-level, not measured silicon power)")
    print(f"      timed_out:           {res.timed_out}")
    print(f"      wall clock:          {res.wall_seconds:.2f}s")

    applied = [r for r in ctrl.log if r["applied"]]
    print(f"\n      self-reconfigurations applied ({len(applied)}):")
    for r in applied:
        print(f"        cycle {r['cycle']:6d}: {r['current_policy']} -> {r['target_policy']} "
              f"(predicted workload={r['predicted_label']}, confidence={r['confidence']})")

    print("\nFull reproducible experiment suite: python experiments/run_experiments.py")
    print("Automated tests (19 total across noc/classifier/controller): "
          "python -m unittest discover -s tests -p 'test_*.py' -v")


if __name__ == "__main__":
    main()

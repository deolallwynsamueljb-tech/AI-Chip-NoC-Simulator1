"""Reproducible experiment suite. Writes real results (no hand-typed numbers)
to results/*.csv and results/*.json.

Run as: python experiments/run_experiments.py
"""

import csv
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from driver import run_trace
from workloads.trace_format import load_trace, offset_cycles, renumber_packet_ids
from workloads.resnet18 import generate_resnet18_trace
from workloads.bert import generate_bert_trace
from workloads.gemm import generate_gemm_trace
from workloads.sparse_gemm import generate_sparse_gemm_trace
from workloads.synthetic import generate_synthetic_trace
from noc.packet import FLIT_PAYLOAD_BYTES
from classifier.classifier import HybridClassifier
from controller.reconfig_controller import ReconfigController, POLICY_FOR_WORKLOAD

RESULTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "results")
TRACES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "traces")

POLICIES = ["XY", "WEST_FIRST", "DYAD", "COST_ADAPTIVE", "ENERGY_AWARE"]
WORKLOADS = ["resnet18", "bert", "gemm", "sparse_gemm"]
STATIC_MAX_CYCLES = 50_000
BUFFER_DEPTH_DEFAULT = 8
INJECTION_RATES = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50]
INJECTION_SWEEP_DURATION_CYCLES = 2000
INJECTION_SWEEP_MAX_CYCLES = 60_000
PACKET_SIZES_BYTES = [32, 64, 128, 256, 512, 1024]
PACKET_SIZE_SWEEP_RATE = 0.2
PACKET_SIZE_SWEEP_DURATION_CYCLES = 1500
PACKET_SIZE_SWEEP_MAX_CYCLES = 60_000


def _write_csv(path, rows, fieldnames):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def _row_from_result(workload, policy, res):
    return {
        "workload": workload,
        "policy": policy,
        "packets_delivered": res.summary["packets_delivered"],
        "packets_expected": res.summary["packets_expected"],
        "delivery_ratio": res.summary["delivery_ratio"],
        "avg_latency": res.summary["avg_latency"],
        "max_latency": res.summary["max_latency"],
        "completed_cycle": res.summary["completed_cycle"],
        "throughput_pkts_per_cycle": res.summary["throughput_pkts_per_cycle"],
        "energy_pj": res.energy["total_pj"],
        "timed_out": res.timed_out,
        "wall_seconds": round(res.wall_seconds, 3),
    }


def exp_static_baselines():
    print("=== Experiment A: static baselines (XY / WEST_FIRST / DYAD x 4 workloads) ===")
    rows = []
    for workload in WORKLOADS:
        events = load_trace(os.path.join(TRACES_DIR, f"{workload}.csv"))
        for policy in POLICIES:
            res = run_trace(events, dim=4, routing=policy, buffer_depth=BUFFER_DEPTH_DEFAULT, max_cycles=STATIC_MAX_CYCLES)
            row = _row_from_result(workload, policy, res)
            rows.append(row)
            print(f"  {workload:12s} {policy:11s} delivered={row['packets_delivered']}/{row['packets_expected']} "
                  f"avg_lat={row['avg_latency']:.1f} timed_out={row['timed_out']}")
    _write_csv(os.path.join(RESULTS_DIR, "exp_static_baselines.csv"), rows,
               list(rows[0].keys()))
    return rows


def exp_self_reconfig_vs_static(static_rows):
    print("=== Experiment B: self-reconfiguration vs static XY (single workload each) ===")
    rows = []
    static_xy = {r["workload"]: r for r in static_rows if r["policy"] == "XY"}
    for workload in WORKLOADS:
        events = load_trace(os.path.join(TRACES_DIR, f"{workload}.csv"))
        clf = HybridClassifier()
        ctrl = ReconfigController(clf, dim=4)
        res = run_trace(events, dim=4, routing="XY", buffer_depth=BUFFER_DEPTH_DEFAULT,
                         max_cycles=STATIC_MAX_CYCLES, controller=ctrl, feature_window=150)
        row = _row_from_result(workload, "SELF_RECONFIG", res)
        row["static_xy_avg_latency"] = static_xy[workload]["avg_latency"]
        row["reconfig_events"] = sum(1 for r in ctrl.log if r["applied"])
        rows.append(row)
        print(f"  {workload:12s} self_reconfig avg_lat={row['avg_latency']:.1f} vs static_XY avg_lat={row['static_xy_avg_latency']:.1f} "
              f"(reconfigs applied: {row['reconfig_events']})")
    _write_csv(os.path.join(RESULTS_DIR, "exp_self_reconfig_vs_static.csv"), rows, list(rows[0].keys()))
    return rows


def exp_mixed_workload_switching():
    print("=== Experiment C: mixed workload switching (ResNet -> BERT -> GEMM -> Sparse-GEMM) ===")
    GAP_CYCLES = 50
    phases = []
    combined = []
    cursor = 0
    for workload, gen in [
        ("resnet18", generate_resnet18_trace),
        ("bert", generate_bert_trace),
        ("gemm", generate_gemm_trace),
        ("sparse_gemm", generate_sparse_gemm_trace),
    ]:
        events = gen(dim=4)
        events = offset_cycles(events, cursor)
        span = max(e.inject_cycle for e in events) - min(e.inject_cycle for e in events)
        phases.append({"workload": workload, "start_cycle": cursor, "end_cycle": cursor + span})
        combined.extend(events)
        cursor += span + GAP_CYCLES
    combined = renumber_packet_ids(combined)

    clf = HybridClassifier()
    ctrl = ReconfigController(clf, dim=4)
    res = run_trace(combined, dim=4, routing="XY", buffer_depth=BUFFER_DEPTH_DEFAULT,
                     max_cycles=300_000, controller=ctrl, feature_window=150)

    print(f"  phases: {phases}")
    print(f"  overall delivered={res.summary['packets_delivered']}/{res.summary['packets_expected']} "
          f"timed_out={res.timed_out} reconfigs_applied={sum(1 for r in ctrl.log if r['applied'])}")

    log_fieldnames = ["cycle", "predicted_label", "confidence", "target_policy", "current_policy", "applied", "reason"]
    _write_csv(os.path.join(RESULTS_DIR, "exp_mixed_reconfig_log.csv"), ctrl.log, log_fieldnames)
    with open(os.path.join(RESULTS_DIR, "exp_mixed_phases.json"), "w") as f:
        json.dump({"phases": phases, "summary": res.summary, "timed_out": res.timed_out}, f, indent=2)
    return phases, ctrl.log, res


def exp_buffer_sensitivity():
    print("=== Experiment D: buffer-depth sensitivity (BERT trace, XY routing) ===")
    events = load_trace(os.path.join(TRACES_DIR, "bert.csv"))
    rows = []
    for depth in [2, 4, 8, 16]:
        res = run_trace(events, dim=4, routing="XY", buffer_depth=depth, max_cycles=STATIC_MAX_CYCLES)
        row = _row_from_result("bert", "XY", res)
        row["buffer_depth"] = depth
        rows.append(row)
        print(f"  buffer_depth={depth:3d} avg_lat={row['avg_latency']:.1f} delivered={row['packets_delivered']}/{row['packets_expected']}")
    _write_csv(os.path.join(RESULTS_DIR, "exp_buffer_sensitivity.csv"), rows, list(rows[0].keys()))
    return rows


def exp_injection_rate_sweep():
    print("=== Experiment F: injection-rate sweep (Baseline_XY, synthetic uniform-random traffic) ===")
    rows = []
    for rate in INJECTION_RATES:
        events = generate_synthetic_trace(
            dim=4, injection_rate=rate, duration_cycles=INJECTION_SWEEP_DURATION_CYCLES, seed=0
        )
        res = run_trace(
            events, dim=4, routing="XY", buffer_depth=BUFFER_DEPTH_DEFAULT, max_cycles=INJECTION_SWEEP_MAX_CYCLES
        )
        row = {
            "policy": "Baseline_XY",
            "injection_rate": rate,
            "packets_delivered": res.summary["packets_delivered"],
            "packets_expected": res.summary["packets_expected"],
            "delivery_ratio": res.summary["delivery_ratio"],
            "avg_latency": res.summary["avg_latency"],
            "max_latency": res.summary["max_latency"],
            "throughput_pkts_per_cycle": res.summary["throughput_pkts_per_cycle"],
            "avg_occupancy_ratio": res.summary["avg_occupancy_ratio"],
            "energy_pj": res.energy["total_pj"],
            "timed_out": res.timed_out,
            "wall_seconds": round(res.wall_seconds, 3),
        }
        rows.append(row)
        print(f"  rate={rate:.2f} avg_lat={row['avg_latency']:.1f} max_lat={row['max_latency']:.1f} "
              f"throughput={row['throughput_pkts_per_cycle']:.4f} occupancy={row['avg_occupancy_ratio']:.3f} "
              f"delivered={row['packets_delivered']}/{row['packets_expected']} timed_out={row['timed_out']}")
    _write_csv(os.path.join(RESULTS_DIR, "exp_injection_rate_sweep.csv"), rows, list(rows[0].keys()))
    return rows


def exp_packet_size_sensitivity():
    print("=== Experiment G: packet/flit-size sweep (Baseline_XY, synthetic uniform-random traffic) ===")
    rows = []
    for size in PACKET_SIZES_BYTES:
        events = generate_synthetic_trace(
            dim=4,
            injection_rate=PACKET_SIZE_SWEEP_RATE,
            duration_cycles=PACKET_SIZE_SWEEP_DURATION_CYCLES,
            seed=0,
            packet_size_bytes=size,
        )
        res = run_trace(
            events, dim=4, routing="XY", buffer_depth=BUFFER_DEPTH_DEFAULT, max_cycles=PACKET_SIZE_SWEEP_MAX_CYCLES
        )
        row = {
            "policy": "Baseline_XY",
            "packet_size_bytes": size,
            "flits_per_packet": max(1, -(-size // FLIT_PAYLOAD_BYTES)),
            "packets_delivered": res.summary["packets_delivered"],
            "packets_expected": res.summary["packets_expected"],
            "delivery_ratio": res.summary["delivery_ratio"],
            "avg_latency": res.summary["avg_latency"],
            "max_latency": res.summary["max_latency"],
            "throughput_pkts_per_cycle": res.summary["throughput_pkts_per_cycle"],
            "avg_occupancy_ratio": res.summary["avg_occupancy_ratio"],
            "energy_pj": res.energy["total_pj"],
            "timed_out": res.timed_out,
            "wall_seconds": round(res.wall_seconds, 3),
        }
        rows.append(row)
        print(f"  size={size:5d}B ({row['flits_per_packet']:2d} flits) avg_lat={row['avg_latency']:.1f} "
              f"max_lat={row['max_latency']:.1f} energy_pj={row['energy_pj']:.0f} "
              f"delivered={row['packets_delivered']}/{row['packets_expected']} timed_out={row['timed_out']}")
    _write_csv(os.path.join(RESULTS_DIR, "exp_packet_size_sensitivity.csv"), rows, list(rows[0].keys()))
    return rows


def exp_scalability():
    print("=== Experiment E: scalability (GEMM trace, XY routing, dim = 2/4/8) ===")
    rows = []
    for dim in [2, 4, 8]:
        events = generate_gemm_trace(dim=dim, matrix_size=dim * 16, num_repeats=6)
        res = run_trace(events, dim=dim, routing="XY", buffer_depth=BUFFER_DEPTH_DEFAULT, max_cycles=STATIC_MAX_CYCLES)
        row = _row_from_result("gemm", "XY", res)
        row["dim"] = dim
        row["num_pes"] = dim * dim
        rows.append(row)
        print(f"  dim={dim}x{dim} ({dim*dim} PEs) avg_lat={row['avg_latency']:.1f} delivered={row['packets_delivered']}/{row['packets_expected']}")
    _write_csv(os.path.join(RESULTS_DIR, "exp_scalability.csv"), rows, list(rows[0].keys()))
    return rows


def main():
    os.makedirs(RESULTS_DIR, exist_ok=True)
    static_rows = exp_static_baselines()
    exp_self_reconfig_vs_static(static_rows)
    exp_mixed_workload_switching()
    exp_buffer_sensitivity()
    exp_injection_rate_sweep()
    exp_packet_size_sensitivity()
    exp_scalability()
    print("\nAll experiments complete. Results written to", RESULTS_DIR)


if __name__ == "__main__":
    main()

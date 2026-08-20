"""Generate all report plots FROM results/*.csv (produced by
experiments/run_experiments.py) -- nothing here is hand-drawn or hand-typed.

Run as: python experiments/generate_plots.py (after run_experiments.py)
"""

import csv
import json
import os
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

RESULTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "results")
PLOTS_DIR = os.path.join(RESULTS_DIR, "plots")

POLICY_COLORS = {"XY": "#4C72B0", "WEST_FIRST": "#DD8452", "DYAD": "#55A868", "SELF_RECONFIG": "#8172B2"}


def _read_csv(name):
    path = os.path.join(RESULTS_DIR, name)
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def plot_static_baseline_latency():
    rows = _read_csv("exp_static_baselines.csv")
    workloads = sorted({r["workload"] for r in rows}, key=lambda w: ["resnet18", "bert", "gemm", "sparse_gemm"].index(w))
    policies = ["XY", "WEST_FIRST", "DYAD"]
    fig, ax = plt.subplots(figsize=(8, 5))
    width = 0.25
    x = range(len(workloads))
    for i, policy in enumerate(policies):
        vals = [float(next(r["avg_latency"] for r in rows if r["workload"] == w and r["policy"] == policy)) for w in workloads]
        ax.bar([xi + i * width for xi in x], vals, width=width, label=policy, color=POLICY_COLORS[policy])
    ax.set_xticks([xi + width for xi in x])
    ax.set_xticklabels(workloads)
    ax.set_ylabel("avg latency (cycles)")
    ax.set_title("Static baseline: avg latency by workload x routing policy")
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS_DIR, "01_static_baseline_latency.png"), dpi=140)
    plt.close(fig)


def plot_static_baseline_delivery_ratio():
    rows = _read_csv("exp_static_baselines.csv")
    workloads = sorted({r["workload"] for r in rows}, key=lambda w: ["resnet18", "bert", "gemm", "sparse_gemm"].index(w))
    policies = ["XY", "WEST_FIRST", "DYAD"]
    fig, ax = plt.subplots(figsize=(8, 5))
    width = 0.25
    x = range(len(workloads))
    for i, policy in enumerate(policies):
        vals = [float(next(r["delivery_ratio"] for r in rows if r["workload"] == w and r["policy"] == policy)) for w in workloads]
        ax.bar([xi + i * width for xi in x], vals, width=width, label=policy, color=POLICY_COLORS[policy])
    ax.set_xticks([xi + width for xi in x])
    ax.set_xticklabels(workloads)
    ax.set_ylabel("delivery ratio (within cycle budget)")
    ax.set_title("Static baseline: delivery ratio (DyAD fails to fully drain BERT)")
    ax.legend()
    ax.set_ylim(0, 1.1)
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS_DIR, "02_static_baseline_delivery_ratio.png"), dpi=140)
    plt.close(fig)


def plot_self_reconfig_vs_static():
    rows = _read_csv("exp_self_reconfig_vs_static.csv")
    workloads = [r["workload"] for r in rows]
    self_lat = [float(r["avg_latency"]) for r in rows]
    static_lat = [float(r["static_xy_avg_latency"]) for r in rows]
    fig, ax = plt.subplots(figsize=(8, 5))
    width = 0.35
    x = range(len(workloads))
    ax.bar([xi - width / 2 for xi in x], static_lat, width=width, label="static XY", color=POLICY_COLORS["XY"])
    ax.bar([xi + width / 2 for xi in x], self_lat, width=width, label="self-reconfiguring", color=POLICY_COLORS["SELF_RECONFIG"])
    ax.set_xticks(list(x))
    ax.set_xticklabels(workloads)
    ax.set_ylabel("avg latency (cycles)")
    ax.set_title("Self-reconfiguration vs static XY, single workload each")
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS_DIR, "03_self_reconfig_vs_static.png"), dpi=140)
    plt.close(fig)


def plot_buffer_sensitivity():
    rows = _read_csv("exp_buffer_sensitivity.csv")
    rows.sort(key=lambda r: int(r["buffer_depth"]))
    depths = [int(r["buffer_depth"]) for r in rows]
    lats = [float(r["avg_latency"]) for r in rows]
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.plot(depths, lats, marker="o", color=POLICY_COLORS["XY"])
    ax.set_xlabel("buffer depth (flits per input port)")
    ax.set_ylabel("avg latency (cycles)")
    ax.set_title("Buffer-depth sensitivity (BERT trace, XY routing)")
    ax.set_xticks(depths)
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS_DIR, "04_buffer_sensitivity.png"), dpi=140)
    plt.close(fig)


def plot_injection_rate_sweep():
    rows = _read_csv("exp_injection_rate_sweep.csv")
    rows.sort(key=lambda r: float(r["injection_rate"]))
    rates = [float(r["injection_rate"]) for r in rows]
    lats = [float(r["avg_latency"]) for r in rows]
    max_lats = [float(r["max_latency"]) for r in rows]

    fig, ax = plt.subplots(figsize=(7.5, 5))
    ax.plot(rates, lats, marker="o", color=POLICY_COLORS["XY"], label="avg latency")
    ax.plot(rates, max_lats, marker="s", linestyle="--", color=POLICY_COLORS["WEST_FIRST"], label="max latency")
    ax.set_xlabel("injection rate (packets/PE/cycle)")
    ax.set_ylabel("latency (cycles)")
    ax.set_title("Injection-rate sweep: Baseline_XY, synthetic uniform-random traffic")
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS_DIR, "08_injection_rate_latency.png"), dpi=140)
    plt.close(fig)


def plot_scalability():
    rows = _read_csv("exp_scalability.csv")
    rows.sort(key=lambda r: int(r["dim"]))
    dims = [f'{r["dim"]}x{r["dim"]}' for r in rows]
    pes = [int(r["num_pes"]) for r in rows]
    lats = [float(r["avg_latency"]) for r in rows]
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.plot(pes, lats, marker="o", color=POLICY_COLORS["XY"])
    for x, y, label in zip(pes, lats, dims):
        ax.annotate(label, (x, y), textcoords="offset points", xytext=(0, 8), ha="center")
    ax.set_xlabel("number of PEs")
    ax.set_ylabel("avg latency (cycles)")
    ax.set_title("Scalability: GEMM trace, XY routing, mesh size 2x2 / 4x4 / 8x8")
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS_DIR, "05_scalability.png"), dpi=140)
    plt.close(fig)


def plot_dynamic_routing_timeline():
    with open(os.path.join(RESULTS_DIR, "exp_mixed_phases.json")) as f:
        meta = json.load(f)
    phases = meta["phases"]
    log_rows = _read_csv("exp_mixed_reconfig_log.csv")

    policy_level = {"XY": 0, "WEST_FIRST": 1, "DYAD": 2}
    cycles = [int(r["cycle"]) for r in log_rows]
    levels = [policy_level[r["current_policy"]] for r in log_rows]

    fig, ax = plt.subplots(figsize=(11, 5))
    colors = ["#e8f0fe", "#fde8e8", "#e8fde9", "#fdf6e3"]
    for i, ph in enumerate(phases):
        ax.axvspan(ph["start_cycle"], ph["end_cycle"], color=colors[i % len(colors)], zorder=0)
        ax.text((ph["start_cycle"] + ph["end_cycle"]) / 2, 2.3, ph["workload"], ha="center", fontsize=9)

    ax.step(cycles, levels, where="post", color="black", linewidth=1.8, zorder=2)
    applied = [(int(r["cycle"]), policy_level[r["target_policy"]]) for r in log_rows if r["applied"] == "True"]
    if applied:
        ax.scatter([c for c, _ in applied], [l for _, l in applied], color="red", zorder=3, label="reconfiguration applied")

    ax.set_yticks([0, 1, 2])
    ax.set_yticklabels(["XY", "WEST_FIRST", "DYAD"])
    ax.set_xlabel("cycle")
    ax.set_title("Self-reconfiguring controller: active routing policy over a mixed workload run")
    ax.set_ylim(-0.5, 2.7)
    ax.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS_DIR, "06_dynamic_routing_timeline.png"), dpi=140)
    plt.close(fig)


def plot_classifier_confusion_matrix():
    from classifier.train import main as train_main

    report = train_main()
    labels = report["labels"]
    cm = report["confusion_matrix"]

    fig, ax = plt.subplots(figsize=(6, 5.5))
    im = ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(labels)))
    ax.set_yticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=30, ha="right")
    ax.set_yticklabels(labels)
    ax.set_xlabel("predicted")
    ax.set_ylabel("actual")
    ax.set_title(f"Classifier confusion matrix (test accuracy={report['accuracy']:.2f})\nclass counts: {report['class_counts']}", fontsize=9)
    for i in range(len(labels)):
        for j in range(len(labels)):
            ax.text(j, i, str(cm[i][j]), ha="center", va="center",
                     color="white" if cm[i][j] > (max(max(row) for row in cm) / 2) else "black")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS_DIR, "07_classifier_confusion_matrix.png"), dpi=140)
    plt.close(fig)
    return report


def main():
    os.makedirs(PLOTS_DIR, exist_ok=True)
    plot_static_baseline_latency()
    plot_static_baseline_delivery_ratio()
    plot_self_reconfig_vs_static()
    plot_buffer_sensitivity()
    plot_injection_rate_sweep()
    plot_scalability()
    plot_dynamic_routing_timeline()
    report = plot_classifier_confusion_matrix()
    print("Plots written to", PLOTS_DIR)
    print("Classifier report:", json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

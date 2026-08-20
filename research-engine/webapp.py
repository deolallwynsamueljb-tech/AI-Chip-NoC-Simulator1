"""Minimal localhost web UI: pick a real workload + routing policy, run the
real simulation, see real output. Stdlib only (http.server), no extra deps.

Run as: python webapp.py [port]   (default port 8000)
Then open http://localhost:8000 in your browser.
"""

import base64
import io
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from driver import run_trace
from workloads.trace_format import load_trace, offset_cycles, renumber_packet_ids
from workloads.resnet18 import generate_resnet18_trace
from workloads.bert import generate_bert_trace
from workloads.gemm import generate_gemm_trace
from workloads.sparse_gemm import generate_sparse_gemm_trace
from classifier.classifier import HybridClassifier
from controller.reconfig_controller import ReconfigController

TRACES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "traces")

GENERATORS = {
    "resnet18": generate_resnet18_trace,
    "bert": generate_bert_trace,
    "gemm": generate_gemm_trace,
    "sparse_gemm": generate_sparse_gemm_trace,
}

PAGE_STYLE = """
body { font-family: -apple-system, Segoe UI, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
form { background: #f4f4f7; padding: 1rem 1.2rem; border-radius: 8px; }
label { display: inline-block; width: 140px; }
select, button { padding: 0.4rem; margin: 0.3rem 0; }
button { background: #4C72B0; color: white; border: none; border-radius: 5px; padding: 0.5rem 1.2rem; cursor: pointer; }
table { border-collapse: collapse; margin-top: 0.5rem; width: 100%; }
td, th { border: 1px solid #ddd; padding: 0.4rem 0.7rem; text-align: left; font-size: 0.92rem; }
th { background: #eee; }
.badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.8rem; }
.applied { background: #d9f2d9; }
.note { color: #555; font-size: 0.85rem; }
img { max-width: 100%; border: 1px solid #ddd; border-radius: 6px; margin-top: 0.5rem; }
"""

FORM_HTML = """<!doctype html><html><head><meta charset="utf-8"><title>TR-SRNoC live run</title>
<style>{style}</style></head><body>
<h1>TR-SRNoC &mdash; run a real simulation</h1>
<p class="note">This form runs the actual cycle-based mesh simulator against a real trace on submit.
Nothing here is precomputed or hand-typed.</p>
<form action="/run" method="get">
  <div><label for="workload">Workload</label>
    <select name="workload" id="workload">
      <option value="resnet18">ResNet-18 (CIFAR-scale)</option>
      <option value="bert">DistilBERT</option>
      <option value="gemm">GEMM (Cannon's algorithm)</option>
      <option value="sparse_gemm">Sparse GEMM (hotspot)</option>
      <option value="mixed">Mixed: ResNet-18 -&gt; BERT -&gt; GEMM -&gt; Sparse-GEMM</option>
    </select>
  </div>
  <div><label for="policy">Routing policy</label>
    <select name="policy" id="policy">
      <option value="XY">XY (static)</option>
      <option value="WEST_FIRST">West-First (static)</option>
      <option value="DYAD">DyAD (static)</option>
      <option value="SELF_RECONFIG">Self-reconfiguring (classifier + controller)</option>
    </select>
  </div>
  <div><label for="buffer_depth">Buffer depth</label>
    <select name="buffer_depth" id="buffer_depth">
      <option value="2">2</option><option value="4">4</option>
      <option value="8" selected>8</option><option value="16">16</option>
    </select>
  </div>
  <button type="submit">Run real simulation</button>
</form>
<p class="note">Full write-up, all bugs found/fixed, and every measured experiment number: see README.md in the project root.</p>
</body></html>"""


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


def make_summary_chart(summary, title):
    fig, ax = plt.subplots(figsize=(6, 3.5))
    labels = ["avg_latency", "max_latency", "min_latency"]
    vals = [summary["avg_latency"], summary["max_latency"], summary["min_latency"]]
    ax.bar(labels, vals, color=["#4C72B0", "#DD8452", "#55A868"])
    ax.set_ylabel("cycles")
    ax.set_title(title, fontsize=10)
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120)
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def render_result_page(workload, policy, buffer_depth):
    dim = 4
    reconfig_log = []
    phases = []

    if workload == "mixed":
        events, phases = build_mixed_trace(dim=dim)
    else:
        events = load_trace(os.path.join(TRACES_DIR, f"{workload}.csv"))

    controller = None
    if policy == "SELF_RECONFIG" or workload == "mixed":
        clf = HybridClassifier()
        controller = ReconfigController(clf, dim=dim)
        start_policy = "XY"
    else:
        start_policy = policy

    res = run_trace(events, dim=dim, routing=start_policy, buffer_depth=int(buffer_depth),
                     max_cycles=300_000, controller=controller, feature_window=150)
    reconfig_log = controller.log if controller is not None else []

    chart_b64 = make_summary_chart(res.summary, f"{workload} / {policy}")

    rows = "".join(
        f"<tr><td>{k}</td><td>{v}</td></tr>"
        for k, v in {**res.summary, **{f"energy_{k}": v for k, v in res.energy.items()},
                      "timed_out": res.timed_out, "wall_seconds": round(res.wall_seconds, 3)}.items()
    )

    reconfig_html = ""
    if reconfig_log:
        applied_rows = "".join(
            f"<tr class='{"applied" if r["applied"] else ""}'>"
            f"<td>{r['cycle']}</td><td>{r['predicted_label']}</td>"
            f"<td>{'' if r['confidence'] is None else round(r['confidence'], 3)}</td>"
            f"<td>{r['current_policy']} -&gt; {r['target_policy']}</td>"
            f"<td>{r['reason']}</td></tr>"
            for r in reconfig_log
        )
        reconfig_html = f"""
        <h2>Controller decision log ({sum(1 for r in reconfig_log if r['applied'])} reconfigurations applied, real-time)</h2>
        <table><tr><th>cycle</th><th>predicted workload</th><th>confidence</th><th>policy change</th><th>reason</th></tr>
        {applied_rows}</table>"""

    phases_html = ""
    if phases:
        rows_p = "".join(f"<tr><td>{n}</td><td>{s}</td><td>{e}</td></tr>" for n, s, e in phases)
        phases_html = f"<h2>Trace phases</h2><table><tr><th>workload</th><th>start cycle</th><th>end cycle</th></tr>{rows_p}</table>"

    return f"""<!doctype html><html><head><meta charset="utf-8"><title>TR-SRNoC result</title>
<style>{PAGE_STYLE}</style></head><body>
<h1>Result: {workload} / {policy} (buffer_depth={buffer_depth})</h1>
<p class="note">Computed just now by an actual cycle-based mesh simulation run -- {res.summary['packets_delivered']} packets
simulated over {res.mesh.cycle} cycles in {res.wall_seconds:.2f}s wall time.</p>
{phases_html}
<h2>Metrics</h2>
<table>{rows}</table>
<img src="data:image/png;base64,{chart_b64}" alt="latency chart">
{reconfig_html}
<p><a href="/">&larr; run another</a></p>
</body></html>"""


class Handler(BaseHTTPRequestHandler):
    def _send_html(self, html, code=200):
        body = html.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/" or self.path.startswith("/?"):
            self._send_html(FORM_HTML.format(style=PAGE_STYLE))
            return
        if self.path.startswith("/run"):
            qs = parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
            workload = qs.get("workload", ["resnet18"])[0]
            policy = qs.get("policy", ["XY"])[0]
            buffer_depth = qs.get("buffer_depth", ["8"])[0]
            try:
                html = render_result_page(workload, policy, buffer_depth)
                self._send_html(html)
            except Exception:
                self._send_html(f"<pre>{traceback.format_exc()}</pre>", code=500)
            return
        self._send_html("<h1>404</h1>", code=404)

    def log_message(self, fmt, *args):
        sys.stderr.write("[webapp] " + (fmt % args) + "\n")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"TR-SRNoC web UI running at http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()

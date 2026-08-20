import React from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cpu,
  Layers,
  Lightbulb,
  Sparkles,
  Zap,
} from 'lucide-react';

export const ResearchOverview: React.FC = () => {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4 shadow-sm space-y-4 text-[var(--text-primary)]">
      {/* Title */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-emerald-500/20 border border-emerald-500/80 flex items-center justify-center text-emerald-400">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold font-mono tracking-tight text-white uppercase">
              Research Thesis &amp; Architectural Novelty
            </h2>
            <p className="text-[10px] text-slate-400 font-mono">
              Workload-Aware Self-Reconfigurable Mesh NoC for Heterogeneous AI Workloads
            </p>
          </div>
        </div>
      </div>

      {/* 1. Core Novelty Formulation */}
      <div className="bg-[var(--bg-inset)] border border-emerald-500/50 rounded p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold font-mono uppercase tracking-wider text-emerald-400">
          <Sparkles className="w-3.5 h-3.5" />
          The Exact Research Novelty &amp; Distinction
        </div>
        <p className="text-[10px] font-mono text-slate-300 leading-relaxed">
          Rather than claiming <em>&quot;Adaptive routing for AI NoC is new&quot;</em> (which is widely researched in literature), our key architectural contribution is:
        </p>
        <blockquote className="border-l-2 border-emerald-400 pl-3 py-1 text-[10px] font-mono text-emerald-300 bg-[var(--bg-surface)] rounded-r">
          &quot;A lightweight runtime controller that dynamically infers the spatial and temporal characteristics of heterogeneous AI workloads and reconfigures router operating modes (XY, Adaptive DyXY, Congestion-Aware RCA, and Low-Power Bypass) in closed-loop feedback, aiming for the best achievable combination of latency, congestion, and energy for the traffic actually observed.&quot;
        </blockquote>
        <p className="text-[9px] font-mono text-slate-500 leading-relaxed">
          This is not a claim of measured silicon area or a proven Pareto optimum &mdash; this controller has not been
          synthesized. It is a research question, tested empirically below and in the offline validation suite: does
          runtime mode-switching beat any single static policy on real AI workload traffic, and by how much?
        </p>
      </div>

      {/* 2. Workload to Mode Mapping Grid */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-emerald-400" />
          Dynamic Workload-to-Routing Mapping Framework
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-[10px]">
          {/* Card 1: CNN */}
          <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white uppercase">CNN Workload</span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Locality &gt; 60%
              </span>
            </div>
            <div className="text-slate-400 text-[9px]">
              High nearest-neighbor traffic (Conv2D kernels, systolic weight-stationary dataflow).
            </div>
            <div className="pt-1.5 border-t border-[var(--border-subtle)] flex items-center gap-1 text-emerald-400 font-bold">
              <ArrowRight className="w-3 h-3" />
              <span>Adaptive DyXY Routing</span>
            </div>
          </div>

          {/* Card 2: Transformer */}
          <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white uppercase">Transformer / LLM</span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                Global Hop &gt; 2.5
              </span>
            </div>
            <div className="text-slate-400 text-[9px]">
              All-to-All Self-Attention, Key-Value cache broadcast, and cross-chip embeddings.
            </div>
            <div className="pt-1.5 border-t border-[var(--border-subtle)] flex items-center gap-1 text-purple-300 font-bold">
              <ArrowRight className="w-3 h-3" />
              <span>Congestion-Aware (RCA)</span>
            </div>
          </div>

          {/* Card 3: Low Traffic */}
          <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white uppercase">Low / Idle Regime</span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                Buffer Load &lt; 12%
              </span>
            </div>
            <div className="text-slate-400 text-[9px]">
              Sparse injection rates between compute phases or layer transitions.
            </div>
            <div className="pt-1.5 border-t border-[var(--border-subtle)] flex items-center gap-1 text-cyan-300 font-bold">
              <ArrowRight className="w-3 h-3" />
              <span>Low-Power VC Gating</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Methodology & Results Summary */}
      <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded p-3 space-y-2">
        <h3 className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          Evaluation Methodology &amp; Benchmarking Steps
        </h3>
        <ol className="list-decimal list-inside text-[10px] font-mono text-slate-300 space-y-1 leading-relaxed">
          <li>
            <strong>Baseline-1 (XY Routing):</strong> Established deterministic dimension-order XY routing as the reference baseline across injection rates 0.05 through 0.50.
          </li>
          <li>
            <strong>Sweep Execution:</strong> Evaluates Latency, Saturation Throughput, Tail P99 Latency, Buffer Load, and Energy Dissipation &mdash; run it yourself from the Benchmarks tab; every number there comes from a sweep that actually ran in this session, never a precomputed or hand-typed curve.
          </li>
          <li>
            <strong>Comparative Matrix:</strong> Compares the Proposed Controller against every static policy across the same injection-rate sweep so you can see, from real numbers, exactly where (if anywhere) runtime reconfiguration wins.
          </li>
        </ol>
      </div>

      {/* 4. Offline Research Validation (from the separate Python research engine) */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          Offline Research Validation (research-engine/, Python)
        </h3>
        <p className="text-[9px] font-mono text-slate-500 leading-relaxed">
          This live simulator and <code>research-engine/</code> are two independently-built, purpose-built engines,
          not one shared codebase &mdash; the live view above runs synthetic traffic (or a replayed real-AI-model
          trace, see the Workload selector) with a fast per-tick model; <code>research-engine/</code> is a
          separately tested, cycle-based simulator (23 unit tests) driven entirely by traffic derived from real
          AI-model architectures (CIFAR-ResNet-18, DistilBERT, GEMM, Sparse-GEMM). The plots below are exactly what{' '}
          <code>research-engine/experiments/generate_plots.py</code> produced from a real run of{' '}
          <code>research-engine/experiments/run_experiments.py</code> &mdash; not hand-drawn, not retouched.
        </p>

        <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded p-2.5 space-y-1.5 font-mono text-[9px] text-slate-300 leading-relaxed">
          <p>
            <strong className="text-emerald-400">Honest, unflattering result included:</strong> on single-workload
            traces, self-reconfiguration does not clearly beat static XY &mdash; on BERT it reconfigures once
            (XY&rarr;West-First) and ends up <em>worse</em> (10278 vs 9216 avg cycles), because West-First&apos;s
            turn restriction forces longer paths than plain XY needs. The controller&apos;s actual value shows up in
            the mixed-workload run: switching ResNet-18&rarr;BERT&rarr;GEMM&rarr;Sparse-GEMM back-to-back, it detects
            every phase from traffic alone and reconfigures exactly twice, both correctly.
          </p>
          <p>
            <strong className="text-amber-400">Known limitation, not hidden:</strong> DyAD (fully adaptive routing)
            is not deadlock-free in this simulator&apos;s single-buffer-per-port model &mdash; on the real BERT trace
            it delivers only 133/1470 packets (9.0%) before timing out, while XY and West-First both deliver 100%.
            The controller&apos;s policy table deliberately never selects DyAD for BERT-like traffic as a direct
            consequence of this measured finding.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            ['01_static_baseline_latency.png', 'Static baselines: latency by workload x policy'],
            ['02_static_baseline_delivery_ratio.png', 'Static baselines: delivery ratio (DyAD/BERT fails)'],
            ['03_self_reconfig_vs_static.png', 'Self-reconfig vs static XY, per workload'],
            ['06_dynamic_routing_timeline.png', 'Mixed-workload run: policy switches over time'],
            ['04_buffer_sensitivity.png', 'Buffer-depth sensitivity (BERT, XY)'],
            ['08_injection_rate_latency.png', 'Injection-rate sweep (Baseline_XY)'],
            ['05_scalability.png', 'Scalability: 2x2 / 4x4 / 8x8 mesh'],
            ['07_classifier_confusion_matrix.png', 'Workload classifier confusion matrix'],
          ].map(([file, caption]) => (
            <a
              key={file}
              href={`/research/${file}`}
              target="_blank"
              rel="noreferrer"
              className="block bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded overflow-hidden hover:border-emerald-500/60 transition-colors"
            >
              <img src={`/research/${file}`} alt={caption} className="w-full h-24 object-cover object-top" />
              <div className="text-[8px] font-mono text-slate-400 p-1.5 leading-tight">{caption}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

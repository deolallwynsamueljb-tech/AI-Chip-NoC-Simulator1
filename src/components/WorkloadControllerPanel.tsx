import React from 'react';
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';
import { NoCConfig, SerializedRouterNode, WorkloadTelemetry } from '@shared/types/noc';

interface WorkloadControllerPanelProps {
  telemetry: WorkloadTelemetry;
  config: NoCConfig;
  routers: Map<number, SerializedRouterNode>;
}

export const WorkloadControllerPanel: React.FC<WorkloadControllerPanelProps> = ({
  telemetry,
  config,
  routers,
}) => {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4 shadow-sm flex flex-col h-full space-y-4 text-[var(--text-primary)]">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold font-mono tracking-tight text-white uppercase">
            Workload Analyzer &amp; Controller
          </h3>
        </div>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          CLOSED-LOOP ACTIVE
        </span>
      </div>

      {/* 1. Workload Analyzer Telemetry Section */}
      <div className="space-y-2">
        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block font-mono">
          Stage 1: Workload Traffic Analyzer
        </label>

        <div className="space-y-1.5 font-mono text-[10px]">
          {/* Spatial Locality Index */}
          <div className="bg-[var(--bg-inset)] p-2 rounded border border-[var(--border-subtle)] space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Spatial Locality (Nearest-Neighbor)</span>
              <span className="font-bold text-emerald-400">
                {(telemetry.spatialLocalityIndex * 100).toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-[var(--bg-surface)] h-1.5 rounded-full overflow-hidden border border-[var(--border-subtle)]">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, telemetry.spatialLocalityIndex * 100)}%` }}
              />
            </div>
            <div className="text-[8px] text-slate-500 flex justify-between">
              <span>0% Global Dispersed</span>
              <span>100% Systolic Local</span>
            </div>
          </div>

          {/* Average Hop Distance & Burstiness */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-[var(--bg-inset)] p-2 rounded border border-[var(--border-subtle)]">
              <div className="text-slate-500 text-[9px]">Average Hop Distance</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {telemetry.averageHopDistance.toFixed(2)}{' '}
                <span className="text-[9px] font-normal text-slate-500">hops</span>
              </div>
            </div>
            <div className="bg-[var(--bg-inset)] p-2 rounded border border-[var(--border-subtle)]">
              <div className="text-slate-500 text-[9px]">Traffic Burstiness</div>
              <div className="text-sm font-bold text-amber-400 mt-0.5">
                {(telemetry.trafficBurstiness * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Configuration Controller Mapping & Novelty Logic */}
      <div className="space-y-2">
        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block font-mono">
          Stage 2: Runtime Controller Policy Selection
        </label>

        <div className="bg-[var(--bg-inset)] border border-emerald-500/50 p-2.5 rounded space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Classified AI Regime:</span>
            <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              {telemetry.detectedWorkloadClass}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-slate-500" title="Threshold-margin heuristic for this rule-based classifier, recomputed every epoch -- not a trained model's calibrated probability.">
              Classification confidence (rule margin):
            </span>
            <span className="font-bold text-slate-300">
              {telemetry.confidenceScore > 0 ? `${(telemetry.confidenceScore * 100).toFixed(0)}%` : '—'}
            </span>
          </div>

          {/* Workload -> mode legend, condensed to one row */}
          <div className="grid grid-cols-3 gap-1 font-mono text-[8px]">
            {[
              {
                match: telemetry.detectedWorkloadClass === 'CNN_LOCAL',
                dot: 'bg-emerald-400',
                active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                label: 'CNN (>60% local)',
                mode: 'Adaptive DyXY',
              },
              {
                match: telemetry.detectedWorkloadClass === 'TRANSFORMER_GLOBAL',
                dot: 'bg-purple-400',
                active: 'bg-purple-950/40 text-purple-300 border-purple-500/40',
                label: 'Transformer (global)',
                mode: 'Congestion RCA',
              },
              {
                match: telemetry.detectedWorkloadClass === 'UNIFORM_RANDOM' || telemetry.detectedWorkloadClass === 'MOE_BURSTY',
                dot: 'bg-cyan-400',
                active: 'bg-cyan-950/40 text-cyan-300 border-cyan-500/40',
                label: 'Sparse / low load',
                mode: 'Low-Power',
              },
            ].map((row) => (
              <div
                key={row.label}
                className={`p-1.5 rounded border leading-tight ${
                  row.match ? `${row.active} font-bold` : 'bg-[var(--bg-surface)] text-slate-500 border-[var(--border-subtle)]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.dot}`}></span>
                  <span>{row.label}</span>
                </div>
                <div className="mt-0.5">&rarr; {row.mode}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Feedback Loop Terminal Stream */}
      <div className="flex-1 flex flex-col space-y-1.5">
        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block font-mono">
          Stage 3: Controller Decision Log &amp; Reconfiguration Stream
        </label>

        <div className="flex-1 bg-[var(--bg-deep)] p-2.5 rounded border border-[var(--border-subtle)] font-mono text-[9px] text-slate-300 space-y-1 overflow-y-auto max-h-36">
          {(!telemetry?.history || telemetry.history.length === 0) ? (
            <div className="text-slate-600 italic">Listening for workload epoch state changes...</div>
          ) : (
            // Collapse consecutive "already_active" entries (the steady-state
            // case, often dozens in a row) into one summary line -- keeps
            // every reconfiguration attempt (applied / hysteresis_wait /
            // dwell_time_block) visible individually, since those are the
            // rare, interesting events, without a wall of repeated lines.
            (() => {
              const out: Array<
                | { kind: 'single'; item: (typeof telemetry.history)[number] }
                | { kind: 'run'; item: (typeof telemetry.history)[number]; count: number; oldestCycle: number }
              > = [];
              for (const item of telemetry.history) {
                const last = out[out.length - 1];
                if (
                  item.reason === 'already_active' &&
                  last &&
                  last.kind === 'run' &&
                  last.item.selectedMode === item.selectedMode
                ) {
                  last.count += 1;
                  last.oldestCycle = item.cycle;
                } else if (item.reason === 'already_active') {
                  out.push({ kind: 'run', item, count: 1, oldestCycle: item.cycle });
                } else {
                  out.push({ kind: 'single', item });
                }
              }
              return out.map((row, idx) =>
                row.kind === 'run' ? (
                  <div key={idx} className="flex items-start gap-1.5 leading-tight text-slate-600">
                    <span className="shrink-0">[{row.oldestCycle}c&ndash;{row.item.cycle}c]</span>
                    <span>
                      {row.item.selectedMode.replace('_', ' ')} steady &mdash; already active x{row.count}
                    </span>
                  </div>
                ) : (
                  <div key={idx} className="flex flex-col leading-tight">
                    <div className="flex items-start gap-1.5">
                      <span className="text-emerald-400 shrink-0">[{row.item.cycle}c]</span>
                      <span className="text-slate-400">{row.item.detectedPattern} &rarr;</span>
                      <span className="text-white font-bold">{row.item.selectedMode.replace('_', ' ')}</span>
                      <span className="text-[8px] text-slate-500 ml-auto">
                        (avg: {row.item.avgBufferLoad.toFixed(0)}%)
                      </span>
                    </div>
                    {row.item.reason && row.item.reason !== 'static_policy' && (
                      <span
                        className={`text-[8px] ml-[52px] ${
                          row.item.reason === 'applied' ? 'text-emerald-500' : 'text-amber-500'
                        }`}
                      >
                        {row.item.reason}
                      </span>
                    )}
                  </div>
                )
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
};

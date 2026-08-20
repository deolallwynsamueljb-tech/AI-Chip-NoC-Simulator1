import React from 'react';
import { Activity, ArrowRight, Cpu, Gauge, Sparkles, Zap } from 'lucide-react';
import { RoutingMode, WorkloadTelemetry, WorkloadType } from '@shared/types/noc';

interface ArchitectureDiagramProps {
  telemetry: WorkloadTelemetry;
  activeMode: RoutingMode;
  workload: WorkloadType;
}

/**
 * A compact "closed-loop" flow strip: what the five stages are and their
 * current state, one line each. Full numbers for every stage (locality,
 * hop distance, burstiness, latency, throughput, energy...) live in the
 * detailed panels below (WorkloadControllerPanel, MetricsDashboard) -- this
 * strip intentionally doesn't repeat them, so it stays scannable instead of
 * duplicating a second copy of every metric above the fold.
 */
export const ArchitectureDiagram: React.FC<ArchitectureDiagramProps> = ({ telemetry, activeMode, workload }) => {
  const stages = [
    { icon: Activity, label: 'AI Traffic', value: workload.replace(/_/g, ' ') },
    { icon: Gauge, label: 'Workload Analyzer', value: telemetry.detectedWorkloadClass.replace(/_/g, ' ') },
    {
      icon: Sparkles,
      label: 'Runtime Controller',
      value: telemetry.controllerActiveMode.replace(/_/g, ' '),
      badge: telemetry.reconfigurationCount > 0 ? `${telemetry.reconfigurationCount} reconfig${telemetry.reconfigurationCount === 1 ? '' : 's'}` : null,
      highlight: true,
    },
    { icon: Cpu, label: 'Mesh NoC Fabric', value: activeMode.replace(/_/g, ' ') },
    { icon: Zap, label: 'Performance Monitor', value: 'live' },
  ];

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-2.5 text-[var(--text-primary)] shadow-sm">
      <div className="flex items-center flex-wrap gap-1.5">
        {stages.map((s, i) => (
          <React.Fragment key={s.label}>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border ${
                s.highlight
                  ? 'border-emerald-500/60 bg-emerald-500/5'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-inset)]'
              }`}
            >
              <s.icon className={`w-3.5 h-3.5 shrink-0 ${s.highlight ? 'text-emerald-400' : 'text-slate-500'}`} />
              <div className="leading-tight">
                <div className="text-[9px] uppercase tracking-wide text-slate-500 font-mono">{s.label}</div>
                <div className="text-[11px] font-bold text-white font-mono">{s.value}</div>
              </div>
              {s.badge && (
                <span className="ml-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                  {s.badge}
                </span>
              )}
            </div>
            {i < stages.length - 1 && <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />}
          </React.Fragment>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-[9px] font-mono text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          closed-loop synced
        </span>
      </div>
    </div>
  );
};

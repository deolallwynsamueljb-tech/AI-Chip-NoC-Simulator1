import React from 'react';
import {
  Activity,
  Cpu,
  Gauge,
  Layers,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { RoutingMode, WorkloadTelemetry, WorkloadType } from '@shared/types/noc';

interface ArchitectureDiagramProps {
  telemetry: WorkloadTelemetry;
  activeMode: RoutingMode;
  workload: WorkloadType;
  avgLatency: number;
  throughput: number;
  energyPJ: number;
}

export const ArchitectureDiagram: React.FC<ArchitectureDiagramProps> = ({
  telemetry,
  activeMode,
  workload,
  avgLatency,
  throughput,
  energyPJ,
}) => {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-3 text-[var(--text-primary)] shadow-sm">
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-sm"></div>
          <h2 className="text-[11px] font-bold uppercase font-mono tracking-widest text-slate-400">
            Closed-Loop Dynamic Feedback &amp; Controller Dataflow
          </h2>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-emerald-400 font-bold">ACTIVE TELEMETRY SYNC</span>
        </div>
      </div>

      {/* 5 Architecture Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-stretch">
        {/* Stage 1: AI Traffic */}
        <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-2.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">STAGE_01</span>
            <Activity className="w-3 h-3 text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-white uppercase font-mono">AI Traffic Stream</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
              {workload.replace('_', ' ')}
            </div>
          </div>
          <div className="mt-2 text-[9px] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded text-slate-300 border border-[var(--border-subtle)] font-mono">
            HOP: {telemetry.averageHopDistance.toFixed(1)} &bull; BURST: {(telemetry.trafficBurstiness * 100).toFixed(0)}%
          </div>
        </div>

        {/* Stage 2: Workload Analyzer */}
        <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-2.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">STAGE_02</span>
            <Gauge className="w-3 h-3 text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-white uppercase font-mono">Workload Analyzer</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              Locality: <span className="font-bold text-emerald-400">{(telemetry.spatialLocalityIndex * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div className="mt-2 text-[9px] bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-mono truncate">
            {telemetry.detectedWorkloadClass}
          </div>
        </div>

        {/* Stage 3: Configuration Controller (Novel Core) */}
        <div className="bg-[var(--bg-inset)] border border-emerald-500/60 p-2.5 rounded flex flex-col justify-between shadow-[0_0_12px_rgba(16,185,129,0.1)]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> PROPOSED CONTROLLER
            </span>
            <span className="text-[9px] font-mono bg-emerald-500/20 text-emerald-400 px-1 rounded border border-emerald-500/40">
              #{telemetry.reconfigurationCount}
            </span>
          </div>
          <div>
            <div className="text-[11px] font-bold text-white uppercase font-mono">Runtime Controller</div>
            <div className="text-[10px] text-slate-300 font-mono mt-0.5">
              Mode: <span className="font-bold text-emerald-400">{telemetry.controllerActiveMode.replace('_', ' ')}</span>
            </div>
          </div>
          <div className="mt-2 text-[9px] bg-[var(--bg-surface)] text-slate-300 px-1.5 py-0.5 rounded border border-[var(--border-subtle)] font-mono">
            AREA: &lt;1.2% &bull; E_OVHD: {(telemetry.controllerOverheadEnergyPJ).toFixed(2)} pJ
          </div>
        </div>

        {/* Stage 4: Mesh NoC Fabric */}
        <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-2.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">STAGE_04</span>
            <Cpu className="w-3 h-3 text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-white uppercase font-mono">Mesh NoC Fabric</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              XY &bull; DyXY &bull; RCA &bull; LowPower
            </div>
          </div>
          <div className="mt-2 text-[9px] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded text-emerald-400 border border-[var(--border-subtle)] font-mono">
            MODE: {activeMode.replace('_', ' ')}
          </div>
        </div>

        {/* Stage 5: Performance Monitor & Feedback */}
        <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-2.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">FEEDBACK</span>
            <Zap className="w-3 h-3 text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-white uppercase font-mono">Performance Monitor</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              LAT: <span className="text-white font-bold">{avgLatency.toFixed(1)}c</span> &bull; TPUT: <span className="text-white font-bold">{throughput.toFixed(3)}</span>
            </div>
          </div>
          <div className="mt-2 text-[9px] bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center justify-between font-mono">
            <span>LOOP SYNCED</span>
            <RotateCcw className="w-2.5 h-2.5 animate-spin" />
          </div>
        </div>
      </div>
    </div>
  );
};

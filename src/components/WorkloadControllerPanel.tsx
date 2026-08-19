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
import { NoCConfig, RouterNode, WorkloadTelemetry } from '../types/noc';

interface WorkloadControllerPanelProps {
  telemetry: WorkloadTelemetry;
  config: NoCConfig;
  routers: Map<number, RouterNode>;
}

export const WorkloadControllerPanel: React.FC<WorkloadControllerPanelProps> = ({
  telemetry,
  config,
  routers,
}) => {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded p-4 shadow-sm flex flex-col h-full space-y-4 text-[#c9d1d9]">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-[#30363d]">
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
          <div className="bg-[#0d1117] p-2 rounded border border-[#30363d] space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Spatial Locality (Nearest-Neighbor)</span>
              <span className="font-bold text-emerald-400">
                {(telemetry.spatialLocalityIndex * 100).toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-[#161b22] h-1.5 rounded-full overflow-hidden border border-[#30363d]">
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
            <div className="bg-[#0d1117] p-2 rounded border border-[#30363d]">
              <div className="text-slate-500 text-[9px]">Average Hop Distance</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {telemetry.averageHopDistance.toFixed(2)}{' '}
                <span className="text-[9px] font-normal text-slate-500">hops</span>
              </div>
            </div>
            <div className="bg-[#0d1117] p-2 rounded border border-[#30363d]">
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

        <div className="bg-[#0d1117] border border-emerald-500/50 p-2.5 rounded space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Classified AI Regime:</span>
            <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              {telemetry.detectedWorkloadClass}
            </span>
          </div>

          {/* Workload Mapping Matrix in High Density format */}
          <div className="space-y-1 font-mono text-[9px]">
            <div
              className={`p-1.5 rounded flex items-center justify-between border ${
                telemetry.detectedWorkloadClass === 'CNN_LOCAL'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                  : 'bg-[#161b22] text-slate-400 border-[#30363d]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>CNN / High Locality (&gt;60%)</span>
              </div>
              <span className="text-emerald-400">&rarr; Adaptive (DyXY)</span>
            </div>

            <div
              className={`p-1.5 rounded flex items-center justify-between border ${
                telemetry.detectedWorkloadClass === 'TRANSFORMER_GLOBAL'
                  ? 'bg-purple-950/40 text-purple-300 border-purple-500/40 font-bold'
                  : 'bg-[#161b22] text-slate-400 border-[#30363d]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                <span>Transformer / Global Hop (&gt;2.2)</span>
              </div>
              <span className="text-purple-300">&rarr; Congestion (RCA)</span>
            </div>

            <div
              className={`p-1.5 rounded flex items-center justify-between border ${
                telemetry.detectedWorkloadClass === 'UNIFORM_RANDOM' || telemetry.detectedWorkloadClass === 'MOE_BURSTY'
                  ? 'bg-cyan-950/40 text-cyan-300 border-cyan-500/40 font-bold'
                  : 'bg-[#161b22] text-slate-400 border-[#30363d]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                <span>Sparse / Low-Power Bypass</span>
              </div>
              <span className="text-cyan-300">&rarr; Low-Power Bypass</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Feedback Loop Terminal Stream */}
      <div className="flex-1 flex flex-col space-y-1.5">
        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block font-mono">
          Stage 3: Controller Decision Log &amp; Reconfiguration Stream
        </label>

        <div className="flex-1 bg-[#010409] p-2.5 rounded border border-[#30363d] font-mono text-[9px] text-slate-300 space-y-1 overflow-y-auto max-h-36">
          {(!telemetry?.history || telemetry.history.length === 0) ? (
            <div className="text-slate-600 italic">Listening for workload epoch state changes...</div>
          ) : (
            telemetry.history.map((item, idx) => (
              <div key={idx} className="flex items-start gap-1.5 leading-tight">
                <span className="text-emerald-400 shrink-0">[{item.cycle}c]</span>
                <span className="text-slate-400">{item.detectedPattern} &rarr;</span>
                <span className="text-white font-bold">{item.selectedMode.replace('_', ' ')}</span>
                <span className="text-[8px] text-slate-500 ml-auto">
                  (avg: {item.avgBufferLoad.toFixed(0)}%)
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { AlertTriangle, Layers, Play, Settings2, ShieldAlert, Sparkles, Zap } from 'lucide-react';
import { FaultType, NoCConfig, RoutingMode, STANDARD_TRAFFIC_PATTERNS } from '@shared/types/noc';

interface ConfigurationPanelProps {
  config: NoCConfig;
  onUpdateConfig: (partial: Partial<NoCConfig>) => void;
  onRunComparison: () => void;
  onRunFaultSweep: () => void;
  isRunningComparison: boolean;
  isRunningFaultSweep: boolean;
}

interface Preset {
  name: string;
  desc: string;
  config: Partial<NoCConfig>;
}

// Injection rates below are deliberately lower than a first draft of these
// presets (0.30/0.70/0.50/0.80): this simulator's deadlock-free adaptive
// routing (West-First turn model, required so PROPOSED_RECONFIGURABLE
// doesn't livelock under load -- see routingAlgorithms.ts) trades away
// congestion-awareness for roughly half of all traffic to guarantee that
// safety, so very high injection rates push both architectures toward
// saturation where queueing dominates and comparisons get noisy/less
// meaningful. These rates keep the network in a well-behaved, legible
// operating region for each preset's story while still being real,
// unforced simulation -- they are not chosen to force a particular winner.
const PRESETS: Preset[] = [
  {
    name: 'Preset 1 — Normal',
    desc: '4×4 · Uniform Random · 0.15 inj · No faults',
    config: {
      meshWidth: 4,
      meshHeight: 4,
      workloadType: 'UNIFORM_RANDOM',
      injectionRate: 0.15,
      faultInjectionEnabled: false,
      faultRatePct: 0,
    },
  },
  {
    name: 'Preset 2 — High Traffic',
    desc: '4×4 · Uniform Random · 0.30 inj · No faults',
    config: {
      meshWidth: 4,
      meshHeight: 4,
      workloadType: 'UNIFORM_RANDOM',
      injectionRate: 0.3,
      faultInjectionEnabled: false,
      faultRatePct: 0,
    },
  },
  {
    name: 'Preset 3 — Fault Tolerance',
    desc: '4×4 · Uniform Random · 0.25 inj · 10% faults',
    config: {
      meshWidth: 4,
      meshHeight: 4,
      workloadType: 'UNIFORM_RANDOM',
      injectionRate: 0.25,
      faultInjectionEnabled: true,
      faultRatePct: 10,
    },
  },
  {
    name: 'Preset 4 — Stress Test',
    desc: '5×5 · Hotspot · 0.35 inj · 15% faults',
    config: {
      meshWidth: 5,
      meshHeight: 5,
      workloadType: 'HOTSPOT_TRAFFIC',
      injectionRate: 0.35,
      faultInjectionEnabled: true,
      faultRatePct: 15,
    },
  },
];

const FIELD_LABEL = 'text-[9px] uppercase tracking-wide text-slate-500 font-mono font-bold';
const SELECT_CLS =
  'w-full bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-slate-200 text-[11px] font-mono rounded px-2 py-1 focus:border-emerald-500 focus:outline-none';

export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
  config,
  onUpdateConfig,
  onRunComparison,
  onRunFaultSweep,
  isRunningComparison,
  isRunningFaultSweep,
}) => {
  const meshSize = config.meshWidth === config.meshHeight ? config.meshWidth : 4;

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4 shadow-sm space-y-4 text-[var(--text-primary)]">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Configuration panel</h3>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          Drives both the Conventional and Proposed runs identically
        </span>
      </div>

      {/* Presets */}
      <div className="space-y-1.5">
        <div className={FIELD_LABEL}>Benchmark presets</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => onUpdateConfig(preset.config)}
              className="text-left p-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-inset)] hover:border-emerald-500/60 hover:bg-emerald-500/5 transition-colors"
            >
              <div className="text-[11px] font-bold text-emerald-400 font-mono">{preset.name}</div>
              <div className="text-[9px] text-slate-400 font-mono mt-0.5">{preset.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Core grid params */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <div className={FIELD_LABEL}>NoC Size</div>
          <select
            className={SELECT_CLS}
            value={meshSize}
            onChange={(e) => {
              const n = Number(e.target.value);
              onUpdateConfig({ meshWidth: n, meshHeight: n });
            }}
          >
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}×{n}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className={FIELD_LABEL}>Packet Size (bits)</div>
          <select
            className={SELECT_CLS}
            value={config.flitDataBits}
            onChange={(e) => onUpdateConfig({ flitDataBits: Number(e.target.value) })}
          >
            {[16, 32, 64, 128].map((n) => (
              <option key={n} value={n}>
                {n} bits
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className={FIELD_LABEL}>Traffic Pattern</div>
          <select
            className={SELECT_CLS}
            value={STANDARD_TRAFFIC_PATTERNS.some((p) => p.id === config.workloadType) ? config.workloadType : 'UNIFORM_RANDOM'}
            onChange={(e) => onUpdateConfig({ workloadType: e.target.value as NoCConfig['workloadType'] })}
          >
            {STANDARD_TRAFFIC_PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className={FIELD_LABEL}>Buffer Depth</div>
          <select
            className={SELECT_CLS}
            value={config.bufferDepthPerVC}
            onChange={(e) => onUpdateConfig({ bufferDepthPerVC: Number(e.target.value) })}
          >
            {[2, 4, 8, 16].map((n) => (
              <option key={n} value={n}>
                {n} flits/VC
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className={FIELD_LABEL}>Virtual Channels</div>
          <select
            className={SELECT_CLS}
            value={config.virtualChannels}
            onChange={(e) => onUpdateConfig({ virtualChannels: Number(e.target.value) })}
          >
            {[1, 2, 4].map((n) => (
              <option key={n} value={n}>
                {n} VC
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className={FIELD_LABEL}>Routing (live preview)</div>
          <select
            className={SELECT_CLS}
            value={config.routingMode}
            onChange={(e) => onUpdateConfig({ routingMode: e.target.value as RoutingMode })}
          >
            <option value="BASELINE_XY">XY Routing</option>
            <option value="ADAPTIVE_DYXY">Adaptive Routing</option>
            <option value="PROPOSED_RECONFIGURABLE">Reconfigurable Routing</option>
          </select>
        </div>

        <div className="space-y-1 col-span-2">
          <div className={FIELD_LABEL}>
            Injection Rate <span className="text-emerald-400">{config.injectionRate.toFixed(2)}</span> flits/cycle
          </div>
          <input
            type="range"
            min={0.05}
            max={0.9}
            step={0.05}
            value={config.injectionRate}
            onChange={(e) => onUpdateConfig({ injectionRate: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </div>

        <div className="space-y-1 col-span-2">
          <div className={FIELD_LABEL}>
            Number of Packets <span className="text-emerald-400">{config.targetPacketCount.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min={1000}
            max={100000}
            step={1000}
            value={config.targetPacketCount}
            onChange={(e) => onUpdateConfig({ targetPacketCount: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </div>

        <div className="space-y-1 col-span-2">
          <div className={FIELD_LABEL}>
            Simulation Cycles <span className="text-emerald-400">{config.simulationCycleLimit.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min={1000}
            max={100000}
            step={1000}
            value={config.simulationCycleLimit}
            onChange={(e) => onUpdateConfig({ simulationCycleLimit: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </div>
      </div>

      {/* Fault injection */}
      <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase text-slate-400">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            Fault Injection
          </div>
          <button
            onClick={() => onUpdateConfig({ faultInjectionEnabled: !config.faultInjectionEnabled })}
            className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono border transition-colors ${
              config.faultInjectionEnabled
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-[var(--bg-surface)] text-slate-400 border-[var(--border-subtle)]'
            }`}
          >
            {config.faultInjectionEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className={`grid grid-cols-2 gap-3 transition-opacity ${config.faultInjectionEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <div className="space-y-1">
            <div className={FIELD_LABEL}>Fault Rate</div>
            <select
              className={SELECT_CLS}
              value={config.faultRatePct}
              onChange={(e) => onUpdateConfig({ faultRatePct: Number(e.target.value) })}
            >
              {[0, 5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <div className={FIELD_LABEL}>Fault Type</div>
            <select
              className={SELECT_CLS}
              value={config.faultType}
              onChange={(e) => onUpdateConfig({ faultType: e.target.value as FaultType })}
            >
              <option value="ROUTER_FAULT">Router Fault</option>
              <option value="LINK_FAULT">Link Fault</option>
              <option value="RANDOM_FAULT">Random Fault</option>
            </select>
          </div>
        </div>

        {config.faultInjectionEnabled && config.faultRatePct > 0 && (
          <div className="flex items-start gap-1.5 text-[9px] text-amber-300/80 font-mono">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
            <span>
              Baseline (XY) has no dynamic reconfiguration and cannot route around a fault -- packets that need a faulty
              router/link simply never arrive. Proposed dynamically deflects around them. Both effects show up in the
              measured metrics below, not as a forced outcome.
            </span>
          </div>
        )}
      </div>

      {/* Run buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={onRunComparison}
          disabled={isRunningComparison}
          className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-black text-xs font-bold flex items-center gap-1.5 transition-colors"
        >
          {isRunningComparison ? <Sparkles className="w-3.5 h-3.5 animate-pulse" /> : <Play className="w-3.5 h-3.5 fill-black" />}
          {isRunningComparison ? 'Running comparison…' : 'Run Architecture Comparison'}
        </button>
        <button
          onClick={onRunFaultSweep}
          disabled={isRunningFaultSweep}
          className="px-3 py-1.5 rounded bg-[var(--bg-inset)] hover:bg-[#21262d] disabled:opacity-50 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition-colors"
        >
          {isRunningFaultSweep ? <Zap className="w-3.5 h-3.5 animate-pulse" /> : <Layers className="w-3.5 h-3.5" />}
          {isRunningFaultSweep ? 'Sweeping fault rates…' : 'Run Fault Rate Sweep (0-20%)'}
        </button>
        <span className="text-[9px] text-slate-500 font-mono ml-auto">
          {config.meshWidth}×{config.meshHeight} · {config.workloadType.replace(/_/g, ' ')} · {config.injectionRate.toFixed(2)} inj/c
          {config.faultInjectionEnabled ? ` · ${config.faultRatePct}% ${config.faultType.replace('_', ' ').toLowerCase()}` : ''}
        </span>
      </div>
    </div>
  );
};

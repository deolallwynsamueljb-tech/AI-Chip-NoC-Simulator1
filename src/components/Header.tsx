import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  StepForward,
  Cpu,
  BarChart3,
  Code2,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react';
import { NoCConfig, RoutingMode, WorkloadType } from '../types/noc';

interface HeaderProps {
  config: NoCConfig;
  isRunning: boolean;
  simSpeed: number;
  currentCycle: number;
  activeTab: 'simulator' | 'benchmarks' | 'matrix' | 'research';
  onTogglePlay: () => void;
  onStepCycle: (cycles: number) => void;
  onReset: () => void;
  onChangeSpeed: (speed: number) => void;
  onUpdateConfig: (partial: Partial<NoCConfig>) => void;
  onSetActiveTab: (tab: 'simulator' | 'benchmarks' | 'matrix' | 'research') => void;
  onOpenCodeExport: () => void;
  onRunSweep: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  isRunning,
  simSpeed,
  currentCycle,
  activeTab,
  onTogglePlay,
  onStepCycle,
  onReset,
  onChangeSpeed,
  onUpdateConfig,
  onSetActiveTab,
  onOpenCodeExport,
  onRunSweep,
}) => {
  return (
    <header className="border-b border-[#30363d] bg-[#161b22] sticky top-0 z-40 shadow-sm text-[#c9d1d9]">
      {/* Top Main Title & Metadata Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
          {/* Left branding */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500/20 border border-emerald-500/80 flex items-center justify-center rounded shrink-0">
              <div className="w-3.5 h-3.5 bg-emerald-400 rounded-sm"></div>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xs font-bold tracking-tight text-white uppercase font-mono">
                  Adaptive AI-NoC Framework
                </h1>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                  v2.4-RECONFIG
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-[#0d1117] border border-[#30363d] px-1.5 py-0.2 rounded">
                  MESH_{config.meshWidth}X{config.meshHeight}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono tracking-tight">
                SYSTEM ARCHITECTURE: SELF-RECONFIGURABLE RUNTIME CONTROLLER &bull; BASELINE-1 XY
              </p>
            </div>
          </div>

          {/* Top Status & Main Nav Bar */}
          <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
            {/* Telemetry quick badges */}
            <div className="hidden lg:flex items-center gap-3 text-[11px] font-mono mr-2">
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                <span className="text-[10px] uppercase font-bold text-slate-300">
                  {isRunning ? 'RUNNING: ACTIVE_SIM' : 'PAUSED: STANDBY'}
                </span>
              </div>
              <div className="bg-[#0d1117] px-2 py-0.5 rounded border border-[#30363d] text-[10px] text-emerald-400">
                {config.injectionRate.toFixed(2)} INJ RATE
              </div>
            </div>

            <nav className="flex bg-[#0d1117] p-0.5 rounded border border-[#30363d]">
              <button
                id="tab-simulator"
                onClick={() => onSetActiveTab('simulator')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors flex items-center gap-1.5 ${
                  activeTab === 'simulator'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                Live Mesh Grid
              </button>
              <button
                id="tab-benchmarks"
                onClick={() => onSetActiveTab('benchmarks')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors flex items-center gap-1.5 ${
                  activeTab === 'benchmarks'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Sweep Evaluation
              </button>
              <button
                id="tab-matrix"
                onClick={() => onSetActiveTab('matrix')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors flex items-center gap-1.5 ${
                  activeTab === 'matrix'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                Baseline Matrix
              </button>
              <button
                id="tab-research"
                onClick={() => onSetActiveTab('research')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors flex items-center gap-1.5 ${
                  activeTab === 'research'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Thesis &amp; Novelty
              </button>
            </nav>

            <button
              id="btn-export-code"
              onClick={onOpenCodeExport}
              className="px-2.5 py-1 text-[11px] font-semibold rounded bg-[#0d1117] hover:bg-[#21262d] text-[#c9d1d9] border border-[#30363d] flex items-center gap-1.5 transition-colors"
              title="Export Python & Verilog RTL"
            >
              <Code2 className="w-3.5 h-3.5 text-emerald-400" />
              Export
            </button>

            <button
              id="btn-run-full-sweep"
              onClick={onRunSweep}
              className="px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-black shadow-sm flex items-center gap-1 transition-all"
            >
              <Zap className="w-3 h-3 fill-black" />
              Sweep
            </button>
          </div>
        </div>

        {/* Bottom Simulation Sub-bar */}
        <div className="mt-2.5 pt-2 border-t border-[#30363d]/80 flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono">
          {/* Controls */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              id="btn-toggle-play"
              onClick={onTogglePlay}
              className={`px-3 py-1 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors ${
                isRunning
                  ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 hover:bg-amber-600/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
              }`}
            >
              {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isRunning ? 'HALT SIM' : 'RESUME SIM'}
            </button>

            <button
              id="btn-step-1"
              onClick={() => onStepCycle(1)}
              disabled={isRunning}
              className="px-2 py-1 rounded bg-[#0d1117] hover:bg-[#21262d] disabled:opacity-40 text-slate-300 border border-[#30363d] flex items-center gap-1 text-[11px]"
            >
              <StepForward className="w-3 h-3" />
              +1c
            </button>

            <button
              id="btn-step-25"
              onClick={() => onStepCycle(config.epochCycles)}
              disabled={isRunning}
              className="px-2 py-1 rounded bg-[#0d1117] hover:bg-[#21262d] disabled:opacity-40 text-slate-300 border border-[#30363d] flex items-center gap-1 text-[11px]"
            >
              <FastForward className="w-3 h-3" />
              +{config.epochCycles}c
            </button>

            <button
              id="btn-reset-sim"
              onClick={onReset}
              className="p-1 rounded bg-[#0d1117] hover:bg-[#21262d] text-slate-400 hover:text-slate-200 border border-[#30363d]"
              title="Reset Simulation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Sim Speed selector */}
            <div className="flex items-center gap-1 bg-[#0d1117] px-1.5 py-0.5 rounded border border-[#30363d]">
              <span className="text-[10px] text-slate-500 font-bold">SPD:</span>
              {[1, 5, 20, 50].map((spd) => (
                <button
                  key={spd}
                  onClick={() => onChangeSpeed(spd)}
                  className={`px-1.5 py-0.2 text-[10px] rounded font-mono ${
                    simSpeed === spd
                      ? 'bg-emerald-500 text-black font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* Right parameters */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Workload */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase">WORKLOAD:</span>
              <select
                id="select-workload"
                value={config.workloadType}
                onChange={(e) => onUpdateConfig({ workloadType: e.target.value as WorkloadType })}
                className="bg-[#0d1117] border border-[#30363d] text-slate-200 text-[11px] font-mono rounded px-2 py-0.5 focus:border-emerald-500 focus:outline-none"
              >
                <option value="CNN_LOCAL">CNN_LOCAL (High Spatial Locality)</option>
                <option value="TRANSFORMER_GLOBAL">TRANSFORMER_GLOBAL (All-to-All)</option>
                <option value="MOE_BURSTY">MOE_BURSTY (Sparse Expert Gating)</option>
                <option value="HOTSPOT_TRAFFIC">HOTSPOT_TRAFFIC (Central Sink)</option>
                <option value="UNIFORM_RANDOM">UNIFORM_RANDOM (Synthetic)</option>
                <option value="BIT_COMPLEMENT">BIT_COMPLEMENT (Bisection)</option>
              </select>
            </div>

            {/* Routing Mode */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase">ROUTING:</span>
              <select
                id="select-routing-mode"
                value={config.routingMode}
                onChange={(e) => onUpdateConfig({ routingMode: e.target.value as RoutingMode })}
                className="bg-[#0d1117] border border-[#30363d] text-emerald-400 text-[11px] font-mono font-bold rounded px-2 py-0.5 focus:border-emerald-500 focus:outline-none"
              >
                <option value="PROPOSED_RECONFIGURABLE">&#9733; Proposed: Self-Reconfigurable</option>
                <option value="BASELINE_XY">Baseline-1: XY Routing</option>
                <option value="ADAPTIVE_DYXY">Adaptive: DyXY Routing</option>
                <option value="CONGESTION_AWARE_RCA">Congestion-Aware: RCA</option>
                <option value="LOW_POWER_BYPASS">Low-Power: Bypass &amp; Gating</option>
              </select>
            </div>

            {/* Current Cycle Pill */}
            <div className="bg-[#010409] px-2 py-0.5 rounded border border-[#30363d] font-mono text-[11px] text-emerald-400">
              CYCLE: <span className="font-bold text-white">{currentCycle}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

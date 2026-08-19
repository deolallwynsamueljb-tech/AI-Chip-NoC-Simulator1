import React from 'react';
import {
  Activity,
  ArrowDown,
  BarChart2,
  Clock,
  Cpu,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';
import { NoCConfig, SimulationMetrics } from '@shared/types/noc';

interface MetricsDashboardProps {
  metrics: SimulationMetrics;
  config: NoCConfig;
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  metrics,
  config,
}) => {
  const {
    currentCycle,
    totalInjectedPackets,
    totalDeliveredPackets,
    totalInjectedFlits,
    totalDeliveredFlits,
    averagePacketLatency,
    maxPacketLatency,
    tailLatencyP99,
    throughputFlitsPerNodeCycle,
    averageBufferOccupancyPct,
    totalEnergyPJ,
    energyPerFlitPJ,
    energyDelayProduct,
    energyBreakdown,
  } = metrics;

  const routerDynamicEnergyPJ = energyBreakdown?.bufferDynamic ?? 0;
  const crossbarEnergyPJ = energyBreakdown?.crossbarDynamic ?? 0;
  const linkEnergyPJ = energyBreakdown?.linkDynamic ?? 0;
  const leakageEnergyPJ = energyBreakdown?.staticLeakage ?? 0;
  const controllerOverheadPJ = energyBreakdown?.controllerDynamic ?? 0;

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4 shadow-sm space-y-4 text-[var(--text-primary)]">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold font-mono tracking-tight text-white uppercase">
            Real-Time Performance Monitor &amp; Energy Telemetry
          </h3>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
          <span>{config.techNodeNm}nm energy model</span>
        </div>
      </div>

      {/* 4 Main High Density KPI Blocks */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Average Latency */}
        <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-3 rounded flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase font-mono font-bold">
            <span>Avg Packet Latency</span>
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="my-1">
            <span className="text-2xl font-mono font-bold text-white">
              {averagePacketLatency.toFixed(2)}{' '}
              <span className="text-xs font-normal text-slate-500 font-sans">cycles</span>
            </span>
          </div>
          <div className="text-[9px] font-mono text-slate-400 flex justify-between border-t border-[var(--border-subtle)] pt-1">
            <span>P99: {tailLatencyP99.toFixed(1)}c</span>
            <span>Max: {maxPacketLatency}c</span>
          </div>
        </div>

        {/* KPI 2: Accepted Throughput */}
        <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-3 rounded flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase font-mono font-bold">
            <span>Accepted Throughput</span>
            <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="my-1">
            <span className="text-2xl font-mono font-bold text-white">
              {throughputFlitsPerNodeCycle.toFixed(3)}{' '}
              <span className="text-xs font-normal text-slate-500 font-sans">flit/node/c</span>
            </span>
          </div>
          <div className="text-[9px] font-mono text-slate-400 flex justify-between border-t border-[var(--border-subtle)] pt-1">
            <span>Delivered: {totalDeliveredFlits}</span>
            <span>Injected: {totalInjectedFlits}</span>
          </div>
        </div>

        {/* KPI 3: Energy per Flit */}
        <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-3 rounded flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase font-mono font-bold">
            <span>Energy Dissipation</span>
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="my-1">
            <span className="text-2xl font-mono font-bold text-white">
              {energyPerFlitPJ.toFixed(2)}{' '}
              <span className="text-xs font-normal text-slate-500 font-sans">pJ / flit</span>
            </span>
          </div>
          <div className="text-[9px] font-mono text-slate-400 flex justify-between border-t border-[var(--border-subtle)] pt-1">
            <span>Total: {totalEnergyPJ.toFixed(0)} pJ</span>
            <span>Leakage: {leakageEnergyPJ.toFixed(0)} pJ</span>
          </div>
        </div>

        {/* KPI 4: Energy-Delay Product */}
        <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-3 rounded flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase font-mono font-bold">
            <span>Energy-Delay Product</span>
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="my-1">
            <span className="text-2xl font-mono font-bold text-emerald-400">
              {energyDelayProduct.toFixed(1)}{' '}
              <span className="text-xs font-normal text-slate-500 font-sans">pJ &bull; cyc</span>
            </span>
          </div>
          <div className="text-[9px] font-mono text-slate-400 flex justify-between border-t border-[var(--border-subtle)] pt-1">
            <span>Buffer Load: {averageBufferOccupancyPct.toFixed(1)}%</span>
            <span>
              Controller: {totalEnergyPJ > 0 ? ((controllerOverheadPJ / totalEnergyPJ) * 100).toFixed(2) : '0.00'}%
            </span>
          </div>
        </div>
      </div>

      {/* Energy Component Breakdown */}
      <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded p-3 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase text-slate-400">
          <span>Energy subsystem breakdown ({config.techNodeNm}nm)</span>
          <span className="text-emerald-400">Total: {totalEnergyPJ.toFixed(1)} pJ</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] font-mono">
          <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
            <span className="text-slate-500 block text-[9px]">BUFFER FIFOS</span>
            <span className="font-bold text-white">{routerDynamicEnergyPJ.toFixed(1)} pJ</span>
          </div>
          <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
            <span className="text-slate-500 block text-[9px]">CROSSBAR XBAR</span>
            <span className="font-bold text-white">{crossbarEnergyPJ.toFixed(1)} pJ</span>
          </div>
          <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
            <span className="text-slate-500 block text-[9px]">INTERCONNECT LINKS</span>
            <span className="font-bold text-white">{linkEnergyPJ.toFixed(1)} pJ</span>
          </div>
          <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
            <span className="text-slate-500 block text-[9px]">STATIC LEAKAGE</span>
            <span className="font-bold text-white">{leakageEnergyPJ.toFixed(1)} pJ</span>
          </div>
          <div className="bg-[var(--bg-surface)] p-2 rounded border border-emerald-500/30">
            <span className="text-emerald-400 block text-[9px]">CONTROLLER LOGIC</span>
            <span className="font-bold text-emerald-300">{controllerOverheadPJ.toFixed(2)} pJ</span>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Cpu,
  Layers,
  Sparkles,
  Thermometer,
  X,
  Zap,
} from 'lucide-react';
import { NoCConfig, PortDirection, RouterBuffer, RouterNode } from '../types/noc';

interface RouterInspectorModalProps {
  router: RouterNode | null;
  config: NoCConfig;
  onClose: () => void;
}

export const RouterInspectorModal: React.FC<RouterInspectorModalProps> = ({
  router,
  config,
  onClose,
}) => {
  if (!router) return null;

  const { x, y, currentMode, buffers, energyPJ, linkUtilization } = router;
  const directions: PortDirection[] = ['LOCAL', 'NORTH', 'SOUTH', 'EAST', 'WEST'];

  const dirIcons: Record<PortDirection, React.ReactNode> = {
    LOCAL: <Cpu className="w-3 h-3 text-emerald-400" />,
    NORTH: <ArrowUp className="w-3 h-3 text-slate-400" />,
    SOUTH: <ArrowDown className="w-3 h-3 text-slate-400" />,
    EAST: <ArrowRight className="w-3 h-3 text-slate-400" />,
    WEST: <ArrowLeft className="w-3 h-3 text-slate-400" />,
  };

  let totalFlits = 0;
  if (buffers) {
    buffers.forEach((buf) => {
      totalFlits += buf?.flits?.length || 0;
    });
  }
  const maxCap = config.virtualChannels * config.bufferDepthPerVC * 5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0a0c10]/80 backdrop-blur-sm">
      <div className="bg-[#161b22] border border-[#30363d] rounded max-w-2xl w-full p-4 shadow-2xl space-y-3 max-h-[90vh] overflow-y-auto text-[#c9d1d9]">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-[#30363d]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-emerald-500/20 border border-emerald-500/80 flex items-center justify-center text-emerald-300 font-bold font-mono text-xs">
              R({x},{y})
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold font-mono text-white uppercase">Router Tile ({x}, {y}) Diagnostic</h3>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {currentMode.replace('_', ' ')}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Total Capacity: {maxCap} flits &bull; Active: {totalFlits} flits
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded bg-[#0d1117] text-slate-400 hover:text-white hover:bg-[#21262d] border border-[#30363d] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Port Queues & VC Breakdown */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-emerald-400" />
            Port Input FIFOs &amp; Virtual Channels
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {directions.map((port) => {
              return (
                <div key={port} className="bg-[#0d1117] p-2 rounded border border-[#30363d] space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="font-semibold text-slate-200 flex items-center gap-1">
                      {dirIcons[port]} {port}
                    </span>
                    <span className="text-[9px] text-slate-500">
                      Util: {linkUtilization[port]} hops
                    </span>
                  </div>

                  {/* VC List */}
                  <div className="space-y-1">
                    {Array.from({ length: config.virtualChannels }).map((_, vcId) => {
                      const buf = buffers?.get(`${port}_${vcId}`);
                      const flitCount = buf?.flits?.length || 0;
                      const isGated = buf?.isPowerGated;

                      return (
                        <div
                          key={vcId}
                          className={`p-1 rounded text-[10px] font-mono flex items-center justify-between border ${
                            isGated
                              ? 'bg-[#161b22]/50 border-[#30363d] text-slate-600'
                              : 'bg-[#161b22] border-[#30363d] text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-emerald-400 font-bold">VC{vcId}</span>
                            {isGated && (
                              <span className="text-[8px] px-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                                GATED
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {Array.from({ length: config.bufferDepthPerVC }).map((_, slotIdx) => {
                              const filled = slotIdx < flitCount;
                              const flit = buf?.flits[slotIdx];

                              return (
                                <span
                                  key={slotIdx}
                                  title={flit ? `Flit ${flit.id} -> (${flit.dstX}, ${flit.dstY})` : 'Empty'}
                                  className={`w-2.5 h-2.5 rounded-sm border ${
                                    filled
                                      ? 'bg-emerald-500 border-emerald-400'
                                      : 'bg-[#0d1117] border-[#30363d]'
                                  }`}
                                />
                              );
                            })}
                            <span className="text-[9px] text-slate-400 ml-1 font-bold">
                              {flitCount}/{config.bufferDepthPerVC}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Energy & Telemetry */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#30363d] font-mono text-[10px]">
          <div className="bg-[#0d1117] p-2 rounded border border-[#30363d]">
            <div className="text-[9px] text-slate-500">Total Energy</div>
            <div className="text-xs font-bold text-white">
              {(energyPJ.bufferDynamic + energyPJ.crossbarDynamic + energyPJ.linkDynamic + energyPJ.staticLeakage).toFixed(2)} pJ
            </div>
          </div>
          <div className="bg-[#0d1117] p-2 rounded border border-[#30363d]">
            <div className="text-[9px] text-slate-500">Delivered Flits</div>
            <div className="text-xs font-bold text-emerald-400">{router.totalDelivered}</div>
          </div>
          <div className="bg-[#0d1117] p-2 rounded border border-[#30363d]">
            <div className="text-[9px] text-slate-500">Temp Rise</div>
            <div className="text-xs font-bold text-amber-400">
              {(router.temperatureRelative * 100).toFixed(0)}&deg;C
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Cpu,
  Eye,
  Layers,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { FaultAvoidanceEvent, Link, NoCConfig, SerializedRouterNode } from '@shared/types/noc';

interface MeshGridProps {
  routers: Map<number, SerializedRouterNode>;
  links: Link[];
  config: NoCConfig;
  selectedRouterId: number | null;
  onSelectRouter: (id: number) => void;
  /** Optional -- when provided, the most recent fault-deflection hops are
   * highlighted on the link overlay so a fault reroute is visible, not just
   * logged. Omit for read-only comparison views that don't need it. */
  faultAvoidanceEvents?: FaultAvoidanceEvent[];
  title?: string;
}

type HeatmapMode = 'OCCUPANCY' | 'ROUTING_MODE' | 'ENERGY' | 'TEMPERATURE';

export const MeshGrid: React.FC<MeshGridProps> = ({
  routers,
  links,
  config,
  selectedRouterId,
  onSelectRouter,
  faultAvoidanceEvents = [],
  title,
}) => {
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>('OCCUPANCY');
  const { meshWidth, meshHeight } = config;

  // Recent fault-deflection hops, as a lookup from "which link" to how
  // recent (0 = most recent) -- used to pulse those specific edges on the
  // overlay so a reroute-around-a-fault is visually traceable, not just a
  // log entry.
  const recentAvoidanceByLink = useMemo(() => {
    const map = new Map<string, number>();
    faultAvoidanceEvents.slice(0, 8).forEach((ev, idx) => {
      const key = `${ev.atX},${ev.atY}:${ev.chosenPort}`;
      if (!map.has(key)) map.set(key, idx);
    });
    return map;
  }, [faultAvoidanceEvents]);

  // Undirected link list for the overlay: one SVG line per physical link
  // (not per direction), carrying the worse-of-two-endpoints congestion,
  // fault state, in-flight-flit state (either direction), and recency of
  // any fault-avoidance event on it.
  const overlayLinks = useMemo(() => {
    const seen = new Set<string>();
    const result: {
      x1: number; y1: number; x2: number; y2: number;
      isFaulty: boolean;
      hasFlit: boolean;
      congestion: number;
      avoidanceRecency: number | null;
    }[] = [];

    links.forEach((l) => {
      const undirectedKey = [`${l.srcX},${l.srcY}`, `${l.dstX},${l.dstY}`].sort().join('|');
      if (seen.has(undirectedKey)) return;
      seen.add(undirectedKey);

      const reverse = links.find((r) => r.srcX === l.dstX && r.srcY === l.dstY && r.dstX === l.srcX && r.dstY === l.srcY);
      const srcRouter = routers.get(l.srcY * meshWidth + l.srcX);
      const dstRouter = routers.get(l.dstY * meshWidth + l.dstX);

      const avoidKeyFwd = `${l.srcX},${l.srcY}:${l.direction}`;
      const avoidKeyRev = reverse ? `${reverse.srcX},${reverse.srcY}:${reverse.direction}` : null;
      const recencyFwd = recentAvoidanceByLink.get(avoidKeyFwd);
      const recencyRev = avoidKeyRev ? recentAvoidanceByLink.get(avoidKeyRev) : undefined;
      const recency = [recencyFwd, recencyRev].filter((v): v is number => v !== undefined).sort((a, b) => a - b)[0];

      result.push({
        x1: l.srcX + 0.5,
        y1: l.srcY + 0.5,
        x2: l.dstX + 0.5,
        y2: l.dstY + 0.5,
        isFaulty: l.isFaulty || !!reverse?.isFaulty,
        hasFlit: l.flitInTransit !== null || reverse?.flitInTransit !== null,
        congestion: Math.max(srcRouter?.congestionScore ?? 0, dstRouter?.congestionScore ?? 0),
        avoidanceRecency: recency ?? null,
      });
    });

    return result;
  }, [links, routers, meshWidth, recentAvoidanceByLink]);

  // Helper for color coding tile based on heatmap
  const getTileStyle = (router: SerializedRouterNode, occupancyPct: number) => {
    if (heatmapMode === 'OCCUPANCY') {
      if (occupancyPct < 5) return 'bg-[var(--bg-inset)] border-[var(--border-subtle)] text-slate-500';
      if (occupancyPct < 25) return 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300';
      if (occupancyPct < 50) return 'bg-emerald-700/50 border-emerald-500/60 text-emerald-100';
      if (occupancyPct < 75) return 'bg-yellow-900/60 border-yellow-500/60 text-yellow-200';
      return 'bg-red-950/80 border-red-500/80 text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.25)]';
    }

    if (heatmapMode === 'ROUTING_MODE') {
      switch (router.currentMode) {
        case 'BASELINE_XY':
          return 'bg-slate-900 border-slate-700 text-slate-300';
        case 'ADAPTIVE_DYXY':
          return 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300';
        case 'CONGESTION_AWARE_RCA':
          return 'bg-purple-950/70 border-purple-500/60 text-purple-300';
        case 'LOW_POWER_BYPASS':
          return 'bg-cyan-950/70 border-cyan-500/60 text-cyan-300';
        case 'TASK_BASED_TBP':
          return 'bg-orange-950/70 border-orange-500/60 text-orange-300';
        default:
          return 'bg-emerald-900/50 border-emerald-400 text-emerald-200';
      }
    }

    if (heatmapMode === 'ENERGY') {
      const totEnergy =
        router.energyPJ.bufferDynamic +
        router.energyPJ.crossbarDynamic +
        router.energyPJ.linkDynamic;
      if (totEnergy < 1.0) return 'bg-slate-900 border-slate-700 text-slate-400';
      if (totEnergy < 3.0) return 'bg-yellow-950/60 border-yellow-600/50 text-yellow-300';
      return 'bg-red-950/70 border-red-500/70 text-red-200';
    }

    // TEMPERATURE
    if (router.temperatureRelative < 0.25) return 'bg-slate-900 border-slate-700 text-slate-400';
    if (router.temperatureRelative < 0.5) return 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300';
    if (router.temperatureRelative < 0.75) return 'bg-yellow-950/60 border-yellow-600/60 text-yellow-300';
    return 'bg-red-950/80 border-red-500/80 text-red-200';
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4 shadow-sm flex flex-col h-full text-[var(--text-primary)]">
      {/* Visualizer Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)] mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold font-mono tracking-tight text-white uppercase">
              {title ?? `Mesh NoC Visualizer (${meshWidth}×${meshHeight} Grid Topology)`}
            </h2>
          </div>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
            Click any router tile to inspect port queues, VC state, and dynamic deflection
          </p>
        </div>

        {/* Heatmap Mode Selector */}
        <div className="flex items-center gap-1 bg-[var(--bg-inset)] p-1 rounded border border-[var(--border-subtle)] text-[10px] font-mono">
          <button
            onClick={() => setHeatmapMode('OCCUPANCY')}
            className={`px-2 py-0.5 rounded transition-colors ${
              heatmapMode === 'OCCUPANCY'
                ? 'bg-emerald-500 text-black font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Buffer Load
          </button>
          <button
            onClick={() => setHeatmapMode('ROUTING_MODE')}
            className={`px-2 py-0.5 rounded transition-colors ${
              heatmapMode === 'ROUTING_MODE'
                ? 'bg-emerald-500 text-black font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Policy Mode
          </button>
          <button
            onClick={() => setHeatmapMode('ENERGY')}
            className={`px-2 py-0.5 rounded transition-colors ${
              heatmapMode === 'ENERGY'
                ? 'bg-emerald-500 text-black font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Energy pJ
          </button>
        </div>
      </div>

      {/* 2D Mesh Canvas & Grid */}
      <div className="flex-1 flex flex-col items-center justify-center p-3 bg-[var(--bg-deep)] rounded border border-[var(--border-subtle)]">
        <div
          className="relative grid gap-2 p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded shadow-2xl"
          style={{
            gridTemplateColumns: `repeat(${meshWidth}, minmax(0, 1fr))`,
          }}
        >
          {/* Link overlay: physical links between routers, colored by
              congestion/fault state, with a pulse on in-flight flits and
              recent fault-avoidance reroutes. Sits under the tiles (which
              have opaque backgrounds), so it's visible only in the gaps --
              exactly where the connecting wire between two routers reads. */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${meshWidth} ${meshHeight}`}
            preserveAspectRatio="none"
          >
            {overlayLinks.map((l, i) => {
              // Inset both ends so the drawn segment lives mostly in the
              // gap between tiles instead of running under their content.
              const dx = l.x2 - l.x1;
              const dy = l.y2 - l.y1;
              const len = Math.hypot(dx, dy) || 1;
              const inset = Math.min(0.36, len * 0.4);
              const ux = (dx / len) * inset;
              const uy = (dy / len) * inset;
              const lx1 = l.x1 + ux;
              const ly1 = l.y1 + uy;
              const lx2 = l.x2 - ux;
              const ly2 = l.y2 - uy;

              const isRecentAvoidance = l.avoidanceRecency !== null;
              let stroke = 'rgba(100,116,139,0.35)'; // idle
              let strokeWidth = 0.035;
              let dash: string | undefined;

              if (l.congestion > 0.05) {
                const t = Math.min(1, l.congestion);
                stroke = t > 0.6 ? 'rgba(239,68,68,0.55)' : t > 0.3 ? 'rgba(234,179,8,0.5)' : 'rgba(52,211,153,0.4)';
                strokeWidth = 0.05;
              }
              if (isRecentAvoidance) {
                stroke = 'rgba(217,119,6,0.9)';
                strokeWidth = 0.09;
              }
              if (l.isFaulty) {
                stroke = 'rgba(239,68,68,0.9)';
                strokeWidth = 0.07;
                dash = '0.12,0.08';
              }

              return (
                <g key={i}>
                  <line
                    x1={lx1}
                    y1={ly1}
                    x2={lx2}
                    y2={ly2}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={dash}
                    strokeLinecap="round"
                  />
                  {l.isFaulty && (
                    <g transform={`translate(${(l.x1 + l.x2) / 2}, ${(l.y1 + l.y2) / 2})`}>
                      <circle r={0.11} fill="rgba(127,29,29,0.95)" stroke="rgba(248,113,113,0.9)" strokeWidth={0.02} />
                      <line x1={-0.05} y1={-0.05} x2={0.05} y2={0.05} stroke="#fca5a5" strokeWidth={0.025} />
                      <line x1={-0.05} y1={0.05} x2={0.05} y2={-0.05} stroke="#fca5a5" strokeWidth={0.025} />
                    </g>
                  )}
                  {!l.isFaulty && l.hasFlit && (
                    <circle
                      cx={(l.x1 + l.x2) / 2}
                      cy={(l.y1 + l.y2) / 2}
                      r={0.06}
                      fill="#34d399"
                      className="animate-pulse"
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {Array.from({ length: meshHeight }).map((_, y) =>
            Array.from({ length: meshWidth }).map((_, x) => {
              const id = y * meshWidth + x;
              const router = routers.get(id);
              if (!router) return null;

              const isSelected = selectedRouterId === id;
              let totalFlits = 0;
              if (router.buffers) {
                Object.values(router.buffers).forEach((buf) => {
                  totalFlits += buf?.flits?.length || 0;
                });
              }
              const maxCap = config.virtualChannels * config.bufferDepthPerVC * 5;
              const occupancyPct = Math.min(100, (totalFlits / Math.max(1, maxCap)) * 100);

              // Mode badge
              const modeTag =
                router.currentMode === 'BASELINE_XY'
                  ? 'XY'
                  : router.currentMode === 'ADAPTIVE_DYXY'
                  ? 'DyXY'
                  : router.currentMode === 'CONGESTION_AWARE_RCA'
                  ? 'RCA'
                  : router.currentMode === 'TASK_BASED_TBP'
                  ? 'TBP'
                  : 'LP';

              const tileClasses = router.isFaulty
                ? 'bg-red-950/90 border-red-500 text-red-200 [background-image:repeating-linear-gradient(135deg,rgba(239,68,68,0.18)_0px,rgba(239,68,68,0.18)_4px,transparent_4px,transparent_10px)]'
                : getTileStyle(router, occupancyPct);

              return (
                <div
                  key={id}
                  id={`router-tile-${id}`}
                  onClick={() => onSelectRouter(id)}
                  className={`relative p-2 rounded cursor-pointer border transition-all duration-200 select-none flex flex-col justify-between w-20 h-20 sm:w-24 sm:h-24 ${tileClasses} ${
                    isSelected
                      ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-[var(--bg-canvas)]'
                      : 'hover:brightness-125'
                  }`}
                >
                  {/* Top Tile Coordinates and Mode */}
                  <div className="flex items-center justify-between text-[9px] font-mono font-bold leading-tight">
                    <span>R({x},{y})</span>
                    {router.isFaulty ? (
                      <span className="text-[8px] px-1 py-0.2 rounded bg-red-500/30 border border-red-400/60 uppercase flex items-center gap-0.5">
                        <X className="w-2 h-2" />
                        FAULT
                      </span>
                    ) : (
                      <span className="text-[8px] px-1 py-0.2 rounded bg-black/40 border border-[var(--border-subtle)] uppercase">
                        {modeTag}
                      </span>
                    )}
                  </div>

                  {/* Center Flit Count & Bar */}
                  <div className="my-auto text-center">
                    <div className="text-xs font-mono font-bold text-white">
                      {totalFlits} <span className="text-[8px] font-normal text-slate-400">flits</span>
                    </div>
                    <div className="w-full bg-[var(--bg-inset)] h-1 rounded-full overflow-hidden mt-1 border border-[var(--border-subtle)]">
                      <div
                        className={`h-full transition-all duration-300 ${
                          occupancyPct > 60
                            ? 'bg-red-500'
                            : occupancyPct > 30
                            ? 'bg-yellow-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${occupancyPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Bottom Stats: Total Injected/Delivered */}
                  <div className="flex items-center justify-between text-[8px] text-slate-400 pt-1 border-t border-[var(--border-subtle)]/80 font-mono">
                    <span>Tx:{router.totalInjected}</span>
                    <span>Rx:{router.totalDelivered}</span>
                  </div>

                  {/* Active Flit ping indicator */}
                  {totalFlits > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Legend & Summary Info */}
      <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-[9px] font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-300 uppercase">LOAD SCALE:</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded-sm"></span> IDLE
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-emerald-950 border border-emerald-500/40 rounded-sm"></span> LOW
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-emerald-700 border border-emerald-500 rounded-sm"></span> MED
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-yellow-600 border border-yellow-500 rounded-sm"></span> HIGH
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-red-700 border border-red-500 rounded-sm"></span> HOT
          </span>
          <span className="flex items-center gap-1 border-l border-[var(--border-subtle)] pl-3">
            <span className="w-2 h-2 rounded-sm bg-red-950 border border-red-500 [background-image:repeating-linear-gradient(135deg,rgba(239,68,68,0.4)_0px,rgba(239,68,68,0.4)_1px,transparent_1px,transparent_2px)]"></span>{' '}
            FAULTY
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-amber-500"></span> REROUTED
          </span>
        </div>

        <div className="text-slate-400">
          Tip: Select tile to inspect Virtual Channel FIFOs
        </div>
      </div>
    </div>
  );
};

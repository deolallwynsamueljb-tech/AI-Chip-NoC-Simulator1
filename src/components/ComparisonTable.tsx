import React from 'react';
import { Cpu } from 'lucide-react';
import { BenchmarkComparisonData, NoCConfig, SweepPoint } from '@shared/types/noc';

interface ComparisonTableProps {
  benchmarkData: BenchmarkComparisonData | null;
  config: NoCConfig;
}

const fmt = (value: number | undefined, digits: number, suffix = '') =>
  value === undefined ? '—' : `${value.toFixed(digits)}${suffix}`;

const getDelta = (val: number | undefined, baseline: number | undefined, lowerIsBetter = true) => {
  if (val === undefined || baseline === undefined || baseline === 0) return null;
  const pct = ((val - baseline) / baseline) * 100;
  const isGood = lowerIsBetter ? pct < 0 : pct > 0;
  return { pct: Math.abs(pct).toFixed(1), isGood, sign: pct < 0 ? '-' : '+' };
};

export const ComparisonTable: React.FC<ComparisonTableProps> = ({ benchmarkData, config }) => {
  if (!benchmarkData) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-6 text-center text-sm text-slate-400">
        Run a sweep to populate the baseline comparison matrix with real simulation data.
      </div>
    );
  }

  const foundIdx = benchmarkData.injectionRates.findIndex((r) => r >= 0.35);
  const targetIdx = foundIdx >= 0 ? foundIdx : Math.floor(benchmarkData.injectionRates.length / 2);

  const xy: SweepPoint | undefined = benchmarkData.results.BASELINE_XY[targetIdx];
  const adapt: SweepPoint | undefined = benchmarkData.results.ADAPTIVE_DYXY[targetIdx];
  const rca: SweepPoint | undefined = benchmarkData.results.CONGESTION_AWARE_RCA[targetIdx];
  const lp: SweepPoint | undefined = benchmarkData.results.LOW_POWER_BYPASS[targetIdx];
  const prop: SweepPoint | undefined = benchmarkData.results.PROPOSED_RECONFIGURABLE[targetIdx];

  const latDelta = getDelta(prop?.avgLatency, xy?.avgLatency, true);
  const tputDelta = getDelta(prop?.throughput, xy?.throughput, false);
  const bufDelta = getDelta(prop?.bufferOccupancyPct, xy?.bufferOccupancyPct, true);
  const edpDelta = getDelta(prop?.energyDelayProduct, xy?.energyDelayProduct, true);
  const tailDelta = getDelta(prop?.tailLatencyP99, xy?.tailLatencyP99, true);

  const rows: { label: string; key: keyof SweepPoint; digits: number; suffix: string; delta: ReturnType<typeof getDelta> }[] = [
    { label: 'Average Latency', key: 'avgLatency', digits: 2, suffix: ' cyc', delta: latDelta },
    { label: 'P99 Tail Latency', key: 'tailLatencyP99', digits: 1, suffix: ' cyc', delta: tailDelta },
    { label: 'Accepted Throughput', key: 'throughput', digits: 4, suffix: '', delta: tputDelta },
    { label: 'Average Buffer Load', key: 'bufferOccupancyPct', digits: 1, suffix: '%', delta: bufDelta },
    { label: 'Energy per Flit', key: 'energyPerFlitPJ', digits: 2, suffix: ' pJ', delta: null },
    { label: 'Energy-Delay Product', key: 'energyDelayProduct', digits: 1, suffix: '', delta: edpDelta },
  ];

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4 shadow-sm space-y-4 text-[var(--text-primary)]">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Baseline vs. proposed comparison</h3>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Operating point: injection rate ={' '}
            <strong className="text-white font-mono">{fmt(benchmarkData.injectionRates[targetIdx], 2)}</strong> flits/node/cycle
            &bull; workload: <strong className="text-emerald-400">{config.workloadType.replace('_', ' ')}</strong>
          </p>
        </div>

        {latDelta && tputDelta && (
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-bold text-[10px]">
              {latDelta.sign}
              {latDelta.pct}% latency
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold text-[10px]">
              +{tputDelta.pct}% throughput
            </span>
          </div>
        )}
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto rounded border border-[var(--border-subtle)]">
        <table className="w-full text-left text-xs text-slate-300 border-collapse font-mono">
          <thead className="bg-[var(--bg-inset)] text-[10px] font-bold text-slate-400 uppercase border-b border-[var(--border-subtle)]">
            <tr>
              <th className="py-2.5 px-3">Metric</th>
              <th className="py-2.5 px-3 bg-[var(--bg-surface)] text-slate-400">Baseline-1 (XY)</th>
              <th className="py-2.5 px-3">Adaptive (DyXY)</th>
              <th className="py-2.5 px-3">Congestion (RCA)</th>
              <th className="py-2.5 px-3">Low-Power Bypass</th>
              <th className="py-2.5 px-3 bg-emerald-950/40 text-emerald-400 border-l border-emerald-500/40">
                Proposed (Reconfigurable)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]/70 text-[10px]">
            {rows.map((row) => (
              <tr key={row.key} className="hover:bg-white/5">
                <td className="py-2 px-3 font-semibold text-white font-sans">{row.label}</td>
                <td className="py-2 px-3 bg-[var(--bg-surface)] text-slate-400">{fmt(xy?.[row.key] as number | undefined, row.digits, row.suffix)}</td>
                <td className="py-2 px-3 text-slate-300">{fmt(adapt?.[row.key] as number | undefined, row.digits, row.suffix)}</td>
                <td className="py-2 px-3 text-slate-300">{fmt(rca?.[row.key] as number | undefined, row.digits, row.suffix)}</td>
                <td className="py-2 px-3 text-slate-300">{fmt(lp?.[row.key] as number | undefined, row.digits, row.suffix)}</td>
                <td className="py-2 px-3 bg-emerald-950/30 text-emerald-400 font-bold border-l border-emerald-500/40">
                  <div className="flex items-center justify-between gap-2">
                    <span>{fmt(prop?.[row.key] as number | undefined, row.digits, row.suffix)}</span>
                    {row.delta && (
                      <span className="text-[9px] text-emerald-400 bg-emerald-500/20 px-1 py-0.2 rounded border border-emerald-500/40">
                        {row.delta.sign}
                        {row.delta.pct}%
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

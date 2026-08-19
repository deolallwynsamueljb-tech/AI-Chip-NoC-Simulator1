import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Layers, Loader2, Sparkles } from 'lucide-react';
import { BenchmarkComparisonData, NoCConfig, WorkloadSensitivityItem } from '@shared/types/noc';

interface BenchmarkChartsProps {
  benchmarkData: BenchmarkComparisonData | null;
  config: NoCConfig;
  onRunNewSweep: () => void;
  workloadSensitivity: WorkloadSensitivityItem[] | null;
  isSweeping: boolean;
  sweepError: string | null;
}

export const BenchmarkCharts: React.FC<BenchmarkChartsProps> = ({
  benchmarkData,
  onRunNewSweep,
  workloadSensitivity,
  isSweeping,
  sweepError,
}) => {
  const [activeMetric, setActiveMetric] = useState<'LATENCY' | 'THROUGHPUT' | 'EDP'>('LATENCY');

  const chartData = useMemo(() => {
    if (!benchmarkData) return [];
    const metricKey = activeMetric === 'LATENCY' ? 'avgLatency' : activeMetric === 'THROUGHPUT' ? 'throughput' : 'energyDelayProduct';
    return benchmarkData.injectionRates.map((rate, idx) => ({
      injectionRate: rate,
      BASELINE_XY: benchmarkData.results.BASELINE_XY[idx]?.[metricKey],
      ADAPTIVE_DYXY: benchmarkData.results.ADAPTIVE_DYXY[idx]?.[metricKey],
      CONGESTION_AWARE_RCA: benchmarkData.results.CONGESTION_AWARE_RCA[idx]?.[metricKey],
      LOW_POWER_BYPASS: benchmarkData.results.LOW_POWER_BYPASS[idx]?.[metricKey],
      PROPOSED_RECONFIGURABLE: benchmarkData.results.PROPOSED_RECONFIGURABLE[idx]?.[metricKey],
    }));
  }, [benchmarkData, activeMetric]);

  // Real callouts, computed from the actual sweep - not hardcoded copy.
  const insights = useMemo(() => {
    if (!benchmarkData) return null;
    const rates = benchmarkData.injectionRates;
    const baseline = benchmarkData.results.BASELINE_XY;
    const proposed = benchmarkData.results.PROPOSED_RECONFIGURABLE;

    const baselineSatIdx = baseline.findIndex((p) => p.isSaturated);
    const proposedSatIdx = proposed.findIndex((p) => p.isSaturated);

    const highIdx = rates.length - 1;
    const baseHigh = baseline[highIdx];
    const propHigh = proposed[highIdx];
    const latencyGainPct =
      baseHigh && propHigh && baseHigh.avgLatency > 0
        ? ((baseHigh.avgLatency - propHigh.avgLatency) / baseHigh.avgLatency) * 100
        : null;

    return {
      baselineSatRate: baselineSatIdx >= 0 ? rates[baselineSatIdx] : null,
      proposedSatRate: proposedSatIdx >= 0 ? rates[proposedSatIdx] : null,
      highLoadRate: rates[highIdx],
      latencyGainPct,
      baseHighLatency: baseHigh?.avgLatency,
      propHighLatency: propHigh?.avgLatency,
      baseHighP99: baseHigh?.tailLatencyP99,
      propHighP99: propHigh?.tailLatencyP99,
    };
  }, [benchmarkData]);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4 shadow-sm space-y-4 text-[var(--text-primary)]">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Baseline-1 XY vs. proposed architecture</h3>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {benchmarkData
              ? `Swept ${benchmarkData.injectionRates.length} injection rates from ${benchmarkData.injectionRates[0].toFixed(2)} to ${benchmarkData.injectionRates[benchmarkData.injectionRates.length - 1].toFixed(2)} flits/node/cycle`
              : 'No sweep has run yet for the current configuration'}
          </p>
        </div>

        {/* Metric Selector Tabs */}
        {benchmarkData && (
          <div className="flex items-center gap-1 bg-[var(--bg-inset)] p-1 rounded border border-[var(--border-subtle)] text-[10px] font-mono">
            <button
              onClick={() => setActiveMetric('LATENCY')}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeMetric === 'LATENCY' ? 'bg-emerald-500 text-black font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Injection vs Latency
            </button>
            <button
              onClick={() => setActiveMetric('THROUGHPUT')}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeMetric === 'THROUGHPUT' ? 'bg-emerald-500 text-black font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Throughput
            </button>
            <button
              onClick={() => setActiveMetric('EDP')}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeMetric === 'EDP' ? 'bg-emerald-500 text-black font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              EDP (Energy &bull; Delay)
            </button>
          </div>
        )}
      </div>

      {sweepError && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-3">
          Sweep failed: {sweepError}
        </div>
      )}

      {!benchmarkData && !isSweeping && !sweepError && (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <p className="text-sm text-slate-400 max-w-sm">
            No benchmark data yet. Run a real multi-mode sweep against the current config to populate these charts.
          </p>
          <button
            onClick={onRunNewSweep}
            className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-semibold"
          >
            Run sweep
          </button>
        </div>
      )}

      {isSweeping && (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          <p className="text-xs">Running real simulations across every routing mode and injection rate…</p>
        </div>
      )}

      {benchmarkData && insights && (
        <>
          {/* Main Chart + Callout split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Chart View */}
            <div className="lg:col-span-8 bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-3 rounded h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="var(--border-subtle)" />
                  <XAxis
                    dataKey="injectionRate"
                    stroke="var(--text-secondary)"
                    fontSize={10}
                    fontFamily="monospace"
                    tickFormatter={(v) => `${v.toFixed(2)}`}
                  />
                  <YAxis stroke="var(--text-secondary)" fontSize={10} fontFamily="monospace" domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-inset)',
                      borderColor: 'var(--border-subtle)',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace', paddingTop: '6px' }} />
                  <Line
                    type="monotone"
                    dataKey="BASELINE_XY"
                    name="Baseline-1 (XY Routing)"
                    stroke="var(--text-secondary)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3 }}
                  />
                  <Line type="monotone" dataKey="ADAPTIVE_DYXY" name="Adaptive (DyXY)" stroke="#38bdf8" strokeWidth={1.5} dot={{ r: 2 }} />
                  <Line
                    type="monotone"
                    dataKey="CONGESTION_AWARE_RCA"
                    name="Congestion-Aware (RCA)"
                    stroke="#c084fc"
                    strokeWidth={1.5}
                    dot={{ r: 2 }}
                  />
                  <Line type="monotone" dataKey="LOW_POWER_BYPASS" name="Low-Power Bypass" stroke="#fbbf24" strokeWidth={1.5} dot={{ r: 2 }} />
                  <Line
                    type="monotone"
                    dataKey="PROPOSED_RECONFIGURABLE"
                    name="Proposed (Self-Reconfigurable)"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#10b981' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Results Summary - computed from the sweep that just ran */}
            <div className="lg:col-span-4 bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-3 rounded space-y-3 font-mono text-[10px]">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                Results summary
              </div>

              <div className="space-y-2 text-slate-300">
                <div className="p-2 bg-[var(--bg-surface)] rounded border border-[var(--border-subtle)]">
                  <div className="text-slate-500 text-[9px] uppercase">Saturation onset</div>
                  <div className="text-xs font-bold text-white mt-0.5">
                    Baseline saturates at{' '}
                    <span className="text-red-400">{insights.baselineSatRate !== null ? insights.baselineSatRate.toFixed(2) : 'not reached'}</span>
                    {' → '}Proposed{' '}
                    <span className="text-emerald-400">
                      {insights.proposedSatRate !== null ? `saturates at ${insights.proposedSatRate.toFixed(2)}` : 'did not saturate in tested range'}
                    </span>
                  </div>
                </div>

                {insights.latencyGainPct !== null && (
                  <div className="p-2 bg-[var(--bg-surface)] rounded border border-emerald-500/30">
                    <div className="text-emerald-400 text-[9px] uppercase">Latency gain at high load ({insights.highLoadRate.toFixed(2)})</div>
                    <div className="text-xs font-bold text-emerald-300 mt-0.5">
                      {insights.latencyGainPct.toFixed(1)}% average latency reduction
                    </div>
                  </div>
                )}

                <div className="p-2 bg-[var(--bg-surface)] rounded border border-[var(--border-subtle)]">
                  <div className="text-slate-500 text-[9px] uppercase">Tail latency (P99) at high load</div>
                  <div className="text-xs font-bold text-white mt-0.5">
                    Baseline: {insights.baseHighP99?.toFixed(1) ?? '—'}c &bull; Proposed:{' '}
                    <span className="text-emerald-400">{insights.propHighP99?.toFixed(1) ?? '—'}c</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Workload Sensitivity Matrix */}
          {workloadSensitivity && (
            <div className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded p-3 space-y-2">
              <h4 className="text-[10px] font-bold font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                AI workload latency sensitivity (vs. Baseline-1 XY)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 font-mono text-[10px]">
                {workloadSensitivity.map((item) => (
                  <div key={item.workload} className="p-2 bg-[var(--bg-surface)] rounded border border-[var(--border-subtle)] flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{item.workload}</span>
                      <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/30">
                        -{item.latencyReductionPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-slate-400 text-[9px] mt-2 flex justify-between">
                      <span>XY: {item.baselineXY.avgLatency.toFixed(1)}c</span>
                      <span className="text-emerald-300 font-bold">Prop: {item.proposed.avgLatency.toFixed(1)}c</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

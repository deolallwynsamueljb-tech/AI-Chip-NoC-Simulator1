import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GitCompareArrows, Loader2, ShieldAlert, Sparkles } from 'lucide-react';
import { ArchitectureComparisonResult, FaultSweepData } from '@shared/types/noc';
import { MeshGrid } from './MeshGrid';

interface ArchitectureComparisonViewProps {
  result: ArchitectureComparisonResult | null;
  faultSweep: FaultSweepData | null;
  isRunning: boolean;
  isSweepingFaults: boolean;
  error: string | null;
}

const fmt = (v: number, digits = 2, suffix = '') => `${v.toFixed(digits)}${suffix}`;

function toRouterMap(routers: ArchitectureComparisonResult['baseline']['routers']) {
  return new Map(routers.map((r) => [r.id, r]));
}

export const ArchitectureComparisonView: React.FC<ArchitectureComparisonViewProps> = ({
  result,
  faultSweep,
  isRunning,
  isSweepingFaults,
  error,
}) => {
  const barData = useMemo(() => {
    if (!result) return { latency: [], throughput: [], edp: [] };
    const { baseline, proposed } = result;
    return {
      latency: [
        { name: 'Latency (cyc)', Conventional: baseline.metrics.averagePacketLatency, Proposed: proposed.metrics.averagePacketLatency },
      ],
      throughput: [
        {
          name: 'Throughput (flit/node/c)',
          Conventional: baseline.metrics.throughputFlitsPerNodeCycle,
          Proposed: proposed.metrics.throughputFlitsPerNodeCycle,
        },
      ],
      edp: [
        { name: 'EDP (pJ·cyc)', Conventional: baseline.metrics.energyDelayProduct, Proposed: proposed.metrics.energyDelayProduct },
      ],
    };
  }, [result]);

  const interpretation = useMemo(() => {
    if (!result) return null;
    const { improvement, config, faults, baseline, proposed } = result;
    const latDir = improvement.latencyPct > 0.5 ? 'lower' : improvement.latencyPct < -0.5 ? 'higher' : 'similar';
    const tputDir = improvement.throughputPct > 0.5 ? 'higher' : improvement.throughputPct < -0.5 ? 'lower' : 'similar';

    let sentence = `Under the selected workload (${config.workloadType.replace(/_/g, ' ').toLowerCase()}, ${config.injectionRate.toFixed(
      2
    )} inj/cycle${faults.enabled && faults.faultRatePct > 0 ? `, ${faults.faultRatePct}% ${faults.faultType.replace('_', ' ').toLowerCase()}` : ''}), the proposed reconfigurable NoC achieved ${latDir} average latency and ${tputDir} accepted throughput than the conventional architecture. The EDP changed by ${improvement.edpPct >= 0 ? '-' : '+'}${Math.abs(
      improvement.edpPct
    ).toFixed(1)}% (${improvement.edpPct >= 0 ? 'improvement' : 'regression'}).`;

    if (faults.enabled && faults.faultRatePct > 0) {
      const baseRatio = baseline.metrics.packetDeliveryRatioPct;
      const propRatio = proposed.metrics.packetDeliveryRatioPct;
      sentence += ` Packet delivery ratio was ${baseRatio.toFixed(1)}% for conventional vs ${propRatio.toFixed(
        1
      )}% for proposed, under ${faults.faultyRouterIds.length} faulty router(s) and ${faults.faultyLinkKeys.length / 2} faulty link(s).`;
    }

    // EDP = Total Energy x Average Latency, so it mechanically rises when
    // an architecture accepts and delivers more total traffic at the same
    // offered injection rate -- that's more work actually done, not pure
    // inefficiency. Surface that context whenever it's the likely
    // explanation, instead of leaving a bare "EDP regressed" reading as an
    // unqualified downside.
    if (improvement.edpPct < 0 && improvement.throughputPct > 5) {
      sentence += ` Note: EDP is Total Energy x Average Latency, so it rises mechanically when more traffic is actually delivered -- proposed delivered ${proposed.metrics.totalDeliveredFlits.toLocaleString()} flits here vs conventional's ${baseline.metrics.totalDeliveredFlits.toLocaleString()} (+${(
        ((proposed.metrics.totalDeliveredFlits - baseline.metrics.totalDeliveredFlits) /
          Math.max(1, baseline.metrics.totalDeliveredFlits)) *
        100
      ).toFixed(0)}%), so part of this EDP gap reflects doing more work, not less efficiency per flit (energy per flit: ${proposed.metrics.energyPerFlitPJ.toFixed(
        2
      )} pJ proposed vs ${baseline.metrics.energyPerFlitPJ.toFixed(2)} pJ conventional).`;
    }

    return sentence;
  }, [result]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-3">Comparison failed: {error}</div>
      )}

      {!result && !isRunning && !error && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-10 text-center text-sm text-slate-400">
          Configure the network above and click "Run Architecture Comparison" to simulate the Conventional and Proposed
          architectures on the identical workload and (optionally) fault set.
        </div>
      )}

      {isRunning && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-10 flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          <p className="text-xs">Running both architectures on identical traffic…</p>
        </div>
      )}

      {result && (
        <>
          {/* Comparison Table */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
              <GitCompareArrows className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">Architecture comparison — Conventional vs. Proposed</h3>
              <span className="text-[12px] text-slate-400 font-mono ml-auto">
                {result.cyclesRun.toLocaleString()} cycles ·{' '}
                {result.baseline.metrics.totalInjectedPackets.toLocaleString()} / {result.proposed.metrics.totalInjectedPackets.toLocaleString()} packets injected
              </span>
            </div>

            <div className="overflow-x-auto rounded border border-[var(--border-subtle)]">
              <table className="w-full text-left text-xs text-slate-300 border-collapse font-mono">
                <thead className="bg-[var(--bg-inset)] text-[12px] font-bold text-slate-400 uppercase border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="py-2.5 px-3">Metric</th>
                    <th className="py-2.5 px-3">Conventional NoC</th>
                    <th className="py-2.5 px-3 bg-emerald-950/40 text-emerald-400 border-l border-emerald-500/40">
                      Proposed (Reconfigurable)
                    </th>
                    <th className="py-2.5 px-3">Improvement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]/70 text-[12px]">
                  <tr>
                    <td className="py-2 px-3 font-semibold text-white font-sans">Average Latency</td>
                    <td className="py-2 px-3">{fmt(result.baseline.metrics.averagePacketLatency, 2, ' cyc')}</td>
                    <td className="py-2 px-3 bg-emerald-950/30 text-emerald-400 font-bold border-l border-emerald-500/40">
                      {fmt(result.proposed.metrics.averagePacketLatency, 2, ' cyc')}
                    </td>
                    <td className={`py-2 px-3 font-bold ${result.improvement.latencyPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {result.improvement.latencyPct >= 0 ? '-' : '+'}
                      {Math.abs(result.improvement.latencyPct).toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-white font-sans">Accepted Throughput</td>
                    <td className="py-2 px-3">{fmt(result.baseline.metrics.throughputFlitsPerNodeCycle, 4)}</td>
                    <td className="py-2 px-3 bg-emerald-950/30 text-emerald-400 font-bold border-l border-emerald-500/40">
                      {fmt(result.proposed.metrics.throughputFlitsPerNodeCycle, 4)}
                    </td>
                    <td className={`py-2 px-3 font-bold ${result.improvement.throughputPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {result.improvement.throughputPct >= 0 ? '+' : ''}
                      {result.improvement.throughputPct.toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold text-white font-sans">Energy-Delay Product</td>
                    <td className="py-2 px-3">{fmt(result.baseline.metrics.energyDelayProduct, 1, ' pJ·cyc')}</td>
                    <td className="py-2 px-3 bg-emerald-950/30 text-emerald-400 font-bold border-l border-emerald-500/40">
                      {fmt(result.proposed.metrics.energyDelayProduct, 1, ' pJ·cyc')}
                    </td>
                    <td className={`py-2 px-3 font-bold ${result.improvement.edpPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {result.improvement.edpPct >= 0 ? '-' : '+'}
                      {Math.abs(result.improvement.edpPct).toFixed(1)}%
                    </td>
                  </tr>
                  {result.faults.enabled && result.faults.faultRatePct > 0 && (
                    <tr>
                      <td className="py-2 px-3 font-semibold text-white font-sans">Packet Delivery Ratio</td>
                      <td className="py-2 px-3">{fmt(result.baseline.metrics.packetDeliveryRatioPct, 1, '%')}</td>
                      <td className="py-2 px-3 bg-emerald-950/30 text-emerald-400 font-bold border-l border-emerald-500/40">
                        {fmt(result.proposed.metrics.packetDeliveryRatioPct, 1, '%')}
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-400">
                        {(result.proposed.metrics.packetDeliveryRatioPct - result.baseline.metrics.packetDeliveryRatioPct >= 0
                          ? '+'
                          : '') +
                          (result.proposed.metrics.packetDeliveryRatioPct - result.baseline.metrics.packetDeliveryRatioPct).toFixed(
                            1
                          )}
                        pp
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-slate-400 font-mono">
              Energy figures are a simulation model/estimate (buffer/crossbar/link/leakage/reconfiguration overhead scaled by
              technology node), not measured silicon power.
            </p>
          </div>

          {/* Results interpretation */}
          {interpretation && (
            <div className="bg-[var(--bg-inset)] border border-emerald-500/30 rounded p-3 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-200 leading-relaxed">{interpretation}</p>
            </div>
          )}

          {/* Bar comparison charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { title: 'Average Latency', data: barData.latency, unit: 'cycles', lowerBetter: true },
              { title: 'Accepted Throughput', data: barData.throughput, unit: 'flit/node/cyc', lowerBetter: false },
              { title: 'Energy-Delay Product', data: barData.edp, unit: 'pJ·cyc', lowerBetter: true },
            ].map((panel) => (
              <div key={panel.title} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-3 h-48">
                <div className="text-[12px] font-mono font-bold text-slate-400 uppercase mb-1">
                  {panel.title} <span className="text-slate-400">({panel.unit})</span>
                </div>
                <ResponsiveContainer width="100%" height="85%">
                  <BarChart data={panel.data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="var(--border-subtle)" />
                    <XAxis dataKey="name" tick={false} stroke="var(--text-secondary)" />
                    <YAxis stroke="var(--text-secondary)" fontSize={9} fontFamily="monospace" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-inset)',
                        borderColor: 'var(--border-subtle)',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontFamily: 'monospace',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '9px', fontFamily: 'monospace' }} />
                    <Bar dataKey="Conventional" fill="#64748b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Proposed" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>

          {/* Before/after mesh visualization */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MeshGrid
              title="Conventional NoC (fixed XY, no reconfiguration)"
              routers={toRouterMap(result.baseline.routers)}
              links={result.baseline.links}
              config={result.config}
              selectedRouterId={null}
              onSelectRouter={() => {}}
            />
            <MeshGrid
              title="Proposed NoC (reconfigurable + fault-aware)"
              routers={toRouterMap(result.proposed.routers)}
              links={result.proposed.links}
              config={result.config}
              selectedRouterId={null}
              onSelectRouter={() => {}}
              faultAvoidanceEvents={result.proposed.telemetry.faultAvoidanceEvents}
            />
          </div>
        </>
      )}

      {/* Fault rate sweep charts */}
      {isSweepingFaults && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-10 flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
          <p className="text-xs">Sweeping fault rates for both architectures…</p>
        </div>
      )}

      {faultSweep && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Fault tolerance — sweep across fault rate</h3>
            <span className="text-[12px] text-slate-400 font-mono ml-auto">{faultSweep.faultType.replace('_', ' ')}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { title: 'Fault Rate vs. Average Latency', key: 'avgLatency' as const, unit: 'cycles' },
              { title: 'Fault Rate vs. Accepted Throughput', key: 'throughput' as const, unit: 'flit/node/cyc' },
            ].map((panel) => {
              const chartData = faultSweep.faultRates.map((rate, idx) => ({
                faultRate: rate,
                Conventional: faultSweep.results.BASELINE_XY[idx]?.[panel.key],
                Proposed: faultSweep.results.PROPOSED_RECONFIGURABLE[idx]?.[panel.key],
              }));
              return (
                <div key={panel.key} className="bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded p-3 h-56">
                  <div className="text-[12px] font-mono font-bold text-slate-400 uppercase mb-1">
                    {panel.title} <span className="text-slate-400">({panel.unit})</span>
                  </div>
                  <ResponsiveContainer width="100%" height="88%">
                    <LineChart data={chartData} margin={{ top: 5, right: 15, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="var(--border-subtle)" />
                      <XAxis
                        dataKey="faultRate"
                        stroke="var(--text-secondary)"
                        fontSize={9}
                        fontFamily="monospace"
                        tickFormatter={(v) => `${v}%`}
                      />
                      <YAxis stroke="var(--text-secondary)" fontSize={9} fontFamily="monospace" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontFamily: 'monospace',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '9px', fontFamily: 'monospace' }} />
                      <Line type="monotone" dataKey="Conventional" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Proposed" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

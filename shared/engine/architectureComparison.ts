import { ArchitectureComparisonResult, ArchitectureRunResult, NoCConfig } from '../types/noc.js';
import { NoCSimulator } from './nocEngine.js';
import { computeFaultPlacement } from './faultModel.js';
import { TraceEvent } from './realTraces.js';

const WARMUP_CYCLES = 150;
const PROGRESS_CHECK_BATCH = 200;

function toRunResult(sim: NoCSimulator): ArchitectureRunResult {
  return {
    metrics: sim.getMetrics(),
    telemetry: sim.getTelemetry(),
    routers: Array.from(sim.getRouters().values()).map((router) => ({
      ...router,
      buffers: Object.fromEntries(router.buffers),
    })),
    links: sim.getLinks(),
  };
}

/** Runs both sims in lockstep batches until either the configured cycle
 * limit is hit, or both have injected at least the configured target
 * packet count -- whichever comes first. Checks with a cheap O(1) counter
 * (not getMetrics(), which sorts the full latency array) so this stays
 * fast even at 100,000 cycles / 100,000 packets. */
function runUntilStop(baseline: NoCSimulator, proposed: NoCSimulator, config: NoCConfig): number {
  let cycles = 0;
  while (cycles < config.simulationCycleLimit) {
    const step = Math.min(PROGRESS_CHECK_BATCH, config.simulationCycleLimit - cycles);
    baseline.stepCycles(step);
    proposed.stepCycles(step);
    cycles += step;

    if (
      baseline.getTotalInjectedPackets() >= config.targetPacketCount &&
      proposed.getTotalInjectedPackets() >= config.targetPacketCount
    ) {
      break;
    }
  }
  return cycles;
}

/**
 * Runs the SAME workload (traffic pattern, injection rate, mesh size,
 * fault placement) through two independent simulators -- a Conventional
 * NoC (BASELINE_XY: fixed dimension-order routing, no dynamic
 * reconfiguration) and the Proposed NoC (PROPOSED_RECONFIGURABLE: dynamic
 * mode selection + fault-aware deflection routing) -- and returns both
 * runs' real measured metrics plus the derived improvement percentages.
 *
 * Every other config field (routingMode aside) is identical between the
 * two runs, and both see the identical fault placement, so any difference
 * in the result is a genuine consequence of the routing architecture, not
 * of the workload or fault set differing between them.
 */
export function runArchitectureComparison(
  fullConfig: NoCConfig,
  customTraceEvents?: TraceEvent[]
): ArchitectureComparisonResult {
  const faultPlacement = computeFaultPlacement(fullConfig);

  const baselineConfig: NoCConfig = { ...fullConfig, routingMode: 'BASELINE_XY' };
  const proposedConfig: NoCConfig = { ...fullConfig, routingMode: 'PROPOSED_RECONFIGURABLE' };

  const baselineSim = new NoCSimulator(baselineConfig);
  baselineSim.setFaultPlacement(faultPlacement);
  const proposedSim = new NoCSimulator(proposedConfig);
  proposedSim.setFaultPlacement(faultPlacement);

  if (fullConfig.workloadType === 'CUSTOM_TRACE' && customTraceEvents) {
    baselineSim.setCustomTrace(customTraceEvents);
    proposedSim.setCustomTrace(customTraceEvents);
  }

  // Warmup so both networks reach steady state before the measured run.
  baselineSim.stepCycles(WARMUP_CYCLES);
  proposedSim.stepCycles(WARMUP_CYCLES);

  const cyclesRun = runUntilStop(baselineSim, proposedSim, fullConfig);

  const baseline = toRunResult(baselineSim);
  const proposed = toRunResult(proposedSim);

  // Real deltas from the two runs above -- never clamped or forced toward
  // "proposed wins": a genuinely worse proposed run (e.g. a fault pattern
  // that happens to defeat both algorithms equally) reports a negative
  // improvement percentage honestly.
  const latencyPct =
    baseline.metrics.averagePacketLatency > 0
      ? ((baseline.metrics.averagePacketLatency - proposed.metrics.averagePacketLatency) /
          baseline.metrics.averagePacketLatency) *
        100
      : 0;
  const throughputPct =
    baseline.metrics.throughputFlitsPerNodeCycle > 0
      ? ((proposed.metrics.throughputFlitsPerNodeCycle - baseline.metrics.throughputFlitsPerNodeCycle) /
          baseline.metrics.throughputFlitsPerNodeCycle) *
        100
      : 0;
  const edpPct =
    baseline.metrics.energyDelayProduct > 0
      ? ((baseline.metrics.energyDelayProduct - proposed.metrics.energyDelayProduct) /
          baseline.metrics.energyDelayProduct) *
        100
      : 0;

  return {
    config: fullConfig,
    faults: baselineSim.getFaultSummary(),
    cyclesRun,
    baseline,
    proposed,
    improvement: {
      latencyPct: Number(latencyPct.toFixed(2)),
      throughputPct: Number(throughputPct.toFixed(2)),
      edpPct: Number(edpPct.toFixed(2)),
    },
  };
}

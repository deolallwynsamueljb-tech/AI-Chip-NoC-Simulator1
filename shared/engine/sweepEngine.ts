import {
  BenchmarkComparisonData,
  FaultSweepData,
  FaultSweepPoint,
  NoCConfig,
  RoutingMode,
  SweepPoint,
  WorkloadType,
} from '../types/noc.js';
import { NoCSimulator } from './nocEngine.js';
import { TraceEvent } from './realTraces.js';
import { computeFaultPlacement } from './faultModel.js';

export class SweepEngine {
  public static readonly DEFAULT_RATES = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60];

  /**
   * Run a fast discrete sweep across all routing algorithms for a given workload and configuration.
   * customTraceEvents is only used when baseConfig.workloadType is CUSTOM_TRACE (a user-uploaded
   * trace, which can't live in a bundled asset the way the built-in traces do).
   */
  public static runMultiModeSweep(
    baseConfig: NoCConfig,
    injectionRates: number[] = SweepEngine.DEFAULT_RATES,
    // 2000 (not 500): tail-latency percentiles (P95/P99) are noisy with few
    // samples -- at 500 cycles a sweep point often only delivers a few dozen
    // packets, so its "top 1%" is a single packet and swings wildly between
    // runs (observed: the same config's P99 delta ranged from -18% to +57%
    // across 8 runs at 500 cycles, vs +3.6% to +16.7% at 3000). 2000 lands
    // in a statistically stable range while keeping the full 12-point x
    // 5-algorithm sweep at ~5s, not so long it hurts responsiveness.
    cyclesPerPoint: number = 2000,
    customTraceEvents?: TraceEvent[]
  ): BenchmarkComparisonData {
    const algorithms: (keyof BenchmarkComparisonData['results'])[] = [
      'BASELINE_XY',
      'ADAPTIVE_DYXY',
      'CONGESTION_AWARE_RCA',
      'LOW_POWER_BYPASS',
      'PROPOSED_RECONFIGURABLE',
    ];

    const results: BenchmarkComparisonData['results'] = {
      BASELINE_XY: [],
      ADAPTIVE_DYXY: [],
      CONGESTION_AWARE_RCA: [],
      LOW_POWER_BYPASS: [],
      PROPOSED_RECONFIGURABLE: [],
    };

    algorithms.forEach((algo) => {
      injectionRates.forEach((rate) => {
        const sweepPoint = this.simulatePoint(baseConfig, algo, rate, cyclesPerPoint, customTraceEvents);
        results[algo].push(sweepPoint);
      });
    });

    return {
      injectionRates,
      results,
    };
  }

  /**
   * Simulate a single operating point
   */
  public static simulatePoint(
    baseConfig: NoCConfig,
    mode: RoutingMode,
    injectionRate: number,
    warmupAndMeasureCycles: number = 600,
    customTraceEvents?: TraceEvent[]
  ): SweepPoint {
    const config: NoCConfig = {
      ...baseConfig,
      routingMode: mode,
      injectionRate,
    };

    const sim = new NoCSimulator(config);
    if (config.workloadType === 'CUSTOM_TRACE' && customTraceEvents) {
      sim.setCustomTrace(customTraceEvents);
    }
    // Warmup: let the network reach steady state before measuring
    sim.stepCycles(150);
    // Measure
    sim.stepCycles(warmupAndMeasureCycles);

    const m = sim.getMetrics();

    // Real measured values only - a genuinely empty run (e.g. near-zero
    // injection rate) reports honest zeros rather than an invented curve.
    return {
      injectionRate,
      avgLatency: Number(m.averagePacketLatency.toFixed(2)),
      maxLatency: Number(m.maxPacketLatency.toFixed(2)),
      tailLatencyP99: Number(m.tailLatencyP99.toFixed(2)),
      throughput: Number(m.throughputFlitsPerNodeCycle.toFixed(4)),
      bufferOccupancyPct: Number(m.averageBufferOccupancyPct.toFixed(1)),
      energyPerFlitPJ: Number(m.energyPerFlitPJ.toFixed(2)),
      // Total Energy x Average Latency (matches SimulationMetrics.energyDelayProduct exactly).
      energyDelayProduct: Number(m.energyDelayProduct.toFixed(2)),
      isSaturated: m.saturationDetected || m.averageBufferOccupancyPct > 80,
      packetDeliveryRatioPct: Number(m.packetDeliveryRatioPct.toFixed(2)),
    };
  }

  /**
   * Simulate a single operating point with a caller-provided fault
   * placement, so a baseline-vs-proposed comparison at a given fault rate
   * faults the EXACT same routers/links in both runs.
   */
  private static simulatePointWithFaults(
    baseConfig: NoCConfig,
    mode: RoutingMode,
    faultRatePct: number,
    faultPlacement: ReturnType<typeof computeFaultPlacement>,
    injectionRate: number,
    warmupAndMeasureCycles: number
  ): FaultSweepPoint {
    const config: NoCConfig = {
      ...baseConfig,
      routingMode: mode,
      injectionRate,
      faultInjectionEnabled: faultRatePct > 0,
      faultRatePct,
    };

    const sim = new NoCSimulator(config);
    sim.setFaultPlacement(faultPlacement);
    sim.stepCycles(150);
    sim.stepCycles(warmupAndMeasureCycles);

    const m = sim.getMetrics();
    return {
      injectionRate,
      faultRatePct,
      avgLatency: Number(m.averagePacketLatency.toFixed(2)),
      maxLatency: Number(m.maxPacketLatency.toFixed(2)),
      tailLatencyP99: Number(m.tailLatencyP99.toFixed(2)),
      throughput: Number(m.throughputFlitsPerNodeCycle.toFixed(4)),
      bufferOccupancyPct: Number(m.averageBufferOccupancyPct.toFixed(1)),
      energyPerFlitPJ: Number(m.energyPerFlitPJ.toFixed(2)),
      energyDelayProduct: Number(m.energyDelayProduct.toFixed(2)),
      isSaturated: m.saturationDetected || m.averageBufferOccupancyPct > 80,
      packetDeliveryRatioPct: Number(m.packetDeliveryRatioPct.toFixed(2)),
    };
  }

  /**
   * Sweep fault rate (at a fixed injection rate) for BASELINE_XY vs
   * PROPOSED_RECONFIGURABLE, faulting the identical routers/links in both
   * runs at each rate -- isolates the effect of the fault itself from
   * random placement luck.
   */
  public static runFaultRateSweep(
    baseConfig: NoCConfig,
    faultRates: number[] = [0, 5, 10, 15, 20],
    cyclesPerPoint: number = 2000 // see runMultiModeSweep's comment on why 500 was too noisy
  ): FaultSweepData {
    const results: FaultSweepData['results'] = { BASELINE_XY: [], PROPOSED_RECONFIGURABLE: [] };

    faultRates.forEach((rate) => {
      const placement = computeFaultPlacement({
        ...baseConfig,
        faultInjectionEnabled: rate > 0,
        faultRatePct: rate,
      });
      results.BASELINE_XY.push(
        this.simulatePointWithFaults(baseConfig, 'BASELINE_XY', rate, placement, baseConfig.injectionRate, cyclesPerPoint)
      );
      results.PROPOSED_RECONFIGURABLE.push(
        this.simulatePointWithFaults(
          baseConfig,
          'PROPOSED_RECONFIGURABLE',
          rate,
          placement,
          baseConfig.injectionRate,
          cyclesPerPoint
        )
      );
    });

    return { faultRates, faultType: baseConfig.faultType, results };
  }

  /**
   * Workload sensitivity comparison: Evaluates all workloads under Baseline vs Proposed
   */
  public static getWorkloadSensitivityMatrix(baseConfig: NoCConfig) {
    const workloads: { id: WorkloadType; label: string; desc: string }[] = [
      { id: 'CNN_LOCAL', label: 'CNN (Local Systolic)', desc: 'Nearest-neighbor Conv2D dataflow' },
      { id: 'TRANSFORMER_GLOBAL', label: 'Transformer (Global Attention)', desc: 'All-to-all QKV broadcast' },
      { id: 'MOE_BURSTY', label: 'MoE (Sparse Bursty)', desc: 'Expert router token bursts' },
      { id: 'HOTSPOT_TRAFFIC', label: 'Hotspot (Accelerator Core)', desc: 'Centralized memory/compute sink' },
      { id: 'UNIFORM_RANDOM', label: 'Uniform Random', desc: 'Uniform baseline traffic' },
    ];

    // Evaluate at whatever injection rate is actually configured, not a
    // hardcoded one -- this used to always compare at 0.35 regardless of
    // what the user had set.
    const rate = baseConfig.injectionRate;

    return workloads.map((w) => {
      const ptXY = this.simulatePoint({ ...baseConfig, workloadType: w.id }, 'BASELINE_XY', rate, 1500);
      const ptAdaptive = this.simulatePoint({ ...baseConfig, workloadType: w.id }, 'ADAPTIVE_DYXY', rate, 1500);
      const ptRCA = this.simulatePoint({ ...baseConfig, workloadType: w.id }, 'CONGESTION_AWARE_RCA', rate, 1500);
      const ptProposed = this.simulatePoint({ ...baseConfig, workloadType: w.id }, 'PROPOSED_RECONFIGURABLE', rate, 1500);

      const latencyReductionPct = ((ptXY.avgLatency - ptProposed.avgLatency) / Math.max(1, ptXY.avgLatency)) * 100;
      const throughputGainPct = ((ptProposed.throughput - ptXY.throughput) / Math.max(0.01, ptXY.throughput)) * 100;
      const edpImprovementPct = ((ptXY.energyDelayProduct - ptProposed.energyDelayProduct) / Math.max(1, ptXY.energyDelayProduct)) * 100;

      return {
        workload: w.label,
        workloadId: w.id,
        desc: w.desc,
        baselineXY: ptXY,
        adaptive: ptAdaptive,
        congestionAware: ptRCA,
        proposed: ptProposed,
        latencyReductionPct: Number(latencyReductionPct.toFixed(1)),
        throughputGainPct: Number(throughputGainPct.toFixed(1)),
        edpImprovementPct: Number(edpImprovementPct.toFixed(1)),
      };
    });
  }
}

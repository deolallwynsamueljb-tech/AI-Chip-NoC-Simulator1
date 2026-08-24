import { BenchmarkComparisonData, NoCConfig, RoutingMode, SweepPoint, WorkloadType } from '../types/noc';
import { NoCSimulator } from './nocEngine';

export class SweepEngine {
  public static readonly DEFAULT_RATES = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60];

  /**
   * Run a fast discrete sweep across all routing algorithms for a given workload and configuration
   */
  public static runMultiModeSweep(
    baseConfig: NoCConfig,
    injectionRates: number[] = SweepEngine.DEFAULT_RATES,
    cyclesPerPoint: number = 500
  ): BenchmarkComparisonData {
    const algorithms: RoutingMode[] = [
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
        const sweepPoint = this.simulatePoint(baseConfig, algo, rate, cyclesPerPoint);
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
    warmupAndMeasureCycles: number = 600
  ): SweepPoint {
    const config: NoCConfig = {
      ...baseConfig,
      routingMode: mode,
      injectionRate,
    };

    const sim = new NoCSimulator(config);
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
      energyDelayProduct: Number((m.averagePacketLatency * m.energyPerFlitPJ).toFixed(2)),
      isSaturated: m.saturationDetected || m.averageBufferOccupancyPct > 80,
    };
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

    return workloads.map((w) => {
      const ptXY = this.simulatePoint({ ...baseConfig, workloadType: w.id }, 'BASELINE_XY', 0.35, 400);
      const ptAdaptive = this.simulatePoint({ ...baseConfig, workloadType: w.id }, 'ADAPTIVE_DYXY', 0.35, 400);
      const ptRCA = this.simulatePoint({ ...baseConfig, workloadType: w.id }, 'CONGESTION_AWARE_RCA', 0.35, 400);
      const ptProposed = this.simulatePoint({ ...baseConfig, workloadType: w.id }, 'PROPOSED_RECONFIGURABLE', 0.35, 400);

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

export type RoutingMode =
  | 'BASELINE_XY'
  | 'ADAPTIVE_DYXY'
  | 'CONGESTION_AWARE_RCA'
  | 'LOW_POWER_BYPASS'
  | 'PROPOSED_RECONFIGURABLE'
  | 'TASK_BASED_TBP';

export type WorkloadType =
  | 'CNN_LOCAL'
  | 'TRANSFORMER_GLOBAL'
  | 'MOE_BURSTY'
  | 'UNIFORM_RANDOM'
  | 'BIT_COMPLEMENT'
  | 'HOTSPOT_TRAFFIC'
  | 'TRANSPOSE'
  | 'BIT_REVERSAL'
  | 'RESNET18_TRACE'
  | 'BERT_TRACE'
  | 'GEMM_TRACE'
  | 'SPARSE_GEMM_TRACE'
  | 'CUSTOM_TRACE';

/** The four standard synthetic traffic patterns exposed by the Configuration
 * Panel's "Traffic Pattern" selector -- a small, canonical subset of the
 * full WorkloadType list above (which also covers AI-specific traces). */
export const STANDARD_TRAFFIC_PATTERNS: { id: WorkloadType; label: string }[] = [
  { id: 'UNIFORM_RANDOM', label: 'Uniform Random' },
  { id: 'HOTSPOT_TRAFFIC', label: 'Hotspot' },
  { id: 'TRANSPOSE', label: 'Transpose' },
  { id: 'BIT_REVERSAL', label: 'Bit-Reversal' },
];

export type FaultType = 'ROUTER_FAULT' | 'LINK_FAULT' | 'RANDOM_FAULT';

/** Workload types that replay a recorded event schedule (from
 * research-engine/traces/*.csv, or a user-uploaded file for CUSTOM_TRACE)
 * instead of generating traffic synthetically. Only valid on a 4x4 mesh,
 * since that's the dimension these traces are keyed to. */
export const TRACE_WORKLOAD_TYPES: WorkloadType[] = [
  'RESNET18_TRACE',
  'BERT_TRACE',
  'GEMM_TRACE',
  'SPARSE_GEMM_TRACE',
  'CUSTOM_TRACE',
];

export type PortDirection = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'LOCAL';

export interface NoCConfig {
  meshWidth: number; // e.g., 4 or 8
  meshHeight: number; // e.g., 4 or 8
  virtualChannels: number; // e.g., 2, 4
  bufferDepthPerVC: number; // flits per VC, e.g. 4, 8
  flitDataBits: number; // 32, 64, 128
  clockFrequencyGHz: number; // e.g. 1.0 GHz
  techNodeNm: number; // e.g. 7nm, 14nm, 28nm
  epochCycles: number; // Controller evaluation window (e.g. 25 cycles)
  routingMode: RoutingMode;
  workloadType: WorkloadType;
  injectionRate: number; // 0.01 - 0.60 flits/node/cycle
  packetLengthFlits: number; // e.g. 4 flits
  powerGatingThreshold: number; // cycles of idle before power gating VC
  hysteresisWindows: number; // consecutive epochs a candidate mode must win before PROPOSED_RECONFIGURABLE applies it
  dwellCycles: number; // minimum cycles since the last actual reconfiguration before another is allowed

  // Fault injection (Configuration Panel section 9 / academic project requirement)
  faultInjectionEnabled: boolean;
  faultRatePct: number; // 0, 5, 10, 15, 20
  faultType: FaultType;

  // Finite-run controls for the Architecture Comparison / benchmark runner
  // (the free-running interactive mesh in the Simulator tab ignores these
  // and just keeps ticking until paused).
  targetPacketCount: number; // 1,000 - 100,000
  simulationCycleLimit: number; // 1,000 - 100,000
}

export type FlitType = 'HEAD' | 'BODY' | 'TAIL' | 'SINGLE';

export interface Flit {
  id: string;
  packetId: string;
  flitIndex: number;
  totalFlits: number;
  type: FlitType;
  srcX: number;
  srcY: number;
  dstX: number;
  dstY: number;
  creationCycle: number;
  hopCount: number;
  routeHistory: { x: number; y: number; cycle: number }[];
  currentVC: number;
  energyPJ: number;
  workloadTag: WorkloadType;
  isBlocked: boolean;
}

export interface RouterBuffer {
  port: PortDirection;
  vcId: number;
  flits: Flit[];
  maxCapacity: number;
  isPowerGated: boolean;
  idleCycles: number;
  readCount: number;
  writeCount: number;
}

export interface RouterNode {
  x: number;
  y: number;
  id: number;
  currentMode: RoutingMode;
  isFaulty: boolean;
  buffers: Map<string, RouterBuffer>; // key: `${port}_${vc}`
  activeFlitsInSwitch: Flit[];
  totalInjected: number;
  totalDelivered: number;
  avgLatency: number;
  accumulatedLatency: number;
  bufferOccupancyHistory: number[];
  congestionScore: number; // 0.0 to 1.0
  temperatureRelative: number; // Normalized thermal/power factor
  energyPJ: {
    staticLeakage: number;
    bufferDynamic: number;
    crossbarDynamic: number;
    controllerDynamic: number;
    linkDynamic: number;
  };
  linkUtilization: {
    NORTH: number;
    SOUTH: number;
    EAST: number;
    WEST: number;
    LOCAL: number;
  };
  controllerDecisions: {
    cycle: number;
    selectedMode: RoutingMode;
    reason: string;
    workloadDetected: WorkloadType;
    localityIndex: number;
    congestionGradient: number;
  }[];
}

export interface Link {
  srcX: number;
  srcY: number;
  dstX: number;
  dstY: number;
  direction: PortDirection;
  flitInTransit: Flit | null;
  busyCycles: number;
  totalTransversals: number;
  energyPJ: number;
  isFaulty: boolean;
}

/** A moment where a fault-aware routing algorithm picked a link/port other
 * than the one a fault-oblivious router would have used, because the
 * "natural" choice led into a faulty router or link. Recorded as it
 * genuinely happens during simulation (see routingAlgorithms.ts /
 * nocEngine.ts) -- not synthesized after the fact. */
export interface FaultAvoidanceEvent {
  cycle: number;
  atX: number;
  atY: number;
  chosenPort: PortDirection;
  avoidedX: number;
  avoidedY: number;
  avoidedKind: 'ROUTER_FAULT' | 'LINK_FAULT';
  wasDeflection: boolean; // true if it had to leave the minimal (shortest-path) direction entirely
}

export interface FaultSummary {
  enabled: boolean;
  faultType: FaultType;
  faultRatePct: number;
  faultyRouterIds: number[];
  faultyLinkKeys: string[];
}

export interface WorkloadTelemetry {
  spatialLocalityIndex: number; // 0.0 (global all-to-all) to 1.0 (nearest neighbor)
  globalHotspotPressure: number; // 0.0 to 1.0
  trafficBurstiness: number; // 0.0 (smooth uniform) to 1.0 (highly bursty)
  averageHopDistance: number;
  detectedWorkloadClass: WorkloadType;
  controllerActiveMode: RoutingMode;
  confidenceScore: number;
  reconfigurationCount: number;
  controllerOverheadEnergyPJ: number;
  /** Only meaningful when routingMode is TASK_BASED_TBP: which of the two
   * VC-partitioning policies is currently active (null otherwise). */
  taskBasedActivePolicy: 'TB' | 'TBP' | null;
  history: {
    cycle: number;
    detectedPattern: string;
    selectedMode: RoutingMode;
    avgBufferLoad: number;
    reason: string; // 'applied' | 'already_active' | 'hysteresis_wait(n/required)' | 'dwell_time_block' | 'static_policy'
  }[];
  faultAvoidanceEvents: FaultAvoidanceEvent[];
}

export interface SimulationMetrics {
  currentCycle: number;
  totalInjectedPackets: number;
  totalInjectedFlits: number;
  totalDeliveredPackets: number;
  totalDeliveredFlits: number;
  flitsInFlight: number;
  averagePacketLatency: number;
  maxPacketLatency: number;
  tailLatencyP95: number;
  tailLatencyP99: number;
  throughputFlitsPerNodeCycle: number;
  averageBufferOccupancyPct: number;
  peakBufferOccupancyPct: number;
  totalEnergyPJ: number;
  energyPerFlitPJ: number;
  energyDelayProduct: number; // Total Energy (pJ) * Average Latency (cycles) -- a SIMULATION ESTIMATE, not measured silicon power
  saturationDetected: boolean;
  saturationCycle: number | null;
  packetDeliveryRatioPct: number; // delivered / injected packets, 100 when nothing injected yet
  totalDroppedFlits: number; // flits dropped by the bounded-lifetime gridlock recovery timeout (see nocEngine.processFlitTimeouts)
  energyBreakdown: {
    staticLeakage: number;
    bufferDynamic: number;
    crossbarDynamic: number;
    linkDynamic: number;
    controllerDynamic: number;
    reconfigurationDynamic: number;
  };
}

export interface SweepPoint {
  injectionRate: number;
  avgLatency: number;
  maxLatency: number;
  tailLatencyP99: number;
  throughput: number;
  bufferOccupancyPct: number;
  energyPerFlitPJ: number;
  energyDelayProduct: number;
  isSaturated: boolean;
  packetDeliveryRatioPct: number;
}

export interface FaultSweepPoint extends SweepPoint {
  faultRatePct: number;
}

export interface FaultSweepData {
  faultRates: number[];
  faultType: FaultType;
  results: {
    BASELINE_XY: FaultSweepPoint[];
    PROPOSED_RECONFIGURABLE: FaultSweepPoint[];
  };
}

export interface ArchitectureRunResult {
  metrics: SimulationMetrics;
  telemetry: WorkloadTelemetry;
  routers: SerializedRouterNode[];
  links: Link[];
}

export interface ArchitectureComparisonResult {
  config: NoCConfig;
  faults: FaultSummary;
  cyclesRun: number;
  baseline: ArchitectureRunResult;
  proposed: ArchitectureRunResult;
  improvement: {
    latencyPct: number; // (Baseline - Proposed) / Baseline * 100
    throughputPct: number; // (Proposed - Baseline) / Baseline * 100
    edpPct: number; // (Baseline - Proposed) / Baseline * 100
  };
}

export interface BenchmarkComparisonData {
  injectionRates: number[];
  results: {
    BASELINE_XY: SweepPoint[];
    ADAPTIVE_DYXY: SweepPoint[];
    CONGESTION_AWARE_RCA: SweepPoint[];
    LOW_POWER_BYPASS: SweepPoint[];
    PROPOSED_RECONFIGURABLE: SweepPoint[];
  };
}

export interface WorkloadSensitivityItem {
  workload: string;
  workloadId: WorkloadType;
  desc: string;
  baselineXY: SweepPoint;
  adaptive: SweepPoint;
  congestionAware: SweepPoint;
  proposed: SweepPoint;
  latencyReductionPct: number;
  throughputGainPct: number;
  edpImprovementPct: number;
}

/**
 * Wire-format router: `buffers` travels as a plain object keyed by
 * `${port}_${vc}` instead of a Map, since Maps don't survive JSON.
 */
export type SerializedRouterBuffers = Record<string, RouterBuffer>;

export interface SerializedRouterNode extends Omit<RouterNode, 'buffers'> {
  buffers: SerializedRouterBuffers;
}

export interface SimulationSnapshot {
  metrics: SimulationMetrics;
  telemetry: WorkloadTelemetry;
  routers: SerializedRouterNode[];
  links: Link[];
  config: NoCConfig;
  faults: FaultSummary;
}

export type ClientCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step'; cycles: number }
  | { type: 'reset' }
  | { type: 'setSpeed'; speed: number }
  | { type: 'updateConfig'; config: Partial<NoCConfig> };

export type ServerMessage =
  | { type: 'snapshot'; isRunning: boolean; speed: number; snapshot: SimulationSnapshot }
  | { type: 'error'; message: string };

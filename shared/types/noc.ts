export type RoutingMode = 
  | 'BASELINE_XY'
  | 'ADAPTIVE_DYXY'
  | 'CONGESTION_AWARE_RCA'
  | 'LOW_POWER_BYPASS'
  | 'PROPOSED_RECONFIGURABLE';

export type WorkloadType =
  | 'CNN_LOCAL'
  | 'TRANSFORMER_GLOBAL'
  | 'MOE_BURSTY'
  | 'UNIFORM_RANDOM'
  | 'BIT_COMPLEMENT'
  | 'HOTSPOT_TRAFFIC';

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
  history: {
    cycle: number;
    detectedPattern: string;
    selectedMode: RoutingMode;
    avgBufferLoad: number;
  }[];
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
  energyDelayProduct: number; // Latency * Energy
  saturationDetected: boolean;
  saturationCycle: number | null;
  energyBreakdown: {
    staticLeakage: number;
    bufferDynamic: number;
    crossbarDynamic: number;
    linkDynamic: number;
    controllerDynamic: number;
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

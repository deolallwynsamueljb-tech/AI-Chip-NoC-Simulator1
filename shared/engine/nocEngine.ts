import {
  FaultAvoidanceEvent,
  FaultSummary,
  Flit,
  Link,
  NoCConfig,
  PortDirection,
  RouterBuffer,
  RouterNode,
  RoutingMode,
  SimulationMetrics,
  WorkloadTelemetry,
  WorkloadType,
} from '../types/noc.js';
import { getEnergyParameters } from './energyModel.js';
import { RoutingEngine } from './routingAlgorithms.js';
import { TrafficGenerator } from './trafficGenerators.js';
import { TraceEvent } from './realTraces.js';
import { computeFaultPlacement, FaultPlacement, linkKey, NO_FAULTS } from './faultModel.js';

export class NoCSimulator {
  private config: NoCConfig;
  private currentCycle: number = 0;
  private routers: Map<number, RouterNode> = new Map();
  private links: Link[] = [];
  private trafficGen: TrafficGenerator;

  // Active metrics
  private totalInjectedPackets = 0;
  private totalInjectedFlits = 0;
  private totalDeliveredPackets = 0;
  private totalDeliveredFlits = 0;
  private totalDroppedFlits = 0;
  private deliveredLatencies: number[] = [];
  private accumulatedEnergy = {
    staticLeakage: 0,
    bufferDynamic: 0,
    crossbarDynamic: 0,
    linkDynamic: 0,
    controllerDynamic: 0,
    reconfigurationDynamic: 0,
  };

  // Fault placement (which routers/links are down). Auto-rolled from config
  // on topology (re)build; can be overridden with an externally-computed
  // placement via setFaultPlacement() so two simulators (baseline vs
  // proposed) can be compared against the IDENTICAL fault set.
  private faultPlacement: FaultPlacement = NO_FAULTS;
  private faultyRouterIdSet: Set<number> = new Set();
  private faultyLinkKeySet: Set<string> = new Set();
  private faultAvoidanceEvents: FaultAvoidanceEvent[] = [];

  // Telemetry & sliding window analysis
  private recentHopDistances: number[] = [];
  private recentArrivals: number[] = [];
  private decisionHistory: {
    cycle: number;
    detectedPattern: string;
    selectedMode: RoutingMode;
    avgBufferLoad: number;
    reason: string;
  }[] = [];
  private telemetry: WorkloadTelemetry;
  private reconfigurationCounter = 0;
  private saturationCycle: number | null = null;
  private isSaturated = false;

  // Anti-thrash controller state (hysteresis + dwell time), mirroring
  // research-engine/controller/reconfig_controller.py.
  private pendingMode: RoutingMode | null = null;
  private pendingCount = 0;
  private lastReconfigCycle = -Infinity;

  // TASK_BASED_TBP's own TB<->TBP hysteresis/dwell state (see
  // routingAlgorithms.ts computeTaskBasedTBP for what these mean).
  private taskBasedActivePolicy: 'TB' | 'TBP' = 'TB';
  private taskBasedPendingPolicy: 'TB' | 'TBP' | null = null;
  private taskBasedPendingCount = 0;
  private taskBasedLastSwitchCycle = -Infinity;
  private static readonly TASK_BASED_TBP_LOAD_THRESHOLD = 0.15;

  constructor(config: NoCConfig) {
    this.config = config;
    this.trafficGen = new TrafficGenerator(config);
    this.telemetry = {
      spatialLocalityIndex: 0.5,
      globalHotspotPressure: 0.2,
      trafficBurstiness: 0.1,
      averageHopDistance: 2.0,
      detectedWorkloadClass: config.workloadType,
      controllerActiveMode: config.routingMode,
      confidenceScore: 0, // no classification epoch has run yet
      reconfigurationCount: 0,
      controllerOverheadEnergyPJ: 0,
      taskBasedActivePolicy: null,
      history: [],
      faultAvoidanceEvents: [],
    };
    this.initializeTopology();
  }

  public reset(newConfig?: NoCConfig) {
    if (newConfig) {
      this.config = newConfig;
      this.trafficGen.updateConfig(newConfig);
    }
    this.currentCycle = 0;
    this.totalInjectedPackets = 0;
    this.totalInjectedFlits = 0;
    this.totalDeliveredPackets = 0;
    this.totalDeliveredFlits = 0;
    this.totalDroppedFlits = 0;
    this.deliveredLatencies = [];
    this.recentHopDistances = [];
    this.recentArrivals = [];
    this.decisionHistory = [];
    this.reconfigurationCounter = 0;
    this.saturationCycle = null;
    this.isSaturated = false;
    this.pendingMode = null;
    this.pendingCount = 0;
    this.lastReconfigCycle = -Infinity;
    this.taskBasedActivePolicy = 'TB';
    this.taskBasedPendingPolicy = null;
    this.taskBasedPendingCount = 0;
    this.taskBasedLastSwitchCycle = -Infinity;
    this.accumulatedEnergy = {
      staticLeakage: 0,
      bufferDynamic: 0,
      crossbarDynamic: 0,
      linkDynamic: 0,
      controllerDynamic: 0,
      reconfigurationDynamic: 0,
    };
    this.faultAvoidanceEvents = [];
    this.telemetry = {
      spatialLocalityIndex: 0.5,
      globalHotspotPressure: 0.2,
      trafficBurstiness: 0.1,
      averageHopDistance: 2.0,
      detectedWorkloadClass: this.config.workloadType,
      controllerActiveMode: this.config.routingMode,
      confidenceScore: 0, // no classification epoch has run yet
      reconfigurationCount: 0,
      controllerOverheadEnergyPJ: 0,
      taskBasedActivePolicy: null,
      history: [],
      faultAvoidanceEvents: [],
    };
    this.initializeTopology();
  }

  public updateConfig(newConfig: NoCConfig) {
    const topologyChanged =
      newConfig.meshWidth !== this.config.meshWidth ||
      newConfig.meshHeight !== this.config.meshHeight ||
      newConfig.virtualChannels !== this.config.virtualChannels ||
      newConfig.bufferDepthPerVC !== this.config.bufferDepthPerVC;

    const faultsChanged =
      newConfig.faultInjectionEnabled !== this.config.faultInjectionEnabled ||
      newConfig.faultRatePct !== this.config.faultRatePct ||
      newConfig.faultType !== this.config.faultType;

    this.config = newConfig;
    this.trafficGen.updateConfig(newConfig);

    if (topologyChanged) {
      this.reset();
    } else {
      // Propagate routing mode update to all routers
      this.routers.forEach((r) => {
        if (newConfig.routingMode !== 'PROPOSED_RECONFIGURABLE') {
          r.currentMode = newConfig.routingMode;
        }
      });
      this.telemetry.controllerActiveMode = newConfig.routingMode;

      if (faultsChanged) {
        this.applyFaultPlacement(computeFaultPlacement(this.config));
      }
    }
  }

  /** Overrides the auto-rolled fault placement with an externally-computed
   * one -- used by architectureComparison.ts so the baseline and proposed
   * simulators fault the exact same routers/links. */
  public setFaultPlacement(placement: FaultPlacement): void {
    this.applyFaultPlacement(placement);
  }

  private applyFaultPlacement(placement: FaultPlacement): void {
    this.faultPlacement = placement;
    this.faultyRouterIdSet = new Set(placement.faultyRouterIds);
    this.faultyLinkKeySet = new Set(placement.faultyLinkKeys);

    this.routers.forEach((r) => {
      r.isFaulty = this.faultyRouterIdSet.has(r.id);
    });
    this.links.forEach((l) => {
      l.isFaulty = this.faultyLinkKeySet.has(linkKey(l.srcX, l.srcY, l.direction));
    });
    this.trafficGen.setFaultyRouters(this.faultyRouterIdSet);
  }

  public getFaultSummary(): FaultSummary {
    return {
      enabled: this.config.faultInjectionEnabled,
      faultType: this.config.faultType,
      faultRatePct: this.config.faultRatePct,
      faultyRouterIds: [...this.faultyRouterIdSet],
      faultyLinkKeys: [...this.faultyLinkKeySet],
    };
  }

  /** Loads a user-uploaded trace for the CUSTOM_TRACE workload. */
  public setCustomTrace(events: TraceEvent[]): void {
    this.trafficGen.setCustomTraceEvents(events);
  }

  private initializeTopology() {
    this.routers.clear();
    this.links = [];
    const { meshWidth, meshHeight, virtualChannels, bufferDepthPerVC, routingMode } = this.config;
    const directions: PortDirection[] = ['NORTH', 'SOUTH', 'EAST', 'WEST', 'LOCAL'];

    // 1. Create Routers
    for (let y = 0; y < meshHeight; y++) {
      for (let x = 0; x < meshWidth; x++) {
        const id = y * meshWidth + x;
        const buffers = new Map<string, RouterBuffer>();

        directions.forEach((port) => {
          for (let vc = 0; vc < virtualChannels; vc++) {
            buffers.set(`${port}_${vc}`, {
              port,
              vcId: vc,
              flits: [],
              maxCapacity: bufferDepthPerVC,
              isPowerGated: false,
              idleCycles: 0,
              readCount: 0,
              writeCount: 0,
            });
          }
        });

        const router: RouterNode = {
          x,
          y,
          id,
          currentMode: routingMode,
          isFaulty: false,
          buffers,
          activeFlitsInSwitch: [],
          totalInjected: 0,
          totalDelivered: 0,
          avgLatency: 0,
          accumulatedLatency: 0,
          bufferOccupancyHistory: [],
          congestionScore: 0,
          temperatureRelative: 0.2,
          energyPJ: {
            staticLeakage: 0,
            bufferDynamic: 0,
            crossbarDynamic: 0,
            controllerDynamic: 0,
            linkDynamic: 0,
          },
          linkUtilization: {
            NORTH: 0,
            SOUTH: 0,
            EAST: 0,
            WEST: 0,
            LOCAL: 0,
          },
          controllerDecisions: [],
        };

        this.routers.set(id, router);
      }
    }

    // 2. Create Bi-directional Links
    for (let y = 0; y < meshHeight; y++) {
      for (let x = 0; x < meshWidth; x++) {
        // Horizontal link (East)
        if (x < meshWidth - 1) {
          this.links.push({
            srcX: x,
            srcY: y,
            dstX: x + 1,
            dstY: y,
            direction: 'EAST',
            flitInTransit: null,
            busyCycles: 0,
            totalTransversals: 0,
            energyPJ: 0,
            isFaulty: false,
          });
          this.links.push({
            srcX: x + 1,
            srcY: y,
            dstX: x,
            dstY: y,
            direction: 'WEST',
            flitInTransit: null,
            busyCycles: 0,
            totalTransversals: 0,
            energyPJ: 0,
            isFaulty: false,
          });
        }
        // Vertical link (South)
        if (y < meshHeight - 1) {
          this.links.push({
            srcX: x,
            srcY: y,
            dstX: x,
            dstY: y + 1,
            direction: 'SOUTH',
            flitInTransit: null,
            busyCycles: 0,
            totalTransversals: 0,
            energyPJ: 0,
            isFaulty: false,
          });
          this.links.push({
            srcX: x,
            srcY: y + 1,
            dstX: x,
            dstY: y,
            direction: 'NORTH',
            flitInTransit: null,
            busyCycles: 0,
            totalTransversals: 0,
            energyPJ: 0,
            isFaulty: false,
          });
        }
      }
    }

    // 3. Roll fault placement for the new topology. A caller that wants a
    // SPECIFIC (e.g. shared-with-another-sim) placement calls
    // setFaultPlacement() right after this, which simply overrides it.
    this.applyFaultPlacement(computeFaultPlacement(this.config));
  }

  /**
   * Advance simulation by 1 clock cycle
   */
  public stepCycle(): void {
    this.currentCycle++;
    const energyParams = getEnergyParameters(this.config);

    // 1. Proposed Workload Analyzer & Configuration Controller Execution (Every Epoch)
    if (this.currentCycle % this.config.epochCycles === 0) {
      this.runWorkloadAnalyzerAndController();
    }

    // 2. Link Traversal Completion (Flits moving across wires into downstream router buffers)
    this.processLinkArrivals(energyParams);

    // 3. Router Switch Allocation & Crossbar Traversal (Moving flits from input buffers to output ports/links)
    this.processRouterPipelines(energyParams);

    // 3b. Bounded flit lifetime (deadlock/gridlock RECOVERY, distinct from
    // the routing-level deadlock AVOIDANCE in routingAlgorithms.ts). A
    // router with no way to progress a flit -- most notably a faulty
    // router, which never runs its pipeline again once a flit lands in its
    // buffers -- would otherwise hold that buffer slot (and the upstream
    // link feeding it) forever, and that backpressure cascades outward
    // until it consumes the whole network's buffer capacity. Real
    // networks bound this with a TTL; this does the same, and applies
    // identically to every routing mode, so it recovers gridlock without
    // favoring either architecture.
    this.processFlitTimeouts();

    // Fault-avoidance events are pushed every cycle (not just per-epoch) --
    // keep telemetry's copy current so a live "reconfiguration events" feed
    // doesn't lag behind by up to a full epoch. New object + new array so
    // consumers relying on reference identity (React state) see the update.
    this.telemetry = { ...this.telemetry, faultAvoidanceEvents: [...this.faultAvoidanceEvents] };

    // 4. Packet Injection from Local Processing Elements
    this.processPacketInjection(energyParams);

    // 5. Static Leakage Energy & Idle VC Power Gating
    this.processStaticPower(energyParams);

    // 6. Update Per-Router Congestion Scores and History
    this.updateRouterStats();
  }

  /**
   * Step N cycles in a batch
   */
  public stepCycles(count: number): void {
    for (let i = 0; i < count; i++) {
      this.stepCycle();
    }
  }

  /**
   * WORKLOAD ANALYZER & CONFIGURATION CONTROLLER
   * Evaluates spatial locality, hop distribution, and congestion to dynamically reconfigure routers.
   */
  private runWorkloadAnalyzerAndController(): void {
    const { meshWidth, meshHeight, routingMode } = this.config;
    const maxPossibleManhattan = meshWidth - 1 + meshHeight - 1;

    // Calculate Spatial Locality Index
    let avgHop = 2.0;
    if (this.recentHopDistances.length > 0) {
      avgHop = this.recentHopDistances.reduce((a, b) => a + b, 0) / this.recentHopDistances.length;
    }
    // High locality = small average hop (e.g. 1.2 hops -> locality ~0.8)
    const localityIndex = Math.max(0, Math.min(1, 1 - (avgHop - 1) / Math.max(1, maxPossibleManhattan - 1)));

    // Calculate Traffic Burstiness (variance of arrival rate in recent window)
    let burstiness = 0.1;
    if (this.recentArrivals.length > 5) {
      const meanArrival = this.recentArrivals.reduce((a, b) => a + b, 0) / this.recentArrivals.length;
      const variance = this.recentArrivals.reduce((a, b) => a + Math.pow(b - meanArrival, 2), 0) / this.recentArrivals.length;
      burstiness = Math.min(1, Math.sqrt(variance) / Math.max(0.1, meanArrival));
    }

    // Calculate Hotspot Pressure (Peak buffer occupancy vs Average)
    let maxCongestion = 0;
    let avgCongestion = 0;
    this.routers.forEach((r) => {
      if (r.congestionScore > maxCongestion) maxCongestion = r.congestionScore;
      avgCongestion += r.congestionScore;
    });
    avgCongestion /= Math.max(1, this.routers.size);
    const hotspotPressure = Math.min(1, (maxCongestion - avgCongestion) * 2 + maxCongestion * 0.5);

    // Classify detected workload
    let detectedClass: WorkloadType = 'UNIFORM_RANDOM';
    if (localityIndex > 0.65) {
      detectedClass = 'CNN_LOCAL';
    } else if (hotspotPressure > 0.45 || (localityIndex < 0.35 && burstiness < 0.6)) {
      detectedClass = 'TRANSFORMER_GLOBAL';
    } else if (burstiness > 0.45) {
      detectedClass = 'MOE_BURSTY';
    }

    // Classification confidence: this is a threshold-based rule classifier,
    // not a trained model with calibrated probabilities (that's what the
    // separate Python research-engine's RandomForest is for -- see the
    // Research tab). What we CAN honestly report here is how far past its
    // deciding threshold the winning metric is, normalized to [0, 1]: a
    // locality of 0.66 barely clearing the 0.65 CNN_LOCAL threshold is
    // reported as low-confidence; a locality of 0.95 is reported as
    // high-confidence. This was previously a hardcoded constant (0.92/0.94)
    // that never actually reflected the classification -- fixed to be real.
    const margin = (value: number, threshold: number) =>
      Math.max(0.05, Math.min(1, (value - threshold) / Math.max(0.0001, 1 - threshold)));
    let classificationConfidence: number;
    if (detectedClass === 'CNN_LOCAL') {
      classificationConfidence = margin(localityIndex, 0.65);
    } else if (detectedClass === 'TRANSFORMER_GLOBAL') {
      classificationConfidence =
        hotspotPressure > 0.45 ? margin(hotspotPressure, 0.45) : margin(0.35 - localityIndex, 0);
    } else if (detectedClass === 'MOE_BURSTY') {
      classificationConfidence = margin(burstiness, 0.45);
    } else {
      // UNIFORM_RANDOM: confidence in "none of the other patterns matched"
      // is how far each metric sits below its own threshold -- the closer
      // any of them is to triggering, the less confident this default is.
      const closeness = Math.max(localityIndex / 0.65, hotspotPressure / 0.45, burstiness / 0.45);
      classificationConfidence = Math.max(0.05, Math.min(1, 1 - closeness));
    }

    // Controller energy accounting (very small decision overhead)
    const energyParams = getEnergyParameters(this.config);
    const controllerEnergy = energyParams.controllerDecisionPJ * this.routers.size;
    this.accumulatedEnergy.controllerDynamic += controllerEnergy;

    // Decision Logic for Proposed Self-Reconfigurable Controller.
    //
    // The raw per-epoch classification below (candidateMode) is noisy --
    // acting on it directly would let the controller reconfigure every
    // single epoch as traffic fluctuates. The offline Python research engine
    // (research-engine/controller/reconfig_controller.py) found this thrash
    // empirically and fixed it with two safeguards, ported here unchanged:
    // hysteresis (a candidate must win `hysteresisWindows` consecutive
    // epochs before it's applied) and a dwell time (a minimum number of
    // cycles must pass since the last actual reconfiguration).
    let candidateMode: RoutingMode = routingMode;
    let appliedMode: RoutingMode = this.telemetry.controllerActiveMode;
    let reconfigReason = 'static_policy';

    if (routingMode === 'PROPOSED_RECONFIGURABLE') {
      // Dynamic mode selection based on detected workload and network state:
      if (avgCongestion < 0.10 && this.config.injectionRate <= 0.12) {
        candidateMode = 'LOW_POWER_BYPASS';
      } else if (localityIndex >= 0.58) {
        // CNN / Local Systolic traffic -> Adaptive DyXY relieves nearest neighbors with minimal overhead
        candidateMode = 'ADAPTIVE_DYXY';
      } else if (hotspotPressure > 0.38 || detectedClass === 'TRANSFORMER_GLOBAL' || detectedClass === 'MOE_BURSTY') {
        // Global all-to-all or heavy hotspot -> Congestion-Aware RCA deflects around overloaded core
        candidateMode = 'CONGESTION_AWARE_RCA';
      } else {
        candidateMode = 'ADAPTIVE_DYXY';
      }

      if (candidateMode === appliedMode) {
        this.pendingMode = null;
        this.pendingCount = 0;
        reconfigReason = 'already_active';
      } else {
        if (candidateMode === this.pendingMode) {
          this.pendingCount++;
        } else {
          this.pendingMode = candidateMode;
          this.pendingCount = 1;
        }

        if (this.pendingCount < this.config.hysteresisWindows) {
          reconfigReason = `hysteresis_wait(${this.pendingCount}/${this.config.hysteresisWindows})`;
        } else if (this.currentCycle - this.lastReconfigCycle < this.config.dwellCycles) {
          reconfigReason = 'dwell_time_block';
        } else {
          appliedMode = candidateMode;
          this.lastReconfigCycle = this.currentCycle;
          this.pendingCount = 0;
          this.pendingMode = null;
          this.reconfigurationCounter++;
          reconfigReason = 'applied';

          // Reconfiguration overhead: real cost of updating every router's
          // route/VC state on an actual mode switch, on top of the small
          // continuous per-epoch classification cost above.
          const reconfigEnergy = energyParams.reconfigurationEventPJ * this.routers.size;
          this.accumulatedEnergy.reconfigurationDynamic += reconfigEnergy;
        }
      }

      // Apply the (post-hysteresis) active mode as per-router configuration
      this.routers.forEach((r) => {
        // Inner routers subject to high pressure get Congestion-Aware RCA, outer low-traffic boundary can use Low-Power/Adaptive
        const isCenter =
          Math.abs(r.x - (meshWidth - 1) / 2) <= 0.8 &&
          Math.abs(r.y - (meshHeight - 1) / 2) <= 0.8;

        let routerMode = appliedMode;
        if (appliedMode === 'CONGESTION_AWARE_RCA' && !isCenter && r.congestionScore < 0.15) {
          routerMode = 'ADAPTIVE_DYXY';
        }

        r.currentMode = routerMode;
        r.controllerDecisions.unshift({
          cycle: this.currentCycle,
          selectedMode: routerMode,
          reason: `Workload: ${detectedClass} (Locality: ${(localityIndex * 100).toFixed(0)}%, Hotspot: ${(hotspotPressure * 100).toFixed(0)}%) [${reconfigReason}]`,
          workloadDetected: detectedClass,
          localityIndex,
          congestionGradient: hotspotPressure,
        });

        // Keep last 15 decisions
        if (r.controllerDecisions.length > 15) {
          r.controllerDecisions.pop();
        }
      });
    } else if (routingMode === 'TASK_BASED_TBP') {
      // TB-TBP's own switch, independent of the PROPOSED_RECONFIGURABLE
      // controller above: pick TB vs TBP from measured network congestion
      // against a fixed threshold (this simulator has no CPU retired-
      // instruction signal to compute the paper's speedup ratio from),
      // guarded by the same hysteresis/dwell safeguards.
      const candidatePolicy: 'TB' | 'TBP' =
        avgCongestion >= NoCSimulator.TASK_BASED_TBP_LOAD_THRESHOLD ? 'TBP' : 'TB';

      if (candidatePolicy === this.taskBasedActivePolicy) {
        this.taskBasedPendingPolicy = null;
        this.taskBasedPendingCount = 0;
        reconfigReason = 'already_active';
      } else {
        if (candidatePolicy === this.taskBasedPendingPolicy) {
          this.taskBasedPendingCount++;
        } else {
          this.taskBasedPendingPolicy = candidatePolicy;
          this.taskBasedPendingCount = 1;
        }

        if (this.taskBasedPendingCount < this.config.hysteresisWindows) {
          reconfigReason = `hysteresis_wait(${this.taskBasedPendingCount}/${this.config.hysteresisWindows})`;
        } else if (this.currentCycle - this.taskBasedLastSwitchCycle < this.config.dwellCycles) {
          reconfigReason = 'dwell_time_block';
        } else {
          this.taskBasedActivePolicy = candidatePolicy;
          this.taskBasedLastSwitchCycle = this.currentCycle;
          this.taskBasedPendingCount = 0;
          this.taskBasedPendingPolicy = null;
          this.reconfigurationCounter++;
          reconfigReason = 'applied';
        }
      }
    }

    // Push to global controller decision log
    this.decisionHistory.unshift({
      cycle: this.currentCycle,
      detectedPattern: `${detectedClass} (Loc: ${(localityIndex * 100).toFixed(0)}%)`,
      selectedMode: routingMode === 'PROPOSED_RECONFIGURABLE' ? appliedMode : routingMode,
      avgBufferLoad: avgCongestion * 100,
      reason: reconfigReason,
    });
    if (this.decisionHistory.length > 20) {
      this.decisionHistory.pop();
    }

    this.telemetry = {
      spatialLocalityIndex: localityIndex,
      globalHotspotPressure: hotspotPressure,
      trafficBurstiness: burstiness,
      averageHopDistance: avgHop,
      detectedWorkloadClass: detectedClass,
      controllerActiveMode: routingMode === 'PROPOSED_RECONFIGURABLE' ? appliedMode : routingMode,
      confidenceScore: classificationConfidence,
      reconfigurationCount: this.reconfigurationCounter,
      controllerOverheadEnergyPJ: this.accumulatedEnergy.controllerDynamic,
      taskBasedActivePolicy: routingMode === 'TASK_BASED_TBP' ? this.taskBasedActivePolicy : null,
      history: [...this.decisionHistory],
      faultAvoidanceEvents: [...this.faultAvoidanceEvents],
    };

    // Trim sliding window histories
    if (this.recentHopDistances.length > 200) this.recentHopDistances.splice(0, 100);
    if (this.recentArrivals.length > 50) this.recentArrivals.splice(0, 25);
  }

  /**
   * LINK ARRIVALS: Flits completing link traversal enter the downstream router input buffer
   */
  private processLinkArrivals(energyParams: ReturnType<typeof getEnergyParameters>): void {
    const { meshWidth, virtualChannels } = this.config;

    this.links.forEach((link) => {
      if (link.flitInTransit) {
        const flit = link.flitInTransit;
        const dstRouterId = link.dstY * meshWidth + link.dstX;
        const dstRouter = this.routers.get(dstRouterId);

        if (dstRouter) {
          // Identify arrival port on destination router (opposite of link direction)
          const arrivalPort: PortDirection =
            link.direction === 'EAST'
              ? 'WEST'
              : link.direction === 'WEST'
              ? 'EAST'
              : link.direction === 'SOUTH'
              ? 'NORTH'
              : 'SOUTH';

          const targetVC = flit.currentVC % virtualChannels;
          const bufferKey = `${arrivalPort}_${targetVC}`;
          const buffer = dstRouter.buffers.get(bufferKey);

          if (buffer && buffer.flits.length < buffer.maxCapacity) {
            // Flit successfully arrives into downstream buffer
            buffer.flits.push(flit);
            buffer.writeCount++;
            buffer.idleCycles = 0;
            buffer.isPowerGated = false;

            // Energy: Buffer Write
            this.accumulatedEnergy.bufferDynamic += energyParams.bufferWritePJPerFlit;
            dstRouter.energyPJ.bufferDynamic += energyParams.bufferWritePJPerFlit;
            flit.energyPJ += energyParams.bufferWritePJPerFlit;

            // Link is now free
            link.flitInTransit = null;
          } else {
            // Buffer is full (Backpressure / Stalled flit on link)
            flit.isBlocked = true;
          }
        }
      }
    });
  }

  /**
   * ROUTER PIPELINE: Route computation, switch allocation, crossbar traversal
   */
  private processRouterPipelines(energyParams: ReturnType<typeof getEnergyParameters>): void {
    const { meshWidth } = this.config;
    const directions: PortDirection[] = ['LOCAL', 'NORTH', 'SOUTH', 'EAST', 'WEST'];

    this.routers.forEach((router) => {
      // A faulty router doesn't process its pipeline at all -- flits
      // already queued there just sit (correctly modeling a dead router,
      // and matching how BASELINE_XY has no way to route around it).
      if (router.isFaulty) return;

      // Track which output ports have been granted in this cycle (1 flit per output port per cycle)
      const allocatedOutputPorts = new Set<PortDirection>();

      // Iterate through input buffers
      directions.forEach((inPort) => {
        for (let vc = 0; vc < this.config.virtualChannels; vc++) {
          const bufKey = `${inPort}_${vc}`;
          const buffer = router.buffers.get(bufKey);

          if (buffer && buffer.flits.length > 0) {
            const headFlit = buffer.flits[0];

            // 1. Route Computation
            const decision = RoutingEngine.computeNextHop(
              headFlit,
              router,
              this.routers,
              this.config,
              router.currentMode,
              this.taskBasedActivePolicy,
              this.faultyLinkKeySet
            );

            if (decision.avoidedFault) {
              this.faultAvoidanceEvents.unshift({
                cycle: this.currentCycle,
                atX: router.x,
                atY: router.y,
                chosenPort: decision.nextPort,
                avoidedX: decision.avoidedFault.x,
                avoidedY: decision.avoidedFault.y,
                avoidedKind: decision.avoidedFault.kind,
                wasDeflection: decision.avoidedFault.wasDeflection,
              });
              if (this.faultAvoidanceEvents.length > 30) this.faultAvoidanceEvents.pop();
            }

            const outPort = decision.nextPort;

            // 2. Switch Allocation & Arbitrate output port
            if (!allocatedOutputPorts.has(outPort)) {
              if (outPort === 'LOCAL') {
                // Destination reached! Deliver flit to local PE
                const delivered = buffer.flits.shift()!;
                buffer.readCount++;
                this.accumulatedEnergy.bufferDynamic += energyParams.bufferReadPJPerFlit;
                this.accumulatedEnergy.crossbarDynamic += energyParams.crossbarSwitchPJPerFlit;

                router.energyPJ.bufferDynamic += energyParams.bufferReadPJPerFlit;
                router.energyPJ.crossbarDynamic += energyParams.crossbarSwitchPJPerFlit;
                delivered.energyPJ += energyParams.bufferReadPJPerFlit + energyParams.crossbarSwitchPJPerFlit;

                this.totalDeliveredFlits++;
                router.totalDelivered++;

                if (delivered.type === 'TAIL' || delivered.type === 'SINGLE') {
                  const latency = this.currentCycle - delivered.creationCycle;
                  this.totalDeliveredPackets++;
                  this.deliveredLatencies.push(latency);
                  router.accumulatedLatency += latency;
                  router.avgLatency = router.accumulatedLatency / Math.max(1, router.totalDelivered);
                }

                allocatedOutputPorts.add('LOCAL');
              } else {
                // Forward flit over outgoing link
                const link = this.links.find(
                  (l) =>
                    l.srcX === router.x &&
                    l.srcY === router.y &&
                    l.direction === outPort
                );

                if (link && link.flitInTransit === null && !link.isFaulty) {
                  // Flit moves across Crossbar Switch onto Link
                  const flitToTransmit = buffer.flits.shift()!;
                  buffer.readCount++;
                  flitToTransmit.currentVC = decision.selectedVC;
                  flitToTransmit.hopCount++;
                  flitToTransmit.isBlocked = false;
                  flitToTransmit.routeHistory.push({
                    x: router.x,
                    y: router.y,
                    cycle: this.currentCycle,
                  });

                  // Energy: Buffer Read + Crossbar Switch + Link Wire
                  const hopEnergy =
                    energyParams.bufferReadPJPerFlit +
                    energyParams.crossbarSwitchPJPerFlit +
                    energyParams.linkTraversalPJPerFlit;

                  this.accumulatedEnergy.bufferDynamic += energyParams.bufferReadPJPerFlit;
                  this.accumulatedEnergy.crossbarDynamic += energyParams.crossbarSwitchPJPerFlit;
                  this.accumulatedEnergy.linkDynamic += energyParams.linkTraversalPJPerFlit;

                  router.energyPJ.bufferDynamic += energyParams.bufferReadPJPerFlit;
                  router.energyPJ.crossbarDynamic += energyParams.crossbarSwitchPJPerFlit;
                  router.energyPJ.linkDynamic += energyParams.linkTraversalPJPerFlit;

                  link.flitInTransit = flitToTransmit;
                  link.busyCycles++;
                  link.totalTransversals++;
                  link.energyPJ += energyParams.linkTraversalPJPerFlit;
                  flitToTransmit.energyPJ += hopEnergy;

                  router.linkUtilization[outPort]++;
                  allocatedOutputPorts.add(outPort);
                }
              }
            }
          }
        }
      });
    });
  }

  /** Generous relative to any real latency in this simulator (typical
   * delivered latency is tens of cycles) but bounded relative to a run --
   * only ever fires on a flit that has genuinely stopped making progress. */
  private getFlitTimeoutCycles(): number {
    return Math.max(200, 20 * (this.config.meshWidth + this.config.meshHeight));
  }

  /**
   * FLIT TIMEOUT (deadlock/gridlock recovery): drops any flit that has been
   * alive longer than getFlitTimeoutCycles() without being delivered,
   * whether it's queued at a router (most commonly: landed in a faulty
   * router's buffer, which never processes its pipeline again) or stalled
   * mid-link. Frees the buffer slot / link it was occupying so backpressure
   * doesn't cascade indefinitely. Applies uniformly regardless of routing
   * mode -- it recovers from gridlock, it doesn't pick a winner.
   */
  private processFlitTimeouts(): void {
    const timeout = this.getFlitTimeoutCycles();

    this.routers.forEach((router) => {
      router.buffers.forEach((buffer) => {
        while (buffer.flits.length > 0 && this.currentCycle - buffer.flits[0].creationCycle > timeout) {
          buffer.flits.shift();
          this.totalDroppedFlits++;
        }
      });
    });

    this.links.forEach((link) => {
      if (link.flitInTransit && this.currentCycle - link.flitInTransit.creationCycle > timeout) {
        link.flitInTransit = null;
        this.totalDroppedFlits++;
      }
    });
  }

  /**
   * PACKET INJECTION: Processing elements generate new packets
   */
  private processPacketInjection(energyParams: ReturnType<typeof getEnergyParameters>): void {
    let injectedThisCycle = 0;
    const defaultPacketLength = this.config.packetLengthFlits || 4;
    const bytesPerFlit = Math.max(1, Math.floor(this.config.flitDataBits / 8));

    this.routers.forEach((router) => {
      if (this.trafficGen.shouldInject(router.x, router.y, this.currentCycle)) {
        const target = this.trafficGen.getDestination(router.x, router.y, this.currentCycle);
        const manhattan = Math.abs(target.dstX - router.x) + Math.abs(target.dstY - router.y);
        this.recentHopDistances.push(manhattan);

        // Real-trace workloads carry their recorded packet size; every other
        // (synthetic) workload uses the configured fixed packet length. This
        // engine admits a packet's flits into the local injection buffer all
        // at once (see the capacity check below), so a packet can never be
        // longer than the buffer itself -- capped here at bufferDepthPerVC,
        // a real physical constraint of this admission model, not an
        // invented number. This means a real trace's larger recorded
        // messages (e.g. BERT's ~3KB attention exchanges) inject as fewer
        // flits here than their true byte size implies under small default
        // buffer depths; the uncapped, byte-accurate numbers are what
        // research-engine's offline experiments actually measure and plot.
        const packetLength =
          target.sizeBytes !== undefined
            ? Math.max(1, Math.min(this.config.bufferDepthPerVC, Math.ceil(target.sizeBytes / bytesPerFlit)))
            : defaultPacketLength;

        // Check if Local injection buffer (VC0) has capacity
        const localBuffer = router.buffers.get('LOCAL_0');
        if (localBuffer && localBuffer.flits.length + packetLength <= localBuffer.maxCapacity) {
          const packetId = `pkt_${this.currentCycle}_${router.id}_${Math.floor(Math.random() * 1000)}`;

          for (let i = 0; i < packetLength; i++) {
            const flitType =
              packetLength === 1
                ? 'SINGLE'
                : i === 0
                ? 'HEAD'
                : i === packetLength - 1
                ? 'TAIL'
                : 'BODY';

            const flit: Flit = {
              id: `${packetId}_f${i}`,
              packetId,
              flitIndex: i,
              totalFlits: packetLength,
              type: flitType,
              srcX: router.x,
              srcY: router.y,
              dstX: target.dstX,
              dstY: target.dstY,
              creationCycle: this.currentCycle,
              hopCount: 0,
              routeHistory: [{ x: router.x, y: router.y, cycle: this.currentCycle }],
              currentVC: 0,
              energyPJ: energyParams.bufferWritePJPerFlit,
              workloadTag: this.config.workloadType,
              isBlocked: false,
            };

            localBuffer.flits.push(flit);
            localBuffer.writeCount++;
            this.totalInjectedFlits++;
            this.accumulatedEnergy.bufferDynamic += energyParams.bufferWritePJPerFlit;
            router.energyPJ.bufferDynamic += energyParams.bufferWritePJPerFlit;
          }

          this.totalInjectedPackets++;
          router.totalInjected++;
          injectedThisCycle++;
        }
      }
    });

    this.recentArrivals.push(injectedThisCycle);
  }

  /**
   * STATIC POWER & LEAKAGE (with Idle VC Power Gating)
   */
  private processStaticPower(energyParams: ReturnType<typeof getEnergyParameters>): void {
    this.routers.forEach((router) => {
      let routerStaticLeakage = 0;

      router.buffers.forEach((buf) => {
        if (buf.flits.length === 0) {
          buf.idleCycles++;
          if (buf.idleCycles > this.config.powerGatingThreshold) {
            buf.isPowerGated = true;
          }
        } else {
          buf.idleCycles = 0;
          buf.isPowerGated = false;
        }

        const vcStatic = buf.isPowerGated
          ? energyParams.staticLeakagePJPerCyclePerRouter * (1 - energyParams.powerGatedLeakageReduction)
          : energyParams.staticLeakagePJPerCyclePerRouter;

        routerStaticLeakage += vcStatic / (this.config.virtualChannels * 5);
      });

      this.accumulatedEnergy.staticLeakage += routerStaticLeakage;
      router.energyPJ.staticLeakage += routerStaticLeakage;
    });
  }

  /**
   * Update Congestion Scores and History
   */
  private updateRouterStats(): void {
    let totalFlitsStored = 0;
    let maxPossibleCapacity = 0;

    this.routers.forEach((router) => {
      let routerFlits = 0;
      let routerCapacity = 0;

      router.buffers.forEach((buf) => {
        routerFlits += buf.flits.length;
        routerCapacity += buf.maxCapacity;
      });

      totalFlitsStored += routerFlits;
      maxPossibleCapacity += routerCapacity;

      const occupancyRatio = routerFlits / Math.max(1, routerCapacity);
      router.congestionScore = occupancyRatio;
      router.temperatureRelative = 0.2 + occupancyRatio * 0.75;

      router.bufferOccupancyHistory.push(occupancyRatio);
      if (router.bufferOccupancyHistory.length > 30) {
        router.bufferOccupancyHistory.shift();
      }
    });

    const netOccupancy = totalFlitsStored / Math.max(1, maxPossibleCapacity);
    if (netOccupancy > 0.85 && !this.isSaturated) {
      this.isSaturated = true;
      this.saturationCycle = this.currentCycle;
    }
  }

  /**
   * Get aggregate metrics
   */
  public getMetrics(): SimulationMetrics {
    const totalEnergy =
      this.accumulatedEnergy.staticLeakage +
      this.accumulatedEnergy.bufferDynamic +
      this.accumulatedEnergy.crossbarDynamic +
      this.accumulatedEnergy.linkDynamic +
      this.accumulatedEnergy.controllerDynamic +
      this.accumulatedEnergy.reconfigurationDynamic;

    let avgLatency = 0;
    let maxLatency = 0;
    let p95Latency = 0;
    let p99Latency = 0;

    if (this.deliveredLatencies.length > 0) {
      const sorted = [...this.deliveredLatencies].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      avgLatency = sum / sorted.length;
      maxLatency = sorted[sorted.length - 1];
      p95Latency = sorted[Math.floor(sorted.length * 0.95)] || maxLatency;
      p99Latency = sorted[Math.floor(sorted.length * 0.99)] || maxLatency;
    }

    const totalNodes = this.config.meshWidth * this.config.meshHeight;
    const throughput = this.totalDeliveredFlits / Math.max(1, this.currentCycle * totalNodes);

    let totalBufferOccupancy = 0;
    let peakBufferOccupancy = 0;
    this.routers.forEach((r) => {
      totalBufferOccupancy += r.congestionScore;
      if (r.congestionScore > peakBufferOccupancy) peakBufferOccupancy = r.congestionScore;
    });
    const avgBufferOccupancyPct = (totalBufferOccupancy / Math.max(1, this.routers.size)) * 100;

    const flitsInFlight = this.totalInjectedFlits - this.totalDeliveredFlits;
    const energyPerFlit = this.totalDeliveredFlits > 0 ? totalEnergy / this.totalDeliveredFlits : 0;
    const edp = avgLatency * totalEnergy;
    const packetDeliveryRatioPct =
      this.totalInjectedPackets > 0 ? (this.totalDeliveredPackets / this.totalInjectedPackets) * 100 : 100;

    return {
      currentCycle: this.currentCycle,
      totalInjectedPackets: this.totalInjectedPackets,
      totalInjectedFlits: this.totalInjectedFlits,
      totalDeliveredPackets: this.totalDeliveredPackets,
      totalDeliveredFlits: this.totalDeliveredFlits,
      flitsInFlight: Math.max(0, flitsInFlight),
      averagePacketLatency: avgLatency,
      maxPacketLatency: maxLatency,
      tailLatencyP95: p95Latency,
      tailLatencyP99: p99Latency,
      throughputFlitsPerNodeCycle: throughput,
      averageBufferOccupancyPct: avgBufferOccupancyPct,
      peakBufferOccupancyPct: peakBufferOccupancy * 100,
      totalEnergyPJ: totalEnergy,
      energyPerFlitPJ: energyPerFlit,
      energyDelayProduct: edp,
      saturationDetected: this.isSaturated,
      saturationCycle: this.saturationCycle,
      packetDeliveryRatioPct,
      totalDroppedFlits: this.totalDroppedFlits,
      energyBreakdown: { ...this.accumulatedEnergy },
    };
  }

  /** Cheap O(1) progress check (unlike getMetrics(), which sorts the full
   * delivered-latency array) -- for a runner loop deciding whether to stop
   * early once a target packet count has been injected. */
  public getTotalInjectedPackets(): number {
    return this.totalInjectedPackets;
  }

  public getRouters(): Map<number, RouterNode> {
    return this.routers;
  }

  public getLinks(): Link[] {
    return this.links;
  }

  public getTelemetry(): WorkloadTelemetry {
    return this.telemetry;
  }

  public getConfig(): NoCConfig {
    return this.config;
  }
}

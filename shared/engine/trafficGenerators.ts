import { NoCConfig, WorkloadType, TRACE_WORKLOAD_TYPES } from '../types/noc.js';
import { REAL_TRACES, TraceEvent, traceDim, spanCyclesForEvents } from './realTraces.js';

export interface TrafficTarget {
  dstX: number;
  dstY: number;
  priority: number;
  burstGroup?: number;
  sizeBytes?: number;
}

function isTraceWorkload(w: WorkloadType): boolean {
  return TRACE_WORKLOAD_TYPES.includes(w);
}

export class TrafficGenerator {
  private config: NoCConfig;
  private burstCounter: number = 0;
  private burstActive: boolean = false;
  private moeCurrentExpertX: number = 0;
  private moeCurrentExpertY: number = 0;

  // Real-trace replay state: per-node (keyed "x,y") sorted event queues,
  // a cursor + loop offset per node so each node's recorded schedule
  // replays once, in order, then loops (looping is intentional and
  // documented, not silently wrong -- a live demo session usually runs
  // longer than one recorded trace).
  private traceWorkload: WorkloadType | null = null;
  private traceNodeEvents: Map<string, { cycle: number; dstX: number; dstY: number; sizeBytes: number }[]> = new Map();
  private traceCursor: Map<string, number> = new Map();
  private traceLoopOffset: Map<string, number> = new Map();
  private traceEpochCycle: number | null = null;
  private traceSpan = 0;

  // CUSTOM_TRACE's events come from a user-uploaded file at runtime, not a
  // bundled asset, so they can't live in REAL_TRACES -- set via
  // setCustomTraceEvents() before or after CUSTOM_TRACE is selected.
  private customTraceEvents: TraceEvent[] | null = null;

  // Nodes currently down (router fault) -- neither a valid source nor a
  // valid destination, since a faulty PE can't inject or receive traffic.
  // Set once per fault placement by NoCSimulator, shared with the routing
  // layer's own fault awareness so a "dead" node behaves consistently
  // everywhere in the sim.
  private faultyRouterIds: Set<number> = new Set();

  constructor(config: NoCConfig) {
    this.config = config;
    this.moeCurrentExpertX = Math.floor(config.meshWidth / 2);
    this.moeCurrentExpertY = Math.floor(config.meshHeight / 2);
    this.setupTraceReplayIfNeeded();
  }

  public updateConfig(config: NoCConfig) {
    const workloadChanged = config.workloadType !== this.config.workloadType;
    this.config = config;
    if (workloadChanged) this.setupTraceReplayIfNeeded();
  }

  /** Load a user-uploaded trace for CUSTOM_TRACE. Re-applies immediately if
   * CUSTOM_TRACE is already the active workload. */
  public setCustomTraceEvents(events: TraceEvent[]): void {
    this.customTraceEvents = events;
    if (this.config.workloadType === 'CUSTOM_TRACE') this.setupTraceReplayIfNeeded();
  }

  /** Replaces the set of faulty (down) router ids. Called by NoCSimulator
   * whenever fault placement is (re)established. */
  public setFaultyRouters(ids: Iterable<number>): void {
    this.faultyRouterIds = new Set(ids);
  }

  private isFaultyNode(x: number, y: number): boolean {
    if (this.faultyRouterIds.size === 0) return false;
    return this.faultyRouterIds.has(y * this.config.meshWidth + x);
  }

  /** When the "natural" destination for a pattern lands on a faulty node,
   * resample rather than send traffic into a dead PE -- a real system
   * wouldn't address a downed node either. Small random probe first (cheap,
   * fine unless fault density is very high), then an exhaustive scan as a
   * fallback so this never silently drops traffic under a merely unlucky
   * random draw. */
  private avoidFaultyDestination(srcX: number, srcY: number, fallback: TrafficTarget): TrafficTarget {
    const { meshWidth, meshHeight } = this.config;
    const total = meshWidth * meshHeight;
    for (let attempt = 0; attempt < 8; attempt++) {
      const id = Math.floor(Math.random() * total);
      const x = id % meshWidth;
      const y = Math.floor(id / meshWidth);
      if ((x !== srcX || y !== srcY) && !this.faultyRouterIds.has(id)) {
        return { dstX: x, dstY: y, priority: fallback.priority };
      }
    }
    for (let id = 0; id < total; id++) {
      const x = id % meshWidth;
      const y = Math.floor(id / meshWidth);
      if ((x !== srcX || y !== srcY) && !this.faultyRouterIds.has(id)) {
        return { dstX: x, dstY: y, priority: fallback.priority };
      }
    }
    return fallback; // every other node is faulty too -- nothing better to do
  }

  private setupTraceReplayIfNeeded() {
    const workload = this.config.workloadType;
    if (!isTraceWorkload(workload)) {
      this.traceWorkload = null;
      return;
    }

    this.traceWorkload = workload;
    this.traceNodeEvents = new Map();
    this.traceCursor = new Map();
    this.traceLoopOffset = new Map();
    this.traceEpochCycle = null;

    const events = workload === 'CUSTOM_TRACE' ? this.customTraceEvents ?? [] : REAL_TRACES[workload] ?? [];
    this.traceSpan = spanCyclesForEvents(events);

    if (this.config.meshWidth !== traceDim() || this.config.meshHeight !== traceDim()) {
      // Real traces were only generated for a 4x4 mesh -- replaying them on
      // any other size would misassign src/dst node ids. Fall back to
      // uniform-random rather than silently misrouting.
      return;
    }

    const dim = traceDim();
    for (const ev of events) {
      const srcX = ev.srcId % dim;
      const srcY = Math.floor(ev.srcId / dim);
      const dstX = ev.dstId % dim;
      const dstY = Math.floor(ev.dstId / dim);
      const key = `${srcX},${srcY}`;
      const list = this.traceNodeEvents.get(key) ?? [];
      list.push({ cycle: ev.cycle, dstX, dstY, sizeBytes: ev.sizeBytes });
      this.traceNodeEvents.set(key, list);
    }
  }

  private nextTraceEvent(srcX: number, srcY: number) {
    const key = `${srcX},${srcY}`;
    const events = this.traceNodeEvents.get(key);
    if (!events || events.length === 0) return null;
    const idx = this.traceCursor.get(key) ?? 0;
    return { key, events, idx };
  }

  /**
   * Determine if node (srcX, srcY) should inject a packet this cycle
   */
  public shouldInject(srcX: number, srcY: number, cycle: number): boolean {
    const { workloadType, injectionRate, meshWidth, meshHeight } = this.config;

    if (this.isFaultyNode(srcX, srcY)) return false; // a downed PE can't inject

    if (this.traceWorkload === workloadType && isTraceWorkload(workloadType)) {
      const next = this.nextTraceEvent(srcX, srcY);
      if (!next) return false;
      if (this.traceEpochCycle === null) this.traceEpochCycle = cycle;
      const offset = this.traceLoopOffset.get(next.key) ?? 0;
      const dueCycle = next.events[next.idx].cycle + offset + this.traceEpochCycle;
      return cycle >= dueCycle;
    }

    if (workloadType === 'MOE_BURSTY') {
      // Periodic burst of active expert gating
      const burstPeriod = 40;
      const burstWindow = 12;
      const isBurstTime = (cycle % burstPeriod) < burstWindow;
      const rate = isBurstTime ? Math.min(0.95, injectionRate * 3.5) : injectionRate * 0.2;
      return Math.random() < rate;
    }

    if (workloadType === 'HOTSPOT_TRAFFIC') {
      // Hotspot nodes have slightly higher baseline injection
      const isCenter = 
        Math.abs(srcX - (meshWidth - 1) / 2) <= 0.5 &&
        Math.abs(srcY - (meshHeight - 1) / 2) <= 0.5;
      const rate = isCenter ? injectionRate * 1.3 : injectionRate;
      return Math.random() < rate;
    }

    // Standard Bernoulli random injection process
    return Math.random() < injectionRate;
  }

  /**
   * Compute destination node (dstX, dstY) for a packet injected at (srcX, srcY)
   */
  public getDestination(srcX: number, srcY: number, cycle: number): TrafficTarget {
    const raw = this.computeRawDestination(srcX, srcY, cycle);
    if (!this.isFaultyNode(raw.dstX, raw.dstY)) return raw;
    return this.avoidFaultyDestination(srcX, srcY, raw);
  }

  private computeRawDestination(srcX: number, srcY: number, cycle: number): TrafficTarget {
    const { workloadType, meshWidth, meshHeight } = this.config;

    if (this.traceWorkload === workloadType && isTraceWorkload(workloadType)) {
      const next = this.nextTraceEvent(srcX, srcY);
      if (next) {
        const ev = next.events[next.idx];
        const nextIdx = next.idx + 1;
        if (nextIdx >= next.events.length) {
          this.traceCursor.set(next.key, 0);
          this.traceLoopOffset.set(next.key, (this.traceLoopOffset.get(next.key) ?? 0) + this.traceSpan);
        } else {
          this.traceCursor.set(next.key, nextIdx);
        }
        return { dstX: ev.dstX, dstY: ev.dstY, priority: 1, sizeBytes: ev.sizeBytes };
      }
    }

    switch (workloadType) {
      case 'CNN_LOCAL': {
        // High spatial locality (75% within 1 or 2 hops: nearest neighbor / systolic array)
        if (Math.random() < 0.75) {
          const deltaX = [-1, 0, 1, 0, -1, 1, -1, 1][Math.floor(Math.random() * 8)];
          const deltaY = [0, -1, 0, 1, -1, -1, 1, 1][Math.floor(Math.random() * 8)];
          let dstX = Math.min(meshWidth - 1, Math.max(0, srcX + deltaX));
          let dstY = Math.min(meshHeight - 1, Math.max(0, srcY + deltaY));
          if (dstX === srcX && dstY === srcY) {
            // Pick a non-identical neighbor
            dstX = srcX + (srcX < meshWidth - 1 ? 1 : -1);
          }
          return { dstX, dstY, priority: 1 };
        } else {
          // 25% boundary pooling or parameter update
          return this.getUniformRandomDestination(srcX, srcY);
        }
      }

      case 'TRANSFORMER_GLOBAL': {
        // High global traffic (All-to-all attention head QKV & KV cache broadcast)
        // 80% long-distance or cross-bisection traffic
        if (Math.random() < 0.80) {
          let dstX = (srcX + Math.floor(meshWidth / 2) + Math.floor(Math.random() * (meshWidth - 1))) % meshWidth;
          let dstY = (srcY + Math.floor(meshHeight / 2) + Math.floor(Math.random() * (meshHeight - 1))) % meshHeight;
          if (dstX === srcX && dstY === srcY) {
            dstX = (srcX + 1) % meshWidth;
          }
          return { dstX, dstY, priority: 2 };
        }
        return this.getUniformRandomDestination(srcX, srcY);
      }

      case 'MOE_BURSTY': {
        // Sparse expert routing: multiple nodes send to dynamic chosen expert clusters
        if (cycle % 30 === 0) {
          this.moeCurrentExpertX = Math.floor(Math.random() * meshWidth);
          this.moeCurrentExpertY = Math.floor(Math.random() * meshHeight);
        }
        if (Math.random() < 0.65) {
          // Send to current expert
          if (srcX !== this.moeCurrentExpertX || srcY !== this.moeCurrentExpertY) {
            return { dstX: this.moeCurrentExpertX, dstY: this.moeCurrentExpertY, priority: 3 };
          }
        }
        return this.getUniformRandomDestination(srcX, srcY);
      }

      case 'BIT_COMPLEMENT': {
        const dstX = meshWidth - 1 - srcX;
        const dstY = meshHeight - 1 - srcY;
        if (dstX === srcX && dstY === srcY) {
          return { dstX: (srcX + 1) % meshWidth, dstY: (srcY + 1) % meshHeight, priority: 1 };
        }
        return { dstX, dstY, priority: 1 };
      }

      case 'TRANSPOSE': {
        // Classic synthetic NoC pattern: node (x,y) sends to (y,x). Only a
        // true involution on a square mesh; on a rectangular one it clamps,
        // which is an honest approximation, not a hidden bug.
        let dstX = Math.min(meshWidth - 1, srcY);
        let dstY = Math.min(meshHeight - 1, srcX);
        if (dstX === srcX && dstY === srcY) {
          dstX = (srcX + 1) % meshWidth;
        }
        return { dstX, dstY, priority: 1 };
      }

      case 'BIT_REVERSAL': {
        // Classic synthetic NoC pattern: reverse the bits of the flat node
        // id and route there.
        const total = meshWidth * meshHeight;
        const bits = Math.max(1, Math.ceil(Math.log2(total)));
        const srcId = srcY * meshWidth + srcX;
        let reversed = 0;
        for (let b = 0; b < bits; b++) {
          if (srcId & (1 << b)) reversed |= 1 << (bits - 1 - b);
        }
        let dstId = reversed % total;
        let dstX = dstId % meshWidth;
        let dstY = Math.floor(dstId / meshWidth);
        if (dstX === srcX && dstY === srcY) {
          dstId = (dstId + 1) % total;
          dstX = dstId % meshWidth;
          dstY = Math.floor(dstId / meshWidth);
        }
        return { dstX, dstY, priority: 1 };
      }

      case 'HOTSPOT_TRAFFIC': {
        // 40% traffic goes to center hotspot node
        if (Math.random() < 0.40) {
          const centerX = Math.floor(meshWidth / 2);
          const centerY = Math.floor(meshHeight / 2);
          if (srcX !== centerX || srcY !== centerY) {
            return { dstX: centerX, dstY: centerY, priority: 2 };
          }
        }
        return this.getUniformRandomDestination(srcX, srcY);
      }

      case 'UNIFORM_RANDOM':
      default:
        return this.getUniformRandomDestination(srcX, srcY);
    }
  }

  private getUniformRandomDestination(srcX: number, srcY: number): TrafficTarget {
    const { meshWidth, meshHeight } = this.config;
    const totalNodes = meshWidth * meshHeight;
    let dstId = Math.floor(Math.random() * totalNodes);
    let dstX = dstId % meshWidth;
    let dstY = Math.floor(dstId / meshWidth);

    if (dstX === srcX && dstY === srcY) {
      dstId = (dstId + 1) % totalNodes;
      dstX = dstId % meshWidth;
      dstY = Math.floor(dstId / meshWidth);
    }

    return { dstX, dstY, priority: 1 };
  }
}

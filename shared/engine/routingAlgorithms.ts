import { Flit, NoCConfig, PortDirection, RouterNode, RoutingMode } from '../types/noc.js';

export interface RouteDecision {
  nextPort: PortDirection;
  nextX: number;
  nextY: number;
  selectedVC: number;
  algorithmUsed: RoutingMode;
  reason: string;
  /** Set when this hop picked its port specifically because the "natural"
   * candidate led into a faulty router/link. Only ADAPTIVE_DYXY and
   * CONGESTION_AWARE_RCA (and therefore PROPOSED_RECONFIGURABLE, which
   * delegates to them) are fault-aware -- BASELINE_XY and LOW_POWER_BYPASS
   * are deterministic/static by design and never populate this. */
  avoidedFault?: { x: number; y: number; kind: 'ROUTER_FAULT' | 'LINK_FAULT'; wasDeflection: boolean };
}

/** Set of `${x},${y}:${direction}` keys for links currently down. Threaded
 * through the fault-aware routing functions so they can route around a
 * faulty link even though Link objects themselves aren't passed in (router
 * faults are read directly off RouterNode.isFaulty). */
export type FaultyLinkSet = ReadonlySet<string>;
export const NO_FAULTY_LINKS: FaultyLinkSet = new Set();

function linkFaultKey(x: number, y: number, port: PortDirection): string {
  return `${x},${y}:${port}`;
}

/** Why a candidate hop is unusable: out-of-bounds is a normal topology edge
 * (not a fault); ROUTER_FAULT/LINK_FAULT are genuine faults worth logging
 * and routing around. */
function classifyBlock(
  curX: number,
  curY: number,
  port: PortDirection,
  nextX: number,
  nextY: number,
  config: NoCConfig,
  allRouters: Map<number, RouterNode>,
  faultyLinks: FaultyLinkSet
): 'OUT_OF_BOUNDS' | 'ROUTER_FAULT' | 'LINK_FAULT' | null {
  if (nextX < 0 || nextX >= config.meshWidth || nextY < 0 || nextY >= config.meshHeight) return 'OUT_OF_BOUNDS';
  if (faultyLinks.has(linkFaultKey(curX, curY, port))) return 'LINK_FAULT';
  const neighbor = allRouters.get(nextY * config.meshWidth + nextX);
  if (neighbor?.isFaulty) return 'ROUTER_FAULT';
  return null;
}

interface Candidate {
  port: PortDirection;
  nextX: number;
  nextY: number;
}

/**
 * Escape-channel deadlock avoidance (Duato's protocol): reserve the LAST
 * virtual channel as a deterministic-XY-only "escape" channel, whose
 * channel dependency graph is a subgraph of plain XY routing's (so it's
 * provably cycle-free), and let every OTHER virtual channel route fully
 * adaptively with no turn restriction. A flit only takes the escape
 * channel when every adaptive candidate's target buffer (the exact
 * port+VC it would land in on the neighbor) is completely full -- see
 * isTargetChannelFull below; once on it, Duato's protocol requires it
 * stay on the escape channel and route deterministically for the rest of
 * its journey, which is what guarantees no new cycle forms.
 * Needs >=2 VCs (1 escape + >=1 adaptive) -- with exactly 1 VC there's no
 * budget for a separate escape channel, so callers fall back to the
 * West-First turn model instead (see faultAwareCandidates).
 */
function getEscapeInfo(config: NoCConfig): { canEscape: boolean; escapeVC: number } {
  return { canEscape: config.virtualChannels >= 2, escapeVC: config.virtualChannels - 1 };
}

const OPPOSITE_PORT: Record<'EAST' | 'WEST' | 'NORTH' | 'SOUTH', PortDirection> = {
  EAST: 'WEST',
  WEST: 'EAST',
  NORTH: 'SOUTH',
  SOUTH: 'NORTH',
};

/**
 * Duato's actual escape trigger: not a router-wide congestion average (that
 * aggregates every port/VC, and can stay low even while the ONE specific
 * channel a flit needs is completely full), but whether the *exact*
 * downstream input buffer this hop would use -- the arrival-port/VC pair on
 * the neighbor -- has any free slot at all. That's the precise condition
 * that matters for the channel-dependency argument: a channel that still
 * has room can't be the stuck link in a cyclic wait.
 */
function isTargetChannelFull(
  candidate: Candidate,
  vc: number,
  config: NoCConfig,
  allRouters: Map<number, RouterNode>
): boolean {
  const neighbor = allRouters.get(candidate.nextY * config.meshWidth + candidate.nextX);
  if (!neighbor) return false;
  const arrivalPort = OPPOSITE_PORT[candidate.port as 'EAST' | 'WEST' | 'NORTH' | 'SOUTH'];
  const buffer = neighbor.buffers.get(`${arrivalPort}_${vc}`);
  if (!buffer) return false;
  return buffer.flits.length >= buffer.maxCapacity;
}

/**
 * Builds the usable candidate hop list towards (dstX, dstY): the minimal
 * (shortest-path) X/Y directions when they're clear, or -- when every
 * minimal direction is blocked by a fault -- deflects to a perpendicular
 * direction that isn't. This is what gives ADAPTIVE_DYXY and
 * CONGESTION_AWARE_RCA (and so PROPOSED_RECONFIGURABLE) their fault
 * tolerance: a fault just removes a candidate from consideration instead
 * of being invisible to the algorithm.
 */
function faultAwareCandidates(
  curX: number,
  curY: number,
  dstX: number,
  dstY: number,
  config: NoCConfig,
  allRouters: Map<number, RouterNode>,
  faultyLinks: FaultyLinkSet,
  fullyAdaptive: boolean
): { usable: (Candidate & { deflected: boolean })[]; avoided: { x: number; y: number; kind: 'ROUTER_FAULT' | 'LINK_FAULT' }[]; minimalFallback: Candidate[] } {
  // Fully-adaptive minimal routing (both X and Y candidates offered
  // whenever both exist) is NOT deadlock-free on its own -- cyclic channel
  // dependencies can still form across flows even though every hop only
  // moves toward the destination. When `fullyAdaptive` is false (no escape
  // VC available -- see computeAdaptiveDyXY/computeCongestionAwareRCA),
  // fall back to the West-First turn model (Glass & Ni, 1992) to guarantee
  // deadlock-freedom by restriction alone: a packet that still needs to
  // move West must do so before it's allowed to turn North/South (N->W and
  // S->W turns forbidden), implemented statelessly per-hop as "West is the
  // only candidate while curX > dstX". When `fullyAdaptive` is true, the
  // caller instead guarantees deadlock-freedom via an escape channel
  // (Duato's protocol), so no turn restriction is needed here at all.
  const needsWest = !fullyAdaptive && curX > dstX;
  const minimal: Candidate[] = [];
  if (curX < dstX) minimal.push({ port: 'EAST', nextX: curX + 1, nextY: curY });
  else if (curX > dstX) minimal.push({ port: 'WEST', nextX: curX - 1, nextY: curY });
  if (!needsWest) {
    if (curY < dstY) minimal.push({ port: 'SOUTH', nextX: curX, nextY: curY + 1 });
    else if (curY > dstY) minimal.push({ port: 'NORTH', nextX: curX, nextY: curY - 1 });
  }

  const avoided: { x: number; y: number; kind: 'ROUTER_FAULT' | 'LINK_FAULT' }[] = [];
  const usableMinimal = minimal.filter((c) => {
    const block = classifyBlock(curX, curY, c.port, c.nextX, c.nextY, config, allRouters, faultyLinks);
    if (block === 'ROUTER_FAULT' || block === 'LINK_FAULT') {
      avoided.push({ x: c.nextX, y: c.nextY, kind: block });
      return false;
    }
    return block === null;
  });

  if (usableMinimal.length > 0) {
    return { usable: usableMinimal.map((c) => ({ ...c, deflected: false })), avoided, minimalFallback: minimal };
  }

  // Every minimal direction is faulty -- deflect to whichever perpendicular
  // compass direction is actually clear, so a single fault can't strand
  // the flit against a wall it's not allowed to route around.
  const usedPorts = new Set(minimal.map((m) => m.port));
  const allDirs: Candidate[] = [
    { port: 'EAST', nextX: curX + 1, nextY: curY },
    { port: 'WEST', nextX: curX - 1, nextY: curY },
    { port: 'SOUTH', nextX: curX, nextY: curY + 1 },
    { port: 'NORTH', nextX: curX, nextY: curY - 1 },
  ];
  const deflection = allDirs.filter(
    (c) =>
      !usedPorts.has(c.port) &&
      classifyBlock(curX, curY, c.port, c.nextX, c.nextY, config, allRouters, faultyLinks) === null
  );

  return {
    usable: deflection.map((c) => ({ ...c, deflected: true })),
    avoided,
    minimalFallback: minimal,
  };
}

export class RoutingEngine {
  /**
   * Primary route selection function
   */
  public static computeNextHop(
    flit: Flit,
    currentRouter: RouterNode,
    allRouters: Map<number, RouterNode>,
    config: NoCConfig,
    activeMode: RoutingMode,
    taskBasedPolicy: 'TB' | 'TBP' = 'TB',
    faultyLinks: FaultyLinkSet = NO_FAULTY_LINKS
  ): RouteDecision {
    const { x: curX, y: curY } = currentRouter;
    const { dstX, dstY } = flit;

    // Check if reached destination
    if (curX === dstX && curY === dstY) {
      return {
        nextPort: 'LOCAL',
        nextX: curX,
        nextY: curY,
        selectedVC: 0,
        algorithmUsed: activeMode,
        reason: 'Destination reached (Local PE Delivery)',
      };
    }

    switch (activeMode) {
      case 'BASELINE_XY':
        return this.computeBaselineXY(curX, curY, dstX, dstY);

      case 'ADAPTIVE_DYXY':
        return this.computeAdaptiveDyXY(flit, currentRouter, allRouters, config, faultyLinks);

      case 'CONGESTION_AWARE_RCA':
        return this.computeCongestionAwareRCA(flit, currentRouter, allRouters, config, faultyLinks);

      case 'LOW_POWER_BYPASS':
        return this.computeLowPowerBypass(flit, currentRouter, allRouters, config);

      case 'TASK_BASED_TBP':
        return this.computeTaskBasedTBP(flit, currentRouter, config, taskBasedPolicy);

      case 'PROPOSED_RECONFIGURABLE':
      default:
        // Use the router's dynamically assigned mode from the configuration controller
        return this.computeForMode(currentRouter.currentMode, flit, currentRouter, allRouters, config, faultyLinks);
    }
  }

  private static computeForMode(
    mode: RoutingMode,
    flit: Flit,
    currentRouter: RouterNode,
    allRouters: Map<number, RouterNode>,
    config: NoCConfig,
    faultyLinks: FaultyLinkSet
  ): RouteDecision {
    if (mode === 'BASELINE_XY') {
      return this.computeBaselineXY(currentRouter.x, currentRouter.y, flit.dstX, flit.dstY);
    } else if (mode === 'ADAPTIVE_DYXY') {
      return this.computeAdaptiveDyXY(flit, currentRouter, allRouters, config, faultyLinks);
    } else if (mode === 'CONGESTION_AWARE_RCA') {
      return this.computeCongestionAwareRCA(flit, currentRouter, allRouters, config, faultyLinks);
    } else if (mode === 'LOW_POWER_BYPASS') {
      return this.computeLowPowerBypass(flit, currentRouter, allRouters, config);
    }
    return this.computeBaselineXY(currentRouter.x, currentRouter.y, flit.dstX, flit.dstY);
  }

  /**
   * 1. Baseline Dimension-Order XY Routing (Deterministic)
   */
  public static computeBaselineXY(
    curX: number,
    curY: number,
    dstX: number,
    dstY: number
  ): RouteDecision {
    if (curX < dstX) {
      return {
        nextPort: 'EAST',
        nextX: curX + 1,
        nextY: curY,
        selectedVC: 0,
        algorithmUsed: 'BASELINE_XY',
        reason: 'Deterministic XY: Routing along X+ (East)',
      };
    } else if (curX > dstX) {
      return {
        nextPort: 'WEST',
        nextX: curX - 1,
        nextY: curY,
        selectedVC: 0,
        algorithmUsed: 'BASELINE_XY',
        reason: 'Deterministic XY: Routing along X- (West)',
      };
    } else if (curY < dstY) {
      return {
        nextPort: 'SOUTH',
        nextX: curX,
        nextY: curY + 1,
        selectedVC: 0,
        algorithmUsed: 'BASELINE_XY',
        reason: 'Deterministic XY: X aligned, routing along Y+ (South)',
      };
    } else {
      return {
        nextPort: 'NORTH',
        nextX: curX,
        nextY: curY - 1,
        selectedVC: 0,
        algorithmUsed: 'BASELINE_XY',
        reason: 'Deterministic XY: X aligned, routing along Y- (North)',
      };
    }
  }

  /**
   * 2. Adaptive DyXY Routing (Local buffer congestion comparison)
   */
  public static computeAdaptiveDyXY(
    flit: Flit,
    currentRouter: RouterNode,
    allRouters: Map<number, RouterNode>,
    config: NoCConfig,
    faultyLinks: FaultyLinkSet = NO_FAULTY_LINKS
  ): RouteDecision {
    const { x: curX, y: curY } = currentRouter;
    const { dstX, dstY } = flit;
    const { canEscape, escapeVC } = getEscapeInfo(config);

    // Already committed to the escape channel: Duato's protocol requires
    // staying deterministic-XY for the rest of this flit's journey, which
    // is what keeps the escape channel's dependency graph cycle-free.
    if (canEscape && flit.currentVC === escapeVC) {
      const dec = this.computeBaselineXY(curX, curY, dstX, dstY);
      return { ...dec, selectedVC: escapeVC, algorithmUsed: 'ADAPTIVE_DYXY', reason: `DyXY (escape channel): ${dec.reason}` };
    }

    const { usable, avoided, minimalFallback } = faultAwareCandidates(curX, curY, dstX, dstY, config, allRouters, faultyLinks, canEscape);
    const avoidedFault = avoided[0]
      ? { x: avoided[0].x, y: avoided[0].y, kind: avoided[0].kind, wasDeflection: false }
      : undefined;

    // No fault-clear candidate exists at all (fully boxed in) -- fall back
    // to the original (possibly blocked) minimal direction so this still
    // returns a decision; the link-level fault check downstream is what
    // actually stops the flit from moving in that case.
    const possiblePorts = usable.length > 0 ? usable : minimalFallback.map((c) => ({ ...c, deflected: false }));
    const nextAdaptiveVC = canEscape ? (flit.currentVC + 1) % escapeVC : (flit.currentVC + 1) % config.virtualChannels;

    // Duato: only candidates whose target channel (this exact port+VC on the
    // neighbor) still has a free slot are safe to use adaptively.
    const notFull = possiblePorts.filter((c) => !canEscape || !isTargetChannelFull(c, nextAdaptiveVC, config, allRouters));

    if (canEscape && notFull.length === 0) {
      const dec = this.computeBaselineXY(curX, curY, dstX, dstY);
      return {
        ...dec,
        selectedVC: escapeVC,
        algorithmUsed: 'ADAPTIVE_DYXY',
        reason: 'DyXY: escaping to deterministic XY (every adaptive candidate channel is full)',
        avoidedFault,
      };
    }

    const scoringPool = notFull.length > 0 ? notFull : possiblePorts;

    // Among the safe candidates, pick the least-congested (single candidate is trivially "best").
    let bestCandidate = scoringPool[0];
    let lowestOccupancy = Infinity;
    for (const cand of scoringPool) {
      const neighbor = allRouters.get(cand.nextY * config.meshWidth + cand.nextX);
      const occupancy = neighbor ? neighbor.congestionScore : 0.5;
      if (occupancy < lowestOccupancy) {
        lowestOccupancy = occupancy;
        bestCandidate = cand;
      }
    }

    return {
      nextPort: bestCandidate.port,
      nextX: bestCandidate.nextX,
      nextY: bestCandidate.nextY,
      selectedVC: nextAdaptiveVC,
      algorithmUsed: 'ADAPTIVE_DYXY',
      reason: bestCandidate.deflected
        ? `DyXY Fault-Deflect: minimal direction(s) blocked by fault, deflected via ${bestCandidate.port}`
        : `DyXY: Selected ${bestCandidate.port} (Downstream buffer load: ${(lowestOccupancy * 100).toFixed(1)}%)`,
      avoidedFault: bestCandidate.deflected && avoidedFault ? { ...avoidedFault, wasDeflection: true } : avoidedFault,
    };
  }

  /**
   * 3. Congestion-Aware Regional Congestion (RCA / Stress-based)
   */
  public static computeCongestionAwareRCA(
    flit: Flit,
    currentRouter: RouterNode,
    allRouters: Map<number, RouterNode>,
    config: NoCConfig,
    faultyLinks: FaultyLinkSet = NO_FAULTY_LINKS
  ): RouteDecision {
    const { x: curX, y: curY } = currentRouter;
    const { dstX, dstY } = flit;
    const { canEscape, escapeVC } = getEscapeInfo(config);

    if (canEscape && flit.currentVC === escapeVC) {
      const dec = this.computeBaselineXY(curX, curY, dstX, dstY);
      return { ...dec, selectedVC: escapeVC, algorithmUsed: 'CONGESTION_AWARE_RCA', reason: `RCA (escape channel): ${dec.reason}` };
    }

    const { usable, avoided, minimalFallback } = faultAwareCandidates(curX, curY, dstX, dstY, config, allRouters, faultyLinks, canEscape);
    const avoidedFault = avoided[0]
      ? { x: avoided[0].x, y: avoided[0].y, kind: avoided[0].kind, wasDeflection: false }
      : undefined;
    const possiblePorts = usable.length > 0 ? usable : minimalFallback.map((c) => ({ ...c, deflected: false }));
    const nextAdaptiveVC = canEscape ? (flit.currentVC + 1) % escapeVC : flit.currentVC;

    // Duato: only candidates whose target channel still has a free slot are safe to use adaptively.
    const notFull = possiblePorts.filter((c) => !canEscape || !isTargetChannelFull(c, nextAdaptiveVC, config, allRouters));

    if (canEscape && notFull.length === 0) {
      const dec = this.computeBaselineXY(curX, curY, dstX, dstY);
      return {
        ...dec,
        selectedVC: escapeVC,
        algorithmUsed: 'CONGESTION_AWARE_RCA',
        reason: 'RCA: escaping to deterministic XY (every adaptive candidate channel is full)',
        avoidedFault,
      };
    }

    const scoringPool = notFull.length > 0 ? notFull : possiblePorts;

    if (scoringPool.length === 1) {
      const c = scoringPool[0];
      return {
        nextPort: c.port,
        nextX: c.nextX,
        nextY: c.nextY,
        selectedVC: nextAdaptiveVC,
        algorithmUsed: 'CONGESTION_AWARE_RCA',
        reason: c.deflected
          ? `RCA Fault-Deflect: minimal direction(s) blocked by fault, deflected via ${c.port}`
          : 'RCA: Single minimal direction towards target',
        avoidedFault: c.deflected && avoidedFault ? { ...avoidedFault, wasDeflection: true } : avoidedFault,
      };
    }

    // Evaluate 2-hop regional stress along both candidate directions
    const scoredCandidates = scoringPool.map((cand) => {
      let regionalStress = 0;
      let count = 0;

      // Check 1-hop and 2-hop neighbors in this direction
      const stepX = cand.nextX - curX;
      const stepY = cand.nextY - curY;

      for (let hop = 1; hop <= 2; hop++) {
        const nx = curX + stepX * hop;
        const ny = curY + stepY * hop;
        if (nx >= 0 && nx < config.meshWidth && ny >= 0 && ny < config.meshHeight) {
          const rNode = allRouters.get(ny * config.meshWidth + nx);
          if (rNode) {
            // Weighted stress: closer hop has higher weight
            const weight = hop === 1 ? 0.65 : 0.35;
            regionalStress += rNode.congestionScore * weight;
            count++;
          }
        }
      }

      return {
        candidate: cand,
        stress: count > 0 ? regionalStress : 0.5,
      };
    });

    // Pick minimum regional stress path
    scoredCandidates.sort((a, b) => a.stress - b.stress);
    const chosen = scoredCandidates[0];

    return {
      nextPort: chosen.candidate.port,
      nextX: chosen.candidate.nextX,
      nextY: chosen.candidate.nextY,
      selectedVC: nextAdaptiveVC,
      algorithmUsed: 'CONGESTION_AWARE_RCA',
      reason: `RCA Global: Selected ${chosen.candidate.port} (Regional path stress: ${(chosen.stress * 100).toFixed(1)}%)`,
      avoidedFault: chosen.candidate.deflected && avoidedFault ? { ...avoidedFault, wasDeflection: true } : avoidedFault,
    };
  }

  /**
   * 4. Low-Power Bypass Routing (Minimizes VC switching & prioritizes direct bypass)
   */
  public static computeLowPowerBypass(
    flit: Flit,
    currentRouter: RouterNode,
    _allRouters: Map<number, RouterNode>,
    _config: NoCConfig
  ): RouteDecision {
    const { x: curX, y: curY } = currentRouter;
    const { dstX, dstY } = flit;

    // Follow deterministic minimal dimension with static VC0 to allow idle VC power gating
    if (curX !== dstX) {
      const port: PortDirection = curX < dstX ? 'EAST' : 'WEST';
      const nextX = curX < dstX ? curX + 1 : curX - 1;
      return {
        nextPort: port,
        nextX,
        nextY: curY,
        selectedVC: 0,
        algorithmUsed: 'LOW_POWER_BYPASS',
        reason: 'Low-Power Bypass: Direct X-traversal with power-gated auxiliary VCs',
      };
    } else {
      const port: PortDirection = curY < dstY ? 'SOUTH' : 'NORTH';
      const nextY = curY < dstY ? curY + 1 : curY - 1;
      return {
        nextPort: port,
        nextX: curX,
        nextY,
        selectedVC: 0,
        algorithmUsed: 'LOW_POWER_BYPASS',
        reason: 'Low-Power Bypass: Direct Y-traversal with minimal switching logic',
      };
    }
  }

  /**
   * 5. Task-Based / Task-Based-Partition Adaptive Routing (TB-TBP)
   *
   * Adapted from Fang, Wei, Liu & Hou, "TB-TBP: a task-based adaptive
   * routing algorithm for network-on-chip in heterogenous CPU-GPU
   * architectures" (J. Supercomput 80, 2024). That paper's algorithm
   * routes CPU/GPU/LLC/MC request-vs-reply traffic along XY vs YX
   * dimension order and dynamically partitions them into separate VCs
   * under high load. This simulator has no CPU/GPU/LLC/MC role model to
   * copy that split onto directly, so this keeps the two ideas that do
   * transfer:
   *
   *   1. Split flows into two disjoint dimension-order classes (X-first
   *      vs Y-first) by a fixed per-flow property decided once from the
   *      flow's own endpoints (not re-decided per hop, and not random) --
   *      each class alone is a standard deadlock-free dimension-order
   *      route, and splitting traffic between them spreads load instead
   *      of concentrating every flow on X-then-Y.
   *   2. Dynamically choose whether the two classes share virtual
   *      channels ("TB": lower overhead, matches the paper's low-load
   *      case) or get one dedicated VC each ("TBP": no head-of-line
   *      blocking between classes, matches the paper's high-load case),
   *      using this project's own congestion-threshold + hysteresis +
   *      dwell-time controller (see runWorkloadAnalyzerAndController in
   *      nocEngine.ts) in place of the paper's CPU-retired-instruction
   *      speedup ratio, which this simulator has no CPU model to compute.
   */
  public static computeTaskBasedTBP(
    flit: Flit,
    currentRouter: RouterNode,
    config: NoCConfig,
    activePolicy: 'TB' | 'TBP'
  ): RouteDecision {
    const { x: curX, y: curY } = currentRouter;
    const { srcX, srcY, dstX, dstY } = flit;

    // Fixed per-flow class derived from endpoints alone, so every hop of
    // the same flow agrees on X-first vs Y-first.
    const xFirst = (srcX + srcY + dstX + dstY) % 2 === 0;

    let nextPort: PortDirection;
    let nextX = curX;
    let nextY = curY;

    const takeXStep = () => {
      nextPort = curX < dstX ? 'EAST' : 'WEST';
      nextX = curX < dstX ? curX + 1 : curX - 1;
    };
    const takeYStep = () => {
      nextPort = curY < dstY ? 'SOUTH' : 'NORTH';
      nextY = curY < dstY ? curY + 1 : curY - 1;
    };

    if (xFirst) {
      if (curX !== dstX) takeXStep();
      else takeYStep();
    } else {
      if (curY !== dstY) takeYStep();
      else takeXStep();
    }

    const partitioned = activePolicy === 'TBP' && config.virtualChannels >= 2;
    const selectedVC = partitioned ? (xFirst ? 0 : 1) : (flit.currentVC + 1) % config.virtualChannels;

    return {
      nextPort: nextPort!,
      nextX,
      nextY,
      selectedVC,
      algorithmUsed: 'TASK_BASED_TBP',
      reason: `TB-TBP (${activePolicy}): ${xFirst ? 'X-first' : 'Y-first'} class -> ${nextPort!}${
        partitioned ? ` on dedicated VC${selectedVC}` : ' (shared VC)'
      }`,
    };
  }
}

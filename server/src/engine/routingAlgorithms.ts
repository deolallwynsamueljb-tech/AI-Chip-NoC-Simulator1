import { Flit, NoCConfig, PortDirection, RouterNode, RoutingMode } from '../../../shared/types/noc';

export interface RouteDecision {
  nextPort: PortDirection;
  nextX: number;
  nextY: number;
  selectedVC: number;
  algorithmUsed: RoutingMode;
  reason: string;
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
    activeMode: RoutingMode
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
        return this.computeAdaptiveDyXY(flit, currentRouter, allRouters, config);

      case 'CONGESTION_AWARE_RCA':
        return this.computeCongestionAwareRCA(flit, currentRouter, allRouters, config);

      case 'LOW_POWER_BYPASS':
        return this.computeLowPowerBypass(flit, currentRouter, allRouters, config);

      case 'PROPOSED_RECONFIGURABLE':
      default:
        // Use the router's dynamically assigned mode from the configuration controller
        return this.computeForMode(currentRouter.currentMode, flit, currentRouter, allRouters, config);
    }
  }

  private static computeForMode(
    mode: RoutingMode,
    flit: Flit,
    currentRouter: RouterNode,
    allRouters: Map<number, RouterNode>,
    config: NoCConfig
  ): RouteDecision {
    if (mode === 'BASELINE_XY') {
      return this.computeBaselineXY(currentRouter.x, currentRouter.y, flit.dstX, flit.dstY);
    } else if (mode === 'ADAPTIVE_DYXY') {
      return this.computeAdaptiveDyXY(flit, currentRouter, allRouters, config);
    } else if (mode === 'CONGESTION_AWARE_RCA') {
      return this.computeCongestionAwareRCA(flit, currentRouter, allRouters, config);
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
    config: NoCConfig
  ): RouteDecision {
    const { x: curX, y: curY } = currentRouter;
    const { dstX, dstY } = flit;

    const possiblePorts: { port: PortDirection; nextX: number; nextY: number }[] = [];

    // Candidate X direction
    if (curX < dstX) possiblePorts.push({ port: 'EAST', nextX: curX + 1, nextY: curY });
    else if (curX > dstX) possiblePorts.push({ port: 'WEST', nextX: curX - 1, nextY: curY });

    // Candidate Y direction
    if (curY < dstY) possiblePorts.push({ port: 'SOUTH', nextX: curX, nextY: curY + 1 });
    else if (curY > dstY) possiblePorts.push({ port: 'NORTH', nextX: curX, nextY: curY - 1 });

    if (possiblePorts.length === 1) {
      return {
        nextPort: possiblePorts[0].port,
        nextX: possiblePorts[0].nextX,
        nextY: possiblePorts[0].nextY,
        selectedVC: (flit.currentVC + 1) % config.virtualChannels,
        algorithmUsed: 'ADAPTIVE_DYXY',
        reason: 'Single minimal dimension available',
      };
    }

    // Compare local downstream buffer occupancy between X and Y candidates
    let bestCandidate = possiblePorts[0];
    let lowestOccupancy = Infinity;

    for (const cand of possiblePorts) {
      const neighborId = cand.nextY * config.meshWidth + cand.nextX;
      const neighbor = allRouters.get(neighborId);
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
      selectedVC: (flit.currentVC + 1) % config.virtualChannels,
      algorithmUsed: 'ADAPTIVE_DYXY',
      reason: `DyXY: Selected ${bestCandidate.port} (Downstream buffer load: ${(lowestOccupancy * 100).toFixed(1)}%)`,
    };
  }

  /**
   * 3. Congestion-Aware Regional Congestion (RCA / Stress-based)
   */
  public static computeCongestionAwareRCA(
    flit: Flit,
    currentRouter: RouterNode,
    allRouters: Map<number, RouterNode>,
    config: NoCConfig
  ): RouteDecision {
    const { x: curX, y: curY } = currentRouter;
    const { dstX, dstY } = flit;

    const possiblePorts: { port: PortDirection; nextX: number; nextY: number }[] = [];

    if (curX < dstX) possiblePorts.push({ port: 'EAST', nextX: curX + 1, nextY: curY });
    else if (curX > dstX) possiblePorts.push({ port: 'WEST', nextX: curX - 1, nextY: curY });

    if (curY < dstY) possiblePorts.push({ port: 'SOUTH', nextX: curX, nextY: curY + 1 });
    else if (curY > dstY) possiblePorts.push({ port: 'NORTH', nextX: curX, nextY: curY - 1 });

    if (possiblePorts.length === 1) {
      return {
        nextPort: possiblePorts[0].port,
        nextX: possiblePorts[0].nextX,
        nextY: possiblePorts[0].nextY,
        selectedVC: flit.currentVC,
        algorithmUsed: 'CONGESTION_AWARE_RCA',
        reason: 'RCA: Single minimal direction towards target',
      };
    }

    // Evaluate 2-hop regional stress along both candidate directions
    const scoredCandidates = possiblePorts.map((cand) => {
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
      selectedVC: 0,
      algorithmUsed: 'CONGESTION_AWARE_RCA',
      reason: `RCA Global: Selected ${chosen.candidate.port} (Regional path stress: ${(chosen.stress * 100).toFixed(1)}%)`,
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
}

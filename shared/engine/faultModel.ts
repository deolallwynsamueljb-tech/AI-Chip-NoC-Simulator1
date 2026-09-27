import { NoCConfig, PortDirection } from '../types/noc.js';

/**
 * Fault placement (which routers/links are down) is computed once, as a
 * pure function of config + an RNG, instead of letting each NoCSimulator
 * instance roll its own faults independently. That's what lets
 * architectureComparison.ts run the SAME fault placement through both the
 * baseline and proposed simulators -- an apples-to-apples comparison,
 * since otherwise two independently-rolled fault sets could happen to
 * favor one architecture by chance alone.
 */
export interface FaultPlacement {
  faultyRouterIds: number[];
  faultyLinkKeys: string[];
}

export function linkKey(x: number, y: number, direction: PortDirection): string {
  return `${x},${y}:${direction}`;
}

const OPPOSITE: Record<'EAST' | 'WEST' | 'NORTH' | 'SOUTH', PortDirection> = {
  EAST: 'WEST',
  WEST: 'EAST',
  NORTH: 'SOUTH',
  SOUTH: 'NORTH',
};

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const NO_FAULTS: FaultPlacement = { faultyRouterIds: [], faultyLinkKeys: [] };

export function computeFaultPlacement(config: NoCConfig, rng: () => number = Math.random): FaultPlacement {
  const { meshWidth, meshHeight, faultInjectionEnabled, faultRatePct, faultType } = config;
  if (!faultInjectionEnabled || faultRatePct <= 0) return { faultyRouterIds: [], faultyLinkKeys: [] };

  const totalRouters = meshWidth * meshHeight;
  const allRouterIds = Array.from({ length: totalRouters }, (_, i) => i);

  // Enumerate each undirected physical link once, as its EAST/SOUTH-origin endpoint.
  const undirectedLinks: { x: number; y: number; direction: 'EAST' | 'SOUTH' }[] = [];
  for (let y = 0; y < meshHeight; y++) {
    for (let x = 0; x < meshWidth; x++) {
      if (x < meshWidth - 1) undirectedLinks.push({ x, y, direction: 'EAST' });
      if (y < meshHeight - 1) undirectedLinks.push({ x, y, direction: 'SOUTH' });
    }
  }

  const faultyRouterIds = new Set<number>();
  const faultyLinkKeys = new Set<string>();

  const pickRouters = (pct: number) => {
    const count = Math.min(totalRouters - 1, Math.round((totalRouters * pct) / 100));
    shuffled(allRouterIds, rng)
      .slice(0, count)
      .forEach((id) => faultyRouterIds.add(id));
  };

  const pickLinks = (pct: number) => {
    const count = Math.min(undirectedLinks.length, Math.round((undirectedLinks.length * pct) / 100));
    shuffled(undirectedLinks, rng)
      .slice(0, count)
      .forEach(({ x, y, direction }) => {
        const dstX = direction === 'EAST' ? x + 1 : x;
        const dstY = direction === 'SOUTH' ? y + 1 : y;
        // A physical link is bidirectional -- fault both directional entries.
        faultyLinkKeys.add(linkKey(x, y, direction));
        faultyLinkKeys.add(linkKey(dstX, dstY, OPPOSITE[direction]));
      });
  };

  if (faultType === 'ROUTER_FAULT') {
    pickRouters(faultRatePct);
  } else if (faultType === 'LINK_FAULT') {
    pickLinks(faultRatePct);
  } else {
    // RANDOM_FAULT: a mix of both fault sources, splitting the configured rate across them.
    pickRouters(faultRatePct / 2);
    pickLinks(faultRatePct / 2);
  }

  return { faultyRouterIds: [...faultyRouterIds], faultyLinkKeys: [...faultyLinkKeys] };
}

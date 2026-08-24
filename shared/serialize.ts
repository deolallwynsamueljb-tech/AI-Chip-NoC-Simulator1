import type { NoCSimulator } from './engine/nocEngine';
import type { SerializedRouterNode, SimulationSnapshot } from './types/noc';

export function buildSnapshot(sim: NoCSimulator): SimulationSnapshot {
  const routers: SerializedRouterNode[] = Array.from(sim.getRouters().values()).map((router) => ({
    ...router,
    buffers: Object.fromEntries(router.buffers),
  }));

  return {
    metrics: sim.getMetrics(),
    telemetry: sim.getTelemetry(),
    routers,
    links: sim.getLinks(),
    config: sim.getConfig(),
  };
}

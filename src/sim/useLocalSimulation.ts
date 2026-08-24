import { useCallback, useEffect, useRef, useState } from 'react';
import type { Link, NoCConfig, SerializedRouterNode, SimulationMetrics, WorkloadTelemetry } from '@shared/types/noc';
import { NoCSimulator } from '@shared/engine/nocEngine';
import { buildSnapshot } from '@shared/serialize';

export interface UseLocalSimulationResult {
  connected: boolean;
  isRunning: boolean;
  speed: number;
  metrics: SimulationMetrics | null;
  telemetry: WorkloadTelemetry | null;
  routers: Map<number, SerializedRouterNode>;
  links: Link[];
  play: () => void;
  pause: () => void;
  step: (cycles: number) => void;
  reset: () => void;
  setSpeed: (speed: number) => void;
  updateConfig: (partial: Partial<NoCConfig>) => void;
}

const TICK_MS = 30;

/**
 * Runs the NoC simulation entirely in the browser, ticking on a local
 * interval. Mirrors the server-owned session loop this replaced (see
 * git history for sessionManager.ts) so the public shape stays identical
 * to the old WebSocket-backed hook - no consuming component needed to
 * change.
 */
export function useLocalSimulation(config: NoCConfig | null): UseLocalSimulationResult {
  const simRef = useRef<NoCSimulator | null>(null);
  const configRef = useRef<NoCConfig | null>(config);
  const [connected, setConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(true);
  const [speed, setSpeedState] = useState(5);
  const [metrics, setMetrics] = useState<SimulationMetrics | null>(null);
  const [telemetry, setTelemetry] = useState<WorkloadTelemetry | null>(null);
  const [routers, setRouters] = useState<Map<number, SerializedRouterNode>>(new Map());
  const [links, setLinks] = useState<Link[]>([]);

  const publishSnapshot = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    const snapshot = buildSnapshot(sim);
    setMetrics(snapshot.metrics);
    setTelemetry(snapshot.telemetry);
    setRouters(new Map(snapshot.routers.map((router) => [router.id, router])));
    setLinks(snapshot.links);
  }, []);

  useEffect(() => {
    if (!config) return;
    simRef.current = new NoCSimulator(config);
    configRef.current = config;
    setIsRunning(true);
    setConnected(true);
    publishSnapshot();

    return () => {
      simRef.current = null;
      setConnected(false);
    };
    // Only re-initialize on mount / when a session is (re)started with a config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!config]);

  useEffect(() => {
    if (!isRunning || !simRef.current) return;
    const interval = setInterval(() => {
      simRef.current?.stepCycles(speed);
      publishSnapshot();
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [isRunning, speed, publishSnapshot]);

  const play = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);

  const step = useCallback(
    (cycles: number) => {
      simRef.current?.stepCycles(cycles);
      publishSnapshot();
    },
    [publishSnapshot]
  );

  const reset = useCallback(() => {
    if (!simRef.current || !configRef.current) return;
    simRef.current.reset(configRef.current);
    publishSnapshot();
  }, [publishSnapshot]);

  const updateConfig = useCallback(
    (partial: Partial<NoCConfig>) => {
      if (!simRef.current || !configRef.current) return;
      configRef.current = { ...configRef.current, ...partial };
      simRef.current.updateConfig(configRef.current);
      publishSnapshot();
    },
    [publishSnapshot]
  );

  return {
    connected,
    isRunning,
    speed,
    metrics,
    telemetry,
    routers,
    links,
    play,
    pause,
    step,
    reset,
    setSpeed: setSpeedState,
    updateConfig,
  };
}

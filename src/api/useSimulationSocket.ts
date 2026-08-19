import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientCommand,
  Link,
  NoCConfig,
  SerializedRouterNode,
  ServerMessage,
  SimulationMetrics,
  WorkloadTelemetry,
} from '@shared/types/noc';

export interface UseSimulationSocketResult {
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

/**
 * Connects to the server-owned simulation loop over WebSocket. The server
 * steps the simulator and streams snapshots - this hook only renders what
 * it receives, it never computes simulation state itself.
 */
export function useSimulationSocket(sessionId: string | null): UseSimulationSocketResult {
  const socketRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(true);
  const [speed, setSpeedState] = useState(5);
  const [metrics, setMetrics] = useState<SimulationMetrics | null>(null);
  const [telemetry, setTelemetry] = useState<WorkloadTelemetry | null>(null);
  const [routers, setRouters] = useState<Map<number, SerializedRouterNode>>(new Map());
  const [links, setLinks] = useState<Link[]>([]);

  useEffect(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws?sessionId=${sessionId}`);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type !== 'snapshot') return;

      setIsRunning(message.isRunning);
      setSpeedState(message.speed);
      setMetrics(message.snapshot.metrics);
      setTelemetry(message.snapshot.telemetry);
      setRouters(new Map(message.snapshot.routers.map((router) => [router.id, router])));
      setLinks(message.snapshot.links);
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [sessionId]);

  const send = useCallback((command: ClientCommand) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(command));
    }
  }, []);

  return {
    connected,
    isRunning,
    speed,
    metrics,
    telemetry,
    routers,
    links,
    play: () => send({ type: 'play' }),
    pause: () => send({ type: 'pause' }),
    step: (cycles: number) => send({ type: 'step', cycles }),
    reset: () => send({ type: 'reset' }),
    setSpeed: (nextSpeed: number) => send({ type: 'setSpeed', speed: nextSpeed }),
    updateConfig: (partial: Partial<NoCConfig>) => send({ type: 'updateConfig', config: partial }),
  };
}

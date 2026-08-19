import { randomUUID } from 'node:crypto';
import type { ClientCommand, NoCConfig, ServerMessage } from '../../shared/types/noc';
import { NoCSimulator } from './engine/nocEngine';
import { buildSnapshot } from './serialize';

const TICK_MS = 30;
const IDLE_CLEANUP_MS = 5 * 60 * 1000;

type Sender = (message: ServerMessage) => void;

interface Session {
  id: string;
  sim: NoCSimulator;
  config: NoCConfig;
  isRunning: boolean;
  speed: number;
  loopTimer: ReturnType<typeof setInterval> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  subscribers: Set<Sender>;
}

const sessions = new Map<string, Session>();

function messageFor(session: Session): ServerMessage {
  return {
    type: 'snapshot',
    isRunning: session.isRunning,
    speed: session.speed,
    snapshot: buildSnapshot(session.sim),
  };
}

function broadcast(session: Session) {
  const message = messageFor(session);
  session.subscribers.forEach((send) => send(message));
}

function stopLoop(session: Session) {
  if (session.loopTimer) {
    clearInterval(session.loopTimer);
    session.loopTimer = null;
  }
}

function startLoop(session: Session) {
  stopLoop(session);
  session.loopTimer = setInterval(() => {
    session.sim.stepCycles(session.speed);
    broadcast(session);
  }, TICK_MS);
}

function clearIdleTimer(session: Session) {
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = null;
  }
}

function scheduleIdleCleanup(session: Session) {
  clearIdleTimer(session);
  session.idleTimer = setTimeout(() => {
    if (session.subscribers.size === 0) {
      stopLoop(session);
      sessions.delete(session.id);
    }
  }, IDLE_CLEANUP_MS);
}

export function createSession(config: NoCConfig): Session {
  const session: Session = {
    id: randomUUID(),
    sim: new NoCSimulator(config),
    config,
    isRunning: true,
    speed: 5,
    loopTimer: null,
    idleTimer: null,
    subscribers: new Set(),
  };
  sessions.set(session.id, session);
  scheduleIdleCleanup(session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function snapshotFor(id: string) {
  const session = sessions.get(id);
  return session ? buildSnapshot(session.sim) : null;
}

export function updateSessionConfig(id: string, partial: Partial<NoCConfig>) {
  const session = sessions.get(id);
  if (!session) return null;
  session.config = { ...session.config, ...partial };
  session.sim.updateConfig(session.config);
  return buildSnapshot(session.sim);
}

export function resetSession(id: string) {
  const session = sessions.get(id);
  if (!session) return null;
  session.sim.reset(session.config);
  return buildSnapshot(session.sim);
}

export function stepSession(id: string, cycles: number) {
  const session = sessions.get(id);
  if (!session) return null;
  session.sim.stepCycles(cycles);
  return buildSnapshot(session.sim);
}

export function deleteSession(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  stopLoop(session);
  clearIdleTimer(session);
  sessions.delete(id);
}

/**
 * Subscribe a transport (a WebSocket) to a session's live tick stream.
 * The server owns the simulation loop: it starts as soon as the first
 * subscriber joins a running session and stops once the last one leaves.
 */
export function subscribe(id: string, send: Sender): (() => void) | null {
  const session = sessions.get(id);
  if (!session) return null;

  clearIdleTimer(session);
  session.subscribers.add(send);
  if (session.isRunning) startLoop(session);
  send(messageFor(session));

  return () => {
    session.subscribers.delete(send);
    if (session.subscribers.size === 0) {
      stopLoop(session);
      scheduleIdleCleanup(session);
    }
  };
}

export function applyCommand(id: string, command: ClientCommand) {
  const session = sessions.get(id);
  if (!session) return;

  switch (command.type) {
    case 'play':
      session.isRunning = true;
      if (session.subscribers.size > 0) startLoop(session);
      broadcast(session);
      break;
    case 'pause':
      session.isRunning = false;
      stopLoop(session);
      broadcast(session);
      break;
    case 'step':
      session.sim.stepCycles(command.cycles);
      broadcast(session);
      break;
    case 'reset':
      session.sim.reset(session.config);
      broadcast(session);
      break;
    case 'setSpeed':
      session.speed = Math.max(1, Math.min(100, Math.round(command.speed)));
      broadcast(session);
      break;
    case 'updateConfig':
      session.config = { ...session.config, ...command.config };
      session.sim.updateConfig(session.config);
      broadcast(session);
      break;
  }
}

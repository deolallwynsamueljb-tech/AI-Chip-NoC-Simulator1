import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { ClientCommand, ServerMessage } from '../../shared/types/noc';
import { applyCommand, subscribe } from './sessionManager';

export function attachWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket: WebSocket, request) => {
    const url = new URL(request.url ?? '', 'http://localhost');
    const sessionId = url.searchParams.get('sessionId');

    const send = (message: ServerMessage) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };

    if (!sessionId) {
      send({ type: 'error', message: 'Missing sessionId query parameter' });
      socket.close();
      return;
    }

    const unsubscribe = subscribe(sessionId, send);
    if (!unsubscribe) {
      send({ type: 'error', message: 'Unknown or expired session' });
      socket.close();
      return;
    }

    socket.on('message', (raw) => {
      try {
        const command = JSON.parse(raw.toString()) as ClientCommand;
        applyCommand(sessionId, command);
      } catch {
        send({ type: 'error', message: 'Invalid command payload' });
      }
    });

    socket.on('close', unsubscribe);
    socket.on('error', unsubscribe);
  });

  return wss;
}

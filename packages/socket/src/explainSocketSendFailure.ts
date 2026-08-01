import type { Socket, SocketSendFailureExplanation } from '@flighthq/types/contract';

// Explains the deterministic preflight reasons sendSocketMessage returns false without invoking its
// backend. Returns null when the socket can reach the backend; the backend may still return false.
export function explainSocketSendFailure(socket: Readonly<Socket>): SocketSendFailureExplanation | null {
  const runtime = socket.runtime;
  if (runtime.disposed) return { reason: 'disposed', readyState: 'closed', url: socket.url };
  if (runtime.connection === null) {
    return { reason: 'no-connection', readyState: runtime.readyState, url: socket.url };
  }
  if (runtime.readyState !== 'open') {
    return { reason: 'not-open', readyState: runtime.readyState, url: socket.url };
  }
  return null;
}

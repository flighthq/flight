import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  EntityConstruction,
  HostSocketCapability,
  SocketConnection,
  SocketMessage,
} from '@flighthq/types/contract';

export function createWebSocketBackend(): HostSocketCapability & Entity {
  const out = allocateEntity<HostSocketCapability & Entity>();
  initializeWebSocketBackend(out);
  return finishEntity(out);
}

// Builds the Web provider over the DOM WebSocket. Nothing constructs one at import time, so importing
// the package has no side effect; a host composes this value into its own net group. Returns a
// null connection when WebSocket is unavailable (non-browser host) rather than throwing; raw TCP/UDP
// is likewise unsupported here and only reachable through a native provider.
export function initializeWebSocketBackend(out: EntityConstruction<HostSocketCapability & Entity>): void {
  out.openSocket = (options, events): SocketConnection | null => {
    if (typeof WebSocket === 'undefined') return null;
    const ws =
      options.protocols !== undefined
        ? new WebSocket(options.url, options.protocols as string[])
        : new WebSocket(options.url);
    ws.binaryType = options.binaryType ?? 'arraybuffer';
    ws.onopen = () => events.handleSocketOpen();
    ws.onmessage = (event: MessageEvent) => events.handleSocketMessage(mapWebSocketMessage(event.data));
    ws.onclose = (event: CloseEvent) =>
      events.handleSocketClose({ code: event.code, reason: event.reason, wasClean: event.wasClean });
    ws.onerror = () => events.handleSocketError();
    return {
      sendSocketFrame(data): boolean {
        if (ws.readyState !== WebSocket.OPEN) return false;
        ws.send(data);
        return true;
      },
      closeSocketConnection(code, reason): void {
        ws.close(code, reason);
      },
    };
  };
}

// Published on the Host rather than installed into the socket package: a caller selects this
// transport by passing the host that carries it. Only web hosts publish it — no native host here
// implements a socket transport, so none carries a slot that would lie about having one.
export const webHostSocket: HostSocketCapability = createWebSocketBackend();

// Maps a raw WebSocket message payload onto a SocketMessage. A string is a text frame; anything else
// (with binaryType 'arraybuffer', an ArrayBuffer) is a binary frame.
function mapWebSocketMessage(data: unknown): SocketMessage {
  if (typeof data === 'string') return { data, binary: false };
  return { data: data as ArrayBuffer, binary: true };
}

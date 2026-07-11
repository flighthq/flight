import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  Socket,
  SocketBackend,
  SocketCloseInfo,
  SocketConnection,
  SocketEventSink,
  SocketMessage,
  SocketOptions,
  SocketReadyState,
  SocketRuntime,
  SocketSignals,
} from '@flighthq/types';

// Resumes delivery of backend events to the socket's signals (idempotent). Pair with detachSocket.
// createSocket leaves a new socket attached, so this is only needed to resume after detachSocket.
export function attachSocket(socket: Socket): void {
  socket.runtime.delivering = true;
}

// Begins a clean close of the live connection. Transitions readyState connecting/open → 'closing';
// the backend's close event later transitions it to 'closed'. A no-op when already closing or closed.
// This is the connection command, distinct from disposeSocket (which releases the entity to GC).
export function closeSocket(socket: Socket, code?: number, reason?: string): void {
  const runtime = socket.runtime;
  if (runtime.readyState === 'closing' || runtime.readyState === 'closed') return;
  runtime.readyState = 'closing';
  runtime.connection?.closeSocketConnection(code, reason);
}

// Allocates a Socket entity plus its runtime and opens the connection through the active backend,
// wiring the backend's open/message/close/error into the socket's (still inert) signal group. The
// socket starts in 'connecting' and is left attached (delivering). Enable signals with
// enableSocketSignals to observe events. A backend that does not support the transport yields a null
// connection and the socket stays in 'connecting' until closed.
export function createSocket(options: Readonly<SocketOptions>): Socket {
  const runtime: SocketRuntime = {
    connection: null,
    signals: null,
    readyState: 'connecting',
    delivering: true,
  };
  const socket: Socket = { url: options.url, runtime };
  runtime.connection = getSocketBackend().openSocket(options, makeSocketEventSink(runtime));
  return socket;
}

// Builds the default web backend over the DOM WebSocket. Created lazily by getSocketBackend — no
// WebSocket is constructed at import time, so importing the package has no side effect. Returns a
// null connection when WebSocket is unavailable (non-browser host) rather than throwing; raw TCP/UDP
// is likewise unsupported here and only reachable through a native backend.
export function createWebSocketBackend(): SocketBackend {
  return {
    openSocket(options, events): SocketConnection | null {
      if (typeof WebSocket === 'undefined') return null;
      const ws =
        options.protocols !== undefined
          ? new WebSocket(options.url, options.protocols as string[])
          : new WebSocket(options.url);
      ws.binaryType = options.binaryType ?? 'arraybuffer';
      ws.onopen = () => events.handleSocketOpen();
      ws.onmessage = (event: MessageEvent) => events.handleSocketMessage(toSocketMessage(event.data));
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
    },
  };
}

// Stops delivery of backend events to the socket's signals. The live connection is untouched — use
// closeSocket to close it. Safe to call repeatedly; resume with attachSocket.
export function detachSocket(socket: Socket): void {
  socket.runtime.delivering = false;
}

// Releases the socket to garbage collection: closes the live connection if still open, stops event
// delivery, and drops the signal group. Distinct from closeSocket — dispose is entity teardown, close
// is the connection command. After dispose the socket is inert and should not be reused.
export function disposeSocket(socket: Socket): void {
  closeSocket(socket);
  detachSocket(socket);
  socket.runtime.signals = null;
}

// Opts the socket into its typed event signals, allocating the group on first call and returning it
// (idempotent — a later call returns the same group). A bare socket that never calls this keeps
// runtime.signals null and pays no signal allocation or dispatch cost.
export function enableSocketSignals(socket: Socket): SocketSignals {
  const runtime = socket.runtime;
  if (runtime.signals === null) {
    runtime.signals = {
      onSocketOpen: createSignal<() => void>(),
      onSocketMessage: createSignal<(message: Readonly<SocketMessage>) => void>(),
      onSocketClose: createSignal<(info: Readonly<SocketCloseInfo>) => void>(),
      onSocketError: createSignal<() => void>(),
    };
  }
  return runtime.signals;
}

// The active socket backend, or a lazily-created web default. There is always a backend.
export function getSocketBackend(): SocketBackend {
  if (_backend === null) _backend = createWebSocketBackend();
  return _backend;
}

// The socket's current connection phase, tracked on the runtime from backend events and closeSocket.
export function getSocketReadyState(socket: Readonly<Socket>): SocketReadyState {
  return socket.runtime.readyState;
}

// Sends a text or binary frame over the live connection. Returns false — a sentinel, not a throw —
// when the socket is not open or has no connection.
export function sendSocketMessage(socket: Readonly<Socket>, data: string | ArrayBuffer): boolean {
  const runtime = socket.runtime;
  if (runtime.readyState !== 'open' || runtime.connection === null) return false;
  return runtime.connection.sendSocketFrame(data);
}

// Installs a native host socket backend (adding TCP/UDP); pass null to fall back to the web default.
export function setSocketBackend(backend: SocketBackend | null): void {
  _backend = backend;
}

let _backend: SocketBackend | null = null;

// Builds the backend→entity sink bound to one socket's runtime: it updates readyState and emits the
// opt-in signals. Every handler is a no-op once the runtime stops delivering (detach/dispose), so a
// late backend event after teardown fires nothing.
function makeSocketEventSink(runtime: SocketRuntime): SocketEventSink {
  return {
    handleSocketOpen(): void {
      if (!runtime.delivering) return;
      runtime.readyState = 'open';
      if (runtime.signals !== null) emitSignal(runtime.signals.onSocketOpen);
    },
    handleSocketMessage(message): void {
      if (!runtime.delivering) return;
      if (runtime.signals !== null) emitSignal(runtime.signals.onSocketMessage, message);
    },
    handleSocketClose(info): void {
      if (!runtime.delivering) return;
      runtime.readyState = 'closed';
      if (runtime.signals !== null) emitSignal(runtime.signals.onSocketClose, info);
    },
    handleSocketError(): void {
      if (!runtime.delivering) return;
      if (runtime.signals !== null) emitSignal(runtime.signals.onSocketError);
    },
  };
}

// Maps a raw WebSocket message payload onto a SocketMessage. A string is a text frame; anything else
// (with binaryType 'arraybuffer', an ArrayBuffer) is a binary frame.
function toSocketMessage(data: unknown): SocketMessage {
  if (typeof data === 'string') return { data, binary: false };
  return { data: data as ArrayBuffer, binary: true };
}

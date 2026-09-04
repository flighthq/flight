import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Entity,
  EntityConstruction,
  EntityRuntimeKey,
  HasNetSocket,
  Socket,
  SocketBackend,
  SocketCloseInfo,
  SocketConnection,
  SocketEventSink,
  SocketGuard,
  SocketMessage,
  SocketOptions,
  SocketReadyState,
  SocketRuntime,
  SocketSignals,
  TcpSocketConnection,
  TcpSocketOptions,
} from '@flighthq/types/contract';

// Resumes delivery of backend events to the socket's signals (idempotent). Pair with detachSocket.
// createSocket leaves a new socket attached, so this is only needed to resume after detachSocket. A
// disposed socket is terminal and cannot be reattached.
export function attachSocket(socket: Socket): void {
  if (socket.runtime.disposed) return;
  socket.runtime.delivering = true;
}

// Begins a clean close of the live connection. Transitions readyState connecting/open → 'closing';
// the backend's close event later transitions it to 'closed'. A no-op when already closing or closed.
// This is the connection command, distinct from disposeSocket (which releases the entity to GC).
export function closeSocket(socket: Socket, code?: number, reason?: string): void {
  const runtime = socket.runtime;
  if (runtime.disposed) {
    _guard?.({ operation: 'closeSocket', reason: 'disposed', socket });
    return;
  }
  if (runtime.readyState === 'closing' || runtime.readyState === 'closed') return;
  runtime.readyState = 'closing';
  runtime.connection?.closeSocketConnection(code, reason);
}

// Allocates a Socket entity plus its runtime and opens the connection through the host's socket
// provider,
// wiring the backend's open/message/close/error into the socket's (still inert) signal group. The
// socket starts in 'connecting' and is left attached (delivering). Enable signals with
// enableSocketSignals to observe events. A backend that does not support the transport yields a null
// connection and the socket stays in 'connecting' until closed.
export function createSocket(host: HasNetSocket, options: Readonly<SocketOptions>): Socket {
  const runtime: SocketRuntime = {
    connection: null,
    signals: null,
    readyState: 'connecting',
    delivering: true,
    disposed: false,
  };
  const socket = allocateEntity<Socket>();
  socket.url = options.url;
  socket.runtime = runtime;
  // The provider comes from the host the caller passed. A host that carries no socket transport
  // yields no connection rather than reaching a process-global fallback: absence is an answer here,
  // and the guard reports it.
  const backend = host.net.socket;
  runtime.connection = backend === undefined ? null : backend.openSocket(options, makeSocketEventSink(runtime));
  if (runtime.connection === null) _guard?.({ operation: 'createSocket', reason: 'no-connection', socket });
  return socket;
}

// Builds the web backend over the DOM WebSocket. Nothing constructs one at import time, so importing
// the package has no side effect; a host composes this value into its own net group. Returns a
// null connection when WebSocket is unavailable (non-browser host) rather than throwing; raw TCP/UDP
// is likewise unsupported here and only reachable through a native backend.
export function createWebSocketBackend(): SocketBackend & Entity {
  const out = allocateEntity<void>();
  out.openSocket = (options, events): SocketConnection | null => {
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
  };
  return finishEntity(out);
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
  if (socket.runtime.disposed) return;
  closeSocket(socket);
  detachSocket(socket);
  const runtime = socket.runtime;
  runtime.connection = null;
  runtime.signals = null;
  runtime.readyState = 'closed';
  runtime.disposed = true;
}

// Opts the socket into its typed event signals, allocating the group on first call and returning it
// (idempotent — a later call returns the same group). A bare socket that never calls this keeps
// runtime.signals null and pays no signal allocation or dispatch cost. On a disposed socket the group
// remains inert; the optional guard reports the misuse while retaining this function's return shape.
export function enableSocketSignals(socket: Socket): SocketSignals {
  const runtime = socket.runtime;
  if (runtime.disposed) _guard?.({ operation: 'enableSocketSignals', reason: 'disposed', socket });
  if (runtime.signals === null) {
    runtime.signals = (() => {
      const out = allocateEntity<void>();
      out.onSocketOpen = createSignal<() => void>();
      out.onSocketMessage = createSignal<(message: Readonly<SocketMessage>) => void>();
      out.onSocketClose = createSignal<(info: Readonly<SocketCloseInfo>) => void>();
      out.onSocketError = createSignal<() => void>();
      return finishEntity(out);
    })();
  }
  return runtime.signals;
}

// The socket's current connection phase, tracked on the runtime from backend events and closeSocket.
export function getSocketReadyState(socket: Readonly<Socket>): SocketReadyState {
  return socket.runtime.readyState;
}

// Opens a raw TCP byte stream through the socket provider selected by the caller's host. Browser and
// other framed-only providers omit openTcpSocket, so unsupported raw TCP returns null without trying
// openSocket or interpreting the endpoint as a WebSocket URL.
export function openTcpSocket(host: HasNetSocket, options: Readonly<TcpSocketOptions>): TcpSocketConnection | null {
  return host.net.socket?.openTcpSocket?.(options) ?? null;
}

// Sends a text or binary frame over the live connection without mutating or copying either argument.
// Returns false — a sentinel, not a throw — when the socket is disposed, not open, has no connection,
// or the backend rejects the send. explainSocketSendFailure diagnoses the deterministic preflight paths.
export function sendSocketMessage(socket: Readonly<Socket>, data: string | ArrayBuffer): boolean {
  const runtime = socket.runtime;
  if (runtime.disposed) {
    _guard?.({ operation: 'sendSocketMessage', reason: 'disposed', socket });
    return false;
  }
  if (runtime.readyState !== 'open' || runtime.connection === null) return false;
  return runtime.connection.sendSocketFrame(data);
}

// Installs the diagnostics hook used by the separately imported enableSocketGuards module. Null is
// the production default and removes all guard-path work except the branch.
export function setSocketGuard(guard: SocketGuard | null): void {
  _guard = guard;
}

let _guard: SocketGuard | null = null;

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

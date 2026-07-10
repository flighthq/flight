import type { Signal } from './Signal';

// Bidirectional persistent-connection transport seam — the Flight home for what OpenFL/Lime expose
// as Socket/WebSocket/XMLSocket. A Socket is an event source (open/message/close/error arrive over
// time), so it takes the platform suite's event-capability shape: a plain Socket entity plus an
// opaque SocketRuntime holding the live connection and opt-in signals, driven over a swappable
// SocketBackend (a WebSocket wrapper on the web, a native TCP/UDP stack elsewhere). Sending and
// closing are explicit commands. Sibling of @flighthq/net (one-shot request/response); socket is the
// long-lived channel.

// The four WebSocket-standard connection phases. Read via getSocketReadyState; driven by the backend
// through the event sink plus the explicit closeSocket command.
export type SocketReadyState = 'connecting' | 'open' | 'closing' | 'closed';

// One received frame. `binary` is false for a text frame (`data` is a string) and true for a binary
// frame (`data` is an ArrayBuffer), so a consumer never has to type-sniff `data`.
export interface SocketMessage {
  data: string | ArrayBuffer;
  binary: boolean;
}

// Inputs to createSocket. Only `url` is required. `protocols` requests WebSocket subprotocols;
// `binaryType` selects how binary frames are delivered — 'arraybuffer' (the only supported value)
// yields ArrayBuffer frames rather than Blob.
export interface SocketOptions {
  url: string;
  protocols?: readonly string[];
  binaryType?: 'arraybuffer';
}

// Carried by onSocketClose: the WebSocket close code, the human-readable reason, and whether the
// close completed the closing handshake cleanly (wasClean false means the connection dropped).
export interface SocketCloseInfo {
  code: number;
  reason: string;
  wasClean: boolean;
}

// Opt-in event group, allocated lazily by enableSocketSignals and stored on the runtime. A bare
// socket keeps these null and pays no signal allocation or dispatch cost.
export interface SocketSignals {
  onSocketOpen: Signal<() => void>;
  onSocketMessage: Signal<(message: Readonly<SocketMessage>) => void>;
  onSocketClose: Signal<(info: Readonly<SocketCloseInfo>) => void>;
  onSocketError: Signal<() => void>;
}

// The backend→entity event sink. The backend calls these as its underlying transport fires; socket
// supplies an implementation (createSocket) that updates the runtime's readyState and emits the
// opt-in signals. Modeled on ConnectivityBackend.subscribe's listener, but split per event kind so the
// backend can carry each event's payload.
export interface SocketEventSink {
  handleSocketOpen(): void;
  handleSocketMessage(message: Readonly<SocketMessage>): void;
  handleSocketClose(info: Readonly<SocketCloseInfo>): void;
  handleSocketError(): void;
}

// A live, opened connection handle owned by the backend. socket sends and closes through it; the
// backend wires the transport's events into the SocketEventSink passed to openSocket. Opaque to
// application code — obtained and released only through the socket lifecycle functions.
export interface SocketConnection {
  // Sends a text or binary frame. Returns false when the connection is not open (an expected case),
  // rather than throwing.
  sendSocketFrame(data: string | ArrayBuffer): boolean;
  // Begins the closing handshake with an optional code and reason.
  closeSocketConnection(code?: number, reason?: string): void;
}

// The swappable transport seam realized by the web default (createWebSocketBackend) and by native
// hosts. openSocket opens a connection for the given options and returns a live handle, wiring the
// transport's open/message/close/error into `events`. Returns null when the transport is unsupported
// (for example raw TCP on the web backend) — a sentinel, not a throw.
export interface SocketBackend {
  openSocket(options: Readonly<SocketOptions>, events: Readonly<SocketEventSink>): SocketConnection | null;
}

// Opaque per-socket runtime: the live connection, the opt-in signal group, the current readyState,
// and a delivery flag. Application code treats this as internal; it is read and written only by the
// @flighthq/socket lifecycle functions.
export interface SocketRuntime {
  connection: SocketConnection | null;
  signals: SocketSignals | null;
  readyState: SocketReadyState;
  // False stops backend events from reaching the signals (set by detachSocket/disposeSocket).
  delivering: boolean;
}

// Persistent-connection transport entity. `url` is the requested endpoint; all live state lives on
// the opaque runtime. Create with createSocket, observe via enableSocketSignals, send with
// sendSocketMessage, and tear down with closeSocket (the connection) then disposeSocket (the entity).
export interface Socket {
  url: string;
  runtime: SocketRuntime;
}

// Reports which IPC operations the active backend supports. The web default returns all-false
// (no main process); a native host reports true for the operations its channel layer provides.
export interface IpcBackendCapabilities {
  canHandle: boolean;
  canInvoke: boolean;
  canSend: boolean;
  canTarget: boolean;
}

// Inter-process messaging seam. Free functions in @flighthq/ipc delegate to the active IpcBackend
// (web default or a native host's). send is fire-and-forget, invoke is a request/response round-trip,
// and subscribe registers a per-channel listener. On web there is no main process: send no-ops,
// invoke resolves to undefined, and subscribe returns an inert unsubscribe rather than throwing.
export interface IpcBackend {
  send(channel: string, args: readonly unknown[]): void;
  invoke(channel: string, args: readonly unknown[]): Promise<unknown>;
  subscribe(channel: string, listener: (args: readonly unknown[]) => void): () => void;
  // Optional: registers a responder for invoke calls on a channel; returns an unregister thunk.
  // Absent on backends that do not support handling (the web default).
  handle?(channel: string, handler: (...args: readonly unknown[]) => unknown | Promise<unknown>): () => void;
  // Optional: sends a fire-and-forget message to a specific target window/process.
  // Absent on backends that cannot target a peer.
  sendTo?(target: Readonly<IpcTarget>, channel: string, args: readonly unknown[]): void;
  // Optional: reports the backend's supported operations. Absent backends are treated as web-default.
  getCapabilities?(): Readonly<IpcBackendCapabilities>;
}

// A typed channel descriptor. Channel-accepting functions take a string or an IpcChannel, so a
// feature can publish its channel constants once and get a single grep target.
export interface IpcChannel {
  name: string;
}

// Event delivered to onIpcMessageEvent listeners: the channel, the sender id (or -1 when unknown),
// the incoming args, and a reply thunk that targets the sender (a no-op when senderId is -1).
export interface IpcMessageEvent {
  channel: string;
  senderId: number;
  args: readonly unknown[];
  reply(...args: readonly unknown[]): void;
}

// Identifies a specific peer for targeted sends — the window/process to deliver a message to.
export interface IpcTarget {
  windowId: number;
}

// Rejection raised by invokeIpcWithTimeout when an invoke does not complete in time. Carries the
// channel and the timeout in milliseconds for diagnostics.
export class IpcTimeoutError extends Error {
  readonly channel: string;
  readonly timeoutMs: number;

  constructor(channel: string, timeoutMs: number) {
    super(`IPC invoke on channel "${channel}" timed out after ${timeoutMs}ms`);
    this.name = 'IpcTimeoutError';
    this.channel = channel;
    this.timeoutMs = timeoutMs;
  }
}

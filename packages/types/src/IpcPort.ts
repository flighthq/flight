/**
 * A bidirectional duplex IPC port — the Flight equivalent of `MessagePort`.
 * Obtained via `openIpcPort(channel)`. Must be explicitly closed with `destroyIpcPort` when
 * no longer needed; `destroyIpcPort` frees the underlying native handle
 * (e.g. a `MessageChannelMain` port in Electron).
 *
 * Posting and receiving messages on a port is symmetric: `postIpcPortMessage` sends,
 * `onIpcPortMessage` subscribes. The port is not usable after `destroyIpcPort`.
 */
export interface IpcPort {
  /** Opaque identifier used by `@flighthq/ipc` port functions; do not read or store. */
  readonly _portId: number;
}

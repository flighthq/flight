// Inter-process messaging seam. Free functions in @flighthq/ipc delegate to the active IpcBackend
// (web default or a native host's). send is fire-and-forget, invoke is a request/response round-trip,
// and subscribe registers a per-channel listener. On web there is no main process: send no-ops,
// invoke resolves to undefined, and subscribe returns an inert unsubscribe rather than throwing.
export interface IpcBackend {
  send(channel: string, args: readonly unknown[]): void;
  invoke(channel: string, args: readonly unknown[]): Promise<unknown>;
  subscribe(channel: string, listener: (args: readonly unknown[]) => void): () => void;
}

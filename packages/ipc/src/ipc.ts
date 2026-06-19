import type { IpcBackend } from '@flighthq/types';

// Builds the default web backend. There is no main process on web, so send no-ops, invoke resolves to
// undefined, and subscribe returns an inert unsubscribe — a native host is required for real IPC.
export function createWebIpcBackend(): IpcBackend {
  return {
    send() {},
    invoke() {
      return Promise.resolve(undefined);
    },
    subscribe() {
      return () => {};
    },
  };
}

// The active IPC backend, or a lazily-created web default. There is always a backend.
export function getIpcBackend(): IpcBackend {
  if (_backend === null) _backend = createWebIpcBackend();
  return _backend;
}

// Sends a request on `channel` and resolves with the host's response, or undefined on web.
export function invokeIpc(channel: string, ...args: readonly unknown[]): Promise<unknown> {
  return getIpcBackend().invoke(channel, args);
}

// Subscribes `listener` to messages on `channel`; returns an unsubscribe function. Incoming args are
// spread to the listener, mirroring sendIpcMessage's variadic shape.
export function onIpcMessage(channel: string, listener: (...args: readonly unknown[]) => void): () => void {
  return getIpcBackend().subscribe(channel, (args) => listener(...args));
}

// Sends a fire-and-forget message on `channel`. No-ops on web (no main process).
export function sendIpcMessage(channel: string, ...args: readonly unknown[]): void {
  getIpcBackend().send(channel, args);
}

// Installs a native host IPC backend; pass null to fall back to the web default.
export function setIpcBackend(backend: IpcBackend | null): void {
  _backend = backend;
}

let _backend: IpcBackend | null = null;

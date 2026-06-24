import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  IpcBackend,
  IpcBackendCapabilities,
  IpcChannel,
  IpcMessageEvent,
  IpcSignals,
  IpcTarget,
} from '@flighthq/types';
import { IpcTimeoutError } from '@flighthq/types';

// Resolves a channel argument that may be either a string or an IpcChannel descriptor.
function resolveChannel(channel: string | Readonly<IpcChannel>): string {
  return typeof channel === 'string' ? channel : channel.name;
}

// ---- Bronze: listener registry for once/removeAll/count ----

// Package-local listener tracking, keyed by channel name. Used by onceIpcMessage,
// removeAllIpcListeners, and getIpcListenerCount. Each entry is the unsubscribe thunk
// returned by the backend, associated with a channel string.
const _listeners = new Map<string, Set<() => void>>();

function _trackListener(channel: string, unsubscribe: () => void): void {
  let set = _listeners.get(channel);
  if (set === undefined) {
    set = new Set();
    _listeners.set(channel, set);
  }
  set.add(unsubscribe);
}

function _untrackListener(channel: string, unsubscribe: () => void): void {
  const set = _listeners.get(channel);
  if (set !== undefined) {
    set.delete(unsubscribe);
    if (set.size === 0) _listeners.delete(channel);
  }
}

// ---- IpcSignals (Silver opt-in) ----

let _ipcSignals: IpcSignals | null = null;

// ---- Core backend ----

// Creates a typed channel descriptor. Functions that accept a channel string also accept an
// IpcChannel, so a feature can publish its channel constants once and get a single grep target.
export function createIpcChannel(name: string): IpcChannel {
  return { name };
}

// Builds the default web backend. There is no main process on web, so send no-ops, invoke resolves
// to undefined, and subscribe returns an inert unsubscribe — a native host is required for real IPC.
export function createWebIpcBackend(): IpcBackend {
  return {
    send() {},
    invoke() {
      return Promise.resolve(undefined);
    },
    subscribe() {
      return () => {};
    },
    getCapabilities(): Readonly<IpcBackendCapabilities> {
      return { canHandle: false, canInvoke: false, canSend: false, canTarget: false };
    },
  };
}

// Activates the optional IpcSignals group and returns it. Calling this is when the cost is assumed.
// The returned object is shared for the lifetime of the package; calling enableIpcSignals multiple
// times returns the same instance.
export function enableIpcSignals(): IpcSignals {
  if (_ipcSignals === null) {
    _ipcSignals = {
      onBackendChanged: createSignal(),
      onChannelMessage: createSignal(),
    };
  }
  return _ipcSignals;
}

// Returns the active IpcBackend, or a lazily-created web default. There is always a backend.
export function getIpcBackend(): IpcBackend {
  if (_backend === null) _backend = createWebIpcBackend();
  return _backend;
}

// Returns the count of active in-package listeners on a channel. Returns 0 for an unknown channel.
export function getIpcListenerCount(channel: string | Readonly<IpcChannel>): number {
  const name = resolveChannel(channel);
  return _listeners.get(name)?.size ?? 0;
}

// Returns the active IpcSignals group, or null if enableIpcSignals has not been called.
export function getIpcSignals(): Readonly<IpcSignals> | null {
  return _ipcSignals;
}

// Returns true when a real native backend is installed, false when the lazy web default is active.
// Use this to distinguish "no main process" (web) from a connected host without performing an invoke.
export function hasIpcBackend(): boolean {
  return _backend !== null;
}

// Sends a request on `channel` and resolves with the host's response, or undefined on web.
// Rejects with a plain Error if the host handler throws.
export function invokeIpc(channel: string | Readonly<IpcChannel>, ...args: readonly unknown[]): Promise<unknown> {
  return getIpcBackend().invoke(resolveChannel(channel), args);
}

// Sends a request on `channel` and resolves with the host's response, or rejects with
// IpcTimeoutError if the invoke does not complete within timeoutMs milliseconds.
export function invokeIpcWithTimeout(
  channel: string | Readonly<IpcChannel>,
  timeoutMs: number,
  ...args: readonly unknown[]
): Promise<unknown> {
  const name = resolveChannel(channel);
  const invoke = getIpcBackend().invoke(name, args);
  const timeout = new Promise<unknown>((_, reject) => {
    const id = setTimeout(() => reject(new IpcTimeoutError(name, timeoutMs)), timeoutMs);
    // Attach a no-op catch so the invoke rejection does not surface if timeout fires first.
    invoke.then(
      () => clearTimeout(id),
      () => clearTimeout(id),
    );
  });
  return Promise.race([invoke, timeout]);
}

// Subscribes `listener` to a single message on `channel`, then auto-unsubscribes.
// Returns an unsubscribe thunk for the not-yet-fired case.
export function onceIpcMessage(
  channel: string | Readonly<IpcChannel>,
  listener: (...args: readonly unknown[]) => void,
): () => void {
  let unsubscribe: (() => void) | null = null;
  unsubscribe = onIpcMessage(channel, (...args) => {
    unsubscribe?.();
    listener(...args);
  });
  return unsubscribe;
}

// Registers a responder for invokeIpc calls on `channel`. The handler may return a value or a
// Promise. Returns an unregister thunk. Requires a backend that supports `handle`; if the backend
// does not support it, returns an inert no-op unsubscribe.
export function onIpcInvoke(
  channel: string | Readonly<IpcChannel>,
  handler: (...args: readonly unknown[]) => unknown | Promise<unknown>,
): () => void {
  const backend = getIpcBackend();
  if (typeof backend.handle !== 'function') return () => {};
  return backend.handle(resolveChannel(channel), handler);
}

// Subscribes `listener` to messages on `channel`; returns an unsubscribe function.
// Incoming args are spread to the listener, mirroring sendIpcMessage's variadic shape.
export function onIpcMessage(
  channel: string | Readonly<IpcChannel>,
  listener: (...args: readonly unknown[]) => void,
): () => void {
  const name = resolveChannel(channel);
  const backend = getIpcBackend();
  const signals = _ipcSignals;

  const unsubscribe = backend.subscribe(name, (args) => {
    if (signals !== null) emitSignal(signals.onChannelMessage, name);
    listener(...args);
  });

  const tracked = () => {
    unsubscribe();
    _untrackListener(name, tracked);
  };
  _trackListener(name, tracked);
  return tracked;
}

// Subscribes `listener` to messages on `channel`, delivering an IpcMessageEvent with channel,
// senderId, args, and a reply thunk. The existing args-spread onIpcMessage path stays untouched.
export function onIpcMessageEvent(
  channel: string | Readonly<IpcChannel>,
  listener: (event: Readonly<IpcMessageEvent>) => void,
): () => void {
  const name = resolveChannel(channel);
  const backend = getIpcBackend();
  const signals = _ipcSignals;

  const unsubscribe = backend.subscribe(name, (args) => {
    if (signals !== null) emitSignal(signals.onChannelMessage, name);
    const event: IpcMessageEvent = {
      channel: name,
      senderId: -1,
      args,
      reply(...replyArgs: readonly unknown[]) {
        if (this.senderId === -1) return;
        backend.sendTo?.({ windowId: this.senderId }, name, replyArgs);
      },
    };
    listener(event);
  });

  const tracked = () => {
    unsubscribe();
    _untrackListener(name, tracked);
  };
  _trackListener(name, tracked);
  return tracked;
}

// Drops every in-package listener for `channel`, or all channels when omitted.
export function removeAllIpcListeners(channel?: string | Readonly<IpcChannel>): void {
  if (channel !== undefined) {
    const name = resolveChannel(channel);
    const set = _listeners.get(name);
    if (set !== undefined) {
      for (const unsubscribe of [...set]) unsubscribe();
    }
  } else {
    for (const [, set] of [..._listeners]) {
      for (const unsubscribe of [...set]) unsubscribe();
    }
  }
}

// Sends a fire-and-forget message on `channel`. No-ops on web (no main process).
export function sendIpcMessage(channel: string | Readonly<IpcChannel>, ...args: readonly unknown[]): void {
  getIpcBackend().send(resolveChannel(channel), args);
}

// Sends a fire-and-forget message to a specific target window/process. No-ops when the backend
// does not support targeted send (i.e. `getCapabilities().canTarget` is false or `sendTo` is absent).
export function sendIpcMessageTo(
  target: Readonly<IpcTarget>,
  channel: string | Readonly<IpcChannel>,
  ...args: readonly unknown[]
): void {
  getIpcBackend().sendTo?.(target, resolveChannel(channel), args);
}

// Installs a native host IPC backend; pass null to fall back to the web default.
export function setIpcBackend(backend: IpcBackend | null): void {
  _backend = backend;
  if (_ipcSignals !== null) emitSignal(_ipcSignals.onBackendChanged);
}

let _backend: IpcBackend | null = null;

import { createSignal, emitSignal } from '@flighthq/signals';
import type { ProtocolBackend, ProtocolHandler } from '@flighthq/types';

// Begins delivering deep-link opens to `handler`'s signal by subscribing to the active backend. Wires
// subscribe→onOpenUrl. Idempotent: a prior subscription is torn down first. Pair with
// detachProtocolHandler/disposeProtocolHandler.
export function attachProtocolHandler(handler: ProtocolHandler): void {
  detachProtocolHandler(handler);
  const backend = getProtocolBackend();
  const unsubscribe = backend.subscribe((url) => emitSignal(handler.onOpenUrl, url));
  _subscriptions.set(handler, unsubscribe);
}

// Allocates a ProtocolHandler event entity with an inert signal; call attachProtocolHandler to start
// delivery.
export function createProtocolHandler(): ProtocolHandler {
  return { onOpenUrl: createSignal() };
}

// Builds the default web backend over navigator.registerProtocolHandler. Registration degrades to
// false where the API is absent. Deep-link delivery needs a native host, so subscribe is inert.
export function createWebProtocolBackend(): ProtocolBackend {
  return {
    register(scheme) {
      if (typeof navigator === 'undefined' || typeof location === 'undefined') return false;
      const nav = navigator as Navigator & {
        registerProtocolHandler?: (scheme: string, url: string) => void;
      };
      if (typeof nav.registerProtocolHandler !== 'function') return false;
      try {
        nav.registerProtocolHandler(scheme, location.origin + '/?url=%s');
        return true;
      } catch {
        return false;
      }
    },
    unregister() {
      // The web platform offers no programmatic unregister; report failure rather than throw.
      return false;
    },
    isRegistered() {
      // The web platform offers no registration query; report not-registered.
      return false;
    },
    setAsDefault() {
      // The web platform cannot claim a scheme as the OS default; report failure.
      return false;
    },
    subscribe() {
      // Web deep-link delivery requires a native host to route incoming URLs into the page; the web
      // backend cannot observe protocol opens on its own, so this subscription is inert.
      return () => {};
    },
  };
}

// Stops delivery to `handler` and forgets its subscription. Safe to call when not attached.
export function detachProtocolHandler(handler: ProtocolHandler): void {
  const unsubscribe = _subscriptions.get(handler);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(handler);
  }
}

// Releases `handler` for garbage collection by detaching its backend subscription. The signal remains
// plain GC-managed memory afterward.
export function disposeProtocolHandler(handler: ProtocolHandler): void {
  detachProtocolHandler(handler);
}

// The active protocol backend, or a lazily-created web default. There is always a backend.
export function getProtocolBackend(): ProtocolBackend {
  if (_backend === null) _backend = createWebProtocolBackend();
  return _backend;
}

// True when `scheme` is currently registered to this app. Returns false where the host cannot report it.
export function isProtocolSchemeRegistered(scheme: string): boolean {
  return getProtocolBackend().isRegistered(scheme);
}

// Registers a custom URI scheme (for example 'myapp') to this app. Returns false when the host denies
// or does not support registration.
export function registerProtocolScheme(scheme: string): boolean {
  return getProtocolBackend().register(scheme);
}

// Installs a native host protocol backend; pass null to fall back to the web default.
export function setProtocolBackend(backend: ProtocolBackend | null): void {
  _backend = backend;
}

// Makes this app the default handler for `scheme`. Returns false when the host denies or does not
// support it.
export function setProtocolSchemeAsDefault(scheme: string): boolean {
  return getProtocolBackend().setAsDefault(scheme);
}

// Unregisters a previously registered custom URI scheme. Returns false when the host denies or does
// not support unregistration.
export function unregisterProtocolScheme(scheme: string): boolean {
  return getProtocolBackend().unregister(scheme);
}

let _backend: ProtocolBackend | null = null;
const _subscriptions = new WeakMap<ProtocolHandler, () => void>();

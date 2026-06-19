import { createSignal, emitSignal } from '@flighthq/signals';
import type { Network, NetworkBackend, NetworkConnectionType, NetworkStatus } from '@flighthq/types';

// Begins delivering connectivity changes to `net`'s signals by subscribing to the active backend. On
// each change it reads a fresh status and emits onChange plus onOnline/onOffline. Idempotent: a prior
// subscription is torn down first. Pair with detachNetwork/disposeNetwork.
export function attachNetwork(net: Network): void {
  detachNetwork(net);
  const backend = getNetworkBackend();
  let wasOnline = backend.getStatus(_scratch).online;
  const unsubscribe = backend.subscribe(() => {
    const status = backend.getStatus(_scratch);
    emitSignal(net.onChange, status);
    if (status.online !== wasOnline) {
      wasOnline = status.online;
      emitSignal(status.online ? net.onOnline : net.onOffline);
    }
  });
  _subscriptions.set(net, unsubscribe);
}

// Allocates a Network event entity with inert signals; call attachNetwork to start delivery.
export function createNetwork(): Network {
  return { onChange: createSignal(), onOffline: createSignal(), onOnline: createSignal() };
}

// Allocates a zeroed NetworkStatus, suitable as the `out` for getNetworkStatus.
export function createNetworkStatus(): NetworkStatus {
  return { downlink: -1, effectiveType: '', online: false, type: 'unknown' };
}

// Builds the default web backend over navigator.onLine, the Network Information API, and the window
// online/offline events. Degrades to online=true / type 'unknown' where the APIs are absent.
export function createWebNetworkBackend(): NetworkBackend {
  return {
    getStatus(out) {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      out.online = nav?.onLine ?? true;
      const conn = getWebConnection();
      out.type = mapWebConnectionType(conn?.type);
      out.downlink = typeof conn?.downlink === 'number' ? conn.downlink : -1;
      out.effectiveType = typeof conn?.effectiveType === 'string' ? conn.effectiveType : '';
      return out;
    },
    subscribe(listener) {
      if (typeof window === 'undefined') return () => {};
      window.addEventListener('online', listener);
      window.addEventListener('offline', listener);
      const conn = getWebConnection();
      conn?.addEventListener?.('change', listener);
      return () => {
        window.removeEventListener('online', listener);
        window.removeEventListener('offline', listener);
        conn?.removeEventListener?.('change', listener);
      };
    },
  };
}

// Stops delivery to `net` and forgets its subscription. Safe to call when not attached.
export function detachNetwork(net: Network): void {
  const unsubscribe = _subscriptions.get(net);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(net);
  }
}

// Releases `net` for garbage collection by detaching its backend subscription. The signals remain
// plain GC-managed memory afterward.
export function disposeNetwork(net: Network): void {
  detachNetwork(net);
}

// The active network backend, or a lazily-created web default. There is always a backend.
export function getNetworkBackend(): NetworkBackend {
  if (_backend === null) _backend = createWebNetworkBackend();
  return _backend;
}

// Fills `out` with the current connectivity snapshot and returns it.
export function getNetworkStatus(out: NetworkStatus): NetworkStatus {
  return getNetworkBackend().getStatus(out);
}

// True when the host currently reports connectivity. Convenience over getNetworkStatus.
export function isNetworkOnline(): boolean {
  return getNetworkBackend().getStatus(_scratch).online;
}

// Installs a native host network backend; pass null to fall back to the web default.
export function setNetworkBackend(backend: NetworkBackend | null): void {
  _backend = backend;
}

let _backend: NetworkBackend | null = null;
const _scratch: NetworkStatus = createNetworkStatus();
const _subscriptions = new WeakMap<Network, () => void>();

interface WebNetworkConnection {
  type?: string;
  downlink?: number;
  effectiveType?: string;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

function getWebConnection(): WebNetworkConnection | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { connection?: WebNetworkConnection };
  return nav.connection ?? null;
}

function mapWebConnectionType(type: string | undefined): NetworkConnectionType {
  switch (type) {
    case 'wifi':
      return 'wifi';
    case 'cellular':
      return 'cellular';
    case 'ethernet':
      return 'ethernet';
    case 'bluetooth':
      return 'bluetooth';
    case 'none':
      return 'none';
    default:
      return 'unknown';
  }
}

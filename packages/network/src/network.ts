import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  Network,
  NetworkBackend,
  NetworkConnectionType,
  NetworkReachability,
  NetworkReachabilityOptions,
  NetworkStatus,
} from '@flighthq/types';

// Begins delivering connectivity changes to `net`'s signals by subscribing to the active backend. On
// each change it reads a fresh status and emits onChange plus edge-triggered signals. Idempotent: a
// prior subscription is torn down first. Pair with detachNetwork/disposeNetwork.
export function attachNetwork(net: Network): void {
  detachNetwork(net);
  const backend = getNetworkBackend();
  const initial = backend.getStatus(_scratch);
  let wasOnline = initial.online;
  let wasType = initial.type;
  let wasMetered = initial.metered;
  const unsubscribe = backend.subscribe(() => {
    const status = backend.getStatus(_scratch);
    emitSignal(net.onChange, status);
    if (status.online !== wasOnline) {
      wasOnline = status.online;
      emitSignal(status.online ? net.onOnline : net.onOffline);
    }
    if (status.type !== wasType) {
      wasType = status.type;
      emitSignal(net.onConnectionTypeChange, status.type);
    }
    if (status.metered !== wasMetered) {
      wasMetered = status.metered;
      emitSignal(net.onMeteredChange, status.metered);
    }
  });
  _subscriptions.set(net, unsubscribe);
}

// Allocates a Network event entity with inert signals; call attachNetwork to start delivery.
export function createNetwork(): Network {
  return {
    onChange: createSignal(),
    onConnectionTypeChange: createSignal(),
    onMeteredChange: createSignal(),
    onOffline: createSignal(),
    onOnline: createSignal(),
  };
}

// Allocates a zeroed NetworkStatus, suitable as the `out` for getNetworkStatus.
export function createNetworkStatus(): NetworkStatus {
  return {
    downlink: -1,
    downlinkMax: -1,
    effectiveType: '',
    metered: false,
    online: false,
    rtt: -1,
    saveData: false,
    type: 'unknown',
  };
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
      out.downlinkMax = typeof conn?.downlinkMax === 'number' ? conn.downlinkMax : -1;
      out.effectiveType = typeof conn?.effectiveType === 'string' ? conn.effectiveType : '';
      out.rtt = typeof conn?.rtt === 'number' ? conn.rtt : -1;
      out.saveData = conn?.saveData === true;
      out.metered = out.saveData || out.type === 'cellular';
      return out;
    },
    async detectReachability(options, out) {
      if (typeof fetch === 'undefined') {
        out.reachable = false;
        out.latency = -1;
        return out;
      }
      const timeout = options.timeout ?? 5000;
      const controller = new AbortController();
      const timerId = setTimeout(() => controller.abort(), timeout);
      const combinedSignal = options.signal ? anyAbortSignal(options.signal, controller.signal) : controller.signal;
      const start = Date.now();
      try {
        const response = await fetch(options.url, {
          method: 'HEAD',
          cache: 'no-store',
          signal: combinedSignal,
        });
        clearTimeout(timerId);
        out.reachable = response.ok;
        out.latency = Date.now() - start;
      } catch {
        clearTimeout(timerId);
        out.reachable = false;
        out.latency = -1;
      }
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

// Performs a one-shot reachability probe against the given URL using the active backend's
// detectReachability, falling back to a fetch-based implementation when the backend does not provide
// one. Writes the result into `out` and returns it. Returns a sentinel on failure rather than throwing.
// NOTE: navigator.onLine reports an interface, not internet reachability. Use this function when you
// need to distinguish "a network interface is up" from "the internet is actually reachable."
export async function detectNetworkReachability(
  options: Readonly<NetworkReachabilityOptions>,
  out: NetworkReachability,
): Promise<NetworkReachability> {
  const backend = getNetworkBackend();
  if (backend.detectReachability !== undefined) {
    return backend.detectReachability(options, out);
  }
  // Fallback: use the web backend's implementation directly
  if (_cachedWebBackend === null) _cachedWebBackend = createWebNetworkBackend();
  const webBackend = _cachedWebBackend;
  if (webBackend.detectReachability !== undefined) {
    return webBackend.detectReachability(options, out);
  }
  out.reachable = false;
  out.latency = -1;
  return out;
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

// Returns a diff of two status snapshots. Returns true if any field differs.
export function hasNetworkStatusChanged(a: Readonly<NetworkStatus>, b: Readonly<NetworkStatus>): boolean {
  return (
    a.online !== b.online ||
    a.type !== b.type ||
    a.downlink !== b.downlink ||
    a.downlinkMax !== b.downlinkMax ||
    a.effectiveType !== b.effectiveType ||
    a.rtt !== b.rtt ||
    a.saveData !== b.saveData ||
    a.metered !== b.metered
  );
}

// True when the connection is metered (cellular or save-data is set). Convenience over getNetworkStatus.
export function isNetworkMetered(): boolean {
  return getNetworkBackend().getStatus(_scratch).metered;
}

// True when the host currently reports connectivity. Convenience over getNetworkStatus.
export function isNetworkOnline(): boolean {
  return getNetworkBackend().getStatus(_scratch).online;
}

// True when the user or OS has requested reduced data usage. Convenience over getNetworkStatus.
export function isNetworkSaveDataEnabled(): boolean {
  return getNetworkBackend().getStatus(_scratch).saveData;
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
  downlinkMax?: number;
  effectiveType?: string;
  rtt?: number;
  saveData?: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

// Combines two AbortSignals: aborts when either fires.
function anyAbortSignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && 'any' in AbortSignal) {
    return (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any([a, b]);
  }
  const controller = new AbortController();
  const onAbort = () => {
    controller.abort();
    a.removeEventListener('abort', onAbort);
    b.removeEventListener('abort', onAbort);
  };
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

function getWebConnection(): WebNetworkConnection | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { connection?: WebNetworkConnection };
  return nav.connection ?? null;
}

function mapWebConnectionType(type: string | undefined): NetworkConnectionType {
  switch (type) {
    case 'bluetooth':
      return 'bluetooth';
    case 'cellular':
      return 'cellular';
    case 'ethernet':
      return 'ethernet';
    case 'none':
      return 'none';
    case 'other':
      return 'other';
    case 'vpn':
      return 'vpn';
    case 'wifi':
      return 'wifi';
    case 'wimax':
      return 'wimax';
    default:
      return 'unknown';
  }
}

let _cachedWebBackend: NetworkBackend | null = null;

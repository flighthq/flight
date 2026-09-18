import type {
  ConnectivityConnectionType,
  HostConnectivityChangeCapability,
  HostConnectivityReachabilityCapability,
  HostConnectivityStatusCapability,
} from '@flighthq/types/contract';

type WebConnectivityBackend = HostConnectivityStatusCapability &
  HostConnectivityChangeCapability &
  HostConnectivityReachabilityCapability;

export function createWebConnectivityBackend(): WebConnectivityBackend {
  const backend = {} as WebConnectivityBackend;
  initializeWebConnectivityBackend(backend);
  return backend;
}

export function initializeWebConnectivityBackend(backend: WebConnectivityBackend): void {
  initializeWebConnectivityChangeProvider(backend);
  initializeWebConnectivityReachabilityBackend(backend);
  initializeWebConnectivityStatusProvider(backend);
}

export const webHostConnectivityChange = createWebConnectivityChangeProvider();
export const webHostConnectivityReachability = createWebConnectivityReachabilityProvider();
export const webHostConnectivityStatus = createWebConnectivityStatusProvider();

function createWebConnectivityChangeProvider(): HostConnectivityChangeCapability {
  const out = {} as HostConnectivityChangeCapability;
  initializeWebConnectivityChangeProvider(out);
  return out;
}

function createWebConnectivityReachabilityProvider(): HostConnectivityReachabilityCapability {
  const out = {} as HostConnectivityReachabilityCapability;
  initializeWebConnectivityReachabilityBackend(out);
  return out;
}

function createWebConnectivityStatusProvider(): HostConnectivityStatusCapability {
  const out = {} as HostConnectivityStatusCapability;
  initializeWebConnectivityStatusProvider(out);
  return out;
}

function initializeWebConnectivityChangeProvider(backend: HostConnectivityChangeCapability): void {
  const releases = new Set<() => void>();
  let destroyed = false;
  backend.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    for (const release of [...releases]) release();
    releases.clear();
  };
  backend.subscribe = (listener) => {
    if (
      destroyed ||
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function' ||
      typeof window.removeEventListener !== 'function'
    ) {
      return null;
    }
    const connection = getWebConnection();
    const canSubscribeConnection =
      typeof connection?.addEventListener === 'function' && typeof connection.removeEventListener === 'function';
    let onlineAttached = false;
    let offlineAttached = false;
    let connectionAttached = false;
    try {
      window.addEventListener('online', listener);
      onlineAttached = true;
      window.addEventListener('offline', listener);
      offlineAttached = true;
      if (canSubscribeConnection) {
        connection.addEventListener?.('change', listener);
        connectionAttached = true;
      }
    } catch {
      if (onlineAttached) window.removeEventListener('online', listener);
      if (offlineAttached) window.removeEventListener('offline', listener);
      if (connectionAttached) connection?.removeEventListener?.('change', listener);
      return null;
    }
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      releases.delete(release);
      window.removeEventListener('online', listener);
      window.removeEventListener('offline', listener);
      if (connectionAttached) connection?.removeEventListener?.('change', listener);
    };
    releases.add(release);
    return release;
  };
}

function initializeWebConnectivityReachabilityBackend(backend: HostConnectivityReachabilityCapability): void {
  backend.detectReachability = async (options, out) => {
    if (typeof fetch !== 'function' || typeof AbortController === 'undefined') {
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
        cache: 'no-store',
        method: 'HEAD',
        signal: combinedSignal,
      });
      out.reachable = response.ok;
      out.latency = Date.now() - start;
    } catch {
      out.reachable = false;
      out.latency = -1;
    } finally {
      clearTimeout(timerId);
    }
    return out;
  };
}

function initializeWebConnectivityStatusProvider(backend: HostConnectivityStatusCapability): void {
  backend.getStatus = (out) => {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    out.online = typeof nav?.onLine === 'boolean' ? nav.onLine : null;
    const connection = getWebConnection();
    out.type = mapWebConnectionType(connection?.type);
    out.downlink = typeof connection?.downlink === 'number' ? connection.downlink : -1;
    out.downlinkMax = typeof connection?.downlinkMax === 'number' ? connection.downlinkMax : -1;
    out.effectiveType = typeof connection?.effectiveType === 'string' ? connection.effectiveType : '';
    out.rtt = typeof connection?.rtt === 'number' ? connection.rtt : -1;
    out.saveData = connection?.saveData === true;
    out.metered = out.saveData || out.type === 'cellular';
    return out;
  };
}

interface WebConnectivityConnection {
  type?: string;
  downlink?: number;
  downlinkMax?: number;
  effectiveType?: string;
  rtt?: number;
  saveData?: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

interface WebConnectivityNavigator extends Navigator {
  connection?: WebConnectivityConnection;
}

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

function getWebConnection(): WebConnectivityConnection | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as WebConnectivityNavigator).connection ?? null;
}

function mapWebConnectionType(type: string | undefined): ConnectivityConnectionType {
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

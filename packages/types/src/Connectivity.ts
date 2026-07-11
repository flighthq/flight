import type { Signal } from './Signal';

export type ConnectivityConnectionType =
  | 'wifi'
  | 'cellular'
  | 'ethernet'
  | 'bluetooth'
  | 'vpn'
  | 'wimax'
  | 'other'
  | 'none'
  | 'unknown';

export interface ConnectivityStatus {
  online: boolean;
  type: ConnectivityConnectionType;
  // Estimated downlink in Mbps, or -1 when the host does not report it.
  downlink: number;
  // Maximum downlink of the underlying connection technology in Mbps, or -1 when not reported.
  downlinkMax: number;
  // Effective connection class ('4g', '3g', …) or '' when unknown.
  effectiveType: string;
  // Estimated round-trip time in milliseconds, or -1 when the host does not report it.
  rtt: number;
  // True when the user or OS has requested reduced data usage.
  saveData: boolean;
  // True when the connection is metered (cellular or save-data is set).
  metered: boolean;
}

// One-shot reachability probe result, written into an `out` by detectReachability. Sentinel values
// (reachable=false, latency=-1) indicate the probe failed rather than throwing.
export interface ConnectivityReachability {
  reachable: boolean;
  // Round-trip latency of the probe in milliseconds, or -1 on failure.
  latency: number;
}

// Inputs to a reachability probe: the URL to reach plus optional timeout and cancellation.
export interface ConnectivityReachabilityOptions {
  url: string;
  // Probe timeout in milliseconds; the backend chooses a default when omitted.
  timeout?: number;
  // Optional caller-supplied abort signal, combined with the backend's internal timeout.
  signal?: AbortSignal;
}

// Event seam for connectivity: a snapshot reader plus a change subscription. The web backend wraps
// navigator.onLine + the Network Information API; a native host emits its own connectivity changes
// through the same subscribe callback.
export interface ConnectivityBackend {
  getStatus(out: ConnectivityStatus): ConnectivityStatus;
  // Optional one-shot reachability probe; callers fall back to a fetch-based default when absent.
  detectReachability?(
    options: Readonly<ConnectivityReachabilityOptions>,
    out: ConnectivityReachability,
  ): Promise<ConnectivityReachability>;
  // Registers a listener invoked on any connectivity change; returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
}

// Connectivity event entity. Enable delivery with attachConnectivity; the signals stay inert until then.
export interface Connectivity {
  onChange: Signal<(status: Readonly<ConnectivityStatus>) => void>;
  onConnectionTypeChange: Signal<(type: ConnectivityConnectionType) => void>;
  onMeteredChange: Signal<(metered: boolean) => void>;
  onOnline: Signal<() => void>;
  onOffline: Signal<() => void>;
}

import type { Signal } from './Signal';

export type NetworkConnectionType = 'wifi' | 'cellular' | 'ethernet' | 'bluetooth' | 'none' | 'unknown';

export interface NetworkStatus {
  online: boolean;
  type: NetworkConnectionType;
  // Estimated downlink in Mbps, or -1 when the host does not report it.
  downlink: number;
  // Effective connection class ('4g', '3g', …) or '' when unknown.
  effectiveType: string;
}

// Event seam for connectivity: a snapshot reader plus a change subscription. The web backend wraps
// navigator.onLine + the Network Information API; a native host emits its own connectivity changes
// through the same subscribe callback.
export interface NetworkBackend {
  getStatus(out: NetworkStatus): NetworkStatus;
  // Registers a listener invoked on any connectivity change; returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
}

// Connectivity event entity. Enable delivery with attachNetwork; the signals stay inert until then.
export interface Network {
  onChange: Signal<(status: Readonly<NetworkStatus>) => void>;
  onOnline: Signal<() => void>;
  onOffline: Signal<() => void>;
}

import type { Entity } from './Entity';
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

// A connectivity snapshot. `online: null` means the provider has not measured connectivity yet; it
// must never be interpreted as offline. The remaining sentinel values likewise mean unreported.
export interface ConnectivityStatus {
  online: boolean | null;
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

// Snapshot queries, raw host change delivery, and active reachability are separate capabilities.
// Their provider coverage differs, and the change subscription has a teardown lifetime that the two
// command shapes do not. A host therefore exposes them as separate slots even when one provider
// object implements more than one facet.
export interface ConnectivityStatusBackend extends Entity {
  getStatus(out: ConnectivityStatus): ConnectivityStatus;
}

export interface ConnectivityChangeBackend extends Entity {
  // Terminal provider teardown. Per-entity detach consumes only the unsubscribe returned below.
  destroy(): void;
  // Returns null when the provider cannot establish a real change subscription. A no-op thunk would
  // falsely claim attach success and leave the caller waiting for events that cannot arrive.
  subscribe(listener: () => void): (() => void) | null;
}

export interface ConnectivityReachabilityBackend extends Entity {
  detectReachability(
    options: Readonly<ConnectivityReachabilityOptions>,
    out: ConnectivityReachability,
  ): Promise<ConnectivityReachability>;
}

// Core connectivity event entity. The five signals are emitted by @flighthq/connectivity after it
// reads and diffs a status snapshot; they are not Host capability slots.
export interface Connectivity extends Entity {
  onChange: Signal<(status: Readonly<ConnectivityStatus>) => void>;
  onConnectionTypeChange: Signal<(type: ConnectivityConnectionType) => void>;
  onMeteredChange: Signal<(metered: boolean) => void>;
  onOnline: Signal<() => void>;
  onOffline: Signal<() => void>;
}

import { createEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Connectivity,
  ConnectivityReachability,
  ConnectivityReachabilityOptions,
  ConnectivityStatus,
  HasConnectivityChange,
  HasConnectivityReachability,
  HasConnectivityStatus,
} from '@flighthq/types/contract';

// Starts raw host-change delivery and turns it into the five core-owned diff signals. Status and
// change are separate Host witnesses: a snapshot command cannot stand in for an event subscription.
// Re-attaching always consumes the prior provider's exact unsubscribe before touching the new one.
// Returns false when the change provider cannot establish a real subscription.
export function attachConnectivity(
  host: HasConnectivityStatus & HasConnectivityChange,
  connectivity: Connectivity,
): boolean {
  detachConnectivity(connectivity);
  const statusBackend = host.connectivity.status;
  const initial = statusBackend.getStatus(connectivityStatusOut());
  let wasOnline = initial.online;
  let wasType = initial.type;
  let wasMetered = initial.metered;
  const unsubscribe = host.connectivity.change.subscribe(() => {
    const status = statusBackend.getStatus(connectivityStatusOut());
    emitSignal(connectivity.onChange, status);
    if (status.online !== wasOnline) {
      wasOnline = status.online;
      if (status.online === true) emitSignal(connectivity.onOnline);
      else if (status.online === false) emitSignal(connectivity.onOffline);
    }
    if (status.type !== wasType) {
      wasType = status.type;
      emitSignal(connectivity.onConnectionTypeChange, status.type);
    }
    if (status.metered !== wasMetered) {
      wasMetered = status.metered;
      emitSignal(connectivity.onMeteredChange, status.metered);
    }
  });
  if (unsubscribe === null) return false;
  _subscriptions.set(connectivity, unsubscribe);
  return true;
}

export function createConnectivity(): Connectivity {
  return createEntity({
    onChange: createSignal(),
    onConnectionTypeChange: createSignal(),
    onMeteredChange: createSignal(),
    onOffline: createSignal(),
    onOnline: createSignal(),
  });
}

// Terminal provider teardown. This is deliberately separate from per-entity detach: a caller that
// releases one subscription must not destroy a shared host provider.
export function destroyConnectivity(host: HasConnectivityChange): void {
  host.connectivity.change.destroy();
}

export function detachConnectivity(connectivity: Connectivity): void {
  const unsubscribe = _subscriptions.get(connectivity);
  if (unsubscribe === undefined) return;
  _subscriptions.delete(connectivity);
  unsubscribe();
}

export function detectConnectivityReachability(
  host: HasConnectivityReachability,
  options: Readonly<ConnectivityReachabilityOptions>,
  out: ConnectivityReachability,
): Promise<ConnectivityReachability> {
  return host.connectivity.reachability.detectReachability(options, out);
}

// Disposes only the caller-owned event entity. Provider teardown is terminal and explicit through
// destroyConnectivity because one provider can fan out to multiple Connectivity entities.
export function disposeConnectivity(connectivity: Connectivity): void {
  detachConnectivity(connectivity);
  clearSignal(connectivity.onChange);
  clearSignal(connectivity.onConnectionTypeChange);
  clearSignal(connectivity.onMeteredChange);
  clearSignal(connectivity.onOffline);
  clearSignal(connectivity.onOnline);
}

export function getConnectivityOnline(host: HasConnectivityStatus): boolean | null {
  return host.connectivity.status.getStatus(connectivityStatusOut()).online;
}

export function getConnectivityStatus(host: HasConnectivityStatus, out: ConnectivityStatus): ConnectivityStatus {
  return host.connectivity.status.getStatus(out);
}

export function hasConnectivityStatusChanged(
  a: Readonly<ConnectivityStatus>,
  b: Readonly<ConnectivityStatus>,
): boolean {
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

export function isConnectivityMetered(host: HasConnectivityStatus): boolean {
  return host.connectivity.status.getStatus(connectivityStatusOut()).metered;
}

export function isConnectivitySaveDataEnabled(host: HasConnectivityStatus): boolean {
  return host.connectivity.status.getStatus(connectivityStatusOut()).saveData;
}

// ConnectivityStatus is a backend-produced query/out snapshot, not a user-created identity. Keep its
// sentinel allocation package-private so the public create* vocabulary remains Entity-only.
function connectivityStatusOut(): ConnectivityStatus {
  return {
    downlink: -1,
    downlinkMax: -1,
    effectiveType: '',
    metered: false,
    online: null,
    rtt: -1,
    saveData: false,
    type: 'unknown',
  };
}

// Each entity retains the exact release returned by the provider it attached to. Deleting the entry
// before invoking the release also makes a re-entrant detach idempotent.
const _subscriptions = new WeakMap<Connectivity, () => void>();

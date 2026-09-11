import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Connectivity,
  ConnectivityReachability,
  ConnectivityReachabilityOptions,
  ConnectivityStatus,
  EntityConstruction,
  HostConnectivityChangeProvider,
  HostConnectivityReachabilityProvider,
  HostConnectivityStatusProvider,
} from '@flighthq/types/contract';

// Starts raw host-change delivery and turns it into the five core-owned diff signals. Status and
// change are separate Host witnesses: a snapshot command cannot stand in for an event subscription.
// Re-attaching always consumes the prior provider's exact unsubscribe before touching the new one.
// Returns false when the change provider cannot establish a real subscription.
export function attachConnectivity(
  hostConnectivityStatus: Readonly<HostConnectivityStatusProvider>,
  hostConnectivityChange: Readonly<HostConnectivityChangeProvider>,
  connectivity: Connectivity,
): boolean {
  detachConnectivity(connectivity);
  const statusBackend = hostConnectivityStatus;
  const initial = statusBackend.getStatus(connectivityStatusOut());
  let wasOnline = initial.online;
  let wasType = initial.type;
  let wasMetered = initial.metered;
  const unsubscribe = hostConnectivityChange.subscribe(() => {
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
  const out = allocateEntity<Connectivity>();
  initializeConnectivity(out);
  return finishEntity(out);
}

// Terminal provider teardown. This is deliberately separate from per-entity detach: a caller that
// releases one subscription must not destroy a shared host provider.
export function destroyConnectivity(hostConnectivityChange: Readonly<HostConnectivityChangeProvider>): void {
  hostConnectivityChange.destroy();
}

export function detachConnectivity(connectivity: Connectivity): void {
  const unsubscribe = _subscriptions.get(connectivity);
  if (unsubscribe === undefined) return;
  _subscriptions.delete(connectivity);
  unsubscribe();
}

export function detectConnectivityReachability(
  hostConnectivityReachability: Readonly<HostConnectivityReachabilityProvider>,
  options: Readonly<ConnectivityReachabilityOptions>,
  out: ConnectivityReachability,
): Promise<ConnectivityReachability> {
  return hostConnectivityReachability.detectReachability(options, out);
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

export function getConnectivityOnline(
  hostConnectivityStatus: Readonly<HostConnectivityStatusProvider>,
): boolean | null {
  return hostConnectivityStatus.getStatus(connectivityStatusOut()).online;
}

export function getConnectivityStatus(
  hostConnectivityStatus: Readonly<HostConnectivityStatusProvider>,
  out: ConnectivityStatus,
): ConnectivityStatus {
  return hostConnectivityStatus.getStatus(out);
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

export function initializeConnectivity(out: EntityConstruction<Connectivity>): void {
  out.onChange = createSignal();
  out.onConnectionTypeChange = createSignal();
  out.onMeteredChange = createSignal();
  out.onOffline = createSignal();
  out.onOnline = createSignal();
}

export function isConnectivityMetered(hostConnectivityStatus: Readonly<HostConnectivityStatusProvider>): boolean {
  return hostConnectivityStatus.getStatus(connectivityStatusOut()).metered;
}

export function isConnectivitySaveDataEnabled(
  hostConnectivityStatus: Readonly<HostConnectivityStatusProvider>,
): boolean {
  return hostConnectivityStatus.getStatus(connectivityStatusOut()).saveData;
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

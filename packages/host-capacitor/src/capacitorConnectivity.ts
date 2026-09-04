import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorConnectionStatus,
  CapacitorPluginListenerHandle,
  ConnectivityChangeBackend,
  ConnectivityConnectionType,
  ConnectivityStatus,
  ConnectivityStatusBackend,
  EntityConstruction,
} from '@flighthq/types/contract';

type CapacitorConnectivityBackend = ConnectivityStatusBackend & ConnectivityChangeBackend;

export function createCapacitorConnectivityBackend(capacitor: CapacitorApi): CapacitorConnectivityBackend {
  const out = allocateEntity<CapacitorConnectivityBackend>();
  initializeCapacitorConnectivityBackend(out, capacitor);
  return finishEntity(out);
}

// Capacitor's async getStatus cannot truthfully fill a synchronous snapshot during construction, so
// the mirror starts UNKNOWN (`online: null`) rather than making an unmeasured offline claim. One native
// listener owns the mirror and fans out to every core entity; per-entity unsubscribe only leaves that
// local subscriber set. Provider destroy owns the one native handle.
export function initializeCapacitorConnectivityBackend(
  out: EntityConstruction<CapacitorConnectivityBackend>,
  capacitor: CapacitorApi,
): void {
  const network = capacitor.network;
  const subscribers = new Set<() => void>();
  const mirror = unknownStatus();
  let destroyed = false;
  let nativeChangeObserved = false;
  let handle: CapacitorPluginListenerHandle | null = null;
  let handleRemoved = false;
  const removeHandle = () => {
    if (handle === null || handleRemoved) return;
    handleRemoved = true;
    void handle.remove().catch(() => {});
  };
  const notify = () => {
    for (const listener of [...subscribers]) listener();
  };
  const update = (status: CapacitorConnectionStatus) => {
    mirror.online = status.connected;
    mirror.type = toConnectionType(status.connectionType);
    mirror.metered = mirror.type === 'cellular';
  };
  // Register the event source before starting the initial query. If an event wins the race, its newer
  // state must not be overwritten by a late getStatus result captured before that event.
  network
    .addListener('networkStatusChange', (status) => {
      if (destroyed) return;
      nativeChangeObserved = true;
      update(status);
      notify();
    })
    .then((resolved) => {
      handle = resolved;
      if (destroyed) removeHandle();
    })
    .catch(() => {});
  network
    .getStatus()
    .then((status) => {
      if (destroyed || nativeChangeObserved) return;
      update(status);
      // Initial readiness is a real unknown→measured transition. Subscribers must see it so core can
      // emit online/offline truthfully instead of retaining its pre-ready baseline forever.
      notify();
    })
    .catch(() => {
      // Failure leaves the status unknown. Unknown means wait; it is not an offline observation.
    });
  out.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    subscribers.clear();
    removeHandle();
  };
  out.getStatus = (out) => {
    copyStatus(out, mirror);
    return out;
  };
  out.subscribe = (listener) => {
    if (destroyed) return null;
    subscribers.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      subscribers.delete(listener);
    };
  };
}

function copyStatus(out: ConnectivityStatus, source: Readonly<ConnectivityStatus>): void {
  out.online = source.online;
  out.type = source.type;
  out.downlink = source.downlink;
  out.downlinkMax = source.downlinkMax;
  out.effectiveType = source.effectiveType;
  out.rtt = source.rtt;
  out.saveData = source.saveData;
  out.metered = source.metered;
}

function unknownStatus(): ConnectivityStatus {
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

function toConnectionType(connectionType: string): ConnectivityConnectionType {
  if (connectionType === 'wifi') return 'wifi';
  if (connectionType === 'cellular') return 'cellular';
  if (connectionType === 'none') return 'none';
  return 'unknown';
}

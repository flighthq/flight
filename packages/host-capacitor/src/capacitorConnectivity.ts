import type {
  ConnectivityBackend,
  ConnectivityConnectionType,
  ConnectivityStatus,
  CapacitorApi,
  CapacitorConnectionStatus,
  CapacitorPluginListenerHandle,
} from '@flighthq/types';

// Maps Flight's ConnectivityBackend onto Capacitor's `@capacitor/network`. ConnectivityBackend.getStatus
// is a synchronous snapshot, whereas Capacitor's getStatus is async, so the adapter keeps a local mirror:
// it prefetches the status once and subscribes internally to `networkStatusChange` to keep the mirror
// current, then fills the caller's `out` from it (reporting the offline/unknown default until the first
// probe resolves). The public `subscribe` registers the caller's listener behind the same event. Capacitor
// reports only connectivity + a coarse type, so downlink/rtt and the other fine-grained fields report
// their -1 / '' sentinels; `metered` is derived (cellular or offline-save has no signal here).
export function createCapacitorConnectivityBackend(capacitor: CapacitorApi): ConnectivityBackend {
  const network = capacitor.network;
  // Local mirror of the last known status, filled into the caller's `out` on getStatus.
  let mirror: CapacitorConnectionStatus = { connected: false, connectionType: 'unknown' };
  network
    .getStatus()
    .then((status) => {
      mirror = status;
    })
    .catch(() => {
      /* leave the offline/unknown default */
    });
  network
    .addListener('networkStatusChange', (status) => {
      mirror = status;
    })
    .catch(() => {});
  return {
    getStatus(out: ConnectivityStatus): ConnectivityStatus {
      out.online = mirror.connected;
      out.type = toConnectionType(mirror.connectionType);
      out.downlink = -1;
      out.downlinkMax = -1;
      out.effectiveType = '';
      out.rtt = -1;
      out.saveData = false;
      out.metered = out.type === 'cellular';
      return out;
    },
    subscribe(listener) {
      return toUnsubscribe(network.addListener('networkStatusChange', () => listener()));
    },
  };
}

function toConnectionType(connectionType: string): ConnectivityConnectionType {
  if (connectionType === 'wifi') return 'wifi';
  if (connectionType === 'cellular') return 'cellular';
  if (connectionType === 'none') return 'none';
  return 'unknown';
}

// Bridges Capacitor's Promise<PluginListenerHandle> to Flight's synchronous unsubscribe: fire the
// registration, adopt the handle when it resolves, and remove it (immediately if already resolved).
function toUnsubscribe(handlePromise: Promise<CapacitorPluginListenerHandle>): () => void {
  let removed = false;
  let handle: CapacitorPluginListenerHandle | null = null;
  handlePromise
    .then((resolved) => {
      handle = resolved;
      if (removed) handle.remove().catch(() => {});
    })
    .catch(() => {});
  return () => {
    removed = true;
    if (handle !== null) handle.remove().catch(() => {});
  };
}

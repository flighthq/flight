import type {
  CapacitorApi,
  CapacitorPluginListenerHandle,
  CapacitorProtocolCapabilities,
  HostProtocolOpenCapability,
} from '@flighthq/types/contract';

export function capacitorHostProtocol(capacitor: CapacitorApi): CapacitorProtocolCapabilities {
  const openBackend = {} as HostProtocolOpenCapability;
  openBackend.subscribe = (listener: (url: string) => void) => {
    return toCapacitorUnsubscribe(capacitor.app.addListener('appUrlOpen', (event) => listener(event.url)));
  };
  return Object.freeze({ open: openBackend });
}

export function capacitorHostProtocolOpen(capacitor: CapacitorApi): HostProtocolOpenCapability {
  return capacitorHostProtocol(capacitor).open;
}

function toCapacitorUnsubscribe(handlePromise: Promise<CapacitorPluginListenerHandle>): () => void {
  let removed = false;
  let handle: CapacitorPluginListenerHandle | null = null;
  void handlePromise
    .then((resolved) => {
      handle = resolved;
      if (removed) void handle.remove().catch(() => {});
    })
    .catch(() => {});
  return () => {
    removed = true;
    if (handle !== null) void handle.remove().catch(() => {});
  };
}

import { createEntity } from '@flighthq/entity/contract';
import type { CapacitorApi, CapacitorPluginListenerHandle, HostProtocolCapabilities } from '@flighthq/types/contract';

export type CapacitorProtocolCapabilities = Required<Pick<HostProtocolCapabilities, 'open'>>;

export function createCapacitorProtocolCapabilities(capacitor: CapacitorApi): CapacitorProtocolCapabilities {
  return {
    open: createEntity({
      subscribe: (listener: (url: string) => void) => {
        return toCapacitorUnsubscribe(capacitor.app.addListener('appUrlOpen', (event) => listener(event.url)));
      },
    }),
  };
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

import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorPluginListenerHandle,
  CapacitorProtocolCapabilities,
} from '@flighthq/types/contract';

export function createCapacitorProtocolCapabilities(capacitor: CapacitorApi): CapacitorProtocolCapabilities {
    const out = allocateEntity<CapacitorProtocolCapabilities>();
  out.open = createEntity({
      subscribe: (listener: (url: string) => void) => {
        return toCapacitorUnsubscribe(capacitor.app.addListener('appUrlOpen', (event) => listener(event.url)));
      },
    });
  return finishEntity(out);
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

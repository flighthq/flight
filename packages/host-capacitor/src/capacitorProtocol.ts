import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorPluginListenerHandle,
  CapacitorProtocolCapabilities,
  EntityConstruction,
  ProtocolOpenBackend,
} from '@flighthq/types/contract';

export function createCapacitorProtocolCapabilities(capacitor: CapacitorApi): CapacitorProtocolCapabilities {
  const out = allocateEntity<CapacitorProtocolCapabilities>();
  initializeCapacitorProtocolCapabilities(out, capacitor);
  return finishEntity(out);
}

export function initializeCapacitorProtocolCapabilities(
  out: EntityConstruction<CapacitorProtocolCapabilities>,
  capacitor: CapacitorApi,
): void {
  const openBackend = allocateEntity<ProtocolOpenBackend>();
  openBackend.subscribe = (listener: (url: string) => void) => {
    return toCapacitorUnsubscribe(capacitor.app.addListener('appUrlOpen', (event) => listener(event.url)));
  };
  out.open = finishEntity(openBackend);
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

import { createEntity } from '@flighthq/entity/contract';
import type {
  PermissionState,
  StoragePersistenceResult,
  WebWindowStoragePersistenceApi,
  WebWindowStoragePersistenceCapabilities,
  WebWorkerStoragePersistenceApi,
  WebWorkerStoragePersistenceCapabilities,
} from '@flighthq/types/contract';

export function createWebWindowStoragePersistenceCapabilities(
  api: Readonly<WebWindowStoragePersistenceApi>,
): WebWindowStoragePersistenceCapabilities {
  const persistenceRequest = createEntity({
    async requestPersistence(): Promise<StoragePersistenceResult> {
      const outcome = await observePersistenceOutcome(() => api.persist());
      const permissionState = await observePermissionState(() => api.getPermissionState());
      return { outcome, permissionState };
    },
  });
  const capabilities = createEntity({
    persistenceQuery: createPersistenceQueryBackend(api),
    persistenceRequest,
  });
  return capabilities;
}

export function createWebWorkerStoragePersistenceCapabilities(
  api: Readonly<WebWorkerStoragePersistenceApi>,
): WebWorkerStoragePersistenceCapabilities {
  const capabilities = createEntity({ persistenceQuery: createPersistenceQueryBackend(api) });
  return capabilities;
}

function createPersistenceQueryBackend(api: Readonly<WebWorkerStoragePersistenceApi>) {
  const backend = createEntity({
    async getPersistence(): Promise<StoragePersistenceResult> {
      const outcome = await observePersistenceOutcome(() => api.persisted());
      const permissionState = await observePermissionState(() => api.getPermissionState());
      return { outcome, permissionState };
    },
  });
  return backend;
}

async function observePermissionState(getPermissionState: () => Promise<PermissionState>) {
  try {
    const state = await getPermissionState();
    return state === 'denied' || state === 'granted' || state === 'prompt' ? state : null;
  } catch {
    return null;
  }
}

async function observePersistenceOutcome(operation: () => Promise<boolean>) {
  try {
    return (await operation()) ? ('persistent' as const) : ('best-effort' as const);
  } catch {
    return 'operation-failed' as const;
  }
}

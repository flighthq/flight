import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
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
  const persistenceRequest = allocateEntity<WebWindowStoragePersistenceCapabilities>();
  persistenceRequest.requestPersistence = async (): Promise<StoragePersistenceResult> => {
      const outcome = await observePersistenceOutcome(() => api.persist());
      const permissionState = await observePermissionState(() => api.getPermissionState());
      return { outcome, permissionState };
    };
  const capabilities = (() => {
    const out = allocateEntity<WebWindowStoragePersistenceCapabilities>();
    out.persistenceQuery = createPersistenceQueryBackend(api);
    out.persistenceRequest = persistenceRequest;
    return finishEntity(out);
  })();
  return capabilities;
}

export function createWebWorkerStoragePersistenceCapabilities(
  api: Readonly<WebWorkerStoragePersistenceApi>,
): WebWorkerStoragePersistenceCapabilities {
  const capabilities = allocateEntity<WebWindowStoragePersistenceCapabilities>();
  capabilities.persistenceQuery = createPersistenceQueryBackend(api);
  return capabilities;
}

function createPersistenceQueryBackend(api: Readonly<WebWorkerStoragePersistenceApi>) {
  const backend = allocateEntity<WebWindowStoragePersistenceCapabilities>();
  backend.getPersistence = async (): Promise<StoragePersistenceResult> => {
      const outcome = await observePersistenceOutcome(() => api.persisted());
      const permissionState = await observePermissionState(() => api.getPermissionState());
      return { outcome, permissionState };
    };
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

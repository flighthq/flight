import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  PermissionState,
  HostStoragePersistenceQueryProvider,
  HostStoragePersistenceRequestProvider,
  StoragePersistenceResult,
  WebWindowStoragePersistenceApi,
  WebWindowStoragePersistenceCapabilities,
  WebWorkerStoragePersistenceApi,
  WebWorkerStoragePersistenceCapabilities,
  EntityConstruction,
} from '@flighthq/types/contract';

export function createWebWindowStoragePersistenceCapabilities(
  api: Readonly<WebWindowStoragePersistenceApi>,
): WebWindowStoragePersistenceCapabilities {
  const persistenceRequest = allocateEntity<HostStoragePersistenceRequestProvider>();
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
  const capabilities = allocateEntity<WebWorkerStoragePersistenceCapabilities>();
  initializeWebWorkerStoragePersistenceCapabilities(capabilities, api);
  return capabilities;
}

export function initializeWebWorkerStoragePersistenceCapabilities(
  capabilities: EntityConstruction<WebWorkerStoragePersistenceCapabilities>,
  api: Readonly<WebWorkerStoragePersistenceApi>,
): void {
  capabilities.persistenceQuery = createPersistenceQueryBackend(api);
}

function createPersistenceQueryBackend(api: Readonly<WebWorkerStoragePersistenceApi>) {
  const backend = allocateEntity<HostStoragePersistenceQueryProvider>();
  backend.getPersistence = async (): Promise<StoragePersistenceResult> => {
    const outcome = await observePersistenceOutcome(() => api.persisted());
    const permissionState = await observePermissionState(() => api.getPermissionState());
    return { outcome, permissionState };
  };
  return backend;
}

const webWindowStoragePersistenceCapabilities = createWebWindowStoragePersistenceCapabilities({
  async getPermissionState() {
    const status = await navigator.permissions.query({ name: 'persistent-storage' as PermissionName });
    return status.state;
  },
  async persist() {
    return navigator.storage.persist();
  },
  async persisted() {
    return navigator.storage.persisted();
  },
});

export const webHostStoragePersistenceQuery = webWindowStoragePersistenceCapabilities.persistenceQuery;
export const webHostStoragePersistenceRequest = webWindowStoragePersistenceCapabilities.persistenceRequest;

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

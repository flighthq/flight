import type {
  HostPreferencesPersistenceQueryCapability,
  NonEntityCreateResult,
  PermissionState,
  StoragePersistenceOutcome,
  WebWindowStoragePersistenceApi,
  WebWindowStoragePersistenceCapabilities,
  WebWorkerStoragePersistenceApi,
  WebWorkerStoragePersistenceCapabilities,
} from '@flighthq/types/contract';

export function createWebWindowStoragePersistenceCapabilities(
  api: Readonly<WebWindowStoragePersistenceApi>,
): NonEntityCreateResult<WebWindowStoragePersistenceCapabilities, 'descriptor'> {
  return Object.freeze({
    persistenceQuery: createPersistenceQueryBackend(api),
    persistenceRequest: {
      async requestPersistence(): Promise<StoragePersistenceOutcome> {
        const outcome = await observePersistenceOutcome(() => api.persist());
        const permissionState = await observePermissionState(() => api.getPermissionState());
        return { outcome, permissionState };
      },
    },
  });
}

export function createWebWorkerStoragePersistenceCapabilities(
  api: Readonly<WebWorkerStoragePersistenceApi>,
): NonEntityCreateResult<WebWorkerStoragePersistenceCapabilities, 'descriptor'> {
  return Object.freeze({
    persistenceQuery: createPersistenceQueryBackend(api),
  });
}

function createPersistenceQueryBackend(
  api: Readonly<WebWorkerStoragePersistenceApi>,
): HostPreferencesPersistenceQueryCapability {
  return {
    async getPersistence(): Promise<StoragePersistenceOutcome> {
      const outcome = await observePersistenceOutcome(() => api.persisted());
      const permissionState = await observePermissionState(() => api.getPermissionState());
      return { outcome, permissionState };
    },
  };
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

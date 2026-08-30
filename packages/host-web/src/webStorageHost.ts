import { createHost } from '@flighthq/entity/contract';

import { webFileSystemBackend } from './webFilesystem';
import { webStorageBackend } from './webStorage';
import { createWebWindowStoragePersistenceCapabilities } from './webStoragePersistence';

const webStoragePersistenceCapabilities = createWebWindowStoragePersistenceCapabilities({
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

export const webStorageHost = createHost({
  storage: {
    change: webStorageBackend,
    fileSystem: webFileSystemBackend,
    local: webStorageBackend,
    persistenceQuery: webStoragePersistenceCapabilities.persistenceQuery,
    persistenceRequest: webStoragePersistenceCapabilities.persistenceRequest,
  },
});

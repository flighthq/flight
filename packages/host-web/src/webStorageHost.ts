import { createHost } from '@flighthq/entity/contract';
import type { HostStorageCapabilities } from '@flighthq/types/contract';

import { webHostFileSystem } from './webFilesystem';
import { webHostStorage, webHostStorageChange } from './webStorage';
import { webHostStoragePersistenceQuery, webHostStoragePersistenceRequest } from './webStoragePersistence';

export const webHostStorageGroup = {
  change: webHostStorageChange,
  fileSystem: webHostFileSystem,
  local: webHostStorage,
  persistenceQuery: webHostStoragePersistenceQuery,
  persistenceRequest: webHostStoragePersistenceRequest,
} satisfies HostStorageCapabilities;

export const webStorageHost = /* @__PURE__ */ createHost({ storage: webHostStorageGroup });

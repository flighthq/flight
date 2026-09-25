import type { HostPreferencesCapabilities } from '@flighthq/types/contract';

import { webHostStorage, webHostStorageChange } from './webStorage.ts';
import { webHostStoragePersistenceQuery, webHostStoragePersistenceRequest } from './webStoragePersistence.ts';

export const webHostPreferences = {
  change: webHostStorageChange,
  local: webHostStorage,
  persistenceQuery: webHostStoragePersistenceQuery,
  persistenceRequest: webHostStoragePersistenceRequest,
} satisfies HostPreferencesCapabilities;

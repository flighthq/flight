import type { HostPreferencesCapabilities } from '@flighthq/types/contract';

import { webHostStorage, webHostStorageChange } from './webStorage';
import { webHostStoragePersistenceQuery, webHostStoragePersistenceRequest } from './webStoragePersistence';

export const webHostPreferences = {
  change: webHostStorageChange,
  local: webHostStorage,
  persistenceQuery: webHostStoragePersistenceQuery,
  persistenceRequest: webHostStoragePersistenceRequest,
} satisfies HostPreferencesCapabilities;

import type {
  HostPreferencesPersistenceQueryCapability,
  HostPreferencesPersistenceRequestCapability,
  StoragePersistenceResult,
} from '@flighthq/types/contract';

export function getStoragePersistence(
  hostPreferencesPersistenceQuery: Readonly<HostPreferencesPersistenceQueryCapability>,
): Promise<StoragePersistenceResult> {
  const backend = hostPreferencesPersistenceQuery;
  return backend.getPersistence();
}

export function requestStoragePersistence(
  hostPreferencesPersistenceRequest: Readonly<HostPreferencesPersistenceRequestCapability>,
): Promise<StoragePersistenceResult> {
  const backend = hostPreferencesPersistenceRequest;
  return backend.requestPersistence();
}

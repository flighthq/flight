import type {
  HostPreferencesPersistenceQueryCapability,
  HostPreferencesPersistenceRequestCapability,
  StoragePersistenceResult,
} from '@flighthq/types/contract';

export function getStoragePersistence(
  hostStoragePersistenceQuery: Readonly<HostPreferencesPersistenceQueryCapability>,
): Promise<StoragePersistenceResult> {
  const backend = hostStoragePersistenceQuery;
  return backend.getPersistence();
}

export function requestStoragePersistence(
  hostStoragePersistenceRequest: Readonly<HostPreferencesPersistenceRequestCapability>,
): Promise<StoragePersistenceResult> {
  const backend = hostStoragePersistenceRequest;
  return backend.requestPersistence();
}

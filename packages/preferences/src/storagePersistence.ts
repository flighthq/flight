import type {
  HostStoragePersistenceQueryCapability,
  HostStoragePersistenceRequestCapability,
  StoragePersistenceResult,
} from '@flighthq/types/contract';

export function getStoragePersistence(
  hostStoragePersistenceQuery: Readonly<HostStoragePersistenceQueryCapability>,
): Promise<StoragePersistenceResult> {
  const backend = hostStoragePersistenceQuery;
  return backend.getPersistence();
}

export function requestStoragePersistence(
  hostStoragePersistenceRequest: Readonly<HostStoragePersistenceRequestCapability>,
): Promise<StoragePersistenceResult> {
  const backend = hostStoragePersistenceRequest;
  return backend.requestPersistence();
}

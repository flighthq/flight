import type {
  HostStoragePersistenceQueryProvider,
  HostStoragePersistenceRequestProvider,
  StoragePersistenceResult,
} from '@flighthq/types/contract';

export function getStoragePersistence(
  hostStoragePersistenceQuery: Readonly<HostStoragePersistenceQueryProvider>,
): Promise<StoragePersistenceResult> {
  const backend = hostStoragePersistenceQuery;
  return backend.getPersistence();
}

export function requestStoragePersistence(
  hostStoragePersistenceRequest: Readonly<HostStoragePersistenceRequestProvider>,
): Promise<StoragePersistenceResult> {
  const backend = hostStoragePersistenceRequest;
  return backend.requestPersistence();
}

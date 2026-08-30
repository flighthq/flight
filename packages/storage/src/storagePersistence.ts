import type {
  HasStoragePersistenceQuery,
  HasStoragePersistenceRequest,
  StoragePersistenceResult,
} from '@flighthq/types/contract';

export function getStoragePersistence(host: HasStoragePersistenceQuery): Promise<StoragePersistenceResult> {
  const backend = host.storage.persistenceQuery;
  return backend.getPersistence();
}

export function requestStoragePersistence(host: HasStoragePersistenceRequest): Promise<StoragePersistenceResult> {
  const backend = host.storage.persistenceRequest;
  return backend.requestPersistence();
}

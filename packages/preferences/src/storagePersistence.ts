import type {
  HostPreferencesPersistenceQueryCapability,
  HostPreferencesPersistenceRequestCapability,
  StoragePersistenceOutcome,
} from '@flighthq/types/contract';

export function getStoragePersistence(
  hostPreferencesPersistenceQuery: Readonly<HostPreferencesPersistenceQueryCapability>,
): Promise<StoragePersistenceOutcome> {
  const backend = hostPreferencesPersistenceQuery;
  return backend.getPersistence();
}

export function requestStoragePersistence(
  hostPreferencesPersistenceRequest: Readonly<HostPreferencesPersistenceRequestCapability>,
): Promise<StoragePersistenceOutcome> {
  const backend = hostPreferencesPersistenceRequest;
  return backend.requestPersistence();
}

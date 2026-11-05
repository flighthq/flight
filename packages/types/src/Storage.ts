import type { PermissionState } from './Permission.ts';

/** @deprecated Import preferences contracts from `@flighthq/preferences/contract`. */
export type {
  StorageClearFailureReason,
  StorageGetItemFailureReason,
  StorageKeysFailureReason,
  StorageRemoveItemFailureReason,
  StorageSetItemFailureReason,
  StorageReadFailureReason,
  StorageWriteFailureReason,
  StorageMutationOutcome,
  StorageClearResult,
  StorageRemoveItemResult,
  StorageSetItemResult,
  StorageJsonWriteResult,
  StorageValueOutcome,
  StorageGetItemResult,
  StorageKeysResult,
  StorageBooleanResult,
  StorageItemCountResult,
  StorageItemOrResult,
  StorageNumberResult,
  StoragePresenceResult,
  StorageFallbackOutcome,
  StorageBooleanOrResult,
  StorageJsonOrResult,
  StorageNumberOrResult,
  StorageJsonResult,
  StorageQueryOutcome,
  StorageByteSizeResult,
  StorageEntriesResult,
  StorageItemsResult,
  StorageBatchMutationOutcome,
  StorageClearNamespaceResult,
  StorageRemoveItemsResult,
  StorageSetItemsResult,
  HostPreferencesCapability,
  HostPreferencesChangeCapability,
  StorageChange,
  StorageMigration,
  StorageMigrationOutcome,
  StorageNamespace,
  StorageSignals,
} from '@flighthq/preferences/contract';

export interface StoragePersistenceOutcome {
  readonly outcome: 'persistent' | 'best-effort' | 'operation-failed';
  readonly permissionState: PermissionState | null;
}
export interface HostPreferencesPersistenceQueryCapability {
  getPersistence(): Promise<StoragePersistenceOutcome>;
}
export interface HostPreferencesPersistenceRequestCapability {
  requestPersistence(): Promise<StoragePersistenceOutcome>;
}

// Injected Web surfaces keep platform access at the host composition boundary. Window adds persist();
// Worker intentionally cannot manufacture the request slot.
export interface WebWorkerStoragePersistenceApi {
  getPermissionState(): Promise<PermissionState>;
  persisted(): Promise<boolean>;
}
export interface WebWindowStoragePersistenceApi extends WebWorkerStoragePersistenceApi {
  persist(): Promise<boolean>;
}
export interface WebWorkerStoragePersistenceCapabilities {
  readonly persistenceQuery: HostPreferencesPersistenceQueryCapability;
}
export interface WebWindowStoragePersistenceCapabilities {
  readonly persistenceQuery: HostPreferencesPersistenceQueryCapability;
  readonly persistenceRequest: HostPreferencesPersistenceRequestCapability;
}

// Multi-key queries return no partial payload: the first failed provider read identifies its key, while
// a keys-enumeration failure has failedKey null. This differs deliberately from mutations, whose already
// completed writes are world state and therefore must be reported rather than hidden.

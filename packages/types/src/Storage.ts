import type { Entity } from './Entity';
import type { Signal } from './Signal';

export type StorageClearFailureReason = 'runtime-unavailable' | 'security-denied' | 'quota-exceeded' | 'clear-failed';

export type StorageGetItemFailureReason =
  | 'runtime-unavailable'
  | 'security-denied'
  | 'persistence-invalid'
  | 'read-failed';

export type StorageKeysFailureReason = StorageGetItemFailureReason;

export type StorageRemoveItemFailureReason = StorageGetItemFailureReason | 'quota-exceeded' | 'remove-failed';

export type StorageSetItemFailureReason = StorageGetItemFailureReason | 'quota-exceeded' | 'write-failed';

export type StorageReadFailureReason = StorageGetItemFailureReason | 'parse-failed';
export type StorageWriteFailureReason = StorageSetItemFailureReason | 'serialization-failed';

// Every mutation result carries `reason`; there is no parallel `ok` flag. `reason: 'ok'` means the
// resulting value is atomically visible through the provider and any provider cache now reflects that
// visible value. It does NOT promise that bytes were fsynced or would survive sudden power loss.
export type StorageMutationResult<FailureReason extends string> =
  | { readonly reason: 'ok' }
  | { readonly reason: FailureReason };

export type StorageClearResult = StorageMutationResult<StorageClearFailureReason>;
export type StorageRemoveItemResult = StorageMutationResult<StorageRemoveItemFailureReason>;
export type StorageSetItemResult = StorageMutationResult<StorageSetItemFailureReason>;
export type StorageJsonWriteResult = StorageMutationResult<StorageWriteFailureReason>;

// A successful value may itself be null: getItem uses null for an ordinary missing key. Provider
// failure also carries a null payload, but its non-ok reason keeps the two states unambiguous.
export type StorageValueResult<Value, FailureReason extends string> =
  | { readonly reason: 'ok'; readonly value: Value }
  | { readonly reason: FailureReason; readonly value: null };

export type StorageGetItemResult = StorageValueResult<string | null, StorageGetItemFailureReason>;
export type StorageKeysResult = StorageValueResult<readonly string[], StorageKeysFailureReason>;
export type StorageBooleanResult = StorageValueResult<boolean | null, StorageReadFailureReason>;
export type StorageItemCountResult = StorageValueResult<number, StorageKeysFailureReason>;
export type StorageItemOrResult = StorageValueResult<string, StorageGetItemFailureReason>;
export type StorageNumberResult = StorageValueResult<number | null, StorageReadFailureReason>;
export type StoragePresenceResult = StorageValueResult<boolean, StorageGetItemFailureReason>;

// Fallback reads retain a decode failure in `reason` while returning the requested fallback. Provider
// failure never substitutes a fallback and therefore keeps a null payload.
export type StorageFallbackResult<Value> =
  | { readonly reason: 'ok' | 'parse-failed'; readonly value: Value }
  | { readonly reason: StorageGetItemFailureReason; readonly value: null };

export type StorageBooleanOrResult = StorageFallbackResult<boolean>;
export type StorageJsonOrResult<Value> = StorageFallbackResult<Value | null>;
export type StorageNumberOrResult = StorageFallbackResult<number>;

export type StorageJsonResult<Value> = StorageValueResult<Value | null, StorageReadFailureReason>;

// Multi-key queries return no partial payload: the first failed provider read identifies its key, while
// a keys-enumeration failure has failedKey null. This differs deliberately from mutations, whose already
// completed writes are world state and therefore must be reported rather than hidden.
export type StorageQueryResult<Value> =
  | { readonly failedKey: null; readonly reason: 'ok'; readonly value: Value }
  | {
      readonly failedKey: string | null;
      readonly reason: StorageGetItemFailureReason;
      readonly value: null;
    };

export type StorageByteSizeResult = StorageQueryResult<number>;
export type StorageEntriesResult = StorageQueryResult<readonly (readonly [string, string])[]>;
export type StorageItemsResult = StorageQueryResult<readonly (string | null)[]>;

// Mutations stop at the first failed key. `completed` exposes prior successful writes because they are
// already externally visible and cannot truthfully be represented as an all-or-nothing failure.
export type StorageBatchMutationResult<FailureReason extends string> =
  | { readonly completed: number; readonly failedKey: null; readonly reason: 'ok' }
  | { readonly completed: number; readonly failedKey: string | null; readonly reason: FailureReason };

export type StorageClearNamespaceResult = StorageBatchMutationResult<
  StorageKeysFailureReason | StorageRemoveItemFailureReason
>;
export type StorageRemoveItemsResult = StorageBatchMutationResult<StorageRemoveItemFailureReason>;
export type StorageSetItemsResult = StorageBatchMutationResult<StorageSetItemFailureReason>;

// Key/value persistence commands. Absence is a successful getItem result whose value is null; callers
// inspect reason rather than guessing whether a sentinel came from missing data or provider failure.
export interface StorageBackend extends Entity {
  clear(): StorageClearResult;
  getItem(key: string): StorageGetItemResult;
  keys(): StorageKeysResult;
  removeItem(key: string): StorageRemoveItemResult;
  setItem(key: string, value: string): StorageSetItemResult;
}

// Raw provider change delivery is separate from local commands because only Web supplies it. Provider
// destroy is terminal; the unsubscribe returned by subscribe releases one caller-owned subscription.
export interface StorageChangeBackend extends Entity {
  destroy(): void;
  subscribe(listener: (change: Readonly<StorageChange>) => void): (() => void) | null;
}

// A single observed storage mutation. A null key with all-null values denotes a full clear.
export interface StorageChange {
  key: string | null;
  newValue: string | null;
  oldValue: string | null;
}

// One versioned migration step. Callbacks may mutate storage and therefore must be idempotent: a failed
// checkpoint leaves callback effects visible and replays that version on the next attempt. There is no
// rollback or exactly-once guarantee.
export interface StorageMigration {
  migrate(prefix: string | null): void;
  version: number;
}

export type StorageMigrationResult =
  | { readonly failedVersion: null; readonly reason: 'ok'; readonly stage: null; readonly version: number }
  | {
      readonly failedVersion: null;
      readonly reason: StorageGetItemFailureReason | 'version-parse-failed';
      readonly stage: 'read-version';
      readonly version: null;
    }
  | {
      readonly failedVersion: number;
      readonly reason: StorageSetItemFailureReason;
      readonly stage: 'checkpoint';
      readonly version: number;
    };

// A prefix-scoped view into the keyspace. Keys are stored as `prefix + '.' + key`. This is a plain
// descriptor supplied structurally by callers, not an identity-bearing object with a create function.
export interface StorageNamespace {
  prefix: string;
}

// Caller-owned core event entity. attachStorage optionally adds raw cross-origin/provider delivery;
// same-tab mutations emit only when this entity is passed explicitly to the mutation operation.
export interface StorageSignals extends Entity {
  onChange: Signal<(change: Readonly<StorageChange>) => void>;
}

import type { Signal } from './Signal';

// Key/value persistence seam. Free functions in @flighthq/storage delegate to the active
// StorageBackend (web localStorage default or a native host's). Storage is a synchronous capability —
// localStorage is sync — so these return values directly rather than Promises. Writes resolve to false
// when the host denies or lacks access (private mode, quota) rather than throwing; reads return null.
export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  removeItem(key: string): boolean;
  clear(): boolean;
  keys(): string[];
  // Optional fast path for the total UTF-16 byte cost of the store. Returns -1 on denial.
  // When absent, @flighthq/storage enumerates entries to compute the size.
  byteSize?(): number;
  // Optional change-notification seam (cross-tab on the web backend). Returns an unsubscribe
  // function. Present only on backends that can observe external mutations.
  subscribeChanges?(listener: (change: Readonly<StorageChange>) => void): () => void;
}

// A single observed storage mutation. A null key with all-null values denotes a full clear.
export interface StorageChange {
  key: string | null;
  newValue: string | null;
  oldValue: string | null;
}

// One versioned migration step. `migrate` receives the namespace prefix it runs under, or null for
// the global keyspace. Migrations run in ascending version order, skipping any at or below the
// stored version.
export interface StorageMigration {
  migrate(prefix: string | null): void;
  version: number;
}

// A prefix-scoped view into the keyspace. Keys are stored as `prefix + '.' + key`.
export interface StorageNamespace {
  prefix: string;
}

// Best-effort storage usage estimate, in bytes. Fields are -1 when unknown.
export interface StorageQuota {
  available: number;
  used: number;
}

// The storage change-notification group, enabled via enableStorageSignals.
export interface StorageSignals {
  onChange: Signal<(change: Readonly<StorageChange>) => void>;
}

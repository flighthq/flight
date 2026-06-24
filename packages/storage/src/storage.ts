import { createSignal, disconnectAllSlots } from '@flighthq/signals';
import type {
  StorageBackend,
  StorageChange,
  StorageMigration,
  StorageNamespace,
  StorageQuota,
  StorageSignals,
} from '@flighthq/types';

// Removes every key. Returns false when the host denies access. Sentinel, not throw.
export function clearStorage(): boolean {
  const result = getStorageBackend().clear();
  if (_signalsActive && result) {
    _emitStorageChange({ key: null, oldValue: null, newValue: null });
  }
  return result;
}

// Removes all keys under the namespace without touching other keys. Returns false on denial.
export function clearStorageNamespace(namespace: Readonly<StorageNamespace>): boolean {
  const prefix = namespace.prefix + '.';
  const keys = getStorageBackend()
    .keys()
    .filter((k) => k.startsWith(prefix));
  let success = true;
  for (const key of keys) {
    if (!getStorageBackend().removeItem(key)) success = false;
  }
  return success;
}

// Creates a prefix-scoped view into the keyspace. Keys under the namespace are stored as
// `prefix + '.' + key` and never collide with the global keyspace or other namespaces.
export function createStorageNamespace(prefix: string): StorageNamespace {
  return { prefix };
}

// Builds the default web backend over window.localStorage. Every call is guarded with try/catch:
// localStorage access can throw in private mode or when storage is disabled. Writes return false and
// reads return null / [] on failure rather than throwing — storage is an expected-failure surface.
export function createWebStorageBackend(): StorageBackend {
  return {
    getItem(key) {
      const ls = getWebStorage();
      if (ls === null) return null;
      try {
        return ls.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      const ls = getWebStorage();
      if (ls === null) return false;
      try {
        ls.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    removeItem(key) {
      const ls = getWebStorage();
      if (ls === null) return false;
      try {
        ls.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      const ls = getWebStorage();
      if (ls === null) return false;
      try {
        ls.clear();
        return true;
      } catch {
        return false;
      }
    },
    keys() {
      const ls = getWebStorage();
      if (ls === null) return [];
      try {
        const out: string[] = [];
        for (let i = 0; i < ls.length; i += 1) {
          const key = ls.key(i);
          if (key !== null) out.push(key);
        }
        return out;
      } catch {
        return [];
      }
    },
    subscribeChanges(listener) {
      if (typeof window === 'undefined') return () => {};
      const handler = (event: StorageEvent) => {
        listener({ key: event.key, oldValue: event.oldValue, newValue: event.newValue });
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
  };
}

// Stops the storage change-notification group. Removes the DOM storage listener and disconnects
// all listeners. Pair with enableStorageSignals.
export function disableStorageSignals(): void {
  if (!_signalsActive) return;
  _signalsActive = false;
  if (_crossTabUnsubscribe !== null) {
    _crossTabUnsubscribe();
    _crossTabUnsubscribe = null;
  }
  if (_signals !== null) {
    disconnectAllSlots(_signals.onChange);
    _signals = null;
  }
}

// Starts the storage change-notification group, wiring cross-tab DOM storage events and enabling
// same-tab emission for write operations. Idempotent: calling again while already enabled returns
// the existing signals object. Pair with disableStorageSignals.
export function enableStorageSignals(): StorageSignals {
  if (_signalsActive && _signals !== null) return _signals;
  _signals = { onChange: createSignal() };
  _signalsActive = true;
  const backend = getStorageBackend();
  if (backend.subscribeChanges !== undefined) {
    _crossTabUnsubscribe = backend.subscribeChanges((change) => {
      _emitStorageChange(change);
    });
  }
  return _signals;
}

// Returns the estimated UTF-16 byte cost of all keys under the namespace. Returns -1 on denial.
export function getNamespacedStorageByteSize(namespace: Readonly<StorageNamespace>): number {
  const prefix = namespace.prefix + '.';
  const backend = getStorageBackend();
  const keys = backend.keys();
  if (keys.length === 0) return 0;
  let total = 0;
  for (const rawKey of keys) {
    if (!rawKey.startsWith(prefix)) continue;
    const value = backend.getItem(rawKey);
    if (value === null) continue;
    total += (rawKey.length + value.length) * 2;
  }
  return total;
}

// Returns all key/value pairs under the given namespace prefix. Keys returned are unprefixed.
// Returns [] on denial.
export function getNamespacedStorageEntries(
  namespace: Readonly<StorageNamespace>,
): readonly (readonly [string, string])[] {
  const prefix = namespace.prefix + '.';
  const backend = getStorageBackend();
  const keys = backend.keys();
  const out: [string, string][] = [];
  for (const rawKey of keys) {
    if (!rawKey.startsWith(prefix)) continue;
    const key = rawKey.slice(prefix.length);
    const value = backend.getItem(rawKey);
    if (value !== null) out.push([key, value]);
  }
  return out;
}

// Reads a value from the namespace. Returns null on absent key or access denial.
export function getNamespacedStorageItem(namespace: Readonly<StorageNamespace>, key: string): string | null {
  return getStorageBackend().getItem(_namespacedKey(namespace, key));
}

// Returns every key stored under the namespace (unprefixed). Returns [] on denial.
export function getNamespacedStorageKeys(namespace: Readonly<StorageNamespace>): string[] {
  const prefix = namespace.prefix + '.';
  const out: string[] = [];
  for (const rawKey of getStorageBackend().keys()) {
    if (rawKey.startsWith(prefix)) out.push(rawKey.slice(prefix.length));
  }
  return out;
}

// The active storage backend, or a lazily-created web default. There is always a backend.
export function getStorageBackend(): StorageBackend {
  if (_backend === null) _backend = createWebStorageBackend();
  return _backend;
}

// Reads the stored value as a stored boolean ('true'/'false'). Returns null on absent key,
// access denial, or unrecognized value.
export function getStorageBoolean(key: string): boolean | null {
  const raw = getStorageBackend().getItem(key);
  if (raw === null) return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

// Returns the stored boolean, or `fallback` on absent key, access denial, or unrecognized value.
export function getStorageBooleanOr(key: string, fallback: boolean): boolean {
  return getStorageBoolean(key) ?? fallback;
}

// Returns the estimated UTF-16 byte cost of the entire store. Delegates to the backend's
// byteSize() when available; otherwise enumerates entries. Returns -1 on denial.
export function getStorageByteSize(): number {
  const backend = getStorageBackend();
  if (backend.byteSize !== undefined) return backend.byteSize();
  const keys = backend.keys();
  if (keys.length === 0) return 0;
  let total = 0;
  for (const key of keys) {
    const value = backend.getItem(key);
    if (value === null) continue;
    // localStorage stores strings as UTF-16: each code unit is 2 bytes.
    total += (key.length + value.length) * 2;
  }
  return total;
}

// Returns all key/value pairs in one pass. Skips keys whose value is null (concurrent removal).
// Returns [] on denial.
export function getStorageEntries(): readonly (readonly [string, string])[] {
  const backend = getStorageBackend();
  const keys = backend.keys();
  const out: [string, string][] = [];
  for (const key of keys) {
    const value = backend.getItem(key);
    if (value !== null) out.push([key, value]);
  }
  return out;
}

// Reads a stored value, or null when the key is absent or access is denied.
export function getStorageItem(key: string): string | null {
  return getStorageBackend().getItem(key);
}

// Returns the number of stored keys. Returns 0 on denial.
export function getStorageItemCount(): number {
  return getStorageBackend().keys().length;
}

// Returns the stored value, or `fallback` when the key is absent or access is denied.
export function getStorageItemOr(key: string, fallback: string): string {
  return getStorageBackend().getItem(key) ?? fallback;
}

// Reads multiple keys in one call. Returns a parallel-indexed array with null for absent/denied
// keys. Returns [] when keys is empty.
export function getStorageItems(keys: readonly string[]): readonly (string | null)[] {
  const backend = getStorageBackend();
  const out: (string | null)[] = new Array(keys.length);
  for (let i = 0; i < keys.length; i += 1) {
    out[i] = backend.getItem(keys[i]);
  }
  return out;
}

// Reads and JSON.parses a stored value. Returns null on absent key, parse failure, or access
// denial — corrupt stored data is an expected-failure surface; do not throw.
export function getStorageJSON<T>(key: string): T | null {
  const raw = getStorageBackend().getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Returns the parsed stored value, or `fallback` on absent key, parse failure, or access denial.
export function getStorageJSONOr<T>(key: string, fallback: T): T {
  const raw = getStorageBackend().getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Returns every stored key, or [] when access is denied.
export function getStorageKeys(): string[] {
  return getStorageBackend().keys();
}

// Reads the stored value as a number. Returns null on absent key, access denial, or parse failure
// (NaN is treated as parse failure).
export function getStorageNumber(key: string): number | null {
  const raw = getStorageBackend().getItem(key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

// Returns the stored number, or `fallback` on absent key, access denial, or parse failure.
export function getStorageNumberOr(key: string, fallback: number): number {
  return getStorageNumber(key) ?? fallback;
}

// Returns the estimated storage quota from the web backend (navigator.storage.estimate), or null
// when unavailable. This is async on the browser; the result is best-effort and may be stale.
// Returns null when the API is absent or returns a denial.
export async function getStorageQuotaEstimate(): Promise<StorageQuota | null> {
  if (typeof navigator === 'undefined') return null;
  const storage = (
    navigator as Navigator & { storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> } }
  ).storage;
  if (storage?.estimate === undefined) return null;
  try {
    const estimate = await storage.estimate();
    const used = typeof estimate.usage === 'number' ? estimate.usage : -1;
    const available =
      typeof estimate.quota === 'number' && estimate.quota >= 0 ? estimate.quota - (used >= 0 ? used : 0) : -1;
    return { used, available };
  } catch {
    return null;
  }
}

// Returns the active StorageSignals, or null when signals have not been enabled.
export function getStorageSignals(): StorageSignals | null {
  return _signals;
}

// Returns true when the key exists in the namespace.
export function hasNamespacedStorageItem(namespace: Readonly<StorageNamespace>, key: string): boolean {
  return getStorageBackend().getItem(_namespacedKey(namespace, key)) !== null;
}

// Returns true when the key exists in the store.
export function hasStorageItem(key: string): boolean {
  return getStorageBackend().getItem(key) !== null;
}

// Applies a sequence of versioned migrations to the given namespace (or global keyspace when null).
// Migrations are run in ascending version order, starting from the stored version + 1. Stores the
// resulting version under the reserved key `__flight_storage_version` (namespaced or global).
// Returns the new version number, or -1 on failure.
export function migrateStorage(
  namespace: Readonly<StorageNamespace> | null,
  migrations: readonly Readonly<StorageMigration>[],
): number {
  const versionKey = '__flight_storage_version';
  const raw = namespace !== null ? getNamespacedStorageItem(namespace, versionKey) : getStorageItem(versionKey);
  const currentVersion = raw !== null ? parseInt(raw, 10) : 0;
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  let newVersion = currentVersion;
  for (const migration of sorted) {
    if (migration.version <= currentVersion) continue;
    try {
      migration.migrate(namespace?.prefix ?? null);
    } catch {
      return -1;
    }
    newVersion = migration.version;
  }
  if (newVersion !== currentVersion) {
    const stored =
      namespace !== null
        ? setNamespacedStorageItem(namespace, versionKey, String(newVersion))
        : setStorageItem(versionKey, String(newVersion));
    if (!stored) return -1;
  }
  return newVersion;
}

// Removes a key from the namespace. Returns false on denial.
export function removeNamespacedStorageItem(namespace: Readonly<StorageNamespace>, key: string): boolean {
  return getStorageBackend().removeItem(_namespacedKey(namespace, key));
}

// Removes one key. Returns false when the host denies access.
export function removeStorageItem(key: string): boolean {
  const oldValue = _signalsActive ? getStorageBackend().getItem(key) : null;
  const result = getStorageBackend().removeItem(key);
  if (_signalsActive && result) {
    _emitStorageChange({ key, oldValue, newValue: null });
  }
  return result;
}

// Removes multiple keys. Returns false if any removal fails; partial removals are possible.
export function removeStorageItems(keys: readonly string[]): boolean {
  const backend = getStorageBackend();
  let success = true;
  for (const key of keys) {
    if (!backend.removeItem(key)) success = false;
  }
  return success;
}

// Writes a namespaced value. Returns false on denial/quota.
export function setNamespacedStorageItem(namespace: Readonly<StorageNamespace>, key: string, value: string): boolean {
  return getStorageBackend().setItem(_namespacedKey(namespace, key), value);
}

// Installs a native host storage backend; pass null to fall back to the web default.
export function setStorageBackend(backend: StorageBackend | null): void {
  if (_signalsActive && _crossTabUnsubscribe !== null) {
    _crossTabUnsubscribe();
    _crossTabUnsubscribe = null;
  }
  _backend = backend;
  if (_signalsActive) {
    const b = getStorageBackend();
    if (b.subscribeChanges !== undefined) {
      _crossTabUnsubscribe = b.subscribeChanges((change) => {
        _emitStorageChange(change);
      });
    }
  }
}

// Writes a boolean as 'true' or 'false'. Returns false on denial/quota.
export function setStorageBoolean(key: string, value: boolean): boolean {
  return setStorageItem(key, value ? 'true' : 'false');
}

// Writes a value. Returns false when the host denies access (private mode, quota exceeded).
export function setStorageItem(key: string, value: string): boolean {
  const oldValue = _signalsActive ? getStorageBackend().getItem(key) : null;
  const result = getStorageBackend().setItem(key, value);
  if (_signalsActive && result) {
    _emitStorageChange({ key, oldValue, newValue: value });
  }
  return result;
}

// Writes multiple key/value pairs. Returns false if any write fails; partial writes are possible.
export function setStorageItems(record: Readonly<Record<string, string>>): boolean {
  const backend = getStorageBackend();
  let success = true;
  for (const key of Object.keys(record)) {
    if (!backend.setItem(key, record[key])) success = false;
  }
  return success;
}

// JSON.stringifies and stores a value. Returns false on denial/quota or if stringify fails
// (cyclic value). Corrupt data is an expected-failure surface; do not throw.
export function setStorageJSON<T>(key: string, value: T): boolean {
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch {
    return false;
  }
  return setStorageItem(key, raw);
}

// Writes a number. Returns false on denial/quota.
export function setStorageNumber(key: string, value: number): boolean {
  return setStorageItem(key, String(value));
}

let _backend: StorageBackend | null = null;
let _signals: StorageSignals | null = null;
let _signalsActive = false;
let _crossTabUnsubscribe: (() => void) | null = null;

function _emitStorageChange(change: Readonly<StorageChange>): void {
  if (_signals !== null) _signals.onChange.emit(change);
}

function _namespacedKey(namespace: Readonly<StorageNamespace>, key: string): string {
  return namespace.prefix + '.' + key;
}

function getWebStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal, hasSignalSlots } from '@flighthq/signals/contract';
import type {
  EntityConstruction,
  HasStorageChange,
  HasStorageLocal,
  StorageBackend,
  StorageBooleanOrResult,
  StorageBooleanResult,
  StorageByteSizeResult,
  StorageClearNamespaceResult,
  StorageClearResult,
  StorageEntriesResult,
  StorageGetItemResult,
  StorageItemCountResult,
  StorageItemOrResult,
  StorageItemsResult,
  StorageJsonOrResult,
  StorageJsonResult,
  StorageJsonWriteResult,
  StorageKeysResult,
  StorageMigration,
  StorageMigrationResult,
  StorageNamespace,
  StorageNumberOrResult,
  StorageNumberResult,
  StoragePresenceResult,
  StorageRemoveItemResult,
  StorageRemoveItemsResult,
  StorageSetItemResult,
  StorageSetItemsResult,
  StorageSignals,
} from '@flighthq/types/contract';

// Starts raw provider change delivery into the caller-owned signal entity. Re-attaching first consumes
// the exact unsubscribe returned by the prior provider, so a different Host can never redirect teardown.
// Returns false when the provider cannot establish a real subscription.
export function attachStorage(host: HasStorageChange, signals: StorageSignals): boolean {
  detachStorage(signals);
  const unsubscribe = host.storage.change.subscribe((change) => emitSignal(signals.onChange, change));
  if (unsubscribe === null) return false;
  _subscriptions.set(signals, unsubscribe);
  return true;
}

export function clearStorage(host: HasStorageLocal, signals: StorageSignals | null = null): StorageClearResult {
  const result = host.storage.local.clear();
  if (result.reason === 'ok' && storageSignalsActive(signals)) {
    emitSignal(signals.onChange, { key: null, newValue: null, oldValue: null });
  }
  return result;
}

export function clearStorageNamespace(
  host: HasStorageLocal,
  namespace: Readonly<StorageNamespace>,
  signals: StorageSignals | null = null,
): StorageClearNamespaceResult {
  const prefix = namespace.prefix + '.';
  const backend = host.storage.local;
  const keys = backend.keys();
  if (keys.reason !== 'ok') return { completed: 0, failedKey: null, reason: keys.reason };
  let completed = 0;
  for (const key of keys.value) {
    if (!key.startsWith(prefix)) continue;
    const result = removeStorageItemFromBackend(backend, key, signals);
    if (result.reason !== 'ok') return { completed, failedKey: key, reason: result.reason };
    completed++;
  }
  return { completed, failedKey: null, reason: 'ok' };
}

export function createStorageSignals(): StorageSignals {
  const out = allocateEntity<StorageSignals>();
  out.onChange = createSignal();
  return finishEntity(out);
}

// Terminal teardown of the Host's raw change provider. Per-entity detach is separate because one
// provider can fan out to more than one StorageSignals entity.
export function destroyStorage(host: HasStorageChange): void {
  host.storage.change.destroy();
}

export function detachStorage(signals: StorageSignals): void {
  const unsubscribe = _subscriptions.get(signals);
  if (unsubscribe === undefined) return;
  _subscriptions.delete(signals);
  unsubscribe();
}

export function disposeStorage(signals: StorageSignals): void {
  detachStorage(signals);
  clearSignal(signals.onChange);
}

export function getNamespacedStorageByteSize(
  host: HasStorageLocal,
  namespace: Readonly<StorageNamespace>,
): StorageByteSizeResult {
  return getStorageByteSizeForPrefix(host.storage.local, namespace.prefix + '.');
}

export function getNamespacedStorageEntries(
  host: HasStorageLocal,
  namespace: Readonly<StorageNamespace>,
): StorageEntriesResult {
  const prefix = namespace.prefix + '.';
  const result = getStorageEntriesForPrefix(host.storage.local, prefix);
  if (result.reason !== 'ok') return result;
  return {
    failedKey: null,
    reason: 'ok',
    value: result.value.map(([key, value]) => [key.slice(prefix.length), value] as const),
  };
}

export function getNamespacedStorageItem(
  host: HasStorageLocal,
  namespace: Readonly<StorageNamespace>,
  key: string,
): StorageGetItemResult {
  return host.storage.local.getItem(namespacedKey(namespace, key));
}

export function getNamespacedStorageItemPresence(
  host: HasStorageLocal,
  namespace: Readonly<StorageNamespace>,
  key: string,
): StoragePresenceResult {
  return getStorageItemPresence(host, namespacedKey(namespace, key));
}

export function getNamespacedStorageKeys(
  host: HasStorageLocal,
  namespace: Readonly<StorageNamespace>,
): StorageKeysResult {
  const prefix = namespace.prefix + '.';
  const result = host.storage.local.keys();
  if (result.reason !== 'ok') return result;
  return {
    reason: 'ok',
    value: result.value.filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)),
  };
}

export function getStorageBoolean(host: HasStorageLocal, key: string): StorageBooleanResult {
  const raw = host.storage.local.getItem(key);
  if (raw.reason !== 'ok') return raw;
  if (raw.value === null) return { reason: 'ok', value: null };
  if (raw.value === 'true') return { reason: 'ok', value: true };
  if (raw.value === 'false') return { reason: 'ok', value: false };
  return { reason: 'parse-failed', value: null };
}

export function getStorageBooleanOr(host: HasStorageLocal, key: string, fallback: boolean): StorageBooleanOrResult {
  const raw = host.storage.local.getItem(key);
  if (raw.reason !== 'ok') return raw;
  if (raw.value === null) return { reason: 'ok', value: fallback };
  if (raw.value === 'true') return { reason: 'ok', value: true };
  if (raw.value === 'false') return { reason: 'ok', value: false };
  return { reason: 'parse-failed', value: fallback };
}

export function getStorageByteSize(host: HasStorageLocal): StorageByteSizeResult {
  return getStorageByteSizeForPrefix(host.storage.local, null);
}

export function getStorageEntries(host: HasStorageLocal): StorageEntriesResult {
  return getStorageEntriesForPrefix(host.storage.local, null);
}

export function getStorageItem(host: HasStorageLocal, key: string): StorageGetItemResult {
  return host.storage.local.getItem(key);
}

export function getStorageItemCount(host: HasStorageLocal): StorageItemCountResult {
  const result = host.storage.local.keys();
  if (result.reason !== 'ok') return result;
  return { reason: 'ok', value: result.value.length };
}

export function getStorageItemOr(host: HasStorageLocal, key: string, fallback: string): StorageItemOrResult {
  const result = host.storage.local.getItem(key);
  if (result.reason !== 'ok') return result;
  return { reason: 'ok', value: result.value ?? fallback };
}

export function getStorageItemPresence(host: HasStorageLocal, key: string): StoragePresenceResult {
  const result = host.storage.local.getItem(key);
  if (result.reason !== 'ok') return result;
  return { reason: 'ok', value: result.value !== null };
}

export function getStorageItems(host: HasStorageLocal, keys: readonly string[]): StorageItemsResult {
  const out: (string | null)[] = [];
  for (const key of keys) {
    const result = host.storage.local.getItem(key);
    if (result.reason !== 'ok') return { failedKey: key, reason: result.reason, value: null };
    out.push(result.value);
  }
  return { failedKey: null, reason: 'ok', value: out };
}

export function getStorageJSON<Value>(host: HasStorageLocal, key: string): StorageJsonResult<Value> {
  const raw = host.storage.local.getItem(key);
  if (raw.reason !== 'ok') return raw;
  if (raw.value === null) return { reason: 'ok', value: null };
  try {
    return { reason: 'ok', value: JSON.parse(raw.value) as Value | null };
  } catch {
    return { reason: 'parse-failed', value: null };
  }
}

export function getStorageJSONOr<Value>(
  host: HasStorageLocal,
  key: string,
  fallback: Value,
): StorageJsonOrResult<Value> {
  const raw = host.storage.local.getItem(key);
  if (raw.reason !== 'ok') return raw;
  if (raw.value === null) return { reason: 'ok', value: fallback };
  try {
    return { reason: 'ok', value: JSON.parse(raw.value) as Value | null };
  } catch {
    return { reason: 'parse-failed', value: fallback };
  }
}

export function getStorageKeys(host: HasStorageLocal): StorageKeysResult {
  return host.storage.local.keys();
}

export function getStorageNumber(host: HasStorageLocal, key: string): StorageNumberResult {
  const raw = host.storage.local.getItem(key);
  if (raw.reason !== 'ok') return raw;
  if (raw.value === null) return { reason: 'ok', value: null };
  const value = Number(raw.value);
  return Number.isFinite(value) ? { reason: 'ok', value } : { reason: 'parse-failed', value: null };
}

export function getStorageNumberOr(host: HasStorageLocal, key: string, fallback: number): StorageNumberOrResult {
  const raw = host.storage.local.getItem(key);
  if (raw.reason !== 'ok') return raw;
  if (raw.value === null) return { reason: 'ok', value: fallback };
  const value = Number(raw.value);
  return Number.isFinite(value) ? { reason: 'ok', value } : { reason: 'parse-failed', value: fallback };
}

// Validates the complete plan before reading or mutating storage. Every successful callback is followed
// immediately by its own checkpoint. A checkpoint failure leaves callback effects visible and causes that
// version to replay next time, so callbacks must be idempotent; exceptions propagate and nothing rolls back.
export function migrateStorage(
  host: HasStorageLocal,
  namespace: Readonly<StorageNamespace> | null,
  migrations: readonly Readonly<StorageMigration>[],
  signals: StorageSignals | null = null,
): StorageMigrationResult {
  const sorted = validateStorageMigrations(migrations);
  const versionKey =
    namespace === null ? '__flight_storage_version' : namespacedKey(namespace, '__flight_storage_version');
  const storedVersion = host.storage.local.getItem(versionKey);
  if (storedVersion.reason !== 'ok') {
    return { failedVersion: null, reason: storedVersion.reason, stage: 'read-version', version: null };
  }
  let checkpoint = 0;
  if (storedVersion.value !== null) {
    const parsed = Number(storedVersion.value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { failedVersion: null, reason: 'version-parse-failed', stage: 'read-version', version: null };
    }
    checkpoint = parsed;
  }
  const initialCheckpoint = checkpoint;
  for (const migration of sorted) {
    if (migration.version <= initialCheckpoint) continue;
    migration.migrate(namespace?.prefix ?? null);
    const stored = setStorageItemOnBackend(host.storage.local, versionKey, String(migration.version), signals);
    if (stored.reason !== 'ok') {
      return {
        failedVersion: migration.version,
        reason: stored.reason,
        stage: 'checkpoint',
        version: checkpoint,
      };
    }
    checkpoint = migration.version;
  }
  return { failedVersion: null, reason: 'ok', stage: null, version: checkpoint };
}

export function removeNamespacedStorageItem(
  host: HasStorageLocal,
  namespace: Readonly<StorageNamespace>,
  key: string,
  signals: StorageSignals | null = null,
): StorageRemoveItemResult {
  return removeStorageItemFromBackend(host.storage.local, namespacedKey(namespace, key), signals);
}

export function removeStorageItem(
  host: HasStorageLocal,
  key: string,
  signals: StorageSignals | null = null,
): StorageRemoveItemResult {
  return removeStorageItemFromBackend(host.storage.local, key, signals);
}

export function removeStorageItems(
  host: HasStorageLocal,
  keys: readonly string[],
  signals: StorageSignals | null = null,
): StorageRemoveItemsResult {
  let completed = 0;
  for (const key of keys) {
    const result = removeStorageItemFromBackend(host.storage.local, key, signals);
    if (result.reason !== 'ok') return { completed, failedKey: key, reason: result.reason };
    completed++;
  }
  return { completed, failedKey: null, reason: 'ok' };
}

export function setNamespacedStorageItem(
  host: HasStorageLocal,
  namespace: Readonly<StorageNamespace>,
  key: string,
  value: string,
  signals: StorageSignals | null = null,
): StorageSetItemResult {
  return setStorageItemOnBackend(host.storage.local, namespacedKey(namespace, key), value, signals);
}

export function setStorageBoolean(
  host: HasStorageLocal,
  key: string,
  value: boolean,
  signals: StorageSignals | null = null,
): StorageSetItemResult {
  return setStorageItemOnBackend(host.storage.local, key, value ? 'true' : 'false', signals);
}

export function setStorageItem(
  host: HasStorageLocal,
  key: string,
  value: string,
  signals: StorageSignals | null = null,
): StorageSetItemResult {
  return setStorageItemOnBackend(host.storage.local, key, value, signals);
}

export function setStorageItems(
  host: HasStorageLocal,
  record: Readonly<Record<string, string>>,
  signals: StorageSignals | null = null,
): StorageSetItemsResult {
  let completed = 0;
  for (const key of Object.keys(record)) {
    const result = setStorageItemOnBackend(host.storage.local, key, record[key], signals);
    if (result.reason !== 'ok') return { completed, failedKey: key, reason: result.reason };
    completed++;
  }
  return { completed, failedKey: null, reason: 'ok' };
}

export function setStorageJSON<Value>(
  host: HasStorageLocal,
  key: string,
  value: Value,
  signals: StorageSignals | null = null,
): StorageJsonWriteResult {
  let raw: string | undefined;
  try {
    raw = JSON.stringify(value);
  } catch {
    return { reason: 'serialization-failed' };
  }
  if (raw === undefined) return { reason: 'serialization-failed' };
  return setStorageItemOnBackend(host.storage.local, key, raw, signals);
}

export function setStorageNumber(
  host: HasStorageLocal,
  key: string,
  value: number,
  signals: StorageSignals | null = null,
): StorageSetItemResult {
  if (!Number.isFinite(value)) throw new RangeError('setStorageNumber value must be finite');
  return setStorageItemOnBackend(host.storage.local, key, String(value), signals);
}

function getStorageByteSizeForPrefix(backend: StorageBackend, prefix: string | null): StorageByteSizeResult {
  const keys = backend.keys();
  if (keys.reason !== 'ok') return { failedKey: null, reason: keys.reason, value: null };
  let value = 0;
  for (const key of keys.value) {
    if (prefix !== null && !key.startsWith(prefix)) continue;
    const item = backend.getItem(key);
    if (item.reason !== 'ok') return { failedKey: key, reason: item.reason, value: null };
    if (item.value !== null) value += (key.length + item.value.length) * 2;
  }
  return { failedKey: null, reason: 'ok', value };
}

function getStorageEntriesForPrefix(backend: StorageBackend, prefix: string | null): StorageEntriesResult {
  const keys = backend.keys();
  if (keys.reason !== 'ok') return { failedKey: null, reason: keys.reason, value: null };
  const value: [string, string][] = [];
  for (const key of keys.value) {
    if (prefix !== null && !key.startsWith(prefix)) continue;
    const item = backend.getItem(key);
    if (item.reason !== 'ok') return { failedKey: key, reason: item.reason, value: null };
    // A successful null after enumeration is an ordinary concurrent removal, not provider failure.
    if (item.value !== null) value.push([key, item.value]);
  }
  return { failedKey: null, reason: 'ok', value };
}

function namespacedKey(namespace: Readonly<StorageNamespace>, key: string): string {
  return namespace.prefix + '.' + key;
}

function removeStorageItemFromBackend(
  backend: StorageBackend,
  key: string,
  signals: StorageSignals | null,
): StorageRemoveItemResult {
  const active = storageSignalsActive(signals);
  const oldValue = active ? backend.getItem(key) : null;
  const result = backend.removeItem(key);
  if (result.reason === 'ok' && active && oldValue?.reason === 'ok' && oldValue.value !== null) {
    emitSignal(signals.onChange, { key, newValue: null, oldValue: oldValue.value });
  }
  return result;
}

function setStorageItemOnBackend(
  backend: StorageBackend,
  key: string,
  value: string,
  signals: StorageSignals | null,
): StorageSetItemResult {
  const active = storageSignalsActive(signals);
  const oldValue = active ? backend.getItem(key) : null;
  const result = backend.setItem(key, value);
  if (result.reason === 'ok' && active && oldValue?.reason === 'ok' && oldValue.value !== value) {
    emitSignal(signals.onChange, { key, newValue: value, oldValue: oldValue.value });
  }
  return result;
}

function storageSignalsActive(signals: StorageSignals | null): signals is StorageSignals {
  return signals !== null && hasSignalSlots(signals.onChange);
}

function validateStorageMigrations(
  migrations: readonly Readonly<StorageMigration>[],
): readonly Readonly<StorageMigration>[] {
  const versions = new Set<number>();
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new RangeError('Storage migration versions must be positive integers');
    }
    if (versions.has(migration.version)) {
      throw new RangeError(`Storage migration version ${migration.version} is duplicated`);
    }
    versions.add(migration.version);
  }
  return [...migrations].sort((a, b) => a.version - b.version);
}

// Each entity retains the exact release returned by the provider it attached to. Deleting before
// invoking the release also keeps re-entrant detach idempotent.
const _subscriptions = new WeakMap<StorageSignals, () => void>();

import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityRuntimeKey,
  StorageBackend,
  StorageChangeBackend,
  StorageClearFailureReason,
  StorageGetItemFailureReason,
  StorageRemoveItemFailureReason,
  StorageSetItemFailureReason,
} from '@flighthq/types/contract';

type WebStorageBackend = StorageBackend & StorageChangeBackend;

const releases = new Set<() => void>();
let destroyed = false;

// One stable Entity supplies the two truthful Web Host facets: synchronous local commands and external
// `storage` events. The command facet remains usable without event listeners; destroy is terminal for
// event acquisition and releases every exact listener pair retained by the change facet.
export const webStorageBackend = createEntity({
  clear() {
    try {
      const storage = getWebLocalStorage();
      if (storage === null) return { reason: 'runtime-unavailable' };
      storage.clear();
      return { reason: 'ok' };
    } catch (error) {
      return { reason: classifyWebStorageClearFailure(error) };
    }
  },
  destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const release of [...releases]) release();
    releases.clear();
  },
  getItem(key) {
    try {
      const storage = getWebLocalStorage();
      if (storage === null) return { reason: 'runtime-unavailable', value: null };
      return { reason: 'ok', value: storage.getItem(key) };
    } catch (error) {
      return { reason: classifyWebStorageReadFailure(error), value: null };
    }
  },
  keys() {
    try {
      const storage = getWebLocalStorage();
      if (storage === null) return { reason: 'runtime-unavailable', value: null };
      const value: string[] = [];
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key !== null) value.push(key);
      }
      return { reason: 'ok', value };
    } catch (error) {
      return { reason: classifyWebStorageReadFailure(error), value: null };
    }
  },
  removeItem(key) {
    try {
      const storage = getWebLocalStorage();
      if (storage === null) return { reason: 'runtime-unavailable' };
      storage.removeItem(key);
      return { reason: 'ok' };
    } catch (error) {
      return { reason: classifyWebStorageRemoveFailure(error) };
    }
  },
  setItem(key, value) {
    try {
      const storage = getWebLocalStorage();
      if (storage === null) return { reason: 'runtime-unavailable' };
      storage.setItem(key, value);
      return { reason: 'ok' };
    } catch (error) {
      return { reason: classifyWebStorageSetFailure(error) };
    }
  },
  subscribe(listener) {
    if (
      destroyed ||
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function' ||
      typeof window.removeEventListener !== 'function'
    ) {
      return null;
    }
    let storage: Storage;
    try {
      const resolved = getWebLocalStorage();
      if (resolved === null) return null;
      storage = resolved;
    } catch {
      return null;
    }
    const handler = (event: StorageEvent) => {
      if (event.storageArea !== null && event.storageArea !== storage) return;
      listener({ key: event.key, newValue: event.newValue, oldValue: event.oldValue });
    };
    try {
      window.addEventListener('storage', handler);
    } catch {
      return null;
    }
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      releases.delete(release);
      window.removeEventListener('storage', handler);
    };
    releases.add(release);
    return release;
  },
} satisfies Omit<WebStorageBackend, typeof EntityRuntimeKey>);

function classifyWebStorageClearFailure(error: unknown): StorageClearFailureReason {
  const name = getErrorName(error);
  if (name === 'SecurityError') return 'security-denied';
  if (name === 'QuotaExceededError') return 'quota-exceeded';
  return 'clear-failed';
}

function classifyWebStorageReadFailure(error: unknown): StorageGetItemFailureReason {
  return getErrorName(error) === 'SecurityError' ? 'security-denied' : 'read-failed';
}

function classifyWebStorageRemoveFailure(error: unknown): StorageRemoveItemFailureReason {
  const name = getErrorName(error);
  if (name === 'SecurityError') return 'security-denied';
  if (name === 'QuotaExceededError') return 'quota-exceeded';
  return 'remove-failed';
}

function classifyWebStorageSetFailure(error: unknown): StorageSetItemFailureReason {
  const name = getErrorName(error);
  if (name === 'SecurityError') return 'security-denied';
  if (name === 'QuotaExceededError') return 'quota-exceeded';
  return 'write-failed';
}

function getErrorName(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('name' in error)) return null;
  return typeof error.name === 'string' ? error.name : null;
}

function getWebLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage ?? null;
}

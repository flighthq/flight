import type { StorageBackend } from '@flighthq/types';

// Removes every key. Returns false when the host denies access. Sentinel, not throw.
export function clearStorage(): boolean {
  return getStorageBackend().clear();
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
  };
}

// The active storage backend, or a lazily-created web default. There is always a backend.
export function getStorageBackend(): StorageBackend {
  if (_backend === null) _backend = createWebStorageBackend();
  return _backend;
}

// Reads a stored value, or null when the key is absent or access is denied.
export function getStorageItem(key: string): string | null {
  return getStorageBackend().getItem(key);
}

// Returns every stored key, or [] when access is denied.
export function getStorageKeys(): string[] {
  return getStorageBackend().keys();
}

// Removes one key. Returns false when the host denies access.
export function removeStorageItem(key: string): boolean {
  return getStorageBackend().removeItem(key);
}

// Installs a native host storage backend; pass null to fall back to the web default.
export function setStorageBackend(backend: StorageBackend | null): void {
  _backend = backend;
}

// Writes a value. Returns false when the host denies access (private mode, quota exceeded).
export function setStorageItem(key: string, value: string): boolean {
  return getStorageBackend().setItem(key, value);
}

let _backend: StorageBackend | null = null;

function getWebStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

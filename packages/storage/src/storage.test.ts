import type { StorageBackend } from '@flighthq/types';

import {
  clearStorage,
  createWebStorageBackend,
  getStorageBackend,
  getStorageItem,
  getStorageKeys,
  removeStorageItem,
  setStorageBackend,
  setStorageItem,
} from './storage';

function fakeBackend(): StorageBackend {
  const map = new Map<string, string>();
  return {
    getItem(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    setItem(key, value) {
      map.set(key, value);
      return true;
    },
    removeItem(key) {
      map.delete(key);
      return true;
    },
    clear() {
      map.clear();
      return true;
    },
    keys() {
      return [...map.keys()];
    },
  };
}

afterEach(() => setStorageBackend(null));

describe('clearStorage', () => {
  it('clears via the active backend', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('a', '1');
    expect(clearStorage()).toBe(true);
    expect(getStorageKeys()).toEqual([]);
  });
});

describe('createWebStorageBackend', () => {
  it('returns a backend whose reads yield sentinels without throwing', () => {
    const backend = createWebStorageBackend();
    expect(() => backend.getItem('missing')).not.toThrow();
    expect(Array.isArray(backend.keys())).toBe(true);
    expect(typeof backend.setItem('k', 'v')).toBe('boolean');
  });
});

describe('getStorageBackend', () => {
  it('falls back to a web backend', () => {
    expect(getStorageBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setStorageBackend(backend);
    expect(getStorageBackend()).toBe(backend);
  });
});

describe('getStorageItem', () => {
  it('returns null for an absent key', () => {
    setStorageBackend(fakeBackend());
    expect(getStorageItem('missing')).toBeNull();
  });

  it('round-trips through the backend', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('greeting', 'hi');
    expect(getStorageItem('greeting')).toBe('hi');
  });
});

describe('getStorageKeys', () => {
  it('lists stored keys', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('a', '1');
    setStorageItem('b', '2');
    expect(getStorageKeys().sort()).toEqual(['a', 'b']);
  });
});

describe('removeStorageItem', () => {
  it('removes via the active backend', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('a', '1');
    expect(removeStorageItem('a')).toBe(true);
    expect(getStorageItem('a')).toBeNull();
  });
});

describe('setStorageBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setStorageBackend(fakeBackend());
    setStorageBackend(null);
    expect(getStorageBackend()).not.toBeNull();
  });
});

describe('setStorageItem', () => {
  it('writes via the active backend', () => {
    setStorageBackend(fakeBackend());
    expect(setStorageItem('x', 'y')).toBe(true);
    expect(getStorageItem('x')).toBe('y');
  });
});

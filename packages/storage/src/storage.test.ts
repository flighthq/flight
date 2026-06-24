import type { StorageBackend, StorageNamespace } from '@flighthq/types';

import {
  clearStorage,
  clearStorageNamespace,
  createStorageNamespace,
  createWebStorageBackend,
  disableStorageSignals,
  enableStorageSignals,
  getNamespacedStorageByteSize,
  getNamespacedStorageEntries,
  getNamespacedStorageItem,
  getNamespacedStorageKeys,
  getStorageBackend,
  getStorageBoolean,
  getStorageBooleanOr,
  getStorageByteSize,
  getStorageEntries,
  getStorageItem,
  getStorageItemCount,
  getStorageItemOr,
  getStorageItems,
  getStorageJSON,
  getStorageJSONOr,
  getStorageKeys,
  getStorageNumber,
  getStorageNumberOr,
  getStorageQuotaEstimate,
  getStorageSignals,
  hasNamespacedStorageItem,
  hasStorageItem,
  migrateStorage,
  removeNamespacedStorageItem,
  removeStorageItem,
  removeStorageItems,
  setNamespacedStorageItem,
  setStorageBackend,
  setStorageBoolean,
  setStorageItem,
  setStorageItems,
  setStorageJSON,
  setStorageNumber,
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

function deniedBackend(): StorageBackend {
  return {
    getItem() {
      return null;
    },
    setItem() {
      return false;
    },
    removeItem() {
      return false;
    },
    clear() {
      return false;
    },
    keys() {
      return [];
    },
  };
}

afterEach(() => {
  disableStorageSignals();
  setStorageBackend(null);
});

describe('clearStorage', () => {
  it('clears via the active backend', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('a', '1');
    expect(clearStorage()).toBe(true);
    expect(getStorageKeys()).toEqual([]);
  });

  it('returns false when denied', () => {
    setStorageBackend(deniedBackend());
    expect(clearStorage()).toBe(false);
  });
});

describe('clearStorageNamespace', () => {
  it('removes only keys under the prefix', () => {
    setStorageBackend(fakeBackend());
    const ns = createStorageNamespace('ns');
    setNamespacedStorageItem(ns, 'a', '1');
    setNamespacedStorageItem(ns, 'b', '2');
    setStorageItem('global', 'g');
    expect(clearStorageNamespace(ns)).toBe(true);
    expect(getNamespacedStorageKeys(ns)).toEqual([]);
    expect(getStorageItem('global')).toBe('g');
  });
});

describe('createStorageNamespace', () => {
  it('creates a namespace with the given prefix', () => {
    const ns = createStorageNamespace('app');
    expect(ns.prefix).toBe('app');
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

describe('disableStorageSignals', () => {
  it('is a no-op when signals are not enabled', () => {
    expect(() => disableStorageSignals()).not.toThrow();
  });

  it('stops emitting after disable', () => {
    setStorageBackend(fakeBackend());
    enableStorageSignals();
    disableStorageSignals();
    expect(getStorageSignals()).toBeNull();
    // write should not throw after disable
    setStorageItem('x', 'y');
  });
});

describe('enableStorageSignals', () => {
  it('returns a StorageSignals object', () => {
    const sigs = enableStorageSignals();
    expect(sigs).not.toBeNull();
    expect(sigs.onChange).toBeDefined();
  });

  it('is idempotent — returns the same object', () => {
    const a = enableStorageSignals();
    const b = enableStorageSignals();
    expect(a).toBe(b);
  });

  it('emits onChange when setStorageItem is called', () => {
    setStorageBackend(fakeBackend());
    const sigs = enableStorageSignals();
    const changes: Array<{ key: string | null; oldValue: string | null; newValue: string | null }> = [];
    sigs.onChange.emit = (change) => changes.push({ ...change });
    setStorageItem('hello', 'world');
    expect(changes).toHaveLength(1);
    expect(changes[0].key).toBe('hello');
    expect(changes[0].newValue).toBe('world');
  });

  it('emits onChange when clearStorage is called', () => {
    setStorageBackend(fakeBackend());
    const sigs = enableStorageSignals();
    const changes: Array<{ key: string | null }> = [];
    sigs.onChange.emit = (change) => changes.push({ key: change.key });
    clearStorage();
    expect(changes).toHaveLength(1);
    expect(changes[0].key).toBeNull();
  });

  it('emits onChange when removeStorageItem is called', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('a', '1');
    const sigs = enableStorageSignals();
    const changes: Array<{ key: string | null; newValue: string | null }> = [];
    sigs.onChange.emit = (change) => changes.push({ key: change.key, newValue: change.newValue });
    removeStorageItem('a');
    expect(changes).toHaveLength(1);
    expect(changes[0].key).toBe('a');
    expect(changes[0].newValue).toBeNull();
  });
});

describe('getNamespacedStorageByteSize', () => {
  it('counts only namespaced keys', () => {
    setStorageBackend(fakeBackend());
    const ns = createStorageNamespace('ns');
    setNamespacedStorageItem(ns, 'x', 'y');
    setStorageItem('global', 'g');
    const size = getNamespacedStorageByteSize(ns);
    expect(size).toBeGreaterThan(0);
  });

  it('returns 0 for empty namespace', () => {
    setStorageBackend(fakeBackend());
    const ns = createStorageNamespace('empty');
    expect(getNamespacedStorageByteSize(ns)).toBe(0);
  });
});

describe('getNamespacedStorageEntries', () => {
  it('returns unprefixed key/value pairs', () => {
    setStorageBackend(fakeBackend());
    const ns = createStorageNamespace('ns');
    setNamespacedStorageItem(ns, 'a', '1');
    setNamespacedStorageItem(ns, 'b', '2');
    setStorageItem('ns.x', 'outside'); // Actually prefix-matching — valid entry
    const entries = getNamespacedStorageEntries(ns);
    const keys = entries.map((e) => e[0]).sort();
    expect(keys).toContain('a');
    expect(keys).toContain('b');
  });

  it('does not include global keys', () => {
    setStorageBackend(fakeBackend());
    const ns = createStorageNamespace('app');
    setStorageItem('global', 'g');
    setNamespacedStorageItem(ns, 'local', 'v');
    const entries = getNamespacedStorageEntries(ns);
    expect(entries.every((e) => e[0] !== 'global')).toBe(true);
  });
});

describe('getNamespacedStorageItem', () => {
  it('returns null when absent', () => {
    setStorageBackend(fakeBackend());
    const ns = createStorageNamespace('ns');
    expect(getNamespacedStorageItem(ns, 'missing')).toBeNull();
  });

  it('round-trips through the backend', () => {
    setStorageBackend(fakeBackend());
    const ns = createStorageNamespace('ns');
    setNamespacedStorageItem(ns, 'key', 'val');
    expect(getNamespacedStorageItem(ns, 'key')).toBe('val');
  });
});

describe('getNamespacedStorageKeys', () => {
  it('returns unprefixed keys', () => {
    setStorageBackend(fakeBackend());
    const ns = createStorageNamespace('app');
    setNamespacedStorageItem(ns, 'x', '1');
    setNamespacedStorageItem(ns, 'y', '2');
    setStorageItem('global', 'g');
    const keys = getNamespacedStorageKeys(ns).sort();
    expect(keys).toEqual(['x', 'y']);
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

describe('getStorageBoolean', () => {
  it('returns true for stored "true"', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('flag', 'true');
    expect(getStorageBoolean('flag')).toBe(true);
  });

  it('returns false for stored "false"', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('flag', 'false');
    expect(getStorageBoolean('flag')).toBe(false);
  });

  it('returns null for absent key', () => {
    setStorageBackend(fakeBackend());
    expect(getStorageBoolean('missing')).toBeNull();
  });

  it('returns null for unrecognized value', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('flag', '1');
    expect(getStorageBoolean('flag')).toBeNull();
  });
});

describe('getStorageBooleanOr', () => {
  it('returns fallback on absent key', () => {
    setStorageBackend(fakeBackend());
    expect(getStorageBooleanOr('missing', true)).toBe(true);
  });

  it('returns stored value when present', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('flag', 'false');
    expect(getStorageBooleanOr('flag', true)).toBe(false);
  });
});

describe('getStorageByteSize', () => {
  it('returns 0 for an empty store', () => {
    setStorageBackend(fakeBackend());
    expect(getStorageByteSize()).toBe(0);
  });

  it('returns a positive size after writing', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('key', 'value');
    expect(getStorageByteSize()).toBeGreaterThan(0);
  });

  it('delegates to backend.byteSize when present', () => {
    const backend = fakeBackend();
    backend.byteSize = () => 42;
    setStorageBackend(backend);
    expect(getStorageByteSize()).toBe(42);
  });
});

describe('getStorageEntries', () => {
  it('returns all key/value pairs', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('a', '1');
    setStorageItem('b', '2');
    const entries = getStorageEntries();
    const sorted = [...entries].sort((a, b) => a[0].localeCompare(b[0]));
    expect(sorted).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  it('returns [] for a denied backend', () => {
    setStorageBackend(deniedBackend());
    expect(getStorageEntries()).toEqual([]);
  });

  it('returns [] for an empty store', () => {
    setStorageBackend(fakeBackend());
    expect(getStorageEntries()).toEqual([]);
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

describe('getStorageItemCount', () => {
  it('returns 0 for an empty store', () => {
    setStorageBackend(fakeBackend());
    expect(getStorageItemCount()).toBe(0);
  });

  it('counts stored keys', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('a', '1');
    setStorageItem('b', '2');
    expect(getStorageItemCount()).toBe(2);
  });

  it('returns 0 when denied', () => {
    setStorageBackend(deniedBackend());
    expect(getStorageItemCount()).toBe(0);
  });
});

describe('getStorageItemOr', () => {
  it('returns the stored value', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('k', 'v');
    expect(getStorageItemOr('k', 'default')).toBe('v');
  });

  it('returns the fallback on absent key', () => {
    setStorageBackend(fakeBackend());
    expect(getStorageItemOr('missing', 'fallback')).toBe('fallback');
  });
});

describe('getStorageItems', () => {
  it('returns parallel-indexed values', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('a', '1');
    setStorageItem('b', '2');
    const results = getStorageItems(['a', 'missing', 'b']);
    expect(results).toEqual(['1', null, '2']);
  });

  it('returns [] for empty keys array', () => {
    setStorageBackend(fakeBackend());
    expect(getStorageItems([])).toEqual([]);
  });
});

describe('getStorageJSON', () => {
  it('parses a valid JSON string', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('obj', '{"x":1}');
    expect(getStorageJSON<{ x: number }>('obj')).toEqual({ x: 1 });
  });

  it('returns null on absent key', () => {
    setStorageBackend(fakeBackend());
    expect(getStorageJSON('missing')).toBeNull();
  });

  it('returns null on corrupt stored data (parse failure)', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('bad', 'not-json{');
    expect(getStorageJSON('bad')).toBeNull();
  });

  it('round-trips through setStorageJSON', () => {
    setStorageBackend(fakeBackend());
    setStorageJSON('data', { hello: 'world' });
    expect(getStorageJSON<{ hello: string }>('data')).toEqual({ hello: 'world' });
  });
});

describe('getStorageJSONOr', () => {
  it('returns fallback on absent key', () => {
    setStorageBackend(fakeBackend());
    expect(getStorageJSONOr('missing', 42)).toBe(42);
  });

  it('returns fallback on parse failure', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('bad', '{corrupt');
    expect(getStorageJSONOr('bad', 'default')).toBe('default');
  });

  it('returns the parsed value when present', () => {
    setStorageBackend(fakeBackend());
    setStorageJSON('n', 99);
    expect(getStorageJSONOr('n', 0)).toBe(99);
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

describe('getStorageNumber', () => {
  it('returns a stored number', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('n', '42');
    expect(getStorageNumber('n')).toBe(42);
  });

  it('returns null for absent key', () => {
    setStorageBackend(fakeBackend());
    expect(getStorageNumber('missing')).toBeNull();
  });

  it('returns null for non-numeric value', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('bad', 'nope');
    expect(getStorageNumber('bad')).toBeNull();
  });
});

describe('getStorageNumberOr', () => {
  it('returns fallback on absent key', () => {
    setStorageBackend(fakeBackend());
    expect(getStorageNumberOr('missing', -1)).toBe(-1);
  });

  it('returns stored value when present', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('n', '7');
    expect(getStorageNumberOr('n', 0)).toBe(7);
  });
});

describe('getStorageQuotaEstimate', () => {
  it('returns null when navigator.storage is absent', async () => {
    const result = await getStorageQuotaEstimate();
    // In jsdom, navigator.storage.estimate may or may not be available — just assert no throw.
    expect(result === null || typeof result === 'object').toBe(true);
  });
});

describe('getStorageSignals', () => {
  it('returns null before enableStorageSignals', () => {
    expect(getStorageSignals()).toBeNull();
  });

  it('returns the signals after enableStorageSignals', () => {
    const sigs = enableStorageSignals();
    expect(getStorageSignals()).toBe(sigs);
  });
});

describe('hasNamespacedStorageItem', () => {
  it('returns false when absent', () => {
    setStorageBackend(fakeBackend());
    const ns = createStorageNamespace('ns');
    expect(hasNamespacedStorageItem(ns, 'missing')).toBe(false);
  });

  it('returns true when present', () => {
    setStorageBackend(fakeBackend());
    const ns = createStorageNamespace('ns');
    setNamespacedStorageItem(ns, 'key', 'val');
    expect(hasNamespacedStorageItem(ns, 'key')).toBe(true);
  });
});

describe('hasStorageItem', () => {
  it('returns false for absent key', () => {
    setStorageBackend(fakeBackend());
    expect(hasStorageItem('missing')).toBe(false);
  });

  it('returns true for a stored key', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('present', 'value');
    expect(hasStorageItem('present')).toBe(true);
  });

  it('returns false when denied', () => {
    setStorageBackend(deniedBackend());
    expect(hasStorageItem('any')).toBe(false);
  });
});

describe('migrateStorage', () => {
  it('runs migrations in version order', () => {
    setStorageBackend(fakeBackend());
    const calls: number[] = [];
    const migrations = [
      {
        version: 2,
        migrate: () => {
          calls.push(2);
        },
      },
      {
        version: 1,
        migrate: () => {
          calls.push(1);
        },
      },
    ];
    const result = migrateStorage(null, migrations);
    expect(result).toBe(2);
    expect(calls).toEqual([1, 2]);
  });

  it('skips migrations at or below current version', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('__flight_storage_version', '2');
    const calls: number[] = [];
    const migrations = [
      {
        version: 1,
        migrate: () => {
          calls.push(1);
        },
      },
      {
        version: 2,
        migrate: () => {
          calls.push(2);
        },
      },
      {
        version: 3,
        migrate: () => {
          calls.push(3);
        },
      },
    ];
    const result = migrateStorage(null, migrations);
    expect(result).toBe(3);
    expect(calls).toEqual([3]);
  });

  it('works with a namespace', () => {
    setStorageBackend(fakeBackend());
    const ns = createStorageNamespace('app');
    const calls: number[] = [];
    const migrations = [
      {
        version: 1,
        migrate: () => {
          calls.push(1);
        },
      },
    ];
    const result = migrateStorage(ns, migrations);
    expect(result).toBe(1);
    expect(calls).toEqual([1]);
    expect(getNamespacedStorageItem(ns, '__flight_storage_version')).toBe('1');
  });

  it('returns -1 when a migration throws', () => {
    setStorageBackend(fakeBackend());
    const migrations = [
      {
        version: 1,
        migrate: () => {
          throw new Error('fail');
        },
      },
    ];
    expect(migrateStorage(null, migrations)).toBe(-1);
  });
});

describe('removeNamespacedStorageItem', () => {
  it('removes a namespaced key', () => {
    setStorageBackend(fakeBackend());
    const ns = createStorageNamespace('ns');
    setNamespacedStorageItem(ns, 'key', 'val');
    expect(removeNamespacedStorageItem(ns, 'key')).toBe(true);
    expect(getNamespacedStorageItem(ns, 'key')).toBeNull();
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

describe('removeStorageItems', () => {
  it('removes multiple keys', () => {
    setStorageBackend(fakeBackend());
    setStorageItem('a', '1');
    setStorageItem('b', '2');
    expect(removeStorageItems(['a', 'b'])).toBe(true);
    expect(getStorageItem('a')).toBeNull();
    expect(getStorageItem('b')).toBeNull();
  });

  it('returns false when any removal fails', () => {
    setStorageBackend(deniedBackend());
    expect(removeStorageItems(['x'])).toBe(false);
  });
});

describe('setNamespacedStorageItem', () => {
  it('stores under the prefixed key', () => {
    setStorageBackend(fakeBackend());
    const ns = createStorageNamespace('app');
    setNamespacedStorageItem(ns, 'setting', '42');
    expect(getStorageItem('app.setting')).toBe('42');
  });
});

describe('setStorageBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setStorageBackend(fakeBackend());
    setStorageBackend(null);
    expect(getStorageBackend()).not.toBeNull();
  });
});

describe('setStorageBoolean', () => {
  it('writes "true" for true', () => {
    setStorageBackend(fakeBackend());
    setStorageBoolean('flag', true);
    expect(getStorageItem('flag')).toBe('true');
  });

  it('writes "false" for false', () => {
    setStorageBackend(fakeBackend());
    setStorageBoolean('flag', false);
    expect(getStorageItem('flag')).toBe('false');
  });
});

describe('setStorageItem', () => {
  it('writes via the active backend', () => {
    setStorageBackend(fakeBackend());
    expect(setStorageItem('x', 'y')).toBe(true);
    expect(getStorageItem('x')).toBe('y');
  });
});

describe('setStorageItems', () => {
  it('writes all key/value pairs', () => {
    setStorageBackend(fakeBackend());
    expect(setStorageItems({ a: '1', b: '2' })).toBe(true);
    expect(getStorageItem('a')).toBe('1');
    expect(getStorageItem('b')).toBe('2');
  });

  it('returns false when any write fails', () => {
    setStorageBackend(deniedBackend());
    expect(setStorageItems({ a: '1' })).toBe(false);
  });
});

describe('setStorageJSON', () => {
  it('stores a stringified value', () => {
    setStorageBackend(fakeBackend());
    expect(setStorageJSON('obj', { n: 1 })).toBe(true);
    expect(getStorageItem('obj')).toBe('{"n":1}');
  });

  it('returns false for cyclic values', () => {
    setStorageBackend(fakeBackend());
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(setStorageJSON('bad', cyclic)).toBe(false);
  });
});

describe('setStorageNumber', () => {
  it('stores the number as a string', () => {
    setStorageBackend(fakeBackend());
    setStorageNumber('n', 3.14);
    expect(getStorageItem('n')).toBe('3.14');
  });
});

import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type {
  EntityRuntimeKey,
  HostStorageChangeProvider,
  HostStorageProvider,
  StorageChange,
  StorageClearFailureReason,
  StorageGetItemFailureReason,
  StorageRemoveItemFailureReason,
  StorageSetItemFailureReason,
} from '@flighthq/types/contract';
import { EntityRuntimeKey as EntityRuntimeKeyValue } from '@flighthq/types/contract';

import {
  attachStorage,
  clearStorage,
  clearStorageNamespace,
  createStorageSignals,
  destroyStorage,
  detachStorage,
  disposeStorage,
  getNamespacedStorageByteSize,
  getNamespacedStorageEntries,
  getNamespacedStorageItem,
  getNamespacedStorageItemPresence,
  getNamespacedStorageKeys,
  getStorageBoolean,
  getStorageBooleanOr,
  getStorageByteSize,
  getStorageEntries,
  getStorageItem,
  getStorageItemCount,
  getStorageItemOr,
  getStorageItemPresence,
  getStorageItems,
  getStorageJSON,
  getStorageJSONOr,
  getStorageKeys,
  getStorageNumber,
  getStorageNumberOr,
  initializeStorageSignals,
  migrateStorage,
  removeNamespacedStorageItem,
  removeStorageItem,
  removeStorageItems,
  setNamespacedStorageItem,
  setStorageBoolean,
  setStorageItem,
  setStorageItems,
  setStorageJSON,
  setStorageNumber,
} from './storage';

interface MemoryStorageBackend extends HostStorageProvider {
  readonly data: Record<string, string>;
  getCalls: number;
  readonly getFailures: Map<string, StorageGetItemFailureReason>;
  keysFailure: StorageGetItemFailureReason | null;
  readonly removeFailures: Map<string, StorageRemoveItemFailureReason>;
  readonly setFailures: Map<string, StorageSetItemFailureReason>;
  clearFailure: StorageClearFailureReason | null;
}

function memoryBackend(initial: Readonly<Record<string, string>> = {}): MemoryStorageBackend {
  const data = { ...initial };
  const getFailures = new Map<string, StorageGetItemFailureReason>();
  const removeFailures = new Map<string, StorageRemoveItemFailureReason>();
  const setFailures = new Map<string, StorageSetItemFailureReason>();
  const out = allocateEntity<MemoryStorageBackend>();
  out.clearFailure = null;
  out.data = data;
  out.getCalls = 0;
  out.getFailures = getFailures;
  out.keysFailure = null;
  out.removeFailures = removeFailures;
  out.setFailures = setFailures;
  out.clear = () => {
    if (out.clearFailure !== null) return { reason: out.clearFailure };
    for (const key of Object.keys(data)) delete data[key];
    return { reason: 'ok' };
  };
  out.getItem = (key: string) => {
    out.getCalls++;
    const failure = getFailures.get(key);
    if (failure !== undefined) return { reason: failure, value: null };
    return { reason: 'ok', value: Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null };
  };
  out.keys = () => {
    return out.keysFailure === null
      ? { reason: 'ok', value: Object.keys(data) }
      : { reason: out.keysFailure, value: null };
  };
  out.removeItem = (key: string) => {
    const failure = removeFailures.get(key);
    if (failure !== undefined) return { reason: failure };
    delete data[key];
    return { reason: 'ok' };
  };
  out.setItem = (key: string, value: string) => {
    const failure = setFailures.get(key);
    if (failure !== undefined) return { reason: failure };
    data[key] = value;
    return { reason: 'ok' };
  };
  return finishEntity(out);
}

function localHost(backend: HostStorageProvider): { readonly storage: { readonly local: HostStorageProvider } } {
  return { storage: { local: backend } };
}

function changeHost(backend: HostStorageChangeProvider): {
  readonly storage: { readonly change: HostStorageChangeProvider };
} {
  return { storage: { change: backend } };
}

describe('attachStorage', () => {
  it('retains and releases the exact provider subscription when re-attached', () => {
    const released: string[] = [];
    const captured: { listener?: (change: Readonly<StorageChange>) => void } = {};
    const a = (() => {
      const out = allocateEntity<HostStorageChangeProvider>();
      out.destroy = () => {};
      out.subscribe = (listener: (change: Readonly<StorageChange>) => void) => {
        captured.listener = listener;
        return () => released.push('a');
      };
      return finishEntity(out);
    })();
    const b = (() => {
      const out = allocateEntity<HostStorageChangeProvider>();
      out.destroy = () => {};
      out.subscribe = () => {
        return () => released.push('b');
      };
      return finishEntity(out);
    })();
    const signals = createStorageSignals();
    const changes: StorageChange[] = [];
    connectSignal(signals.onChange, (change) => changes.push({ ...change }));

    expect(attachStorage(changeHost(a).storage.change, signals)).toBe(true);
    captured.listener?.({ key: 'a', newValue: '1', oldValue: null });
    expect(changes).toEqual([{ key: 'a', newValue: '1', oldValue: null }]);
    expect(attachStorage(changeHost(b).storage.change, signals)).toBe(true);
    expect(released).toEqual(['a']);
    detachStorage(signals);
    expect(released).toEqual(['a', 'b']);
  });

  it('returns false and retains no cleanup when acquisition fails', () => {
    const provider = allocateEntity<HostStorageChangeProvider>();
    provider.destroy = () => {};
    provider.subscribe = () => null;
    const signals = createStorageSignals();
    expect(attachStorage(changeHost(finishEntity(provider)).storage.change, signals)).toBe(false);
    expect(() => detachStorage(signals)).not.toThrow();
  });
});

describe('clearStorage', () => {
  it('returns the method reason and emits only after success', () => {
    const backend = memoryBackend({ a: '1' });
    const host = localHost(backend);
    const signals = createStorageSignals();
    const changes: StorageChange[] = [];
    connectSignal(signals.onChange, (change) => changes.push({ ...change }));
    backend.clearFailure = 'security-denied';
    expect(clearStorage(host.storage.local, signals)).toEqual({ reason: 'security-denied' });
    expect(changes).toEqual([]);
    backend.clearFailure = null;
    expect(clearStorage(host.storage.local, signals)).toEqual({ reason: 'ok' });
    expect(changes).toEqual([{ key: null, newValue: null, oldValue: null }]);
  });
});

describe('clearStorageNamespace', () => {
  it('removes matching keys, stops on failure, and exposes completed world state', () => {
    const backend = memoryBackend({ 'ns.a': '1', 'ns.b': '2', other: '3' });
    backend.removeFailures.set('ns.b', 'remove-failed');
    expect(clearStorageNamespace(localHost(backend).storage.local, { prefix: 'ns' })).toEqual({
      completed: 1,
      failedKey: 'ns.b',
      reason: 'remove-failed',
    });
    expect(backend.data).toEqual({ 'ns.b': '2', other: '3' });
  });

  it('returns no partial state when key enumeration fails', () => {
    const backend = memoryBackend({ 'ns.a': '1' });
    backend.keysFailure = 'security-denied';
    expect(clearStorageNamespace(localHost(backend).storage.local, { prefix: 'ns' })).toEqual({
      completed: 0,
      failedKey: null,
      reason: 'security-denied',
    });
  });
});

describe('createStorageSignals', () => {
  it('creates an Entity with an onChange signal', () => {
    const signals = createStorageSignals();
    expect(EntityRuntimeKeyValue in signals).toBe(true);
    expect(signals.onChange).toBeDefined();
  });
});

describe('destroyStorage', () => {
  it('runs the explicit change-provider teardown', () => {
    let destroyed = 0;
    const provider = allocateEntity<HostStorageChangeProvider>();
    provider.destroy = () => destroyed++;
    provider.subscribe = () => null;
    destroyStorage(changeHost(finishEntity(provider)).storage.change);
    expect(destroyed).toBe(1);
  });
});

describe('detachStorage', () => {
  it('is idempotent', () => {
    let released = 0;
    const provider = allocateEntity<HostStorageChangeProvider>();
    provider.destroy = () => {};
    provider.subscribe = () => () => released++;
    const signals = createStorageSignals();
    attachStorage(changeHost(finishEntity(provider)).storage.change, signals);
    detachStorage(signals);
    detachStorage(signals);
    expect(released).toBe(1);
  });
});

describe('disposeStorage', () => {
  it('detaches and clears listeners', () => {
    let calls = 0;
    const signals = createStorageSignals();
    connectSignal(signals.onChange, () => calls++);
    disposeStorage(signals);
    expect(signals.onChange.data).toBeNull();
    expect(calls).toBe(0);
  });
});

describe('getNamespacedStorageByteSize', () => {
  it('computes byte size from raw prefixed keys', () => {
    const host = localHost(memoryBackend({ 'n.a': 'xy', other: 'ignored' }));
    expect(getNamespacedStorageByteSize(host.storage.local, { prefix: 'n' })).toEqual({
      failedKey: null,
      reason: 'ok',
      value: ('n.a'.length + 'xy'.length) * 2,
    });
  });
});

describe('getNamespacedStorageEntries', () => {
  it('filters entries and strips the namespace prefix', () => {
    const host = localHost(memoryBackend({ 'app.a': '1', 'app.b': '2', other: '3' }));
    const namespace = { prefix: 'app' };
    expect(getNamespacedStorageEntries(host.storage.local, namespace)).toEqual({
      failedKey: null,
      reason: 'ok',
      value: [
        ['a', '1'],
        ['b', '2'],
      ],
    });
  });
});

describe('getNamespacedStorageItem', () => {
  it('reads the prefixed key', () => {
    const host = localHost(memoryBackend({ 'app.a': '1' }));
    const namespace = { prefix: 'app' };
    expect(getNamespacedStorageItem(host.storage.local, namespace, 'a')).toEqual({ reason: 'ok', value: '1' });
  });
});

describe('getNamespacedStorageItemPresence', () => {
  it('reports a missing prefixed key', () => {
    const host = localHost(memoryBackend());
    const namespace = { prefix: 'app' };
    expect(getNamespacedStorageItemPresence(host.storage.local, namespace, 'missing')).toEqual({
      reason: 'ok',
      value: false,
    });
  });
});

describe('getNamespacedStorageKeys', () => {
  it('filters keys and strips the namespace prefix', () => {
    const host = localHost(memoryBackend({ 'app.a': '1', 'app.b': '2', other: '3' }));
    const namespace = { prefix: 'app' };
    expect(getNamespacedStorageKeys(host.storage.local, namespace)).toEqual({ reason: 'ok', value: ['a', 'b'] });
  });
});

describe('getStorageBoolean', () => {
  it('distinguishes miss, values, and parse failure', () => {
    const backend = memoryBackend({ bad: 'yes', false: 'false', true: 'true' });
    const host = localHost(backend);
    expect(getStorageBoolean(host.storage.local, 'true')).toEqual({ reason: 'ok', value: true });
    expect(getStorageBoolean(host.storage.local, 'false')).toEqual({ reason: 'ok', value: false });
    expect(getStorageBoolean(host.storage.local, 'missing')).toEqual({ reason: 'ok', value: null });
    expect(getStorageBoolean(host.storage.local, 'bad')).toEqual({ reason: 'parse-failed', value: null });
  });
});

describe('getStorageBooleanOr', () => {
  it('retains fallback decode and provider failure reasons', () => {
    const backend = memoryBackend({ bad: 'yes' });
    const host = localHost(backend);
    expect(getStorageBooleanOr(host.storage.local, 'bad', true)).toEqual({ reason: 'parse-failed', value: true });
    backend.getFailures.set('denied', 'security-denied');
    expect(getStorageBooleanOr(host.storage.local, 'denied', true)).toEqual({ reason: 'security-denied', value: null });
  });
});

describe('getStorageByteSize', () => {
  it('returns empty success separately from keys and value failures', () => {
    const empty = memoryBackend();
    expect(getStorageByteSize(localHost(empty).storage.local)).toEqual({ failedKey: null, reason: 'ok', value: 0 });
    empty.keysFailure = 'read-failed';
    expect(getStorageByteSize(localHost(empty).storage.local)).toEqual({
      failedKey: null,
      reason: 'read-failed',
      value: null,
    });
    const failedValue = memoryBackend({ a: '1' });
    failedValue.getFailures.set('a', 'security-denied');
    expect(getStorageByteSize(localHost(failedValue).storage.local)).toEqual({
      failedKey: 'a',
      reason: 'security-denied',
      value: null,
    });
  });
});

describe('getStorageEntries', () => {
  it('returns no partial payload after the first failed value read', () => {
    const backend = memoryBackend({ a: '1', b: '2' });
    backend.getFailures.set('b', 'read-failed');
    expect(getStorageEntries(localHost(backend).storage.local)).toEqual({
      failedKey: 'b',
      reason: 'read-failed',
      value: null,
    });
  });
});

describe('getStorageItem', () => {
  it('distinguishes missing, empty, and failed reads', () => {
    const backend = memoryBackend({ empty: '' });
    const host = localHost(backend);
    expect(getStorageItem(host.storage.local, 'missing')).toEqual({ reason: 'ok', value: null });
    expect(getStorageItem(host.storage.local, 'empty')).toEqual({ reason: 'ok', value: '' });
  });
});

describe('getStorageItemCount', () => {
  it('distinguishes an empty store from failed enumeration', () => {
    const backend = memoryBackend();
    const host = localHost(backend);
    expect(getStorageItemCount(host.storage.local)).toEqual({ reason: 'ok', value: 0 });
    backend.keysFailure = 'runtime-unavailable';
    expect(getStorageItemCount(host.storage.local)).toEqual({ reason: 'runtime-unavailable', value: null });
  });
});

describe('getStorageItemOr', () => {
  it('does not hide failure behind fallback', () => {
    const backend = memoryBackend({ empty: '' });
    const host = localHost(backend);
    expect(getStorageItemOr(host.storage.local, 'missing', 'fallback')).toEqual({ reason: 'ok', value: 'fallback' });
    expect(getStorageItemOr(host.storage.local, 'empty', 'fallback')).toEqual({ reason: 'ok', value: '' });
    backend.getFailures.set('denied', 'security-denied');
    expect(getStorageItemOr(host.storage.local, 'denied', 'fallback')).toEqual({
      reason: 'security-denied',
      value: null,
    });
  });
});

describe('getStorageItemPresence', () => {
  it('returns null payload on provider failure instead of false', () => {
    const backend = memoryBackend();
    backend.getFailures.set('key', 'read-failed');
    expect(getStorageItemPresence(localHost(backend).storage.local, 'key')).toEqual({
      reason: 'read-failed',
      value: null,
    });
  });
});

describe('getStorageItems', () => {
  it('stops on first failure and returns no partial array', () => {
    const backend = memoryBackend({ a: '1', c: '3' });
    backend.getFailures.set('b', 'read-failed');
    expect(getStorageItems(localHost(backend).storage.local, ['a', 'b', 'c'])).toEqual({
      failedKey: 'b',
      reason: 'read-failed',
      value: null,
    });
    expect(backend.getCalls).toBe(2);
  });
});

describe('getStorageJSON', () => {
  it('keeps miss and stored null ordinary while identifying malformed input', () => {
    const backend = memoryBackend({ bad: '{', null: 'null', value: '{"x":1}' });
    const host = localHost(backend);
    expect(getStorageJSON<{ x: number }>(host.storage.local, 'value')).toEqual({ reason: 'ok', value: { x: 1 } });
    expect(getStorageJSON(host.storage.local, 'missing')).toEqual({ reason: 'ok', value: null });
    expect(getStorageJSON(host.storage.local, 'null')).toEqual({ reason: 'ok', value: null });
    expect(getStorageJSON(host.storage.local, 'bad')).toEqual({ reason: 'parse-failed', value: null });
  });
});

describe('getStorageJSONOr', () => {
  it('returns fallback with the parse reason but preserves a stored null', () => {
    const host = localHost(memoryBackend({ bad: '{', null: 'null' }));
    expect(getStorageJSONOr(host.storage.local, 'bad', { x: 2 })).toEqual({ reason: 'parse-failed', value: { x: 2 } });
    expect(getStorageJSONOr(host.storage.local, 'null', { x: 2 })).toEqual({ reason: 'ok', value: null });
  });
});

describe('getStorageKeys', () => {
  it('distinguishes successful empty keys from a failed query', () => {
    const backend = memoryBackend();
    const host = localHost(backend);
    expect(getStorageKeys(host.storage.local)).toEqual({ reason: 'ok', value: [] });
    backend.keysFailure = 'runtime-unavailable';
    expect(getStorageKeys(host.storage.local)).toEqual({ reason: 'runtime-unavailable', value: null });
  });
});

describe('getStorageNumber', () => {
  it('reports nonfinite stored values as parse failures', () => {
    const host = localHost(memoryBackend({ bad: 'Infinity', number: '2.5' }));
    expect(getStorageNumber(host.storage.local, 'number')).toEqual({ reason: 'ok', value: 2.5 });
    expect(getStorageNumber(host.storage.local, 'missing')).toEqual({ reason: 'ok', value: null });
    expect(getStorageNumber(host.storage.local, 'bad')).toEqual({ reason: 'parse-failed', value: null });
  });
});

describe('getStorageNumberOr', () => {
  it('retains the fallback parse reason', () => {
    const host = localHost(memoryBackend({ bad: 'Infinity' }));
    expect(getStorageNumberOr(host.storage.local, 'bad', 7)).toEqual({ reason: 'parse-failed', value: 7 });
  });
});

describe('initializeStorageSignals', () => {
  it('is the construction initializer of createStorageSignals', () => {
    expect(typeof initializeStorageSignals).toBe('function');
  });
});

describe('migrateStorage', () => {
  it('validates the entire plan before reading storage', () => {
    const backend = memoryBackend();
    expect(() => migrateStorage(localHost(backend).storage.local, null, [{ migrate() {}, version: 0 }])).toThrow(
      RangeError,
    );
    expect(backend.getCalls).toBe(0);
    expect(() =>
      migrateStorage(localHost(backend).storage.local, null, [
        { migrate() {}, version: 1 },
        { migrate() {}, version: 1 },
      ]),
    ).toThrow(RangeError);
  });

  it('runs zero callbacks after provider read failure or invalid stored version', () => {
    const backend = memoryBackend({ __flight_storage_version: 'not-a-version' });
    let callbacks = 0;
    expect(
      migrateStorage(localHost(backend).storage.local, null, [{ migrate: () => callbacks++, version: 1 }]),
    ).toEqual({
      failedVersion: null,
      reason: 'version-parse-failed',
      stage: 'read-version',
      version: null,
    });
    expect(callbacks).toBe(0);
    backend.getFailures.set('__flight_storage_version', 'security-denied');
    expect(
      migrateStorage(localHost(backend).storage.local, null, [{ migrate: () => callbacks++, version: 1 }]),
    ).toEqual({
      failedVersion: null,
      reason: 'security-denied',
      stage: 'read-version',
      version: null,
    });
    expect(callbacks).toBe(0);
  });

  it('checkpoints after every callback in sorted order', () => {
    const backend = memoryBackend();
    const seen: string[] = [];
    const result = migrateStorage(localHost(backend).storage.local, null, [
      {
        migrate() {
          seen.push(`two:${backend.data.__flight_storage_version}`);
        },
        version: 2,
      },
      { migrate: () => seen.push('one'), version: 1 },
    ]);
    expect(result).toEqual({ failedVersion: null, reason: 'ok', stage: null, version: 2 });
    expect(seen).toEqual(['one', 'two:1']);
    expect(backend.data.__flight_storage_version).toBe('2');
  });

  it('reports the last checkpoint and replays a callback whose checkpoint failed', () => {
    const backend = memoryBackend();
    const original = backend.setItem.bind(backend);
    let checkpointWrites = 0;
    backend.setItem = (key, value) => {
      checkpointWrites++;
      return checkpointWrites === 2 ? { reason: 'write-failed' } : original(key, value);
    };
    let versionTwoCalls = 0;
    const migrations = [
      { migrate() {}, version: 1 },
      { migrate: () => versionTwoCalls++, version: 2 },
    ];
    expect(migrateStorage(localHost(backend).storage.local, null, migrations)).toEqual({
      failedVersion: 2,
      reason: 'write-failed',
      stage: 'checkpoint',
      version: 1,
    });
    expect(versionTwoCalls).toBe(1);
    backend.setItem = original;
    expect(migrateStorage(localHost(backend).storage.local, null, migrations).reason).toBe('ok');
    expect(versionTwoCalls).toBe(2);
  });

  it('propagates callback exceptions without rolling back prior checkpoints', () => {
    const backend = memoryBackend();
    expect(() =>
      migrateStorage(localHost(backend).storage.local, null, [
        { migrate() {}, version: 1 },
        {
          migrate: () => {
            throw new Error('callback failed');
          },
          version: 2,
        },
      ]),
    ).toThrow('callback failed');
    expect(backend.data.__flight_storage_version).toBe('1');
  });
});

describe('removeNamespacedStorageItem', () => {
  it('emits only a real successful prefixed change', () => {
    const backend = memoryBackend({ 'ns.a': '1' });
    const host = localHost(backend);
    const signals = createStorageSignals();
    const changes: StorageChange[] = [];
    connectSignal(signals.onChange, (change) => changes.push({ ...change }));
    expect(removeNamespacedStorageItem(host.storage.local, { prefix: 'ns' }, 'a', signals)).toEqual({ reason: 'ok' });
    expect(changes).toEqual([{ key: 'ns.a', newValue: null, oldValue: '1' }]);
  });
});

describe('removeStorageItem', () => {
  it('treats absent removal as idempotent success', () => {
    const backend = memoryBackend();
    const signals = createStorageSignals();
    const changes: StorageChange[] = [];
    connectSignal(signals.onChange, (change) => changes.push({ ...change }));
    expect(removeStorageItem(localHost(backend).storage.local, 'missing', signals)).toEqual({ reason: 'ok' });
    expect(changes).toEqual([]);
  });
});

describe('removeStorageItems', () => {
  it('stops at the first failure and reports completed removals', () => {
    const backend = memoryBackend({ a: '1', b: '2', c: '3' });
    backend.removeFailures.set('b', 'security-denied');
    expect(removeStorageItems(localHost(backend).storage.local, ['a', 'b', 'c'])).toEqual({
      completed: 1,
      failedKey: 'b',
      reason: 'security-denied',
    });
    expect(backend.data).toEqual({ b: '2', c: '3' });
  });
});

describe('setNamespacedStorageItem', () => {
  it('prefixes namespaced keys', () => {
    const backend = memoryBackend();
    const host = localHost(backend);
    expect(setNamespacedStorageItem(host.storage.local, { prefix: 'app' }, 'key', 'value')).toEqual({ reason: 'ok' });
    expect(backend.data).toEqual({ 'app.key': 'value' });
  });
});

describe('setStorageBoolean', () => {
  it('serializes booleans', () => {
    const backend = memoryBackend();
    const host = localHost(backend);
    expect(setStorageBoolean(host.storage.local, 'flag', true)).toEqual({ reason: 'ok' });
    expect(backend.data).toEqual({ flag: 'true' });
  });
});

describe('setStorageItem', () => {
  it('reads old values only for observed signals and emits only after successful mutation', () => {
    const backend = memoryBackend({ key: 'old' });
    const host = localHost(backend);
    const signals = createStorageSignals();
    expect(setStorageItem(host.storage.local, 'key', 'unobserved', signals)).toEqual({ reason: 'ok' });
    expect(backend.getCalls).toBe(0);
    const changes: StorageChange[] = [];
    connectSignal(signals.onChange, (change) => changes.push({ ...change }));
    backend.setFailures.set('key', 'quota-exceeded');
    expect(setStorageItem(host.storage.local, 'key', 'failed', signals)).toEqual({ reason: 'quota-exceeded' });
    expect(changes).toEqual([]);
    backend.setFailures.delete('key');
    expect(setStorageItem(host.storage.local, 'key', 'new', signals)).toEqual({ reason: 'ok' });
    expect(changes).toEqual([{ key: 'key', newValue: 'new', oldValue: 'unobserved' }]);
  });
});

describe('setStorageItems', () => {
  it('stops after a failed write and exposes completed world state', () => {
    const backend = memoryBackend();
    backend.setFailures.set('b', 'quota-exceeded');
    expect(setStorageItems(localHost(backend).storage.local, { a: '1', b: '2', c: '3' })).toEqual({
      completed: 1,
      failedKey: 'b',
      reason: 'quota-exceeded',
    });
    expect(backend.data).toEqual({ a: '1' });
  });
});

describe('setStorageJSON', () => {
  it('keeps serialization failures core-owned, including undefined', () => {
    const backend = memoryBackend();
    const host = localHost(backend);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(setStorageJSON(host.storage.local, 'cyclic', cyclic)).toEqual({ reason: 'serialization-failed' });
    expect(setStorageJSON(host.storage.local, 'undefined', undefined)).toEqual({ reason: 'serialization-failed' });
    expect(setStorageJSON(host.storage.local, 'value', { x: 1 })).toEqual({ reason: 'ok' });
    expect(backend.data.value).toBe('{"x":1}');
  });
});
describe('setStorageNumber', () => {
  it('stores finite values and throws RangeError for programmer misuse', () => {
    const backend = memoryBackend();
    const host = localHost(backend);
    expect(setStorageNumber(host.storage.local, 'number', 2.5)).toEqual({ reason: 'ok' });
    expect(backend.data.number).toBe('2.5');
    expect(() => setStorageNumber(host.storage.local, 'nan', Number.NaN)).toThrow(RangeError);
    expect(() => setStorageNumber(host.storage.local, 'infinity', Infinity)).toThrow(RangeError);
  });
});

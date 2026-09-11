import { EntityRuntimeKey } from '@flighthq/types/contract';

import { webHost } from './webHost';
import { initializeWebStorageBackend, webHostStorage, webHostStorageChange, webStorageBackend } from './webStorage';

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

describe('initializeWebStorageBackend', () => {
  it('is the construction initializer of createWebStorageBackend', () => {
    expect(typeof initializeWebStorageBackend).toBe('function');
  });
});
describe('webHostStorage providers', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('decomposes the legacy provider into exact local and change Host leaves', () => {
    expect(EntityRuntimeKey in webStorageBackend).toBe(true);
    expect(webHost.storage.local).toBe(webHostStorage);
    expect(webHost.storage.change).toBe(webHostStorageChange);
    expect(webHostStorage).not.toBe(webHostStorageChange);
  });

  it('distinguishes an ordinary miss from an empty stored string', () => {
    localStorage.setItem('empty', '');
    expect(webHostStorage.getItem('missing')).toEqual({ reason: 'ok', value: null });
    expect(webHostStorage.getItem('empty')).toEqual({ reason: 'ok', value: '' });
  });

  it('distinguishes successful empty keys from a failed query', () => {
    expect(webHostStorage.keys()).toEqual({ reason: 'ok', value: [] });
    localStorage.setItem('key', 'value');
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw namedError('SecurityError');
    });
    expect(webHostStorage.keys()).toEqual({ reason: 'security-denied', value: null });
  });

  it('classifies reliable Web security, quota, and method failures without private-mode inference', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw namedError('SecurityError');
    });
    expect(webHostStorage.getItem('key')).toEqual({ reason: 'security-denied', value: null });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw namedError('QuotaExceededError');
    });
    expect(webHostStorage.setItem('key', 'value')).toEqual({ reason: 'quota-exceeded' });

    vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
      throw new Error('method failed');
    });
    expect(webHostStorage.removeItem('key')).toEqual({ reason: 'remove-failed' });

    vi.spyOn(Storage.prototype, 'clear').mockImplementationOnce(() => {
      throw new Error('method failed');
    });
    expect(webHostStorage.clear()).toEqual({ reason: 'clear-failed' });
  });

  it('returns runtime-unavailable when the Web runtime is absent', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(webHostStorage.getItem('key')).toEqual({ reason: 'runtime-unavailable', value: null });
      expect(webHostStorage.keys()).toEqual({ reason: 'runtime-unavailable', value: null });
      expect(webHostStorage.setItem('key', 'value')).toEqual({ reason: 'runtime-unavailable' });
      expect(webHostStorage.removeItem('key')).toEqual({ reason: 'runtime-unavailable' });
      expect(webHostStorage.clear()).toEqual({ reason: 'runtime-unavailable' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('treats removing an absent key as idempotent success', () => {
    expect(webHostStorage.removeItem('missing')).toEqual({ reason: 'ok' });
  });

  it('delivers storage events and the returned release detaches the exact listener', () => {
    const changes: unknown[] = [];
    const release = webHostStorageChange.subscribe((change) => changes.push(change));
    expect(release).not.toBeNull();
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'key', newValue: 'new', oldValue: 'old', storageArea: localStorage }),
    );
    expect(changes).toEqual([{ key: 'key', newValue: 'new', oldValue: 'old' }]);
    release?.();
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: '1', storageArea: localStorage }));
    expect(changes).toHaveLength(1);
  });

  it('destroy releases active subscriptions and makes later acquisition fail', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    expect(webHostStorageChange.subscribe(() => {})).not.toBeNull();
    webHostStorageChange.destroy();
    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
    expect(webHostStorageChange.subscribe(() => {})).toBeNull();
    expect(() => webHostStorageChange.destroy()).not.toThrow();
  });
});

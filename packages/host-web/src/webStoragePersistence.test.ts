import type {
  PermissionState,
  WebWindowStoragePersistenceApi,
  WebWorkerStoragePersistenceApi,
} from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWebWindowStoragePersistenceCapabilities,
  createWebWorkerStoragePersistenceCapabilities,
  initializeWebWorkerStoragePersistenceCapabilities,
} from './webStoragePersistence';

describe('createWebWindowStoragePersistenceCapabilities', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('constructs the exact Window profile while the Worker profile remains query-only', () => {
    const windowCapabilities = createWebWindowStoragePersistenceCapabilities(windowApi().api);
    const workerCapabilities = createWebWorkerStoragePersistenceCapabilities(workerApi().api);

    expect(Object.keys(windowCapabilities).sort()).toEqual(['persistenceQuery', 'persistenceRequest']);
    expect(Object.keys(workerCapabilities)).toEqual(['persistenceQuery']);
  });

  it.each([
    [true, 'denied', { outcome: 'persistent', permissionState: 'denied' }],
    [false, 'granted', { outcome: 'best-effort', permissionState: 'granted' }],
    [false, 'prompt', { outcome: 'best-effort', permissionState: 'prompt' }],
  ] as const)('queries bucket=%s and permission=%s as independent facts', async (persisted, state, expected) => {
    const fake = windowApi({ persisted, state });
    const capabilities = createWebWindowStoragePersistenceCapabilities(fake.api);

    await expect(capabilities.persistenceQuery.getPersistence()).resolves.toEqual(expected);
    expect(fake.persisted).toHaveBeenCalledOnce();
    expect(fake.persist).not.toHaveBeenCalled();
    expect(fake.getPermissionState).toHaveBeenCalledOnce();
    expect(fake.events).toEqual(['persisted', 'permission']);
  });

  it('keeps a nonfailed query outcome when permission state is not observed', async () => {
    const fake = windowApi({ persisted: false, permissionFailure: true });
    const capabilities = createWebWindowStoragePersistenceCapabilities(fake.api);

    await expect(capabilities.persistenceQuery.getPersistence()).resolves.toEqual({
      outcome: 'best-effort',
      permissionState: null,
    });
    expect(fake.persisted).toHaveBeenCalledOnce();
    expect(fake.getPermissionState).toHaveBeenCalledOnce();
  });

  it('keeps an observed permission state when the bucket query fails', async () => {
    const fake = windowApi({ persistedFailure: true, state: 'granted' });
    const capabilities = createWebWindowStoragePersistenceCapabilities(fake.api);

    await expect(capabilities.persistenceQuery.getPersistence()).resolves.toEqual({
      outcome: 'operation-failed',
      permissionState: 'granted',
    });
    expect(fake.persisted).toHaveBeenCalledOnce();
    expect(fake.getPermissionState).toHaveBeenCalledOnce();
  });

  it.each([
    [true, 'prompt', { outcome: 'persistent', permissionState: 'prompt' }],
    [false, 'denied', { outcome: 'best-effort', permissionState: 'denied' }],
  ] as const)('requests bucket=%s and then observes permission=%s', async (persisted, state, expected) => {
    const fake = windowApi({ persist: persisted, state });
    const capabilities = createWebWindowStoragePersistenceCapabilities(fake.api);

    await expect(capabilities.persistenceRequest.requestPersistence()).resolves.toEqual(expected);
    expect(fake.persist).toHaveBeenCalledOnce();
    expect(fake.persisted).not.toHaveBeenCalled();
    expect(fake.getPermissionState).toHaveBeenCalledOnce();
    expect(fake.events).toEqual(['persist', 'permission']);
  });

  it('calls persist exactly once and still observes permission after rejection', async () => {
    const fake = windowApi({ persistFailure: true, state: 'denied' });
    const capabilities = createWebWindowStoragePersistenceCapabilities(fake.api);

    await expect(capabilities.persistenceRequest.requestPersistence()).resolves.toEqual({
      outcome: 'operation-failed',
      permissionState: 'denied',
    });
    expect(fake.persist).toHaveBeenCalledOnce();
    expect(fake.getPermissionState).toHaveBeenCalledOnce();
    expect(fake.events).toEqual(['persist', 'permission']);
  });

  it('uses injected functions only and never consults ambient navigator', async () => {
    vi.stubGlobal(
      'navigator',
      new Proxy(
        {},
        {
          get() {
            throw new Error('ambient navigator must not be consulted by the injected adapter');
          },
        },
      ),
    );
    const fake = windowApi({ persisted: false, state: 'prompt' });
    const capabilities = createWebWindowStoragePersistenceCapabilities(fake.api);

    await expect(capabilities.persistenceQuery.getPersistence()).resolves.toEqual({
      outcome: 'best-effort',
      permissionState: 'prompt',
    });
  });
});

describe('createWebWorkerStoragePersistenceCapabilities', () => {
  it('queries the same independent snapshot without manufacturing a request capability', async () => {
    const fake = workerApi({ persisted: false, permissionFailure: true });
    const capabilities = createWebWorkerStoragePersistenceCapabilities(fake.api);

    await expect(capabilities.persistenceQuery.getPersistence()).resolves.toEqual({
      outcome: 'best-effort',
      permissionState: null,
    });
    expect(Object.keys(capabilities)).toEqual(['persistenceQuery']);
    expect(fake.persisted).toHaveBeenCalledOnce();
    expect(fake.getPermissionState).toHaveBeenCalledOnce();
  });
});

interface FakeOptions {
  readonly persist?: boolean;
  readonly persisted?: boolean;
  readonly persistFailure?: boolean;
  readonly persistedFailure?: boolean;
  readonly permissionFailure?: boolean;
  readonly state?: PermissionState;
}

function workerApi(options: Readonly<FakeOptions> = {}) {
  const events: string[] = [];
  const persisted = vi.fn(async () => {
    events.push('persisted');
    if (options.persistedFailure === true) throw new Error('persisted failed');
    return options.persisted ?? true;
  });
  const getPermissionState = vi.fn(async () => {
    events.push('permission');
    if (options.permissionFailure === true) throw new Error('permission failed');
    return options.state ?? 'granted';
  });
  const api: WebWorkerStoragePersistenceApi = { getPermissionState, persisted };
  return { api, events, getPermissionState, persisted };
}

function windowApi(options: Readonly<FakeOptions> = {}) {
  const worker = workerApi(options);
  const persist = vi.fn(async () => {
    worker.events.push('persist');
    if (options.persistFailure === true) throw new Error('persist failed');
    return options.persist ?? true;
  });
  const api: WebWindowStoragePersistenceApi = { ...worker.api, persist };
  return { ...worker, api, persist };
}
describe('initializeWebWorkerStoragePersistenceCapabilities', () => {
  it('is the construction initializer of createWebWorkerStoragePersistenceCapabilities', () => {
    expect(typeof initializeWebWorkerStoragePersistenceCapabilities).toBe('function');
  });
});

import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  HostMidiPermissionProvider,
  HostNotificationPermissionProvider,
  HostStoragePersistenceQueryProvider,
} from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPermissionState } from './permission';

describe('getPermissionState', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['default', 'prompt'],
  ] as const)('projects Notification %s to the common %s state', async (permission, state) => {
    const getPermission = vi.fn(async () => ({ permission, reason: 'ok' as const }));
    const requestPermission = vi.fn();
    const provider = notificationProvider({ getPermission, requestPermission });
    forbidNativeNotificationOwner();

    await expect(getPermissionState(provider, undefined, undefined, 'notifications')).resolves.toEqual({
      reason: 'ok',
      state,
    });
    expect(getPermission).toHaveBeenCalledOnce();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('preserves an owner query failure instead of returning a plausible state', async () => {
    const provider = notificationProvider({
      getPermission: vi.fn(async () => ({ reason: 'operation-failed' as const })),
      requestPermission: vi.fn(),
    });

    await expect(getPermissionState(provider, undefined, undefined, 'notifications')).resolves.toEqual({
      reason: 'operation-failed',
    });
  });

  it('reports an absent Notification owner structurally instead of falling back to a native global', async () => {
    forbidNativeNotificationOwner();

    await expect(getPermissionState(undefined, undefined, undefined, 'notifications')).resolves.toEqual({
      reason: 'unsupported',
    });
  });

  it.each([
    [
      { outcome: 'persistent', permissionState: 'denied' },
      { reason: 'ok', state: 'granted' },
    ],
    [{ outcome: 'operation-failed', permissionState: 'granted' }, { reason: 'operation-failed' }],
    [
      { outcome: 'best-effort', permissionState: 'granted' },
      { reason: 'best-effort', state: 'granted' },
    ],
    [
      { outcome: 'best-effort', permissionState: 'denied' },
      { reason: 'best-effort', state: 'denied' },
    ],
    [
      { outcome: 'best-effort', permissionState: 'prompt' },
      { reason: 'best-effort', state: 'prompt' },
    ],
    [
      { outcome: 'best-effort', permissionState: null },
      { reason: 'best-effort', state: null },
    ],
  ] as const)('projects the Storage owner snapshot %# without inferring field consistency', async (owner, expected) => {
    const getPersistence = vi.fn(async () => owner);
    const provider = persistenceProvider({ getPersistence });
    forbidNativeStorageOwner();

    await expect(getPermissionState(undefined, undefined, provider, 'persistent-storage')).resolves.toEqual(expected);
    expect(getPersistence).toHaveBeenCalledOnce();
  });

  it('reports an absent persistence-query owner structurally', async () => {
    forbidNativeStorageOwner();

    await expect(getPermissionState(undefined, undefined, undefined, 'persistent-storage')).resolves.toEqual({
      reason: 'unsupported',
    });
  });

  it('projects MIDI from only Host.midi.permission without touching Web globals or access', async () => {
    const getPermission = vi.fn(async () => ({ reason: 'ok' as const, state: 'prompt' as const }));
    const provider = { [EntityRuntimeKey]: undefined, getPermission } as HostMidiPermissionProvider;
    vi.stubGlobal(
      'navigator',
      new Proxy(
        {},
        {
          get() {
            throw new Error('a MIDI permission query resolved an ambient Web owner');
          },
        },
      ),
    );

    await expect(getPermissionState(undefined, provider, undefined, 'midi')).resolves.toEqual({
      reason: 'ok',
      state: 'prompt',
    });
    expect(getPermission).toHaveBeenCalledOnce();
  });

  it('requires explicit providers at the caller boundary', () => {
    expect(ambientPermissionQueryMustNotCompile).toBeTypeOf('function');
  });
});

function ambientPermissionQueryMustNotCompile(): void {
  // @ts-expect-error Permission queries never resolve an ambient provider.
  void getPermissionState('notifications');
}

function forbidNativeNotificationOwner(): void {
  vi.stubGlobal(
    'Notification',
    new Proxy(
      {},
      {
        get() {
          throw new Error('Permissions must delegate to HostNotificationPermissionProvider');
        },
      },
    ),
  );
}

function forbidNativeStorageOwner(): void {
  vi.stubGlobal(
    'navigator',
    new Proxy(
      {},
      {
        get() {
          throw new Error('Permissions must delegate to HostStoragePersistenceQueryProvider');
        },
      },
    ),
  );
}

function persistenceProvider(provider: object): HostStoragePersistenceQueryProvider {
  return { [EntityRuntimeKey]: undefined, ...provider } as unknown as HostStoragePersistenceQueryProvider;
}

function notificationProvider(provider: object): HostNotificationPermissionProvider {
  return provider as HostNotificationPermissionProvider;
}

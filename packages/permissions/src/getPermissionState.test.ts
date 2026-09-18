import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  HostMidiPermissionCapability,
  HostNotificationPermissionCapability,
  HostPermissionsCapability,
  HostPreferencesPersistenceQueryCapability,
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
    const provider = permissionsProvider({ getPermission, requestPermission });
    forbidNativeNotificationOwner();

    await expect(getPermissionState(provider, undefined, undefined, 'notifications')).resolves.toEqual({
      reason: 'ok',
      state,
    });
    expect(getPermission).toHaveBeenCalledOnce();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('preserves an owner query failure instead of returning a plausible state', async () => {
    const provider = permissionsProvider({
      getPermission: vi.fn(async () => ({ reason: 'operation-failed' as const })),
      requestPermission: vi.fn(),
    });

    await expect(getPermissionState(provider, undefined, undefined, 'notifications')).resolves.toEqual({
      reason: 'operation-failed',
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

    await expect(getPermissionState(permissionsProvider(), undefined, provider, 'persistent-storage')).resolves.toEqual(
      expected,
    );
    expect(getPersistence).toHaveBeenCalledOnce();
  });

  it('reports an absent persistence-query owner structurally', async () => {
    forbidNativeStorageOwner();

    await expect(
      getPermissionState(permissionsProvider(), undefined, undefined, 'persistent-storage'),
    ).resolves.toEqual({
      reason: 'unsupported',
    });
  });

  it('projects MIDI from only Host.midi.permission without touching Web globals or access', async () => {
    const getPermission = vi.fn(async () => ({ reason: 'ok' as const, state: 'prompt' as const }));
    const provider = { [EntityRuntimeKey]: undefined, getPermission } as HostMidiPermissionCapability;
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

    await expect(getPermissionState(permissionsProvider(), provider, undefined, 'midi')).resolves.toEqual({
      reason: 'ok',
      state: 'prompt',
    });
    expect(getPermission).toHaveBeenCalledOnce();
  });

  it('delegates native queries to the explicit permissions provider without reading Web globals', async () => {
    const queryPermission = vi.fn(async () => ({ reason: 'ok' as const, state: 'granted' as const }));
    forbidNativePermissionQuery();
    const provider = permissionsProvider(undefined, queryPermission);

    await expect(getPermissionState(provider, undefined, undefined, 'camera')).resolves.toEqual({
      reason: 'ok',
      state: 'granted',
    });
    expect(queryPermission).toHaveBeenCalledWith('camera');
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
          throw new Error('Permissions must delegate to HostNotificationPermissionCapability');
        },
      },
    ),
  );
}

function forbidNativePermissionQuery(): void {
  vi.stubGlobal(
    'navigator',
    new Proxy(
      {},
      {
        get() {
          throw new Error('Permissions must delegate to HostPermissionsCapability');
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
          throw new Error('Permissions must delegate to HostPreferencesPersistenceQueryCapability');
        },
      },
    ),
  );
}

function persistenceProvider(provider: object): HostPreferencesPersistenceQueryCapability {
  return { [EntityRuntimeKey]: undefined, ...provider } as unknown as HostPreferencesPersistenceQueryCapability;
}

function permissionsProvider(
  notification: HostNotificationPermissionCapability = {
    getPermission: async () => ({ permission: 'default', reason: 'ok' }),
    requestPermission: async () => ({ reason: 'dismissed' }),
  },
  queryPermission: HostPermissionsCapability['queryPermission'] = async () => ({ reason: 'unsupported' }),
): HostPermissionsCapability {
  return {
    notification,
    queryPermission,
    requestMediaAccess: async () => ({ reason: 'runtime-unavailable' }),
    requestWakeLock: async () => ({ reason: 'runtime-unavailable' }),
  };
}

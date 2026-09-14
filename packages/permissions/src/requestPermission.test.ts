import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  HostNotificationPermissionProvider,
  HostPermissionsProvider,
  HostStoragePersistenceRequestProvider,
} from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestPermission } from './permission';

describe('requestPermission', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['dismissed', 'prompt'],
  ] as const)('projects the Notification %s outcome without erasing its owner reason', async (reason, state) => {
    const request = vi.fn(async () => ({ reason }));
    const provider = permissionsProvider({ notification: { getPermission: vi.fn(), requestPermission: request } });
    forbidNativeNotificationOwner();

    await expect(requestPermission(provider, undefined, undefined, 'notifications')).resolves.toEqual({
      reason,
      state,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it('preserves an owner request failure instead of translating it to denial', async () => {
    const provider = permissionsProvider({
      notification: {
        getPermission: vi.fn(),
        requestPermission: vi.fn(async () => ({ reason: 'operation-failed' as const })),
      },
    });

    await expect(requestPermission(provider, undefined, undefined, 'notifications')).resolves.toEqual({
      reason: 'operation-failed',
    });
  });

  it('delegates media acquisition and preserves its cleanup failure outcome', async () => {
    const requestMediaAccess = vi.fn(async () => ({ reason: 'cleanup-failed' as const, state: 'granted' as const }));
    const provider = permissionsProvider({ requestMediaAccess });
    forbidNativePermissionOwner();

    await expect(requestPermission(provider, undefined, undefined, 'camera')).resolves.toEqual({
      reason: 'cleanup-failed',
      state: 'granted',
    });
    expect(requestMediaAccess).toHaveBeenCalledWith('camera');
  });

  it('delegates wake-lock acquisition and preserves its cleanup failure outcome', async () => {
    const requestWakeLock = vi.fn(async () => ({ reason: 'cleanup-failed' as const, state: 'granted' as const }));
    const provider = permissionsProvider({ requestWakeLock });
    forbidNativePermissionOwner();

    await expect(requestPermission(provider, undefined, undefined, 'screen-wake-lock')).resolves.toEqual({
      reason: 'cleanup-failed',
      state: 'granted',
    });
    expect(requestWakeLock).toHaveBeenCalledOnce();
  });

  it('projects a thrown host permission request as an operational failure', async () => {
    const provider = permissionsProvider({
      requestMediaAccess: async () => {
        throw new Error('provider failed');
      },
    });

    await expect(requestPermission(provider, undefined, undefined, 'camera')).resolves.toEqual({
      reason: 'operation-failed',
    });
  });

  it('reports an absent request route without silently degrading to a read', async () => {
    const queryPermission = vi.fn(async () => ({ reason: 'ok' as const, state: 'granted' as const }));
    const provider = permissionsProvider({ queryPermission });

    await expect(requestPermission(provider, undefined, undefined, 'push')).resolves.toEqual({
      reason: 'no-request-route',
    });
    expect(queryPermission).not.toHaveBeenCalled();
  });

  it.each([
    [
      { outcome: 'persistent', permissionState: 'prompt' },
      { reason: 'granted', state: 'granted' },
    ],
    [{ outcome: 'operation-failed', permissionState: 'denied' }, { reason: 'operation-failed' }],
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
  ] as const)(
    'projects the Storage request snapshot %# without inferring field consistency',
    async (owner, expected) => {
      const requestPersistence = vi.fn(async () => owner);
      const provider = persistenceProvider({ requestPersistence });
      forbidNativeStorageOwner();

      await expect(
        requestPermission(permissionsProvider(), provider, undefined, 'persistent-storage'),
      ).resolves.toEqual(expected);
      expect(requestPersistence).toHaveBeenCalledOnce();
    },
  );

  it('reports an absent persistence-request owner without crossing into query', async () => {
    const getPersistence = vi.fn(async () => ({ outcome: 'persistent' as const, permissionState: 'granted' as const }));
    forbidNativeStorageOwner();

    await expect(requestPermission(permissionsProvider(), undefined, undefined, 'persistent-storage')).resolves.toEqual(
      {
        reason: 'unsupported',
      },
    );
    expect(getPersistence).not.toHaveBeenCalled();
  });

  it('makes MIDI query-only here and never acquires ambient access', async () => {
    const requestMIDIAccess = vi.fn();
    vi.stubGlobal('navigator', { requestMIDIAccess });

    await expect(requestPermission(permissionsProvider(), undefined, undefined, 'midi')).resolves.toEqual({
      reason: 'no-request-route',
    });
    expect(requestMIDIAccess).not.toHaveBeenCalled();
  });

  it('requires explicit providers at the caller boundary', () => {
    expect(ambientPermissionRequestMustNotCompile).toBeTypeOf('function');
  });
});

function ambientPermissionRequestMustNotCompile(): void {
  // @ts-expect-error Permission requests never resolve an ambient provider.
  void requestPermission('notifications');
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

function forbidNativePermissionOwner(): void {
  vi.stubGlobal(
    'navigator',
    new Proxy(
      {},
      {
        get() {
          throw new Error('Permissions must delegate to HostPermissionsProvider');
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
          throw new Error('Permissions must delegate to HostStoragePersistenceRequestProvider');
        },
      },
    ),
  );
}

function persistenceProvider(provider: object): HostStoragePersistenceRequestProvider {
  return { [EntityRuntimeKey]: undefined, ...provider } as unknown as HostStoragePersistenceRequestProvider;
}

interface PermissionsProviderOverrides {
  readonly notification?: HostNotificationPermissionProvider;
  readonly queryPermission?: HostPermissionsProvider['queryPermission'];
  readonly requestMediaAccess?: HostPermissionsProvider['requestMediaAccess'];
  readonly requestWakeLock?: HostPermissionsProvider['requestWakeLock'];
}

function permissionsProvider(overrides: Readonly<PermissionsProviderOverrides> = {}): HostPermissionsProvider {
  return {
    [EntityRuntimeKey]: undefined,
    notification: overrides.notification ?? {
      getPermission: async () => ({ permission: 'default', reason: 'ok' }),
      requestPermission: async () => ({ reason: 'dismissed' }),
    },
    queryPermission: overrides.queryPermission ?? (async () => ({ reason: 'unsupported' })),
    requestMediaAccess: overrides.requestMediaAccess ?? (async () => ({ reason: 'runtime-unavailable' })),
    requestWakeLock: overrides.requestWakeLock ?? (async () => ({ reason: 'runtime-unavailable' })),
  };
}

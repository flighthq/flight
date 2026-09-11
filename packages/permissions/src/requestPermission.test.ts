import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  HostNotificationPermissionProvider,
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
    const provider = notificationProvider({ getPermission: vi.fn(), requestPermission: request });
    forbidNativeNotificationOwner();

    await expect(requestPermission(provider, undefined, undefined, 'notifications')).resolves.toEqual({
      reason,
      state,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it('preserves an owner request failure instead of translating it to denial', async () => {
    const provider = notificationProvider({
      getPermission: vi.fn(),
      requestPermission: vi.fn(async () => ({ reason: 'operation-failed' as const })),
    });

    await expect(requestPermission(provider, undefined, undefined, 'notifications')).resolves.toEqual({
      reason: 'operation-failed',
    });
  });

  it('attempts every acquired media-track cleanup and reports cleanup failure as operational, not denial', async () => {
    const stopped: string[] = [];
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [
            { stop: () => stopped.push('first') },
            {
              stop: () => {
                stopped.push('second');
                throw new Error('second stop failed');
              },
            },
            { stop: () => stopped.push('third') },
          ],
        }),
      },
    });

    await expect(requestPermission(undefined, undefined, undefined, 'camera')).resolves.toEqual({
      reason: 'cleanup-failed',
      state: 'granted',
    });
    expect(stopped).toEqual(['first', 'second', 'third']);
  });

  it('reports a wake-lock release failure as cleanup failure after the request succeeded', async () => {
    vi.stubGlobal('navigator', {
      wakeLock: {
        request: async () => ({
          release: async () => {
            throw new Error('release failed');
          },
        }),
      },
    });

    await expect(requestPermission(undefined, undefined, undefined, 'screen-wake-lock')).resolves.toEqual({
      reason: 'cleanup-failed',
      state: 'granted',
    });
  });

  it('reports the Wake Lock API as unavailable when the standard property is absent at runtime', async () => {
    vi.stubGlobal('navigator', {});

    await expect(requestPermission(undefined, undefined, undefined, 'screen-wake-lock')).resolves.toEqual({
      reason: 'runtime-unavailable',
    });
  });

  it('keeps acquisition failure separate from user denial', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: async () => {
          throw new Error('device disconnected');
        },
      },
    });

    await expect(requestPermission(undefined, undefined, undefined, 'camera')).resolves.toEqual({
      reason: 'operation-failed',
    });
  });

  it('reports an absent request route without silently degrading to a read', async () => {
    const query = vi.fn(async () => ({ state: 'granted' }));
    vi.stubGlobal('navigator', { permissions: { query } });

    await expect(requestPermission(undefined, undefined, undefined, 'push')).resolves.toEqual({
      reason: 'no-request-route',
    });
    expect(query).not.toHaveBeenCalled();
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

      await expect(requestPermission(undefined, provider, undefined, 'persistent-storage')).resolves.toEqual(expected);
      expect(requestPersistence).toHaveBeenCalledOnce();
    },
  );

  it('reports an absent persistence-request owner without crossing into query', async () => {
    const getPersistence = vi.fn(async () => ({ outcome: 'persistent' as const, permissionState: 'granted' as const }));
    forbidNativeStorageOwner();

    await expect(requestPermission(undefined, undefined, undefined, 'persistent-storage')).resolves.toEqual({
      reason: 'unsupported',
    });
    expect(getPersistence).not.toHaveBeenCalled();
  });

  it('makes MIDI query-only here and never acquires ambient access', async () => {
    const requestMIDIAccess = vi.fn();
    vi.stubGlobal('navigator', { requestMIDIAccess });

    await expect(requestPermission(undefined, undefined, undefined, 'midi')).resolves.toEqual({
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

function notificationProvider(provider: object): HostNotificationPermissionProvider {
  return provider as HostNotificationPermissionProvider;
}

import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { Host } from '@flighthq/types/contract';
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
    const host = notificationHost({ getPermission: vi.fn(), requestPermission: request });
    forbidNativeNotificationOwner();

    await expect(requestPermission(host, 'notifications')).resolves.toEqual({ reason, state });
    expect(request).toHaveBeenCalledOnce();
  });

  it('preserves an owner request failure instead of translating it to denial', async () => {
    const host = notificationHost({
      getPermission: vi.fn(),
      requestPermission: vi.fn(async () => ({ reason: 'operation-failed' as const })),
    });

    await expect(requestPermission(host, 'notifications')).resolves.toEqual({ reason: 'operation-failed' });
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

    await expect(requestPermission(notificationHost(null), 'camera')).resolves.toEqual({
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

    await expect(requestPermission(notificationHost(null), 'screen-wake-lock')).resolves.toEqual({
      reason: 'cleanup-failed',
      state: 'granted',
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

    await expect(requestPermission(notificationHost(null), 'camera')).resolves.toEqual({
      reason: 'operation-failed',
    });
  });

  it('reports an absent request route without silently degrading to a read', async () => {
    const query = vi.fn(async () => ({ state: 'granted' }));
    vi.stubGlobal('navigator', { permissions: { query } });

    await expect(requestPermission(notificationHost(null), 'push')).resolves.toEqual({ reason: 'no-request-route' });
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
      const host = persistenceHost({ requestPersistence });
      forbidNativeStorageOwner();

      await expect(requestPermission(host, 'persistent-storage')).resolves.toEqual(expected);
      expect(requestPersistence).toHaveBeenCalledOnce();
    },
  );

  it('reports an absent persistence-request owner without crossing into query', async () => {
    const getPersistence = vi.fn(async () => ({ outcome: 'persistent' as const, permissionState: 'granted' as const }));
    const host = persistenceHost(null, { getPersistence });
    forbidNativeStorageOwner();

    await expect(requestPermission(host, 'persistent-storage')).resolves.toEqual({ reason: 'unsupported' });
    expect(getPersistence).not.toHaveBeenCalled();
  });

  it('makes MIDI query-only here and never acquires access from either owner', async () => {
    const midi: object = {};
    Object.defineProperty(midi, 'permission', {
      get() {
        throw new Error('a MIDI request-only decision queried permission');
      },
    });
    Object.defineProperty(midi, 'access', {
      get() {
        throw new Error('Permissions acquired explicit MIDI access');
      },
    });
    const requestMIDIAccess = vi.fn();
    vi.stubGlobal('navigator', { requestMIDIAccess });

    await expect(requestPermission(hostWithMidiGroup(midi), 'midi')).resolves.toEqual({
      reason: 'no-request-route',
    });
    expect(requestMIDIAccess).not.toHaveBeenCalled();
  });

  it('requires an explicit Host at the caller boundary', () => {
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
          throw new Error('Permissions must delegate to Host.notification.permission');
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
          throw new Error('Permissions must delegate persistent-storage to Host.storage.persistenceRequest');
        },
      },
    ),
  );
}

function persistenceHost(persistenceRequest: object | null, persistenceQuery: object | null = null): Host {
  return {
    [EntityRuntimeKey]: undefined,
    notification: {},
    storage: {
      ...(persistenceQuery === null ? {} : { persistenceQuery }),
      ...(persistenceRequest === null ? {} : { persistenceRequest }),
    },
  } as unknown as Host;
}

function notificationHost(permission: object | null): Host {
  return {
    [EntityRuntimeKey]: undefined,
    accessibility: {},
    app: {},
    clipboard: {},
    connectivity: {},
    dialog: {},
    graphics: {},
    input: {},
    media: {},
    menu: {},
    midi: {},
    net: {},
    notification: permission === null ? {} : { permission },
    share: {},
    storage: {},
    system: {},
    text: {},
    tray: {},
    ui: {},
    window: {},
  } as unknown as Host;
}

function hostWithMidiGroup(midi: object): Host {
  return { ...notificationHost(null), midi } as Host;
}

import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { Host } from '@flighthq/types/contract';
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
    const host = notificationHost({ getPermission, requestPermission });
    forbidNativeNotificationOwner();

    await expect(getPermissionState(host, 'notifications')).resolves.toEqual({ reason: 'ok', state });
    expect(getPermission).toHaveBeenCalledOnce();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('preserves an owner query failure instead of returning a plausible state', async () => {
    const host = notificationHost({
      getPermission: vi.fn(async () => ({ reason: 'operation-failed' as const })),
      requestPermission: vi.fn(),
    });

    await expect(getPermissionState(host, 'notifications')).resolves.toEqual({ reason: 'operation-failed' });
  });

  it('reports an absent Notification owner structurally instead of falling back to a native global', async () => {
    const host = notificationHost(null);
    forbidNativeNotificationOwner();

    await expect(getPermissionState(host, 'notifications')).resolves.toEqual({ reason: 'unsupported' });
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
    const host = persistenceHost({ getPersistence });
    forbidNativeStorageOwner();

    await expect(getPermissionState(host, 'persistent-storage')).resolves.toEqual(expected);
    expect(getPersistence).toHaveBeenCalledOnce();
  });

  it('reports an absent persistence-query owner structurally', async () => {
    const host = persistenceHost(null);
    forbidNativeStorageOwner();

    await expect(getPermissionState(host, 'persistent-storage')).resolves.toEqual({ reason: 'unsupported' });
  });

  it('projects MIDI from only Host.midi.permission without touching Web globals or access', async () => {
    const getPermission = vi.fn(async () => ({ reason: 'ok' as const, state: 'prompt' as const }));
    const midi: object = {};
    Object.defineProperty(midi, 'access', {
      get() {
        throw new Error('a MIDI permission query acquired access');
      },
    });
    Object.defineProperty(midi, 'permission', { value: { getPermission } });
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

    await expect(getPermissionState(hostWithMidiGroup(midi), 'midi')).resolves.toEqual({
      reason: 'ok',
      state: 'prompt',
    });
    expect(getPermission).toHaveBeenCalledOnce();
  });

  it('requires an explicit Host at the caller boundary', () => {
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
          throw new Error('Permissions must delegate persistent-storage to Host.storage.persistenceQuery');
        },
      },
    ),
  );
}

function persistenceHost(persistenceQuery: object | null): Host {
  return {
    [EntityRuntimeKey]: undefined,
    notification: {},
    storage: persistenceQuery === null ? {} : { persistenceQuery },
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

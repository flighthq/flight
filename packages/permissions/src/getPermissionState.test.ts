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

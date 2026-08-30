import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { TauriApi, TauriNotificationOptions, TauriNotificationPermission } from '@flighthq/types/contract';

import { createTauriNotificationCapabilities } from './tauriNotification';

function fakeTauri(granted = true, permission: TauriNotificationPermission = 'granted') {
  const sent: TauriNotificationOptions[] = [];
  const notification = {
    async isPermissionGranted() {
      return granted;
    },
    async requestPermission() {
      return permission;
    },
    sendNotification(options: TauriNotificationOptions) {
      sent.push(options);
    },
  };
  return { notification, sent, tauri: { notification } as unknown as TauriApi };
}

describe('createTauriNotificationCapabilities', () => {
  it('constructs exactly permission, delivery, and lifecycle', () => {
    const capabilities = createTauriNotificationCapabilities(fakeTauri().tauri);
    expect(EntityRuntimeKey in capabilities).toBe(true);
    expect(Object.keys(capabilities).sort()).toEqual(['delivery', 'lifecycle', 'permission']);
  });

  it('reports provider acceptance without claiming display success', async () => {
    const { sent, tauri } = fakeTauri();
    const capabilities = createTauriNotificationCapabilities(tauri);
    const outcome = await capabilities.delivery.notify({
      body: 'there',
      id: 'n1',
      title: 'Hi',
    });
    expect(outcome).toMatchObject({
      notification: { id: 'n1' },
      reason: 'accepted',
    });
    expect(sent).toEqual([{ body: 'there', icon: undefined, title: 'Hi' }]);
  });

  it('reports permission denial and operation failure distinctly', async () => {
    const denied = createTauriNotificationCapabilities(fakeTauri(false).tauri);
    await expect(denied.delivery.notify({ title: 'No' })).resolves.toEqual({
      reason: 'permission-denied',
    });
    const fixture = fakeTauri();
    fixture.notification.isPermissionGranted = async () => {
      throw new Error('native failed');
    };
    const failed = createTauriNotificationCapabilities(fixture.tauri);
    await expect(failed.permission.getPermission()).resolves.toEqual({
      reason: 'operation-failed',
    });
    await expect(failed.delivery.notify({ title: 'No' })).resolves.toEqual({
      reason: 'operation-failed',
    });
  });

  it('rejects fields the built Tauri profile cannot carry', async () => {
    const capabilities = createTauriNotificationCapabilities(fakeTauri().tauri);
    await expect(capabilities.delivery.notify({ silent: true, title: 'No' })).resolves.toEqual({
      fields: ['silent'],
      reason: 'invalid-request',
    });
  });
});

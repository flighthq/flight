import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { TauriApi, TauriNotificationOptions, TauriNotificationPermission } from '@flighthq/types/contract';

import { createTauriNotificationCapabilities } from './tauriNotification';

function fakeTauri(granted = true, permission: TauriNotificationPermission = 'granted') {
  const sent: TauriNotificationOptions[] = [];
  const tauri = {
    notification: {
      async isPermissionGranted() {
        return granted;
      },
      async requestPermission() {
        return permission;
      },
      sendNotification(options: TauriNotificationOptions) {
        sent.push(options);
      },
    },
  } as unknown as TauriApi;
  return { sent, tauri };
}

describe('createTauriNotificationCapabilities', () => {
  it('declares delivery alone and resolves the request id', async () => {
    const { sent, tauri } = fakeTauri();
    const capabilities = createTauriNotificationCapabilities(tauri);
    expect(EntityRuntimeKey in capabilities).toBe(true);
    expect(Object.keys(capabilities)).toEqual(['delivery']);
    expect(await capabilities.delivery.notify({ body: 'there', id: 'n1', title: 'Hi' })).toBe('n1');
    expect(sent[0]).toEqual({ body: 'there', icon: undefined, title: 'Hi' });
  });

  it('generates an id when the request omits one', async () => {
    const capabilities = createTauriNotificationCapabilities(fakeTauri().tauri);
    expect(await capabilities.delivery.notify({ title: 'Hi' })).toMatch(/^notification-/);
  });

  it('queries current permission instead of serving a construction-time cache', async () => {
    const capabilities = createTauriNotificationCapabilities(fakeTauri(false, 'granted').tauri);
    expect(await capabilities.delivery.getPermission()).toBe('default');
    expect(await capabilities.delivery.requestPermission()).toBe('granted');
  });
});

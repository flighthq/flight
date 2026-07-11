import type { TauriApi, TauriNotificationOptions, TauriNotificationPermission } from './tauriModule';
import { createTauriNotificationBackend } from './tauriNotification';

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
  return { tauri, sent };
}

describe('createTauriNotificationBackend', () => {
  it('sends a notification and resolves the request id', async () => {
    const { tauri, sent } = fakeTauri();
    const backend = createTauriNotificationBackend(tauri);
    const id = await backend.notify({ title: 'Hi', body: 'there', id: 'n1' });
    expect(id).toBe('n1');
    expect(sent[0]).toEqual({ title: 'Hi', body: 'there', icon: undefined });
  });

  it('generates an id when the request omits one', async () => {
    const backend = createTauriNotificationBackend(fakeTauri().tauri);
    expect(await backend.notify({ title: 'Hi' })).toMatch(/^notification-/);
  });

  it('maps requestPermission and then reads it back synchronously', async () => {
    const backend = createTauriNotificationBackend(fakeTauri(false, 'granted').tauri);
    expect(await backend.requestPermission()).toBe('granted');
    expect(backend.getPermission()).toBe('granted');
  });

  it('reflects the prefetched permission after it resolves', async () => {
    const backend = createTauriNotificationBackend(fakeTauri(true).tauri);
    // Let the construction-time isPermissionGranted() prefetch settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(backend.getPermission()).toBe('granted');
  });

  it('reports conservative capabilities and unsupported-surface sentinels', async () => {
    const backend = createTauriNotificationBackend(fakeTauri().tauri);
    expect(backend.isSupported()).toBe(true);
    expect(backend.getCapabilities().scheduling).toBe(false);
    expect(await backend.getActiveNotifications()).toEqual([]);
    expect(await backend.scheduleNotification({ title: 'x' }, { at: 0 })).toBe('');
    expect(await backend.updateNotification('n1', {})).toBe(false);
    expect(typeof backend.subscribeClick(() => {})).toBe('function');
  });
});

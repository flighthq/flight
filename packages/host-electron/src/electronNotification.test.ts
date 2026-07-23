import type { ElectronApi, ElectronNotificationOptions } from '@flighthq/types';

import { createElectronNotificationBackend } from './electronNotification';

interface FakeNotification {
  options: ElectronNotificationOptions;
  shown: boolean;
  handlers: Record<string, (...args: unknown[]) => void>;
  show(): void;
  close(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

function fakeElectron(supported = true): {
  electron: ElectronApi;
  notifications: FakeNotification[];
} {
  const notifications: FakeNotification[] = [];
  const electron = {
    Notification: Object.assign(
      function (this: FakeNotification, options: ElectronNotificationOptions) {
        this.options = options;
        this.shown = false;
        this.handlers = {};
        this.show = () => {
          this.shown = true;
        };
        this.close = () => {};
        this.on = (event: string, listener: (...args: unknown[]) => void) => {
          this.handlers[event] = listener;
        };
        notifications.push(this);
      },
      { isSupported: () => supported },
    ),
  } as unknown as ElectronApi;
  return { electron, notifications };
}

describe('createElectronNotificationBackend', () => {
  it('shows a notification and resolves to its id', async () => {
    const { electron, notifications } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    expect(backend.isSupported()).toBe(true);
    expect(backend.getPermission()).toBe('granted');
    expect(await backend.requestPermission()).toBe('granted');
    const id = await backend.notify({ id: 'n1', title: 'Hi', body: 'there', actions: [{ id: 'ok', title: 'OK' }] });
    expect(id).toBe('n1');
    expect(notifications[0].options.title).toBe('Hi');
    expect(notifications[0].options.actions).toEqual([{ type: 'button', text: 'OK' }]);
    expect(notifications[0].shown).toBe(true);
  });

  it('returns an empty id when notifications are unsupported', async () => {
    const { electron } = fakeElectron(false);
    const backend = createElectronNotificationBackend(electron);
    expect(backend.isSupported()).toBe(false);
    expect(backend.getPermission()).toBe('denied');
    expect(await backend.requestPermission()).toBe('denied');
    expect(await backend.notify({ title: 'x' })).toBe('');
  });

  it('forwards click events with the notification id and stops after unsubscribe', async () => {
    const { electron, notifications } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    const ids: string[] = [];
    const unsubscribe = backend.subscribeClick((id) => ids.push(id));
    await backend.notify({ id: 'msg-1', title: 'x' });
    notifications[0].handlers['click']();
    unsubscribe();
    notifications[0].handlers['click']();
    expect(ids).toEqual(['msg-1']);
  });

  it('forwards action events mapping the electron index back to the action id', async () => {
    const { electron, notifications } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    const seen: [string, string][] = [];
    backend.subscribeAction((id, actionId) => seen.push([id, actionId]));
    await backend.notify({
      id: 'msg-2',
      title: 'x',
      actions: [
        { id: 'yes', title: 'Yes' },
        { id: 'no', title: 'No' },
      ],
    });
    notifications[0].handlers['action']({}, 1);
    expect(seen).toEqual([['msg-2', 'no']]);
  });

  it('updateNotification returns false (no in-place update support)', async () => {
    const { electron } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    await backend.notify({ title: 'Hi', tag: 'u1' });
    expect(await backend.updateNotification('u1', { title: 'Updated' })).toBe(false);
  });
});

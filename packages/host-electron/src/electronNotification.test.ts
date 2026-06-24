import type { ElectronApi, ElectronNotificationOptions } from './electronModule';
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
  it('shows a notification and reports support', async () => {
    const { electron, notifications } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    expect(backend.isSupported()).toBe(true);
    expect(await backend.requestPermission()).toBe(true);
    expect(await backend.notify({ title: 'Hi', body: 'there', actions: [{ id: 'ok', title: 'OK' }] })).toBe(true);
    expect(notifications[0].options.title).toBe('Hi');
    expect(notifications[0].options.actions).toEqual([{ type: 'button', text: 'OK' }]);
    expect(notifications[0].shown).toBe(true);
  });

  it('returns false when notifications are unsupported', async () => {
    const { electron } = fakeElectron(false);
    const backend = createElectronNotificationBackend(electron);
    expect(backend.isSupported()).toBe(false);
    expect(await backend.requestPermission()).toBe(false);
    expect(await backend.notify({ title: 'x' })).toBe(false);
  });

  it('forwards click events with the request tag and stops after unsubscribe', async () => {
    const { electron, notifications } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    const tags: string[] = [];
    const unsubscribe = backend.subscribeClick((tag) => tags.push(tag));
    await backend.notify({ title: 'x', tag: 'msg-1' });
    notifications[0].handlers['click']();
    unsubscribe();
    notifications[0].handlers['click']();
    expect(tags).toEqual(['msg-1']);
  });

  it('forwards action events mapping the electron index back to the action id', async () => {
    const { electron, notifications } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    const seen: [string, string][] = [];
    backend.subscribeAction((tag, actionId) => seen.push([tag, actionId]));
    await backend.notify({
      title: 'x',
      tag: 'msg-2',
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

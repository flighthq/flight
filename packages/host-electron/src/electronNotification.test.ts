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
<<<<<<< Updated upstream
    expect(seen).toEqual([['msg-2', 'no']]);
=======
    expect(seen).toEqual([[id, 'no']]);
  });

  it('forwards click events with the request id and stops after unsubscribe', async () => {
    const { electron, notifications } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    const ids: string[] = [];
    const unsubscribe = backend.subscribeClick((id) => ids.push(id));
    const id = await backend.notify({ title: 'x', id: 'msg-1' });
    notifications[0].handlers['click']();
    unsubscribe();
    notifications[0].handlers['click']();
    expect(ids).toEqual([id]);
  });

  it('forwards dismiss events on close and stops after unsubscribe', async () => {
    const { electron, notifications } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    const dismissed: string[] = [];
    const unsubscribe = backend.subscribeDismiss((id) => dismissed.push(id));
    const id = await backend.notify({ title: 'x', id: 'msg-dismiss' });
    notifications[0].handlers['close']();
    unsubscribe();
    expect(dismissed).toEqual([id]);
  });

  it('forwards show events and stops after unsubscribe', async () => {
    const { electron } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    const shown: string[] = [];
    const unsubscribe = backend.subscribeShow((id) => shown.push(id));
    await backend.notify({ title: 'x', id: 'msg-show' });
    unsubscribe();
    expect(shown).toEqual(['msg-show']);
  });

  it('getCapabilities reports actions=true and scheduling=false', () => {
    const { electron } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    const caps = backend.getCapabilities();
    expect(caps.actions).toBe(true);
    expect(caps.scheduling).toBe(false);
    expect(caps.channels).toBe(false);
  });

  it('getPermission returns granted when supported and denied when not', () => {
    expect(createElectronNotificationBackend(fakeElectron(true).electron).getPermission()).toBe('granted');
    expect(createElectronNotificationBackend(fakeElectron(false).electron).getPermission()).toBe('denied');
  });

  it('notify returns the request id when provided', async () => {
    const { electron } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    const id = await backend.notify({ title: 'Hi', id: 'stable-id' });
    expect(id).toBe('stable-id');
  });

  it('notify generates an id when none is provided', async () => {
    const { electron } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    const id = await backend.notify({ title: 'Hi' });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns empty string when notifications are unsupported', async () => {
    const { electron } = fakeElectron(false);
    const backend = createElectronNotificationBackend(electron);
    expect(backend.isSupported()).toBe(false);
    expect(await backend.requestPermission()).toBe('denied');
    expect(await backend.notify({ title: 'x' })).toBe('');
  });

  it('scheduleNotification returns empty string (unsupported)', async () => {
    const { electron } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    expect(await backend.scheduleNotification({ title: 'x' }, { at: Date.now() + 1000 })).toBe('');
  });

  it('shows a notification and reports support', async () => {
    const { electron, notifications } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    expect(backend.isSupported()).toBe(true);
    expect(await backend.requestPermission()).toBe('granted');
    await backend.notify({ title: 'Hi', body: 'there', id: 'test', actions: [{ id: 'ok', title: 'OK' }] });
    expect(notifications[0].options.title).toBe('Hi');
    expect(notifications[0].options.actions).toEqual([{ type: 'button', text: 'OK' }]);
    expect(notifications[0].shown).toBe(true);
  });

  it('subscribeReply returns a no-op (inline reply unsupported)', () => {
    const { electron } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    expect(() => backend.subscribeReply(() => {})()).not.toThrow();
>>>>>>> Stashed changes
  });

  it('updateNotification returns false (no in-place update support)', async () => {
    const { electron } = fakeElectron();
    const backend = createElectronNotificationBackend(electron);
    await backend.notify({ title: 'Hi', id: 'u1' });
    expect(await backend.updateNotification('u1', { title: 'Updated' })).toBe(false);
  });
});

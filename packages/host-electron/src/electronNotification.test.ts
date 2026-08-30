import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { ElectronApi, ElectronNotificationOptions } from '@flighthq/types/contract';

import { createElectronNotificationCapabilities } from './electronNotification';

interface FakeNotification {
  options: ElectronNotificationOptions;
  shown: boolean;
  handlers: Record<string, (...args: unknown[]) => void>;
  show(): void;
  close(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

function fakeElectron(supported = true): { electron: ElectronApi; notifications: FakeNotification[] } {
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

describe('createElectronNotificationCapabilities', () => {
  it('shows a notification and resolves its id', async () => {
    const { electron, notifications } = fakeElectron();
    const capabilities = createElectronNotificationCapabilities(electron);
    expect(EntityRuntimeKey in capabilities).toBe(true);
    expect(await capabilities.delivery.getPermission()).toBe('granted');
    expect(await capabilities.delivery.requestPermission()).toBe('granted');
    const id = await capabilities.delivery.notify({
      actions: [{ id: 'ok', title: 'OK' }],
      body: 'there',
      id: 'n1',
      title: 'Hi',
    });
    expect(id).toBe('n1');
    expect(notifications[0].options.title).toBe('Hi');
    expect(notifications[0].options.actions).toEqual([{ text: 'OK', type: 'button' }]);
    expect(notifications[0].shown).toBe(true);
  });

  it('returns null when notifications are unsupported', async () => {
    const capabilities = createElectronNotificationCapabilities(fakeElectron(false).electron);
    expect(await capabilities.delivery.getPermission()).toBe('denied');
    expect(await capabilities.delivery.requestPermission()).toBe('denied');
    expect(await capabilities.delivery.notify({ title: 'x' })).toBeNull();
  });

  it.each(['click', 'dismiss', 'show'] as const)('%s keeps multiple subscriptions independent', async (event) => {
    const { electron, notifications } = fakeElectron();
    const capabilities = createElectronNotificationCapabilities(electron);
    const seen: string[] = [];
    const first = (id: string): void => {
      seen.push(`first:${id}`);
    };
    const second = (id: string): void => {
      seen.push(`second:${id}`);
    };
    capabilities[event].subscribe(first);
    capabilities[event].subscribe(second);
    await capabilities.delivery.notify({ id: 'multi', title: 'x' });
    const electronEvent = event === 'dismiss' ? 'close' : event;
    notifications[0].handlers[electronEvent]();
    expect(seen).toEqual(['first:multi', 'second:multi']);
    capabilities[event].unsubscribe(first);
    notifications[0].handlers[electronEvent]();
    expect(seen).toEqual(['first:multi', 'second:multi', 'second:multi']);
    capabilities[event].unsubscribe(second);
  });

  it('keeps multiple action subscriptions independent and maps the Electron index', async () => {
    const { electron, notifications } = fakeElectron();
    const capabilities = createElectronNotificationCapabilities(electron);
    const seen: string[] = [];
    const first = (id: string, actionId: string): void => {
      seen.push(`first:${id}:${actionId}`);
    };
    const second = (id: string, actionId: string): void => {
      seen.push(`second:${id}:${actionId}`);
    };
    capabilities.action.subscribe(first);
    capabilities.action.subscribe(second);
    await capabilities.delivery.notify({
      actions: [
        { id: 'yes', title: 'Yes' },
        { id: 'no', title: 'No' },
      ],
      id: 'choice',
      title: 'x',
    });
    notifications[0].handlers['action']({}, 1);
    expect(seen).toEqual(['first:choice:no', 'second:choice:no']);
    capabilities.action.unsubscribe(first);
    notifications[0].handlers['action']({}, 0);
    expect(seen.at(-1)).toBe('second:choice:yes');
  });

  it('closes a live notification through the close slot', async () => {
    const { electron, notifications } = fakeElectron();
    let closes = 0;
    const capabilities = createElectronNotificationCapabilities(electron);
    await capabilities.delivery.notify({ id: 'close-me', title: 'x' });
    notifications[0].close = () => {
      closes += 1;
    };
    await capabilities.close.closeNotification('close-me');
    await capabilities.close.closeNotification('close-me');
    expect(closes).toBe(1);
  });
});

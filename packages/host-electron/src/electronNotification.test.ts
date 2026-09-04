import { closeNotification } from '@flighthq/notification/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { ElectronApi, ElectronNotificationOptions } from '@flighthq/types/contract';

import {
  createElectronNotificationCapabilities,
  initializeElectronMacosNotificationCapabilities,
  initializeElectronNotificationCapabilities,
} from './electronNotification';

interface FakeNotification {
  close(): void;
  handlers: Record<string, (...args: unknown[]) => void>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  options: ElectronNotificationOptions;
  show(): void;
}

function fakeElectron(supported = true) {
  const notifications: FakeNotification[] = [];
  const electron = {
    Notification: Object.assign(
      function (this: FakeNotification, options: ElectronNotificationOptions) {
        this.options = options;
        this.handlers = {};
        this.close = () => {};
        this.on = (event: string, listener: (...args: unknown[]) => void) => {
          this.handlers[event] = listener;
        };
        this.show = () => {
          this.handlers['show']?.();
        };
        notifications.push(this);
      },
      { isSupported: () => supported },
    ),
  } as unknown as ElectronApi;
  return { electron, notifications };
}

describe('createElectronNotificationCapabilities', () => {
  it.each([
    ['macos', ['action', 'click', 'close', 'delivery', 'dismiss', 'lifecycle', 'received', 'reply']],
    ['windows', ['click', 'close', 'delivery', 'dismiss', 'lifecycle', 'received']],
    ['linux', ['click', 'close', 'delivery', 'dismiss', 'lifecycle', 'received']],
  ] as const)('constructs the exact %s profile', (platform, expected) => {
    const capabilities = createElectronNotificationCapabilities(fakeElectron().electron, { platform });
    expect(EntityRuntimeKey in capabilities).toBe(true);
    expect(Object.keys(capabilities).sort()).toEqual(expected);
    expect('permission' in capabilities).toBe(false);
  });

  it('rejects Darwin-only actions on Windows instead of dropping them', async () => {
    const capabilities = createElectronNotificationCapabilities(fakeElectron().electron, { platform: 'windows' });
    await expect(
      capabilities.delivery.notify({
        actions: [{ id: 'open', title: 'Open' }],
        title: 'Title',
      }),
    ).resolves.toEqual({ fields: ['actions'], reason: 'invalid-request' });
  });

  it('publishes only after the native show event', async () => {
    const { electron, notifications } = fakeElectron();
    const capabilities = createElectronNotificationCapabilities(electron, {
      platform: 'linux',
    });
    let show: (() => void) | null = null;
    const NativeNotification = electron.Notification;
    electron.Notification = Object.assign(
      function (this: FakeNotification, options: ElectronNotificationOptions) {
        const instance = new NativeNotification(options) as unknown as FakeNotification;
        instance.show = () => {
          show = () => instance.handlers['show']?.();
        };
        return instance;
      },
      { isSupported: () => true },
    ) as unknown as ElectronApi['Notification'];
    let settled = false;
    const delivery = capabilities.delivery.notify({ id: 'n1', title: 'Title' }).then((outcome) => {
      settled = true;
      return outcome;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    (show as (() => void) | null)?.();
    const outcome = await delivery;
    expect(outcome.reason).toBe('accepted');
    expect(notifications).toHaveLength(1);
  });

  it('does not publish a resource when native show throws', async () => {
    const { electron, notifications } = fakeElectron();
    const NativeNotification = electron.Notification;
    electron.Notification = Object.assign(
      function (this: FakeNotification, options: ElectronNotificationOptions) {
        const instance = new NativeNotification(options) as unknown as FakeNotification;
        instance.show = () => {
          throw new Error('show failed');
        };
        return instance;
      },
      { isSupported: () => true },
    ) as unknown as ElectronApi['Notification'];
    const capabilities = createElectronNotificationCapabilities(electron, {
      platform: 'linux',
    });
    await expect(capabilities.delivery.notify({ id: 'ghost', title: 'Ghost' })).resolves.toEqual({
      reason: 'operation-failed',
    });
    let closes = 0;
    notifications[0].close = () => {
      closes += 1;
    };
    await capabilities.close.closeAllNotifications();
    expect(closes).toBe(0);
  });

  it('maps Darwin action/reply and all-platform click/dismiss/received to one Entity', async () => {
    const { electron, notifications } = fakeElectron();
    const capabilities = createElectronNotificationCapabilities(electron, {
      platform: 'macos',
    });
    const seen: string[] = [];
    await capabilities.action.attach((notification, actionId) => seen.push(`action:${notification.id}:${actionId}`));
    await capabilities.click.attach((notification) => seen.push(`click:${notification.id}`));
    await capabilities.dismiss.attach((notification) => seen.push(`dismiss:${notification.id}`));
    await capabilities.received.attach((notification) => seen.push(`received:${notification.id}`));
    await capabilities.reply.attach((notification, actionId, text) =>
      seen.push(`reply:${notification.id}:${actionId}:${text}`),
    );
    const delivered = await capabilities.delivery.notify({
      actions: [{ id: 'open', title: 'Open' }],
      id: 'n1',
      title: 'Title',
    });
    expect(delivered.reason).toBe('accepted');
    notifications[0].handlers['action']?.({}, 0);
    notifications[0].handlers['click']?.();
    notifications[0].handlers['reply']?.({}, 'hello');
    notifications[0].handlers['close']?.();
    expect(seen).toEqual(['received:n1', 'action:n1:open', 'click:n1', 'reply:n1:open:hello', 'dismiss:n1']);
  });

  it('pins close to the returned Entity', async () => {
    const { electron, notifications } = fakeElectron();
    const capabilities = createElectronNotificationCapabilities(electron, {
      platform: 'linux',
    });
    const delivered = await capabilities.delivery.notify({
      id: 'n1',
      title: 'Title',
    });
    if (delivered.reason !== 'accepted') throw new Error('fixture delivery failed');
    let closes = 0;
    notifications[0].close = () => {
      closes += 1;
    };
    await expect(closeNotification(delivered.notification)).resolves.toEqual({
      reason: 'ok',
    });
    await expect(closeNotification(delivered.notification)).resolves.toEqual({
      reason: 'already-closed',
    });
    expect(closes).toBe(1);
  });

  it('attempts all live closes and retries only failures', async () => {
    const { electron, notifications } = fakeElectron();
    const capabilities = createElectronNotificationCapabilities(electron, {
      platform: 'linux',
    });
    await capabilities.delivery.notify({ id: 'first', title: 'First' });
    await capabilities.delivery.notify({ id: 'second', title: 'Second' });
    let firstCloses = 0;
    let secondCloses = 0;
    notifications[0].close = () => {
      firstCloses += 1;
    };
    notifications[1].close = () => {
      secondCloses += 1;
      if (secondCloses === 1) throw new Error('second failed');
    };
    await expect(capabilities.close.closeAllNotifications()).resolves.toMatchObject({ reason: 'operation-failed' });
    await expect(capabilities.close.closeAllNotifications()).resolves.toEqual({
      reason: 'ok',
    });
    expect(firstCloses).toBe(1);
    expect(secondCloses).toBe(2);
  });
});
describe('initializeElectronMacosNotificationCapabilities', () => {
  it('is the construction initializer of createElectronMacosNotificationCapabilities', () => {
    expect(typeof initializeElectronMacosNotificationCapabilities).toBe('function');
  });
});

describe('initializeElectronNotificationCapabilities', () => {
  it('is the construction initializer of createElectronNotificationCapabilities', () => {
    expect(typeof initializeElectronNotificationCapabilities).toBe('function');
  });
});

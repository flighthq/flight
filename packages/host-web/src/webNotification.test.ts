import { closeNotification } from '@flighthq/notification/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  NotificationPermission,
  WebNotificationOptions,
  WebPageNotificationApi,
  WebPageNotificationInstance,
} from '@flighthq/types/contract';

import { createWebPageNotificationCapabilities } from './webNotification';

interface FakeWebNotification extends WebPageNotificationInstance {
  options?: Readonly<WebNotificationOptions>;
  title: string;
}

function fakeWebPage(permission: NotificationPermission = 'granted') {
  const notifications: FakeWebNotification[] = [];
  const Api = class implements FakeWebNotification {
    static permission = permission;
    static async requestPermission() {
      return Api.permission;
    }

    onclick: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onshow: (() => void) | null = null;

    constructor(
      public title: string,
      public options?: Readonly<WebNotificationOptions>,
    ) {
      notifications.push(this);
    }

    close(): void {
      this.onclose?.();
    }
  };
  return {
    api: { Notification: Api } as WebPageNotificationApi,
    notifications,
  };
}

describe('createWebPageNotificationCapabilities', () => {
  it('constructs the exact page profile without scheduling, reply, or update', () => {
    const capabilities = createWebPageNotificationCapabilities(fakeWebPage().api);
    expect(EntityRuntimeKey in capabilities).toBe(true);
    expect(Object.keys(capabilities).sort()).toEqual([
      'click',
      'close',
      'delivery',
      'dismiss',
      'lifecycle',
      'permission',
      'received',
    ]);
  });

  it('reports rejected profile fields instead of silently dropping them', async () => {
    const capabilities = createWebPageNotificationCapabilities(fakeWebPage().api);
    await expect(
      capabilities.delivery.notify({
        actions: [{ id: 'open', title: 'Open' }],
        title: 'Title',
      }),
    ).resolves.toEqual({ fields: ['actions'], reason: 'invalid-request' });
  });

  it('publishes an Entity only after constructor acceptance and pins close', async () => {
    const { api, notifications } = fakeWebPage();
    const capabilities = createWebPageNotificationCapabilities(api);
    const outcome = await capabilities.delivery.notify({
      data: { caller: true },
      id: 'n1',
      title: 'Title',
    });
    expect(outcome.reason).toBe('accepted');
    expect(notifications[0].options?.data).toEqual({ caller: true });
    if (outcome.reason !== 'accepted') return;
    expect(EntityRuntimeKey in outcome.notification).toBe(true);
    await expect(closeNotification(outcome.notification)).resolves.toEqual({
      reason: 'ok',
    });
  });

  it('attempts all closes and retries only failures', async () => {
    const { api, notifications } = fakeWebPage();
    const capabilities = createWebPageNotificationCapabilities(api);
    await capabilities.delivery.notify({ id: 'first', title: 'First' });
    await capabilities.delivery.notify({ id: 'second', title: 'Second' });
    let firstCloses = 0;
    let secondCloses = 0;
    notifications[0].close = () => {
      firstCloses += 1;
    };
    notifications[1].close = () => {
      secondCloses += 1;
      if (secondCloses === 1) throw new Error('failed');
    };
    await expect(capabilities.close.closeAllNotifications()).resolves.toMatchObject({ reason: 'operation-failed' });
    await expect(capabilities.close.closeAllNotifications()).resolves.toEqual({
      reason: 'ok',
    });
    expect(firstCloses).toBe(1);
    expect(secondCloses).toBe(2);
  });
});

import { closeNotification } from '@flighthq/notification/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  NotificationPermission,
  WebNotificationOptions,
  WebServiceWorkerNotificationApi,
  WebServiceWorkerNotificationInstance,
} from '@flighthq/types/contract';

import {
  createWebServiceWorkerNotificationCapabilities,
  notifyWebServiceWorkerNotificationEvent,
} from './webServiceWorkerNotification';

function fakeServiceWorker(permission: NotificationPermission = 'granted') {
  const shown: Array<{
    closed: boolean;
    options?: Readonly<WebNotificationOptions>;
    tag: string;
    title: string;
  }> = [];
  const api: WebServiceWorkerNotificationApi = {
    permission: {
      getPermission: () => permission,
      async requestPermission() {
        return permission;
      },
    },
    registration: {
      async getNotifications(filter) {
        return shown
          .filter((entry) => !entry.closed && (filter?.tag === undefined || filter.tag === entry.tag))
          .map(
            (entry): WebServiceWorkerNotificationInstance => ({
              close() {
                entry.closed = true;
              },
              data: entry.options?.data,
              tag: entry.tag,
              title: entry.title,
            }),
          );
      },
      async showNotification(title, options) {
        shown.push({
          closed: false,
          options,
          tag: String(options?.tag ?? ''),
          title,
        });
      },
    },
  };
  return { api, shown };
}

describe('createWebServiceWorkerNotificationCapabilities', () => {
  it('constructs the exact persistent profile without timers, reply, or synthetic received', () => {
    const capabilities = createWebServiceWorkerNotificationCapabilities(fakeServiceWorker().api);
    expect(EntityRuntimeKey in capabilities).toBe(true);
    expect(Object.keys(capabilities).sort()).toEqual([
      'action',
      'activeList',
      'click',
      'close',
      'delivery',
      'dismiss',
      'lifecycle',
      'permission',
    ]);
  });

  it('keeps private provider identity out of opaque caller data', async () => {
    const { api, shown } = fakeServiceWorker();
    const capabilities = createWebServiceWorkerNotificationCapabilities(api);
    const data = { caller: 'owned' };
    await capabilities.delivery.notify({
      data,
      id: 'public-id',
      title: 'Flight',
    });
    expect(shown[0].options?.data).toBe(data);
  });

  it('reconciles enumeration and events to one stable Entity', async () => {
    const { api } = fakeServiceWorker();
    const capabilities = createWebServiceWorkerNotificationCapabilities(api);
    const delivered = await capabilities.delivery.notify({
      id: 'n1',
      title: 'Flight',
    });
    expect(delivered.reason).toBe('accepted');
    if (delivered.reason !== 'accepted') return;
    const first = await capabilities.activeList.getActiveNotifications();
    const second = await capabilities.activeList.getActiveNotifications();
    expect(first.reason).toBe('ok');
    expect(second.reason).toBe('ok');
    if (first.reason === 'ok' && second.reason === 'ok') {
      expect(first.notifications[0]).toBe(delivered.notification);
      expect(second.notifications[0]).toBe(delivered.notification);
    }
    const clicked: unknown[] = [];
    await capabilities.click.attach((notification) => clicked.push(notification));
    notifyWebServiceWorkerNotificationEvent(capabilities, {
      notificationTag: delivered.notification.tag,
      type: 'notificationclick',
    });
    expect(clicked).toEqual([delivered.notification]);
    await expect(closeNotification(delivered.notification)).resolves.toEqual({
      reason: 'ok',
    });
  });
});

describe('notifyWebServiceWorkerNotificationEvent', () => {
  it('routes real action/click/close events without fabricating reply', async () => {
    const { api } = fakeServiceWorker();
    const capabilities = createWebServiceWorkerNotificationCapabilities(api);
    const delivered = await capabilities.delivery.notify({
      id: 'n1',
      title: 'Flight',
    });
    if (delivered.reason !== 'accepted') throw new Error('fixture delivery failed');
    const seen: string[] = [];
    await capabilities.action.attach((_notification, actionId) => seen.push(`action:${actionId}`));
    await capabilities.click.attach(() => seen.push('click'));
    await capabilities.dismiss.attach(() => seen.push('dismiss'));
    notifyWebServiceWorkerNotificationEvent(capabilities, {
      actionId: 'open',
      notificationTag: delivered.notification.tag,
      type: 'notificationclick',
    });
    notifyWebServiceWorkerNotificationEvent(capabilities, {
      notificationTag: delivered.notification.tag,
      type: 'notificationclose',
    });
    expect(seen).toEqual(['action:open', 'click', 'dismiss']);
  });
});

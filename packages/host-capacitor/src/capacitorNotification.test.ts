import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  CapacitorApi,
  CapacitorLocalNotificationAction,
  CapacitorLocalNotificationSchema,
} from '@flighthq/types/contract';

import { createCapacitorNotificationCapabilities } from './capacitorNotification';

function fakeCapacitor(display = 'granted') {
  const scheduled: CapacitorLocalNotificationSchema[] = [];
  const cancelled: number[] = [];
  const actionListeners = new Set<(action: Readonly<CapacitorLocalNotificationAction>) => void>();
  const capacitor = {
    localNotifications: {
      async addListener(_eventName: string, listener: (action: Readonly<CapacitorLocalNotificationAction>) => void) {
        actionListeners.add(listener);
        return {
          async remove() {
            actionListeners.delete(listener);
          },
        };
      },
      async cancel(options: { notifications: Array<{ id: number }> }) {
        cancelled.push(...options.notifications.map((notification) => notification.id));
      },
      async checkPermissions() {
        return { display };
      },
      async getPending() {
        return { notifications: scheduled };
      },
      async requestPermissions() {
        return { display };
      },
      async schedule(options: { notifications: CapacitorLocalNotificationSchema[] }) {
        scheduled.push(...options.notifications);
        return { notifications: options.notifications.map((notification) => ({ id: notification.id })) };
      },
    },
  } as unknown as CapacitorApi;
  return {
    cancelled,
    capacitor,
    fire: (action: CapacitorLocalNotificationAction) => {
      for (const listener of actionListeners) listener(action);
    },
    scheduled,
  };
}

describe('createCapacitorNotificationCapabilities', () => {
  it('declares exactly delivery, scheduling, click, and action', () => {
    const capabilities = createCapacitorNotificationCapabilities(fakeCapacitor().capacitor);
    expect(EntityRuntimeKey in capabilities).toBe(true);
    expect(Object.keys(capabilities).sort()).toEqual(['action', 'click', 'delivery', 'scheduling']);
  });

  it('schedules an immediate notification and returns the caller id', async () => {
    const { capacitor, scheduled } = fakeCapacitor();
    const capabilities = createCapacitorNotificationCapabilities(capacitor);
    expect(await capabilities.delivery.notify({ body: 'there', id: 'welcome', title: 'Hi' })).toBe('welcome');
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].title).toBe('Hi');
  });

  it('queries and requests permission asynchronously', async () => {
    const capabilities = createCapacitorNotificationCapabilities(fakeCapacitor('granted').capacitor);
    expect(await capabilities.delivery.getPermission()).toBe('granted');
    expect(await capabilities.delivery.requestPermission()).toBe('granted');
  });

  it('preserves repeating schedules, lists them, and cancels by caller id', async () => {
    const { cancelled, capacitor } = fakeCapacitor();
    const capabilities = createCapacitorNotificationCapabilities(capacitor);
    const at = Date.now() + 1000;
    await capabilities.scheduling.scheduleNotification({ id: 'later', title: 'Later' }, { at, repeat: 'week' });
    const pending = await capabilities.scheduling.getPendingNotifications();
    expect(pending[0]).toMatchObject({ id: 'later', schedule: { at, repeat: 'week' } });
    await capabilities.scheduling.cancelScheduledNotification('later');
    expect(cancelled).toEqual([1]);
  });

  it('routes click and action independently and honors each unsubscribe', async () => {
    const { capacitor, fire } = fakeCapacitor();
    const capabilities = createCapacitorNotificationCapabilities(capacitor);
    const clicks: string[] = [];
    const actions: string[] = [];
    const click = (id: string): void => {
      clicks.push(id);
    };
    const action = (id: string, actionId: string): void => {
      actions.push(`${id}:${actionId}`);
    };
    capabilities.click.subscribe(click);
    capabilities.action.subscribe(action);
    await capabilities.delivery.notify({ id: 'welcome', title: 'Hi' });
    fire({ actionId: 'tap', notification: { id: 1 } });
    expect(clicks).toEqual(['welcome']);
    expect(actions).toEqual(['welcome:tap']);
    capabilities.click.unsubscribe(click);
    capabilities.action.unsubscribe(action);
    await Promise.resolve();
    fire({ actionId: 'tap', notification: { id: 1 } });
    expect(clicks).toEqual(['welcome']);
    expect(actions).toEqual(['welcome:tap']);
  });
});

import { cancelScheduledNotification } from '@flighthq/notification/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  CapacitorApi,
  CapacitorLocalNotificationAction,
  CapacitorLocalNotificationSchema,
} from '@flighthq/types/contract';

import {
  createCapacitorNotificationCapabilities,
  initializeCapacitorNotificationCapabilities,
} from './capacitorNotification';

function fakeCapacitor(display = 'granted') {
  const scheduled: CapacitorLocalNotificationSchema[] = [];
  const cancelled: number[] = [];
  const actionListeners = new Set<(action: Readonly<CapacitorLocalNotificationAction>) => void>();
  const localNotifications = {
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
      for (const entry of options.notifications) {
        const index = scheduled.findIndex((notification) => notification.id === entry.id);
        if (index !== -1) scheduled.splice(index, 1);
      }
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
      return {
        notifications: options.notifications.map((notification) => ({
          id: notification.id,
        })),
      };
    },
  };
  return {
    cancelled,
    capacitor: { localNotifications } as unknown as CapacitorApi,
    fire(action: CapacitorLocalNotificationAction) {
      for (const listener of actionListeners) listener(action);
    },
    localNotifications,
    scheduled,
  };
}

describe('createCapacitorNotificationCapabilities', () => {
  it('constructs the exact Android/iOS common profile', () => {
    const capabilities = createCapacitorNotificationCapabilities(fakeCapacitor().capacitor);
    expect(EntityRuntimeKey in capabilities).toBe(true);
    expect(Object.keys(capabilities).sort()).toEqual([
      'action',
      'click',
      'delivery',
      'lifecycle',
      'permission',
      'scheduling',
    ]);
  });

  it('validates profile fields and native acquisition ids before publishing', async () => {
    const fixture = fakeCapacitor();
    const capabilities = createCapacitorNotificationCapabilities(fixture.capacitor);
    await expect(capabilities.delivery.notify({ icon: 'icon.png', title: 'No' })).resolves.toEqual({
      fields: ['icon'],
      reason: 'invalid-request',
    });
    fixture.localNotifications.schedule = async () => ({ notifications: [] });
    await expect(capabilities.delivery.notify({ title: 'No native id' })).resolves.toEqual({
      reason: 'operation-failed',
    });
  });

  it('keeps duplicate public ids as distinct private native resources', async () => {
    const fixture = fakeCapacitor();
    const capabilities = createCapacitorNotificationCapabilities(fixture.capacitor);
    const first = await capabilities.scheduling.scheduleNotification({ id: 'same', title: 'First' }, { at: 1 });
    const second = await capabilities.scheduling.scheduleNotification({ id: 'same', title: 'Second' }, { at: 2 });
    if (first.reason !== 'scheduled' || second.reason !== 'scheduled') throw new Error('fixture schedule failed');
    expect(first.scheduled).not.toBe(second.scheduled);
    await expect(cancelScheduledNotification(second.scheduled)).resolves.toEqual({ reason: 'ok' });
    expect(fixture.cancelled).toEqual([2]);
  });

  it('reconciles repeated pending enumeration to stable Entity identity', async () => {
    const fixture = fakeCapacitor();
    const capabilities = createCapacitorNotificationCapabilities(fixture.capacitor);
    const scheduled = await capabilities.scheduling.scheduleNotification({ id: 'later', title: 'Later' }, { at: 1 });
    if (scheduled.reason !== 'scheduled') throw new Error('fixture schedule failed');
    const first = await capabilities.scheduling.getPendingNotifications();
    const second = await capabilities.scheduling.getPendingNotifications();
    if (first.reason !== 'ok' || second.reason !== 'ok') throw new Error('fixture query failed');
    expect(first.notifications[0]).toBe(scheduled.scheduled);
    expect(second.notifications[0]).toBe(scheduled.scheduled);
  });

  it('keeps permission and query failures observable', async () => {
    const fixture = fakeCapacitor();
    fixture.localNotifications.checkPermissions = async () => {
      throw new Error('failed');
    };
    fixture.localNotifications.getPending = async () => {
      throw new Error('failed');
    };
    const capabilities = createCapacitorNotificationCapabilities(fixture.capacitor);
    await expect(capabilities.permission.getPermission()).resolves.toEqual({
      reason: 'operation-failed',
    });
    await expect(capabilities.scheduling.getPendingNotifications()).resolves.toEqual({ reason: 'operation-failed' });
  });

  it('acquires independent click/action resources and releases their native handles', async () => {
    const fixture = fakeCapacitor();
    const capabilities = createCapacitorNotificationCapabilities(fixture.capacitor);
    const seen: string[] = [];
    const click = await capabilities.click.attach((notification) => seen.push(`click:${notification.id}`));
    const action = await capabilities.action.attach((notification, actionId) =>
      seen.push(`action:${notification.id}:${actionId}`),
    );
    fixture.fire({ actionId: 'tap', notification: { id: 7 } });
    expect(seen).toEqual(['click:capacitor-notification-7', 'action:capacitor-notification-7:tap']);
    if (click.reason === 'ok') await click.attachment.release();
    if (action.reason === 'ok') await action.attachment.release();
    fixture.fire({ actionId: 'tap', notification: { id: 7 } });
    expect(seen).toHaveLength(2);
  });
});
describe('initializeCapacitorNotificationCapabilities', () => {
  it('is the construction initializer of createCapacitorNotificationCapabilities', () => {
    expect(typeof initializeCapacitorNotificationCapabilities).toBe('function');
  });
});

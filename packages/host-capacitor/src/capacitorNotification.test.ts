import type { CapacitorApi } from '@flighthq/types';

import { createCapacitorNotificationBackend } from './capacitorNotification';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function fakeCapacitor(display = 'granted') {
  const scheduled: Array<{ id: number; title: string }> = [];
  const cancelled: number[] = [];
  const actionListeners: Array<(action: { actionId: string; notification: { id: number } }) => void> = [];
  const capacitor = {
    localNotifications: {
      async schedule(options: { notifications: Array<{ id: number; title: string }> }) {
        scheduled.push(...options.notifications);
        return { notifications: options.notifications.map((n) => ({ id: n.id })) };
      },
      async requestPermissions() {
        return { display };
      },
      async checkPermissions() {
        return { display };
      },
      async cancel(options: { notifications: Array<{ id: number }> }) {
        cancelled.push(...options.notifications.map((n) => n.id));
      },
      async getPending() {
        return { notifications: scheduled };
      },
      async addListener(
        _eventName: string,
        listener: (action: { actionId: string; notification: { id: number } }) => void,
      ) {
        actionListeners.push(listener);
        return { async remove() {} };
      },
    },
  } as unknown as CapacitorApi;
  return {
    capacitor,
    scheduled,
    cancelled,
    fire: (a: { actionId: string; notification: { id: number } }) => actionListeners.forEach((l) => l(a)),
  };
}

describe('createCapacitorNotificationBackend', () => {
  it('schedules an immediate notification and returns the caller id', async () => {
    const { capacitor, scheduled } = fakeCapacitor();
    const backend = createCapacitorNotificationBackend(capacitor);
    expect(await backend.notify({ id: 'welcome', title: 'Hi', body: 'there' })).toBe('welcome');
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].title).toBe('Hi');
  });

  it('serves permission from the prefetch cache and updates it on request', async () => {
    const backend = createCapacitorNotificationBackend(fakeCapacitor('granted').capacitor);
    // Reads 'default' until the construction-time prefetch settles.
    expect(backend.getPermission()).toBe('default');
    await flush();
    expect(backend.getPermission()).toBe('granted');
    expect(await backend.requestPermission()).toBe('granted');
  });

  it('cancels a scheduled notification by its caller id', async () => {
    const { capacitor, cancelled } = fakeCapacitor();
    const backend = createCapacitorNotificationBackend(capacitor);
    await backend.scheduleNotification({ id: 'later', title: 'Later' }, { at: Date.now() + 1000 });
    backend.cancelScheduledNotification('later');
    await flush();
    expect(cancelled).toHaveLength(1);
  });

  it('routes an action-performed event to click and action subscribers', async () => {
    const { capacitor, fire } = fakeCapacitor();
    const backend = createCapacitorNotificationBackend(capacitor);
    let clicked = '';
    let action = '';
    backend.subscribeClick((id) => (clicked = id));
    backend.subscribeAction((id, actionId) => (action = `${id}:${actionId}`));
    await backend.notify({ id: 'welcome', title: 'Hi' });
    await flush();
    fire({ actionId: 'tap', notification: { id: 1 } });
    expect(clicked).toBe('welcome');
    expect(action).toBe('welcome:tap');
  });

  it('reports sentinels for the unmodeled surface', async () => {
    const backend = createCapacitorNotificationBackend(fakeCapacitor().capacitor);
    expect(await backend.getActiveNotifications()).toEqual([]);
    expect(await backend.updateNotification('x', {})).toBe(false);
    expect(await backend.getLaunchNotification()).toBeNull();
  });
});

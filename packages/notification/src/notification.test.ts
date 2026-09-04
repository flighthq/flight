import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  HostNotificationCapabilities,
  Notification,
  NotificationClickBackend,
  NotificationEventBackendAttachOutcome,
} from '@flighthq/types/contract';

import {
  attachNotificationActionSubscription,
  attachNotificationClickSubscription,
  attachNotificationDismissSubscription,
  attachNotificationReceivedSubscription,
  attachNotificationReplySubscription,
  bindNotificationClose,
  bindScheduledNotificationCancel,
  cancelScheduledNotification,
  closeAllNotifications,
  closeNotification,
  createNotificationActionSubscription,
  createNotificationClickSubscription,
  createNotificationDismissSubscription,
  createNotificationReceivedSubscription,
  createNotificationReplySubscription,
  createNotificationResource,
  createScheduledNotificationResource,
  destroyNotificationCapabilities,
  detachNotificationActionSubscription,
  detachNotificationClickSubscription,
  detachNotificationDismissSubscription,
  detachNotificationReceivedSubscription,
  detachNotificationReplySubscription,
  disposeNotificationActionSubscription,
  disposeNotificationClickSubscription,
  disposeNotificationDismissSubscription,
  disposeNotificationReceivedSubscription,
  disposeNotificationReplySubscription,
  getActiveNotifications,
  getNotificationPermission,
  getPendingNotifications,
  initializeNotificationResource,
  initializeScheduledNotificationResource,
  requestNotificationPermission,
  scheduleNotification,
  showNotification,
} from './notification';

function host<const TCapabilities extends HostNotificationCapabilities>(notification: TCapabilities) {
  return { notification };
}

function createClickBackend(options?: Readonly<{ attachFailure?: boolean; releaseFailure?: boolean }>) {
  const listeners = new Set<(notification: Readonly<Notification>) => void>();
  const backend: NotificationClickBackend = {
    async attach(listener): Promise<NotificationEventBackendAttachOutcome> {
      if (options?.attachFailure === true) {
        return {
          reason: 'operation-failed',
          releaseFailed: options.releaseFailure === true,
        };
      }
      listeners.add(listener);
      return {
        attachment: {
          async release() {
            if (options?.releaseFailure === true) return { reason: 'operation-failed' };
            listeners.delete(listener);
            return { reason: 'ok' };
          },
        },
        reason: 'ok',
      };
    },
  };
  return { backend, listeners };
}

describe('attachNotificationActionSubscription', () => {
  it('acquires the action event and emits the stable Notification Entity', async () => {
    const listeners = new Set<(notification: Readonly<Notification>, actionId: string) => void>();
    const subscription = createNotificationActionSubscription();
    const notification = createNotificationResource('n1', 'Title');
    const seen: string[] = [];
    connectSignal(subscription.onNotificationAction, (value, actionId) => seen.push(`${value.id}:${actionId}`));
    await expect(
      attachNotificationActionSubscription(
        host({
          action: {
            async attach(listener) {
              listeners.add(listener);
              return {
                attachment: {
                  async release() {
                    listeners.delete(listener);
                    return { reason: 'ok' };
                  },
                },
                reason: 'ok',
              };
            },
          },
        }),
        subscription,
      ),
    ).resolves.toEqual({ reason: 'ok' });
    for (const listener of listeners) listener(notification, 'open');
    expect(seen).toEqual(['n1:open']);
  });
});

describe('attachNotificationClickSubscription', () => {
  it('preserves simultaneous attach and cleanup failures', async () => {
    const subscription = createNotificationClickSubscription();
    const attached = attachNotificationClickSubscription(
      host({
        click: createClickBackend({ attachFailure: true, releaseFailure: true }).backend,
      }),
      subscription,
    );
    const disposed = disposeNotificationClickSubscription(subscription);
    await expect(attached).resolves.toEqual({
      attachFailed: true,
      reason: 'operation-failed',
      releaseFailed: true,
    });
    await expect(disposed).resolves.toEqual({ reason: 'ok' });
  });

  it('routes the provider Entity and owns only its acquired release', async () => {
    const { backend, listeners } = createClickBackend();
    const subscription = createNotificationClickSubscription();
    const notification = createNotificationResource('n1', 'Title');
    const seen: Notification[] = [];
    connectSignal(subscription.onNotificationClick, (value) => seen.push(value));
    await expect(attachNotificationClickSubscription(host({ click: backend }), subscription)).resolves.toEqual({
      reason: 'ok',
    });
    for (const listener of listeners) listener(notification);
    expect(seen).toEqual([notification]);
    await expect(detachNotificationClickSubscription(subscription)).resolves.toEqual({ reason: 'ok' });
    expect(listeners.size).toBe(0);
  });
});

describe('attachNotificationDismissSubscription', () => {
  it('acquires and releases the dismiss event', async () => {
    const { backend } = createClickBackend();
    const subscription = createNotificationDismissSubscription();
    await expect(attachNotificationDismissSubscription(host({ dismiss: backend }), subscription)).resolves.toEqual({
      reason: 'ok',
    });
    await expect(detachNotificationDismissSubscription(subscription)).resolves.toEqual({ reason: 'ok' });
  });
});

describe('attachNotificationReceivedSubscription', () => {
  it('acquires and releases the backend-emitted received event', async () => {
    const { backend } = createClickBackend();
    const subscription = createNotificationReceivedSubscription();
    await expect(attachNotificationReceivedSubscription(host({ received: backend }), subscription)).resolves.toEqual({
      reason: 'ok',
    });
    await expect(detachNotificationReceivedSubscription(subscription)).resolves.toEqual({ reason: 'ok' });
  });
});

describe('attachNotificationReplySubscription', () => {
  it('acquires and releases the reply event', async () => {
    const listeners = new Set<(notification: Readonly<Notification>, actionId: string, text: string) => void>();
    const subscription = createNotificationReplySubscription();
    await expect(
      attachNotificationReplySubscription(
        host({
          reply: {
            async attach(listener) {
              listeners.add(listener);
              return {
                attachment: {
                  async release() {
                    listeners.delete(listener);
                    return { reason: 'ok' };
                  },
                },
                reason: 'ok',
              };
            },
          },
        }),
        subscription,
      ),
    ).resolves.toEqual({ reason: 'ok' });
    await expect(detachNotificationReplySubscription(subscription)).resolves.toEqual({ reason: 'ok' });
  });
});

describe('bindNotificationClose', () => {
  it('pins the provider close operation to its Notification Entity', async () => {
    const notification = createNotificationResource('bound', 'Bound');
    bindNotificationClose(notification, async () => ({ reason: 'ok' }));
    await expect(closeNotification(notification)).resolves.toEqual({
      reason: 'ok',
    });
  });
});

describe('bindScheduledNotificationCancel', () => {
  it('pins the provider cancel operation to its ScheduledNotification Entity', async () => {
    const scheduled = createScheduledNotificationResource('bound', { title: 'Bound' }, { at: 1 });
    bindScheduledNotificationCancel(scheduled, async () => ({ reason: 'ok' }));
    await expect(cancelScheduledNotification(scheduled)).resolves.toEqual({
      reason: 'ok',
    });
  });
});

describe('cancelScheduledNotification', () => {
  it('uses only the origin-pinned private cancellation and is idempotent', async () => {
    const scheduled = createScheduledNotificationResource('same', { title: 'Later' }, { at: 1 });
    let cancels = 0;
    bindScheduledNotificationCancel(scheduled, async () => {
      cancels += 1;
      return { reason: 'ok' };
    });
    await expect(cancelScheduledNotification(scheduled)).resolves.toEqual({
      reason: 'ok',
    });
    await expect(cancelScheduledNotification(scheduled)).resolves.toEqual({
      reason: 'already-cancelled',
    });
    expect(cancels).toBe(1);
  });
});

describe('closeAllNotifications', () => {
  it('dispatches provider-wide close through the exact Host trait', async () => {
    const outcome = { reason: 'ok' } as const;
    await expect(
      closeAllNotifications(
        host({
          close: {
            async closeAllNotifications() {
              return outcome;
            },
          },
        }),
      ),
    ).resolves.toBe(outcome);
  });
});

describe('closeNotification', () => {
  it('never accepts a replacement Host and never reroutes a foreign id', async () => {
    const notification = createNotificationResource('shared', 'A');
    await expect(closeNotification(notification)).resolves.toEqual({
      reason: 'operation-failed',
    });
  });

  it('uses only the origin-pinned close and is idempotent', async () => {
    const notification = createNotificationResource('same', 'A');
    let closes = 0;
    bindNotificationClose(notification, async () => {
      closes += 1;
      return { reason: 'ok' };
    });
    await expect(closeNotification(notification)).resolves.toEqual({
      reason: 'ok',
    });
    await expect(closeNotification(notification)).resolves.toEqual({
      reason: 'already-closed',
    });
    expect(closes).toBe(1);
  });
});

describe('createNotificationActionSubscription', () => {
  it('creates an Entity with an inert signal', () => {
    expect(EntityRuntimeKey in createNotificationActionSubscription()).toBe(true);
  });
});

describe('createNotificationClickSubscription', () => {
  it('creates an Entity with an inert signal', () => {
    expect(EntityRuntimeKey in createNotificationClickSubscription()).toBe(true);
  });
});

describe('createNotificationDismissSubscription', () => {
  it('creates an Entity with an inert signal', () => {
    expect(EntityRuntimeKey in createNotificationDismissSubscription()).toBe(true);
  });
});

describe('createNotificationReceivedSubscription', () => {
  it('creates an Entity with an inert signal', () => {
    expect(EntityRuntimeKey in createNotificationReceivedSubscription()).toBe(true);
  });
});

describe('createNotificationReplySubscription', () => {
  it('creates an Entity with an inert signal', () => {
    expect(EntityRuntimeKey in createNotificationReplySubscription()).toBe(true);
  });
});

describe('createNotificationResource', () => {
  it('creates stable public identity without a native key', () => {
    const notification = createNotificationResource('n1', 'Title', 'group');
    expect(EntityRuntimeKey in notification).toBe(true);
    expect(notification).toMatchObject({
      id: 'n1',
      tag: 'group',
      title: 'Title',
    });
  });
});

describe('createScheduledNotificationResource', () => {
  it('creates a stable scheduled Entity with request and schedule facts', () => {
    const request = { title: 'Later' };
    const schedule = { at: 1 };
    const scheduled = createScheduledNotificationResource('s1', request, schedule);
    expect(EntityRuntimeKey in scheduled).toBe(true);
    expect(scheduled).toMatchObject({ id: 's1', request, schedule });
  });
});

describe('destroyNotificationCapabilities', () => {
  it('dispatches through lifecycle and preserves retry-only failures', async () => {
    let calls = 0;
    const value = host({
      lifecycle: {
        async destroy() {
          calls += 1;
          return calls === 1
            ? {
                failures: [{ id: 'n1', operation: 'close' as const }],
                reason: 'operation-failed' as const,
              }
            : { reason: 'ok' as const };
        },
      },
    });
    await expect(destroyNotificationCapabilities(value)).resolves.toMatchObject({ reason: 'operation-failed' });
    await expect(destroyNotificationCapabilities(value)).resolves.toEqual({
      reason: 'ok',
    });
  });
});

describe('detachNotificationActionSubscription', () => {
  it('is harmless before attach', async () => {
    await expect(detachNotificationActionSubscription(createNotificationActionSubscription())).resolves.toEqual({
      reason: 'not-attached',
    });
  });
});

describe('detachNotificationClickSubscription', () => {
  it('is harmless before attach', async () => {
    await expect(detachNotificationClickSubscription(createNotificationClickSubscription())).resolves.toEqual({
      reason: 'not-attached',
    });
  });
});

describe('detachNotificationDismissSubscription', () => {
  it('is harmless before attach', async () => {
    await expect(detachNotificationDismissSubscription(createNotificationDismissSubscription())).resolves.toEqual({
      reason: 'not-attached',
    });
  });
});

describe('detachNotificationReceivedSubscription', () => {
  it('is harmless before attach', async () => {
    await expect(detachNotificationReceivedSubscription(createNotificationReceivedSubscription())).resolves.toEqual({
      reason: 'not-attached',
    });
  });
});

describe('detachNotificationReplySubscription', () => {
  it('is harmless before attach', async () => {
    await expect(detachNotificationReplySubscription(createNotificationReplySubscription())).resolves.toEqual({
      reason: 'not-attached',
    });
  });
});

describe('disposeNotificationActionSubscription', () => {
  it('is terminal and idempotent', async () => {
    const subscription = createNotificationActionSubscription();
    await expect(disposeNotificationActionSubscription(subscription)).resolves.toEqual({ reason: 'ok' });
    await expect(disposeNotificationActionSubscription(subscription)).resolves.toEqual({ reason: 'already-disposed' });
  });
});

describe('disposeNotificationClickSubscription', () => {
  it('keeps a failed release observable', async () => {
    const subscription = createNotificationClickSubscription();
    await attachNotificationClickSubscription(
      host({ click: createClickBackend({ releaseFailure: true }).backend }),
      subscription,
    );
    await expect(disposeNotificationClickSubscription(subscription)).resolves.toEqual({
      attachFailed: false,
      reason: 'operation-failed',
      releaseFailed: true,
    });
  });
});

describe('disposeNotificationDismissSubscription', () => {
  it('is terminal', async () => {
    await expect(disposeNotificationDismissSubscription(createNotificationDismissSubscription())).resolves.toEqual({
      reason: 'ok',
    });
  });
});

describe('disposeNotificationReceivedSubscription', () => {
  it('is terminal', async () => {
    await expect(disposeNotificationReceivedSubscription(createNotificationReceivedSubscription())).resolves.toEqual({
      reason: 'ok',
    });
  });
});

describe('disposeNotificationReplySubscription', () => {
  it('is terminal', async () => {
    await expect(disposeNotificationReplySubscription(createNotificationReplySubscription())).resolves.toEqual({
      reason: 'ok',
    });
  });
});

describe('getActiveNotifications', () => {
  it('returns provider-reconciled stable Entity identity without remapping', async () => {
    const notification = createNotificationResource('same', 'Title');
    const backend = {
      async getActiveNotifications() {
        return { notifications: [notification], reason: 'ok' as const };
      },
    };
    const value = host({ activeList: backend });
    const first = await getActiveNotifications(value);
    const second = await getActiveNotifications(value);
    expect(first.reason).toBe('ok');
    expect(second.reason).toBe('ok');
    if (first.reason === 'ok' && second.reason === 'ok') expect(second.notifications[0]).toBe(first.notifications[0]);
  });
});

describe('getNotificationPermission', () => {
  it('preserves query failure instead of collapsing it to denied', async () => {
    await expect(
      getNotificationPermission(
        host({
          permission: {
            async getPermission() {
              return { reason: 'operation-failed' };
            },
            async requestPermission() {
              return { reason: 'operation-failed' };
            },
          },
        }),
      ),
    ).resolves.toEqual({ reason: 'operation-failed' });
  });
});

describe('getPendingNotifications', () => {
  it('preserves provider failure instead of returning an empty success', async () => {
    await expect(
      getPendingNotifications(
        host({
          scheduling: {
            async cancelAllScheduledNotifications() {
              return { reason: 'ok' };
            },
            async getPendingNotifications() {
              return { reason: 'operation-failed' };
            },
            async scheduleNotification() {
              return { reason: 'operation-failed' };
            },
          },
        }),
      ),
    ).resolves.toEqual({ reason: 'operation-failed' });
  });
});

describe('initializeNotificationResource', () => {
  it('is the construction initializer of createNotificationResource', () => {
    expect(typeof initializeNotificationResource).toBe('function');
  });
});

describe('initializeScheduledNotificationResource', () => {
  it('is the construction initializer of createScheduledNotificationResource', () => {
    expect(typeof initializeScheduledNotificationResource).toBe('function');
  });
});

describe('requestNotificationPermission', () => {
  it('preserves the provider request outcome', async () => {
    await expect(
      requestNotificationPermission(
        host({
          permission: {
            async getPermission() {
              return { permission: 'default', reason: 'ok' };
            },
            async requestPermission() {
              return { reason: 'dismissed' };
            },
          },
        }),
      ),
    ).resolves.toEqual({ reason: 'dismissed' });
  });
});
describe('scheduleNotification', () => {
  it('returns the provider-created stable Entity', async () => {
    const scheduled = createScheduledNotificationResource('later', { title: 'Later' }, { at: 1 });
    await expect(
      scheduleNotification(
        host({
          scheduling: {
            async cancelAllScheduledNotifications() {
              return { reason: 'ok' };
            },
            async getPendingNotifications() {
              return { notifications: [], reason: 'ok' };
            },
            async scheduleNotification() {
              return { precision: 'exact', reason: 'scheduled', scheduled };
            },
          },
        }),
        { title: 'Later' },
        { at: 1 },
      ),
    ).resolves.toEqual({ precision: 'exact', reason: 'scheduled', scheduled });
  });
});

describe('showNotification', () => {
  it('returns only the provider acquisition outcome', async () => {
    const notification = createNotificationResource('shown', 'Title');
    await expect(
      showNotification(
        host({
          delivery: {
            async notify() {
              return { notification, reason: 'accepted' };
            },
          },
        }),
        { title: 'Title' },
      ),
    ).resolves.toEqual({ notification, reason: 'accepted' });
  });
});

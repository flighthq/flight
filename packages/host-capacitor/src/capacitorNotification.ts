import { createEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorLocalNotificationSchema,
  CapacitorPluginListenerHandle,
  HostNotificationCapabilities,
  NotificationPermission,
  NotificationSchedule,
} from '@flighthq/types/contract';

// Capacitor local notifications truthfully cover delivery, scheduling/cancellation, click, and action.
// Numeric plugin ids are kept behind the capability object and mapped to Flight's string ids.
export function createCapacitorNotificationCapabilities(capacitor: CapacitorApi) {
  const notifications = capacitor.localNotifications;
  const actionSubscriptions = new Map<(id: string, actionId: string) => void, () => void>();
  const clickSubscriptions = new Map<(id: string) => void, () => void>();
  const idByNumber = new Map<number, string>();
  let nextNumericId = 1;

  return createEntity({
    action: {
      subscribe(listener: (id: string, actionId: string) => void) {
        removeSubscription(actionSubscriptions, listener);
        const unsubscribe = toUnsubscribe(
          notifications.addListener('localNotificationActionPerformed', (action) => {
            listener(idByNumber.get(action.notification.id) ?? String(action.notification.id), action.actionId);
          }),
        );
        actionSubscriptions.set(listener, unsubscribe);
      },
      unsubscribe(listener: (id: string, actionId: string) => void) {
        removeSubscription(actionSubscriptions, listener);
      },
    },
    click: {
      subscribe(listener: (id: string) => void) {
        removeSubscription(clickSubscriptions, listener);
        const unsubscribe = toUnsubscribe(
          notifications.addListener('localNotificationActionPerformed', (action) => {
            if (action.actionId === 'tap')
              listener(idByNumber.get(action.notification.id) ?? String(action.notification.id));
          }),
        );
        clickSubscriptions.set(listener, unsubscribe);
      },
      unsubscribe(listener: (id: string) => void) {
        removeSubscription(clickSubscriptions, listener);
      },
    },
    delivery: {
      async getPermission(): Promise<NotificationPermission> {
        try {
          return toNotificationPermission((await notifications.checkPermissions()).display);
        } catch {
          return 'denied';
        }
      },
      async notify(request) {
        const numericId = nextNumericId++;
        const stringId = request.id ?? `notification-${numericId}`;
        idByNumber.set(numericId, stringId);
        try {
          await notifications.schedule({
            notifications: [{ body: request.body, id: numericId, title: request.title }],
          });
          return stringId;
        } catch {
          idByNumber.delete(numericId);
          return null;
        }
      },
      async requestPermission(): Promise<NotificationPermission> {
        try {
          return toNotificationPermission((await notifications.requestPermissions()).display);
        } catch {
          return 'denied';
        }
      },
    },
    pendingList: {
      async getPendingNotifications() {
        try {
          const pending = await notifications.getPending();
          return pending.notifications.map((schema) => {
            const id = idByNumber.get(schema.id) ?? String(schema.id);
            return {
              id,
              request: { body: schema.body, id, title: schema.title },
              schedule: {
                at: schema.schedule?.at?.getTime() ?? 0,
                repeat: toNotificationRepeat(schema.schedule?.every),
              },
            };
          });
        } catch {
          return [];
        }
      },
    },
    scheduling: {
      async cancelScheduledNotification(id: string) {
        const numericId = findNumericId(idByNumber, id);
        if (numericId === null) return;
        await notifications.cancel({ notifications: [{ id: numericId }] });
        idByNumber.delete(numericId);
      },
      async scheduleNotification(request, schedule) {
        const numericId = nextNumericId++;
        const stringId = request.id ?? `notification-${numericId}`;
        idByNumber.set(numericId, stringId);
        const schema: CapacitorLocalNotificationSchema = {
          body: request.body,
          id: numericId,
          schedule: {
            at: new Date(schedule.at),
            every: schedule.repeat,
            repeats: schedule.repeat !== undefined,
          },
          title: request.title,
        };
        try {
          await notifications.schedule({ notifications: [schema] });
          return stringId;
        } catch {
          idByNumber.delete(numericId);
          return null;
        }
      },
    },
  } as const satisfies HostNotificationCapabilities);
}

function findNumericId(idByNumber: ReadonlyMap<number, string>, stringId: string): number | null {
  for (const [numericId, mapped] of idByNumber) {
    if (mapped === stringId) return numericId;
  }
  const parsed = Number(stringId);
  return Number.isNaN(parsed) ? null : parsed;
}

function toNotificationPermission(display: string): NotificationPermission {
  if (display === 'granted') return 'granted';
  if (display === 'denied') return 'denied';
  return 'default';
}

function toNotificationRepeat(value: string | undefined): NotificationSchedule['repeat'] {
  switch (value) {
    case 'minute':
    case 'hour':
    case 'day':
    case 'week':
    case 'month':
    case 'year':
      return value;
    default:
      return undefined;
  }
}

function removeSubscription<TListener>(subscriptions: Map<TListener, () => void>, listener: TListener): void {
  const unsubscribe = subscriptions.get(listener);
  if (unsubscribe === undefined) return;
  subscriptions.delete(listener);
  unsubscribe();
}

// Bridges Capacitor's Promise<PluginListenerHandle> to the synchronous event-slot pair. If unsubscribe
// wins the registration race, the native handle is removed as soon as it resolves.
function toUnsubscribe(handlePromise: Promise<CapacitorPluginListenerHandle>): () => void {
  let removed = false;
  let handle: CapacitorPluginListenerHandle | null = null;
  handlePromise
    .then((resolved) => {
      handle = resolved;
      if (removed) handle.remove().catch(() => {});
    })
    .catch(() => {});
  return () => {
    removed = true;
    if (handle !== null) handle.remove().catch(() => {});
  };
}

import type {
  NotificationBackend,
  NotificationCapabilities,
  NotificationPermission,
  CapacitorApi,
  CapacitorLocalNotificationSchema,
  CapacitorPluginListenerHandle,
} from '@flighthq/types';

// Maps Flight's NotificationBackend onto Capacitor's `@capacitor/local-notifications`. Capacitor ids are
// numeric while Flight's are strings, so the adapter mints a monotonic numeric id per notification and
// maps back to the caller's string id (or a generated one) on return. `notify` schedules an immediate
// notification; `scheduleNotification` schedules at the request time; `getPendingNotifications` reads the
// pending list. `requestPermission` maps directly; the sync `getPermission` is served from a value
// prefetched once at construction (async→sync bridge), so it may read 'default' until that first probe
// resolves. Click/action delivery wires through the `localNotificationActionPerformed` listener; active
// list, image, and in-place update are outside the modeled surface and report the contract sentinels.
export function createCapacitorNotificationBackend(capacitor: CapacitorApi): NotificationBackend {
  const notifications = capacitor.localNotifications;
  let nextNumericId = 1;
  // A notification's Flight id, keyed by the numeric id Capacitor uses, so returned/enumerated
  // notifications carry the caller's original string id rather than the internal counter.
  const idByNumber = new Map<number, string>();
  // Sync getPermission has no async escape; prefetch the display state once and cache it.
  let cachedPermission: NotificationPermission = 'default';
  notifications
    .checkPermissions()
    .then((status) => {
      cachedPermission = toNotificationPermission(status.display);
    })
    .catch(() => {
      /* leave the 'default' sentinel */
    });
  return {
    async notify(request) {
      const numericId = nextNumericId++;
      const stringId = request.id ?? `notification-${numericId}`;
      idByNumber.set(numericId, stringId);
      try {
        await notifications.schedule({ notifications: [{ id: numericId, title: request.title, body: request.body }] });
        return stringId;
      } catch {
        return '';
      }
    },
    async requestPermission(): Promise<NotificationPermission> {
      try {
        const status = await notifications.requestPermissions();
        cachedPermission = toNotificationPermission(status.display);
        return cachedPermission;
      } catch {
        return 'denied';
      }
    },
    getPermission(): NotificationPermission {
      return cachedPermission;
    },
    isSupported() {
      return true;
    },
    getCapabilities(): NotificationCapabilities {
      return {
        actions: true,
        channels: true,
        coldStart: true,
        image: false,
        listActive: false,
        scheduling: true,
        textReply: false,
      };
    },
    async getLaunchNotification() {
      return null;
    },
    async getActiveNotifications() {
      // Capacitor exposes pending (scheduled) notifications, not the currently-displayed set; report none.
      return [];
    },
    async getPendingNotifications() {
      try {
        const pending = await notifications.getPending();
        return pending.notifications.map((schema) => ({
          id: idByNumber.get(schema.id) ?? String(schema.id),
          request: { id: idByNumber.get(schema.id) ?? String(schema.id), title: schema.title, body: schema.body },
          schedule: { at: schema.schedule?.at?.getTime() ?? 0 },
        }));
      } catch {
        return [];
      }
    },
    async scheduleNotification(request, schedule) {
      const numericId = nextNumericId++;
      const stringId = request.id ?? `notification-${numericId}`;
      idByNumber.set(numericId, stringId);
      const schema: CapacitorLocalNotificationSchema = {
        id: numericId,
        title: request.title,
        body: request.body,
        schedule: { at: new Date(schedule.at) },
      };
      try {
        await notifications.schedule({ notifications: [schema] });
        return stringId;
      } catch {
        return '';
      }
    },
    cancelScheduledNotification(id) {
      const numericId = findNumericId(idByNumber, id);
      if (numericId === null) return;
      notifications.cancel({ notifications: [{ id: numericId }] }).catch(() => {});
    },
    closeNotification() {
      // Capacitor local notifications expose no dismiss-shown-by-id call.
    },
    closeAllNotifications() {
      // No dismiss-all call.
    },
    async updateNotification() {
      // Capacitor has no in-place update; report not applied.
      return false;
    },
    subscribeClick(listener) {
      return toUnsubscribe(
        notifications.addListener('localNotificationActionPerformed', (action) => {
          if (action.actionId === 'tap')
            listener(idByNumber.get(action.notification.id) ?? String(action.notification.id));
        }),
      );
    },
    subscribeAction(listener) {
      return toUnsubscribe(
        notifications.addListener('localNotificationActionPerformed', (action) =>
          listener(idByNumber.get(action.notification.id) ?? String(action.notification.id), action.actionId),
        ),
      );
    },
    subscribeDismiss() {
      return () => {};
    },
    subscribeReply() {
      return () => {};
    },
    subscribeShow() {
      return () => {};
    },
  };
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

// Bridges Capacitor's Promise<PluginListenerHandle> to Flight's synchronous unsubscribe: fire the
// registration, adopt the handle when it resolves, and remove it (immediately if already resolved).
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

import { createEntity } from '@flighthq/entity/contract';
import { bindNotificationClose, createNotificationResource } from '@flighthq/notification/contract';
import type {
  Notification,
  NotificationEventBackendAttachOutcome,
  NotificationLifecycleFailure,
  NotificationLifecycleOutcome,
  NotificationRequest,
  NotificationRequestField,
  WebPageNotificationApi,
  WebPageNotificationCapabilities,
  WebPageNotificationInstance,
  WebNotificationOptions,
} from '@flighthq/types/contract';

export function createWebPageNotificationCapabilities(
  api: Readonly<WebPageNotificationApi>,
): WebPageNotificationCapabilities {
  const nativeByNotification = new Map<Notification, WebPageNotificationInstance>();
  const clickListeners = new Set<(notification: Readonly<Notification>) => void>();
  const dismissListeners = new Set<(notification: Readonly<Notification>) => void>();
  const receivedListeners = new Set<(notification: Readonly<Notification>) => void>();
  let destroyed = false;
  let destroyCompleted = false;
  let nextId = 1;

  async function closeOne(notification: Notification) {
    const native = nativeByNotification.get(notification);
    if (native === undefined) return { reason: 'already-closed' } as const;
    try {
      native.close();
      nativeByNotification.delete(notification);
      return { reason: 'ok' } as const;
    } catch {
      return { reason: 'operation-failed' } as const;
    }
  }

  async function closeAll(): Promise<NotificationLifecycleOutcome> {
    const failures: NotificationLifecycleFailure[] = [];
    for (const notification of [...nativeByNotification.keys()]) {
      const outcome = await closeOne(notification);
      if (outcome.reason === 'operation-failed') failures.push({ id: notification.id, operation: 'close' });
    }
    return failures.length === 0 ? { reason: 'ok' } : { failures, reason: 'operation-failed' };
  }

  return createEntity({
    click: makeWebNotificationEventBackend(clickListeners, () => destroyed),
    close: { closeAllNotifications: closeAll },
    delivery: {
      async notify(request) {
        if (destroyed) return { reason: 'operation-failed' };
        const invalid = getWebPageInvalidNotificationRequestFields(request);
        if (invalid.length > 0) return { fields: invalid, reason: 'invalid-request' };
        if (api.Notification.permission !== 'granted') return { reason: 'permission-denied' };
        const id = request.id ?? `web-notification-${nextId++}`;
        const tag = request.tag ?? `flight-web-notification-${nextId++}`;
        let native: WebPageNotificationInstance;
        try {
          native = new api.Notification(request.title, toWebNotificationOptions(request, tag));
        } catch {
          return { reason: 'operation-failed' };
        }
        const notification = createNotificationResource(id, request.title, tag);
        nativeByNotification.set(notification, native);
        bindNotificationClose(notification, () => closeOne(notification));
        native.onclick = () => {
          for (const listener of clickListeners) listener(notification);
        };
        native.onclose = () => {
          nativeByNotification.delete(notification);
          for (const listener of dismissListeners) listener(notification);
        };
        native.onerror = () => {
          nativeByNotification.delete(notification);
        };
        native.onshow = () => {
          for (const listener of receivedListeners) listener(notification);
        };
        return { notification, reason: 'accepted' };
      },
    },
    dismiss: makeWebNotificationEventBackend(dismissListeners, () => destroyed),
    lifecycle: {
      async destroy() {
        if (destroyCompleted) return { reason: 'already-destroyed' };
        destroyed = true;
        clickListeners.clear();
        dismissListeners.clear();
        receivedListeners.clear();
        const outcome = await closeAll();
        if (outcome.reason === 'ok') destroyCompleted = true;
        return outcome;
      },
    },
    permission: {
      async getPermission() {
        try {
          return { permission: api.Notification.permission, reason: 'ok' };
        } catch {
          return { reason: 'operation-failed' };
        }
      },
      async requestPermission() {
        try {
          const permission = await api.Notification.requestPermission();
          return {
            reason: permission === 'default' ? 'dismissed' : permission,
          };
        } catch {
          return { reason: 'operation-failed' };
        }
      },
    },
    received: makeWebNotificationEventBackend(receivedListeners, () => destroyed),
  });
}

function makeWebNotificationEventBackend<TListener>(listeners: Set<TListener>, isDestroyed: () => boolean) {
  return {
    async attach(listener: TListener): Promise<NotificationEventBackendAttachOutcome> {
      if (isDestroyed()) return { reason: 'operation-failed', releaseFailed: false };
      listeners.add(listener);
      let released = false;
      return {
        attachment: {
          async release() {
            if (!released) listeners.delete(listener);
            released = true;
            return { reason: 'ok' };
          },
        },
        reason: 'ok',
      };
    },
  };
}

function getWebPageInvalidNotificationRequestFields(
  request: Readonly<NotificationRequest>,
): NotificationRequestField[] {
  return request.actions === undefined ? [] : ['actions'];
}

function toWebNotificationOptions(
  request: Readonly<NotificationRequest>,
  tag: string,
): Readonly<WebNotificationOptions> {
  return {
    badge: request.badge,
    body: request.body,
    data: request.data,
    dir: request.dir,
    icon: request.icon,
    image: request.image,
    lang: request.lang,
    renotify: request.renotify,
    requireInteraction: request.requireInteraction,
    silent: request.silent,
    tag,
    timestamp: request.timestamp,
    vibrate: request.vibrate,
  };
}

import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { bindNotificationClose, createNotificationResource } from '@flighthq/notification/contract';
import type {
  EntityConstruction,
  Notification,
  NotificationEventBackendAttachOutcome,
  NotificationLifecycleFailure,
  NotificationLifecycleOutcome,
  NotificationRequest,
  WebNotificationOptions,
  WebServiceWorkerNotificationApi,
  WebServiceWorkerNotificationCapabilities,
  WebServiceWorkerNotificationEvent,
} from '@flighthq/types/contract';

interface WebServiceWorkerNotificationDispatch {
  action(notification: Notification, actionId: string): void;
  click(notification: Notification): void;
  dismiss(notification: Notification): void;
}

export function createWebServiceWorkerNotificationCapabilities(
  api: Readonly<WebServiceWorkerNotificationApi>,
): WebServiceWorkerNotificationCapabilities {
  const notificationByTag = new Map<string, Notification>();
  const actionListeners = new Set<(notification: Readonly<Notification>, actionId: string) => void>();
  const clickListeners = new Set<(notification: Readonly<Notification>) => void>();
  const dismissListeners = new Set<(notification: Readonly<Notification>) => void>();
  let destroyed = false;
  let destroyCompleted = false;
  let nextId = 1;

  async function closeOne(notification: Notification) {
    if (notificationByTag.get(notification.tag) !== notification) return { reason: 'already-closed' } as const;
    let nativeNotifications;
    try {
      nativeNotifications = await api.registration.getNotifications({
        tag: notification.tag,
      });
    } catch {
      return { reason: 'operation-failed' } as const;
    }
    try {
      for (const native of nativeNotifications) native.close();
    } catch {
      return { reason: 'operation-failed' } as const;
    }
    notificationByTag.delete(notification.tag);
    return { reason: 'ok' } as const;
  }

  async function closeAll(): Promise<NotificationLifecycleOutcome> {
    const failures: NotificationLifecycleFailure[] = [];
    for (const notification of [...notificationByTag.values()]) {
      const outcome = await closeOne(notification);
      if (outcome.reason === 'operation-failed') failures.push({ id: notification.id, operation: 'close' });
    }
    return failures.length === 0 ? { reason: 'ok' } : { failures, reason: 'operation-failed' };
  }

  const capabilities = allocateEntity<WebServiceWorkerNotificationCapabilities>();
  capabilities.action = makeWebServiceWorkerNotificationEventBackend(actionListeners, () => destroyed);
  capabilities.activeList = {
    async getActiveNotifications() {
      let nativeNotifications;
      try {
        nativeNotifications = await api.registration.getNotifications();
      } catch {
        return { reason: 'operation-failed' };
      }
      const notifications: Notification[] = [];
      for (const native of nativeNotifications) {
        const notification = notificationByTag.get(native.tag);
        if (notification !== undefined) notifications.push(notification);
      }
      return { notifications, reason: 'ok' };
    },
  };
  capabilities.click = makeWebServiceWorkerNotificationEventBackend(clickListeners, () => destroyed);
  capabilities.close = { closeAllNotifications: closeAll };
  capabilities.delivery = {
    async notify(request) {
      if (destroyed) return { reason: 'operation-failed' };
      if (api.permission.getPermission() !== 'granted') return { reason: 'permission-denied' };
      const id = request.id ?? `service-worker-notification-${nextId++}`;
      const tag = request.tag ?? `flight-service-worker-notification-${nextId++}`;
      try {
        await api.registration.showNotification(request.title, toServiceWorkerNotificationOptions(request, tag));
      } catch {
        return { reason: 'operation-failed' };
      }
      let notification = notificationByTag.get(tag);
      if (notification === undefined) {
        notification = createNotificationResource(id, request.title, tag);
        notificationByTag.set(tag, notification);
        bindNotificationClose(notification, () => closeOne(notification!));
      }
      return { notification, reason: 'accepted' };
    },
  };
  capabilities.dismiss = makeWebServiceWorkerNotificationEventBackend(dismissListeners, () => destroyed);
  capabilities.lifecycle = {
    async destroy() {
      if (destroyCompleted) return { reason: 'already-destroyed' };
      destroyed = true;
      actionListeners.clear();
      clickListeners.clear();
      dismissListeners.clear();
      const outcome = await closeAll();
      if (outcome.reason === 'ok') destroyCompleted = true;
      return outcome;
    },
  };
  capabilities.permission = {
    async getPermission() {
      try {
        return { permission: api.permission.getPermission(), reason: 'ok' };
      } catch {
        return { reason: 'operation-failed' };
      }
    },
    async requestPermission() {
      try {
        const permission = await api.permission.requestPermission();
        return {
          reason: permission === 'default' ? 'dismissed' : permission,
        };
      } catch {
        return { reason: 'operation-failed' };
      }
    },
  };

  _webServiceWorkerNotificationDispatch.set(capabilities, {
    action(notification, actionId) {
      for (const listener of actionListeners) listener(notification, actionId);
    },
    click(notification) {
      for (const listener of clickListeners) listener(notification);
    },
    dismiss(notification) {
      for (const listener of dismissListeners) listener(notification);
    },
  });
  _webServiceWorkerNotificationByTag.set(capabilities, notificationByTag);
  return capabilities;
}

export function notifyWebServiceWorkerNotificationEvent(
  capabilities: WebServiceWorkerNotificationCapabilities,
  event: Readonly<WebServiceWorkerNotificationEvent>,
): void {
  const notification = _webServiceWorkerNotificationByTag.get(capabilities)?.get(event.notificationTag);
  const dispatch = _webServiceWorkerNotificationDispatch.get(capabilities);
  if (notification === undefined || dispatch === undefined) return;
  if (event.type === 'notificationclose') {
    dispatch.dismiss(notification);
  } else if (event.actionId === undefined || event.actionId === '') {
    dispatch.click(notification);
  } else {
    dispatch.action(notification, event.actionId);
    dispatch.click(notification);
  }
}

function makeWebServiceWorkerNotificationEventBackend<TListener>(
  listeners: Set<TListener>,
  isDestroyed: () => boolean,
) {
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

function toServiceWorkerNotificationOptions(
  request: Readonly<NotificationRequest>,
  tag: string,
): Readonly<WebNotificationOptions> {
  return {
    actions: request.actions?.map((action) => ({
      action: action.id,
      icon: action.icon,
      title: action.title,
    })),
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

const _webServiceWorkerNotificationDispatch = new WeakMap<
  WebServiceWorkerNotificationCapabilities,
  WebServiceWorkerNotificationDispatch
>();
const _webServiceWorkerNotificationByTag = new WeakMap<
  WebServiceWorkerNotificationCapabilities,
  ReadonlyMap<string, Notification>
>();

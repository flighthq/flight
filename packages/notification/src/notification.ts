import { createEntity } from '@flighthq/entity/contract';
import type {
  ActiveNotification,
  Entity,
  HasNotificationAction,
  HasNotificationActiveList,
  HasNotificationClick,
  HasNotificationClose,
  HasNotificationDelivery,
  HasNotificationDismiss,
  HasNotificationReply,
  HasNotificationScheduling,
  HasNotificationShow,
  HasNotificationUpdate,
  HostNotificationCapabilities,
  NotificationCloseBackend,
  NotificationDeliveryBackend,
  NotificationHandle,
  NotificationPermission,
  NotificationRequest,
  NotificationSchedule,
  NotificationSchedulingBackend,
  NotificationUpdateBackend,
  ScheduledNotification,
  ScheduledNotificationHandle,
  ServiceWorkerNotificationCapabilities,
  WebNotificationCapabilities,
} from '@flighthq/types/contract';

interface ServiceWorkerNotificationLike {
  readonly data?: unknown;
  readonly tag: string;
  readonly title: string;
  close(): void;
}

// The service-worker provider accepts this minimal interface so the package does not need to depend on
// @types/service-worker-api or lib.webworker. A native ServiceWorkerRegistration satisfies it.
interface ServiceWorkerRegistrationLike {
  showNotification(title: string, options?: NotificationOptions): Promise<void>;
  getNotifications(filter?: { tag?: string }): Promise<ReadonlyArray<ServiceWorkerNotificationLike>>;
}

interface ServiceWorkerNotificationDispatch {
  action(notificationId: string, actionId: string): void;
  click(notificationId: string): void;
  dismiss(notificationId: string): void;
  reply(notificationId: string, actionId: string, text: string): void;
}

const _serviceWorkerDispatch = new WeakMap<ServiceWorkerNotificationCapabilities, ServiceWorkerNotificationDispatch>();

export async function cancelScheduledNotification(
  host: HasNotificationScheduling,
  handle: ScheduledNotificationHandle,
): Promise<void> {
  if (_cancelledSchedules.has(handle)) return;
  const backend = _scheduleOwners.get(handle) ?? host.notification.scheduling;
  await backend.cancelScheduledNotification(handle.id);
  _scheduleOwners.delete(handle);
  _cancelledSchedules.add(handle);
}

export function closeAllNotifications(host: HasNotificationClose): Promise<void> {
  return host.notification.close.closeAllNotifications();
}

export async function closeNotification(host: HasNotificationClose, handle: NotificationHandle): Promise<void> {
  if (_closedNotifications.has(handle)) return;
  const backend = _notificationOwners.get(handle)?.close ?? host.notification.close;
  await backend.closeNotification(handle.id);
  _notificationOwners.delete(handle);
  _closedNotifications.add(handle);
}

type NotificationHost = { readonly notification: HostNotificationCapabilities };
type NotificationOwner = Readonly<{
  close?: NotificationCloseBackend;
  update?: NotificationUpdateBackend;
}>;

const _notificationOwners = new WeakMap<NotificationHandle, NotificationOwner>();
const _closedNotifications = new WeakSet<NotificationHandle>();
const _scheduleOwners = new WeakMap<ScheduledNotificationHandle, NotificationSchedulingBackend>();
const _cancelledSchedules = new WeakSet<ScheduledNotificationHandle>();

// Builds a web provider backed by the Service Worker Notifications API. Action, click, dismiss, and
// reply events originate in the worker; forward them through notifyServiceWorkerNotificationEvent.
// Update is deliberately absent: the platform cannot recover the complete original request needed by
// the contract's merge semantics. Active-list summaries contain only the id/title/tag data it can prove.
export function createServiceWorkerNotificationCapabilities(
  registration: ServiceWorkerRegistrationLike,
): ServiceWorkerNotificationCapabilities & Entity {
  let idCounter = 0;
  const actionListeners = new Set<(id: string, actionId: string) => void>();
  const clickListeners = new Set<(id: string) => void>();
  const dismissListeners = new Set<(id: string) => void>();
  const replyListeners = new Set<(id: string, actionId: string, text: string) => void>();
  const showListeners = new Set<(id: string) => void>();
  const scheduled = new Map<string, { timeout: ReturnType<typeof setTimeout>; entry: ScheduledNotification }>();

  function generateId(): string {
    idCounter += 1;
    return `sw-notif-${idCounter}`;
  }

  async function notify(request: Readonly<NotificationRequest>): Promise<string | null> {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
    try {
      const id = request.id ?? generateId();
      await registration.showNotification(request.title, {
        actions: request.actions?.map((action) => ({ action: action.id, icon: action.icon, title: action.title })),
        badge: request.badge,
        body: request.body,
        data: { ...(request.data as object | null), notificationId: id },
        dir: request.dir,
        icon: request.icon,
        image: request.image,
        lang: request.lang,
        renotify: request.renotify,
        requireInteraction: request.requireInteraction,
        silent: request.silent,
        tag: request.tag ?? id,
        timestamp: request.timestamp,
        vibrate: request.vibrate ? [...request.vibrate] : undefined,
      } as NotificationOptions);
      for (const listener of showListeners) listener(id);
      return id;
    } catch {
      return null;
    }
  }

  const close: NotificationCloseBackend = {
    async closeAllNotifications() {
      try {
        const notifications = await registration.getNotifications();
        for (const notification of notifications) {
          if (getServiceWorkerNotificationId(notification) !== null) notification.close();
        }
      } catch {
        // A provider rejection leaves the platform's current notifications unchanged.
      }
    },
    async closeNotification(id) {
      try {
        const notifications = await registration.getNotifications();
        for (const notification of notifications) {
          if (getServiceWorkerNotificationId(notification) === id) notification.close();
        }
      } catch {
        // A provider rejection leaves the platform's current notifications unchanged.
      }
    },
  };

  const delivery: NotificationDeliveryBackend = {
    async getPermission() {
      if (typeof Notification === 'undefined') return 'denied';
      return Notification.permission as NotificationPermission;
    },
    notify,
    async requestPermission() {
      if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function') return 'denied';
      try {
        return (await Notification.requestPermission()) as NotificationPermission;
      } catch {
        return 'denied';
      }
    },
  };

  const scheduling: NotificationSchedulingBackend = {
    async cancelScheduledNotification(id) {
      const entry = scheduled.get(id);
      if (entry === undefined) return;
      clearTimeout(entry.timeout);
      scheduled.delete(id);
    },
    async getPendingNotifications() {
      return Array.from(scheduled.values()).map((entry) => entry.entry);
    },
    async scheduleNotification(request, schedule) {
      const id = request.id ?? generateId();
      const delay = Math.max(0, schedule.at - Date.now());
      const entry: ScheduledNotification = { id, request, schedule };
      const fireAndReschedule = (): void => {
        scheduled.delete(id);
        void notify({ ...request, id });
        if (schedule.repeat === undefined) return;
        const milliseconds = repeatMilliseconds(schedule.repeat);
        const timeout = setTimeout(fireAndReschedule, milliseconds);
        scheduled.set(id, {
          entry: { id, request, schedule: { ...schedule, at: Date.now() + milliseconds } },
          timeout,
        });
      };
      const timeout = setTimeout(fireAndReschedule, delay);
      scheduled.set(id, { entry, timeout });
      return id;
    },
  };

  const capabilities = createEntity({
    action: {
      subscribe(listener) {
        actionListeners.add(listener);
      },
      unsubscribe(listener) {
        actionListeners.delete(listener);
      },
    },
    activeList: {
      async getActiveNotifications() {
        try {
          const notifications = await registration.getNotifications();
          const active: ActiveNotification[] = [];
          for (const notification of notifications) {
            const id = getServiceWorkerNotificationId(notification);
            if (id !== null) active.push({ id, tag: notification.tag, title: notification.title });
          }
          return active;
        } catch {
          return [];
        }
      },
    },
    click: {
      subscribe(listener) {
        clickListeners.add(listener);
      },
      unsubscribe(listener) {
        clickListeners.delete(listener);
      },
    },
    close,
    delivery,
    dismiss: {
      subscribe(listener) {
        dismissListeners.add(listener);
      },
      unsubscribe(listener) {
        dismissListeners.delete(listener);
      },
    },
    reply: {
      subscribe(listener) {
        replyListeners.add(listener);
      },
      unsubscribe(listener) {
        replyListeners.delete(listener);
      },
    },
    scheduling,
    show: {
      subscribe(listener) {
        showListeners.add(listener);
      },
      unsubscribe(listener) {
        showListeners.delete(listener);
      },
    },
  } as const satisfies ServiceWorkerNotificationCapabilities);

  _serviceWorkerDispatch.set(capabilities, {
    action(notificationId, actionId) {
      for (const listener of actionListeners) listener(notificationId, actionId);
      for (const listener of clickListeners) listener(notificationId);
    },
    click(notificationId) {
      for (const listener of clickListeners) listener(notificationId);
    },
    dismiss(notificationId) {
      for (const listener of dismissListeners) listener(notificationId);
    },
    reply(notificationId, actionId, text) {
      for (const listener of replyListeners) listener(notificationId, actionId, text);
    },
  });
  return capabilities;
}

// Builds the standard page Notification API provider. It owns live Notification instances and
// best-effort page-lifetime schedule timers, so callers that need isolation may construct a fresh value.
export function createWebNotificationCapabilities(): WebNotificationCapabilities & Entity {
  const live = new Map<string, InstanceType<typeof Notification>>();
  const requests = new Map<string, Readonly<NotificationRequest>>();
  const clickListeners = new Set<(id: string) => void>();
  const dismissListeners = new Set<(id: string) => void>();
  const showListeners = new Set<(id: string) => void>();
  const scheduled = new Map<string, { timeout: ReturnType<typeof setTimeout>; entry: ScheduledNotification }>();
  let idCounter = 0;

  function generateId(): string {
    idCounter += 1;
    return `web-notif-${idCounter}`;
  }

  async function notify(request: Readonly<NotificationRequest>): Promise<string | null> {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
    try {
      const id = request.id ?? generateId();
      const notification = new Notification(request.title, {
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
        tag: request.tag ?? id,
        timestamp: request.timestamp,
        vibrate: request.vibrate ? [...request.vibrate] : undefined,
      } as NotificationOptions);
      live.set(id, notification);
      requests.set(id, request);
      notification.onshow = () => {
        for (const listener of showListeners) listener(id);
      };
      notification.onclick = () => {
        for (const listener of clickListeners) listener(id);
      };
      notification.onclose = () => {
        if (live.get(id) === notification) {
          live.delete(id);
          requests.delete(id);
        }
        for (const listener of dismissListeners) listener(id);
      };
      notification.onerror = () => {
        if (live.get(id) === notification) {
          live.delete(id);
          requests.delete(id);
        }
      };
      return id;
    } catch {
      return null;
    }
  }

  function closeOne(id: string): void {
    const notification = live.get(id);
    if (notification === undefined) return;
    live.delete(id);
    requests.delete(id);
    try {
      notification.close();
    } catch {
      // Some browsers reject programmatic close; the provider no longer treats the instance as live.
    }
  }

  return createEntity({
    click: {
      subscribe(listener) {
        clickListeners.add(listener);
      },
      unsubscribe(listener) {
        clickListeners.delete(listener);
      },
    },
    close: {
      async closeAllNotifications() {
        for (const id of [...live.keys()]) closeOne(id);
      },
      async closeNotification(id) {
        closeOne(id);
      },
    },
    delivery: {
      async getPermission() {
        if (typeof Notification === 'undefined') return 'denied';
        return Notification.permission as NotificationPermission;
      },
      notify,
      async requestPermission() {
        if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function')
          return 'denied';
        try {
          return (await Notification.requestPermission()) as NotificationPermission;
        } catch {
          return 'denied';
        }
      },
    },
    dismiss: {
      subscribe(listener) {
        dismissListeners.add(listener);
      },
      unsubscribe(listener) {
        dismissListeners.delete(listener);
      },
    },
    scheduling: {
      async cancelScheduledNotification(id) {
        const entry = scheduled.get(id);
        if (entry === undefined) return;
        clearTimeout(entry.timeout);
        scheduled.delete(id);
      },
      async getPendingNotifications() {
        return Array.from(scheduled.values()).map((entry) => entry.entry);
      },
      async scheduleNotification(request, schedule) {
        const id = request.id ?? generateId();
        const delay = Math.max(0, schedule.at - Date.now());
        const entry: ScheduledNotification = { id, request, schedule };
        const fireAndReschedule = (): void => {
          scheduled.delete(id);
          void notify({ ...request, id });
          if (schedule.repeat === undefined) return;
          const milliseconds = repeatMilliseconds(schedule.repeat);
          const timeout = setTimeout(fireAndReschedule, milliseconds);
          scheduled.set(id, {
            entry: { id, request, schedule: { ...schedule, at: Date.now() + milliseconds } },
            timeout,
          });
        };
        const timeout = setTimeout(fireAndReschedule, delay);
        scheduled.set(id, { entry, timeout });
        return id;
      },
    },
    show: {
      subscribe(listener) {
        showListeners.add(listener);
      },
      unsubscribe(listener) {
        showListeners.delete(listener);
      },
    },
    update: {
      async updateNotification(id, partial) {
        const existing = live.get(id);
        const request = requests.get(id);
        if (existing === undefined || request === undefined) return false;
        closeOne(id);
        return (await notify({ ...request, ...partial, id })) !== null;
      },
    },
  } as const satisfies WebNotificationCapabilities);
}

export async function getActiveNotifications(
  host: HasNotificationActiveList & NotificationHost,
): Promise<ReadonlyArray<Readonly<ActiveNotification>>> {
  const active = await host.notification.activeList.getActiveNotifications();
  return active.map((entry) => {
    const handle: ActiveNotification = { id: entry.id, tag: entry.tag, title: entry.title };
    _notificationOwners.set(handle, { close: host.notification.close, update: host.notification.update });
    return handle;
  });
}

export function getNotificationPermission(host: HasNotificationDelivery): Promise<NotificationPermission> {
  return host.notification.delivery.getPermission();
}

export async function getPendingNotifications(
  host: HasNotificationScheduling & NotificationHost,
): Promise<ReadonlyArray<Readonly<ScheduledNotification>>> {
  const backend = host.notification.scheduling;
  const pending = await backend.getPendingNotifications();
  return pending.map((entry) => {
    const handle: ScheduledNotification = { id: entry.id, request: entry.request, schedule: entry.schedule };
    _scheduleOwners.set(handle, backend);
    return handle;
  });
}

// Forwards a worker-side notificationclick/notificationclose message to the exact service-worker
// capability object that created the subscriptions.
export function notifyServiceWorkerNotificationEvent(
  capabilities: ServiceWorkerNotificationCapabilities,
  message: Readonly<{ type: string; notificationId: string; actionId?: string; reply?: string }>,
): void {
  const dispatch = _serviceWorkerDispatch.get(capabilities);
  if (dispatch === undefined) return;
  if (message.type === 'notificationclose') {
    dispatch.dismiss(message.notificationId);
    return;
  }
  if (message.type !== 'notificationclick') return;
  if (message.actionId !== undefined && message.reply !== undefined) {
    dispatch.reply(message.notificationId, message.actionId, message.reply);
  } else if (message.actionId !== undefined) {
    dispatch.action(message.notificationId, message.actionId);
  } else {
    dispatch.click(message.notificationId);
  }
}

export function onNotificationAction(
  host: HasNotificationAction,
  listener: (id: string, actionId: string) => void,
): () => void {
  return registerNotificationListener(host.notification.action, listener);
}

export function onNotificationClick(host: HasNotificationClick, listener: (id: string) => void): () => void {
  return registerNotificationListener(host.notification.click, listener);
}

export function onNotificationDismiss(host: HasNotificationDismiss, listener: (id: string) => void): () => void {
  return registerNotificationListener(host.notification.dismiss, listener);
}

export function onNotificationReply(
  host: HasNotificationReply,
  listener: (id: string, actionId: string, text: string) => void,
): () => void {
  return registerNotificationListener(host.notification.reply, listener);
}

export function onNotificationShow(host: HasNotificationShow, listener: (id: string) => void): () => void {
  return registerNotificationListener(host.notification.show, listener);
}

export function requestNotificationPermission(host: HasNotificationDelivery): Promise<NotificationPermission> {
  return host.notification.delivery.requestPermission();
}

export async function scheduleNotification(
  host: HasNotificationScheduling,
  request: Readonly<NotificationRequest>,
  schedule: Readonly<NotificationSchedule>,
): Promise<ScheduledNotificationHandle | null> {
  const backend = host.notification.scheduling;
  const id = await backend.scheduleNotification(request, schedule);
  if (id === null) return null;
  const handle: ScheduledNotificationHandle = { id };
  _scheduleOwners.set(handle, backend);
  return handle;
}

export async function showNotification(
  host: HasNotificationDelivery & NotificationHost,
  request: Readonly<NotificationRequest>,
): Promise<NotificationHandle | null> {
  const id = await host.notification.delivery.notify(request);
  if (id === null) return null;
  const handle: NotificationHandle = { id };
  _notificationOwners.set(handle, { close: host.notification.close, update: host.notification.update });
  return handle;
}

export async function updateNotification(
  host: HasNotificationUpdate,
  handle: NotificationHandle,
  partial: Readonly<Partial<NotificationRequest>>,
): Promise<boolean> {
  if (_closedNotifications.has(handle)) return false;
  const backend = _notificationOwners.get(handle)?.update ?? host.notification.update;
  return backend.updateNotification(handle.id, partial);
}

function registerNotificationListener<TArgs extends unknown[]>(
  backend: {
    subscribe(listener: (...args: TArgs) => void): void;
    unsubscribe(listener: (...args: TArgs) => void): void;
  },
  listener: (...args: TArgs) => void,
): () => void {
  backend.subscribe(listener);
  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    backend.unsubscribe(listener);
  };
}

function getServiceWorkerNotificationId(notification: ServiceWorkerNotificationLike): string | null {
  if (typeof notification.data !== 'object' || notification.data === null) return null;
  const id = (notification.data as { notificationId?: unknown }).notificationId;
  return typeof id === 'string' ? id : null;
}

function repeatMilliseconds(repeat: NonNullable<NotificationSchedule['repeat']>): number {
  switch (repeat) {
    case 'minute':
      return 60_000;
    case 'hour':
      return 3_600_000;
    case 'day':
      return 86_400_000;
    case 'week':
      return 604_800_000;
    case 'month':
      return 2_592_000_000;
    case 'year':
      return 31_536_000_000;
  }
}

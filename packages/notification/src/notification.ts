import type {
  NotificationBackend,
  NotificationCapabilities,
  NotificationChannel,
  NotificationPermission,
  NotificationRequest,
  NotificationSchedule,
  ScheduledNotification,
} from '@flighthq/types';

// ---- ServiceWorkerRegistration shim for type safety without importing lib.webworker ----
// The service-worker backend accepts this minimal interface so the package does not need to
// depend on @types/service-worker-api or lib.webworker. A native ServiceWorkerRegistration
// satisfies it automatically.
interface ServiceWorkerRegistrationLike {
  showNotification(title: string, options?: NotificationOptions): Promise<void>;
  getNotifications(filter?: { tag?: string }): Promise<ReadonlyArray<{ title: string; close(): void; tag: string }>>;
}

// Cancels a pending scheduled notification by id. No-ops when the id is unknown.
export function cancelScheduledNotification(id: string): void {
  getNotificationBackend().cancelScheduledNotification(id);
}

// Dismisses all currently-shown notifications.
export function closeAllNotifications(): void {
  getNotificationBackend().closeAllNotifications();
}

// Dismisses the notification with the given id. No-ops when the id is unknown or already dismissed.
export function closeNotification(id: string): void {
  getNotificationBackend().closeNotification(id);
}

// Creates or updates a notification channel. No-ops on backends without channel support.
export function createNotificationChannel(channel: Readonly<NotificationChannel>): void {
  const backend = getNotificationBackend() as NotificationBackend & {
    createNotificationChannel?: (channel: Readonly<NotificationChannel>) => void;
  };
  backend.createNotificationChannel?.(channel);
}

// Builds a web backend backed by the Service Worker Notifications API. Unlike the basic web
// backend, this variant can deliver action-button activations because it uses
// `registration.showNotification`, which triggers the SW `notificationclick` event globally.
//
// The caller must supply an active ServiceWorkerRegistration (e.g. from
// `navigator.serviceWorker.ready`). The backend uses `registration.showNotification` and
// `registration.getNotifications` to manage notification identity and lifecycle.
//
// Action delivery requires a service worker that forwards `notificationclick` messages back to the
// page. Wire the SW side like this:
//
//   self.addEventListener('notificationclick', (event) => {
//     event.notification.close();
//     const { notificationId, actionId } = event.notification.data ?? {};
//     if (event.source) event.source.postMessage({ type: 'notificationclick', notificationId, actionId });
//   });
//
// Then call `notifyServiceWorkerBackendAction(backend, event.data)` in the page's message handler.
// This two-step wiring is necessary because SW events fire in the worker thread, not the page.
export function createServiceWorkerNotificationBackend(
  registration: ServiceWorkerRegistrationLike,
): NotificationBackend {
  let _idCounter = 0;
  let _clickListeners = new Set<(id: string) => void>();
  let _actionListeners = new Set<(id: string, actionId: string) => void>();
  let _dismissListeners = new Set<(id: string) => void>();
  let _replyListeners = new Set<(id: string, actionId: string, text: string) => void>();
  let _showListeners = new Set<(id: string) => void>();
  const _scheduled = new Map<string, { timeout: ReturnType<typeof setTimeout>; entry: ScheduledNotification }>();

  function _generateId(): string {
    _idCounter += 1;
    return `sw-notif-${_idCounter}`;
  }

  function _fire<T>(listeners: Set<(arg: T) => void>, arg: T): void {
    for (const fn of listeners) fn(arg);
  }

  async function _show(request: Readonly<NotificationRequest>): Promise<string> {
    if (typeof Notification === 'undefined') return '';
    try {
      if (Notification.permission !== 'granted') return '';
      const id = request.id ?? _generateId();
      await registration.showNotification(request.title, {
        body: request.body,
        badge: request.badge,
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
        // Store the Flight id in data so SW click handlers can forward it back.
        data: { ...((request.data as object | null) ?? {}), notificationId: id },
        actions: request.actions?.map((a) => ({ action: a.id, title: a.title, icon: a.icon })),
      } as NotificationOptions);
      _fire(_showListeners, id);
      return id;
    } catch {
      return '';
    }
  }

  const backend: NotificationBackend = {
    cancelScheduledNotification(id) {
      const entry = _scheduled.get(id);
      if (entry !== undefined) {
        clearTimeout(entry.timeout);
        _scheduled.delete(id);
      }
    },

    async closeAllNotifications() {
      try {
        const notifications = await registration.getNotifications();
        for (const n of notifications) {
          n.close();
        }
      } catch {
        // Guarded.
      }
    },

    async closeNotification(id) {
      try {
        const notifications = await registration.getNotifications({ tag: id });
        for (const n of notifications) {
          n.close();
        }
      } catch {
        // Guarded.
      }
    },

    getCapabilities(): NotificationCapabilities {
      return {
        actions: true,
        channels: false,
        coldStart: false,
        image: true,
        listActive: true,
        scheduling: true,
        textReply: false,
      };
    },

    async getLaunchNotification() {
      return null;
    },

    async getActiveNotifications() {
      try {
        const notifications = await registration.getNotifications();
        return notifications.map((n) => ({ title: n.title, tag: n.tag }));
      } catch {
        return [];
      }
    },

    async getPendingNotifications() {
      return Array.from(_scheduled.values()).map((e) => e.entry);
    },

    getPermission(): NotificationPermission {
      if (typeof Notification === 'undefined') return 'denied';
      return Notification.permission as NotificationPermission;
    },

    isSupported() {
      return typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
    },

    notify: _show,

    async requestPermission(): Promise<NotificationPermission> {
      if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function') return 'denied';
      try {
        return (await Notification.requestPermission()) as NotificationPermission;
      } catch {
        return 'denied';
      }
    },

    async scheduleNotification(request, schedule) {
      const id = request.id ?? _generateId();
      const delay = Math.max(0, schedule.at - Date.now());
      const entry: ScheduledNotification = { id, request, schedule };

      const fireAndReschedule = () => {
        _scheduled.delete(id);
        void _show({ ...request, id });
        if (schedule.repeat !== undefined) {
          const ms = _repeatMs(schedule.repeat);
          const timeout = setTimeout(fireAndReschedule, ms);
          _scheduled.set(id, {
            timeout,
            entry: { id, request, schedule: { ...schedule, at: Date.now() + ms } },
          });
        }
      };

      const timeout = setTimeout(fireAndReschedule, delay);
      _scheduled.set(id, { timeout, entry });
      return id;
    },

    subscribeAction(listener) {
      _actionListeners.add(listener);
      return () => {
        _actionListeners.delete(listener);
      };
    },

    subscribeClick(listener) {
      _clickListeners.add(listener);
      return () => {
        _clickListeners.delete(listener);
      };
    },

    subscribeDismiss(listener) {
      _dismissListeners.add(listener);
      return () => {
        _dismissListeners.delete(listener);
      };
    },

    subscribeReply(listener) {
      _replyListeners.add(listener);
      return () => {
        _replyListeners.delete(listener);
      };
    },

    subscribeShow(listener) {
      _showListeners.add(listener);
      return () => {
        _showListeners.delete(listener);
      };
    },

    async updateNotification(id, partial) {
      // Close existing and re-show with merged fields.
      await backend.closeNotification(id);
      // Merge the partial on top; since we don't retain the original request in the SW backend
      // (the SW doesn't expose it), callers must include at least a title in partial or this
      // cannot reconstruct the notification.
      const merged: NotificationRequest = { ...(partial as NotificationRequest), id };
      if (merged.title === undefined) return false;
      await _show(merged);
      return true;
    },
  };

  type SwBackendInternal = NotificationBackend & {
    _dispatchAction: (notificationId: string, actionId: string) => void;
    _dispatchClick: (notificationId: string) => void;
    _dispatchDismiss: (notificationId: string) => void;
  };

  // Exposes internal dispatch hooks so page-side message handlers can forward SW events.
  // Use notifyServiceWorkerBackendAction() rather than calling these directly.
  const internal = backend as SwBackendInternal;
  internal._dispatchAction = (notificationId, actionId) => {
    // Action button tap: deliver to both action listeners (id + actionId) and click listeners (id).
    for (const fn of _actionListeners) fn(notificationId, actionId);
    _fire(_clickListeners, notificationId);
  };
  internal._dispatchClick = (notificationId) => {
    _fire(_clickListeners, notificationId);
  };
  internal._dispatchDismiss = (notificationId) => {
    _fire(_dismissListeners, notificationId);
  };

  return backend;
}

// Builds the default web backend over the global Notification API. Every touch is guarded for hosts
// where Notification is absent (jsdom, non-secure contexts) and wrapped in try/catch; notify and
// requestPermission resolve to '' / 'default' when unsupported or denied rather than throwing.
// Per-instance onclick is wired so clicks are actually delivered; action buttons require the
// service-worker backend variant and never fire on this basic backend.
export function createWebNotificationBackend(): NotificationBackend {
  // Live map of id → Notification instance so we can close them and wire onclick.
  const _live = new Map<string, InstanceType<typeof Notification>>();
  // Live request registry: id → the original request, needed to merge partial updates.
  const _requests = new Map<string, Readonly<NotificationRequest>>();
  let _clickListeners = new Set<(id: string) => void>();
  let _actionListeners = new Set<(id: string, actionId: string) => void>();
  let _dismissListeners = new Set<(id: string) => void>();
  let _replyListeners = new Set<(id: string, actionId: string, text: string) => void>();
  let _showListeners = new Set<(id: string) => void>();

  // Scheduled-notification registry (best-effort setTimeout — cleared on page reload).
  const _scheduled = new Map<string, { timeout: ReturnType<typeof setTimeout>; entry: ScheduledNotification }>();
  let _idCounter = 0;

  function _generateId(): string {
    _idCounter += 1;
    return `web-notif-${_idCounter}`;
  }

  function _fire<T>(listeners: Set<(arg: T) => void>, arg: T): void {
    for (const fn of listeners) fn(arg);
  }

  // Extracted as a closure function so scheduleNotification can call it without a `this` reference.
  async function _notify(request: Readonly<NotificationRequest>): Promise<string> {
    if (typeof Notification === 'undefined') return '';
    try {
      if (Notification.permission !== 'granted') return '';
      const id = request.id ?? _generateId();
      const n = new Notification(request.title, {
        body: request.body,
        badge: request.badge,
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

      _live.set(id, n);
      _requests.set(id, request);

      n.onshow = () => {
        _fire(_showListeners, id);
      };
      n.onclick = () => {
        _fire(_clickListeners, id);
      };
      n.onclose = () => {
        _live.delete(id);
        _requests.delete(id);
        _fire(_dismissListeners, id);
      };
      n.onerror = () => {
        _live.delete(id);
        _requests.delete(id);
      };

      return id;
    } catch {
      return '';
    }
  }

  return {
    cancelScheduledNotification(id) {
      const entry = _scheduled.get(id);
      if (entry !== undefined) {
        clearTimeout(entry.timeout);
        _scheduled.delete(id);
      }
    },

    closeAllNotifications() {
      for (const [id, n] of _live) {
        try {
          n.close();
        } catch {
          // Guarded — some browsers disallow closing programmatically.
        }
        _live.delete(id);
        _requests.delete(id);
      }
    },

    closeNotification(id) {
      const n = _live.get(id);
      if (n !== undefined) {
        try {
          n.close();
        } catch {
          // Guarded.
        }
        _live.delete(id);
        _requests.delete(id);
      }
    },

    getCapabilities(): NotificationCapabilities {
      return {
        actions: false,
        channels: false,
        coldStart: false,
        image: false,
        listActive: false,
        scheduling: true,
        textReply: false,
      };
    },

    async getLaunchNotification() {
      // Web pages are not launched from a notification; always null.
      return null;
    },

    async getActiveNotifications() {
      return [];
    },

    async getPendingNotifications() {
      return Array.from(_scheduled.values()).map((e) => e.entry);
    },

    getPermission(): NotificationPermission {
      if (typeof Notification === 'undefined') return 'denied';
      const p = Notification.permission as NotificationPermission;
      // The web API uses 'default' / 'granted' / 'denied' — same union values.
      return p;
    },

    isSupported() {
      return typeof Notification !== 'undefined';
    },

    notify: _notify,

    async requestPermission(): Promise<NotificationPermission> {
      if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function') return 'denied';
      try {
        const result = (await Notification.requestPermission()) as NotificationPermission;
        return result;
      } catch {
        return 'denied';
      }
    },

    async scheduleNotification(request, schedule) {
      const id = request.id ?? _generateId();
      const delay = Math.max(0, schedule.at - Date.now());
      const entry: ScheduledNotification = { id, request, schedule };

      const fireAndReschedule = () => {
        _scheduled.delete(id);
        void _notify({ ...request, id });
        if (schedule.repeat !== undefined) {
          const ms = _repeatMs(schedule.repeat);
          const timeout = setTimeout(fireAndReschedule, ms);
          _scheduled.set(id, {
            timeout,
            entry: { id, request, schedule: { ...schedule, at: Date.now() + ms } },
          });
        }
      };

      const timeout = setTimeout(fireAndReschedule, delay);
      _scheduled.set(id, { timeout, entry });
      return id;
    },

    subscribeAction(listener) {
      // Web notifications have no global action feed — action buttons require the Service Worker
      // Notifications API. A native host (Electron/Tauri) or the SW backend is required.
      _actionListeners.add(listener);
      return () => {
        _actionListeners.delete(listener);
      };
    },

    subscribeClick(listener) {
      _clickListeners.add(listener);
      return () => {
        _clickListeners.delete(listener);
      };
    },

    subscribeDismiss(listener) {
      _dismissListeners.add(listener);
      return () => {
        _dismissListeners.delete(listener);
      };
    },

    subscribeReply(listener) {
      // Inline reply requires the SW backend; this basic backend never fires it.
      _replyListeners.add(listener);
      return () => {
        _replyListeners.delete(listener);
      };
    },

    subscribeShow(listener) {
      _showListeners.add(listener);
      return () => {
        _showListeners.delete(listener);
      };
    },

    async updateNotification(id, partial) {
      // The basic Notification API has no update mechanism. Simulate by closing and re-opening.
      const existing = _live.get(id);
      const originalRequest = _requests.get(id);
      if (existing === undefined || originalRequest === undefined) return false;
      try {
        existing.close();
        _live.delete(id);
        _requests.delete(id);
      } catch {
        // Guarded — some browsers disallow closing programmatically.
      }
      // Merge the partial fields into the original request, preserving the stable id.
      const merged: NotificationRequest = { ...originalRequest, ...partial, id };
      await _notify(merged);
      return true;
    },
  };
}

// Deletes the notification channel with the given id. No-ops on backends without channel support.
export function deleteNotificationChannel(id: string): void {
  const backend = getNotificationBackend() as NotificationBackend & {
    deleteNotificationChannel?: (id: string) => void;
  };
  backend.deleteNotificationChannel?.(id);
}

// Returns all currently-displayed notifications. Returns an empty array on backends that do not
// support active-notification introspection.
export function getActiveNotifications(): Promise<ReadonlyArray<Readonly<NotificationRequest>>> {
  return getNotificationBackend().getActiveNotifications();
}

// Returns the notification the app was launched from, or null when the app was not launched via
// a notification tap. On web this always returns null.
export function getLaunchNotification(): Promise<Readonly<NotificationRequest> | null> {
  return getNotificationBackend().getLaunchNotification();
}

// The active notification backend, or a lazily-created web default. There is always a backend.
export function getNotificationBackend(): NotificationBackend {
  if (_backend === null) _backend = createWebNotificationBackend();
  return _backend;
}

// Returns a plain-data record of what the active backend supports.
export function getNotificationCapabilities(): NotificationCapabilities {
  return getNotificationBackend().getCapabilities();
}

// Returns the list of currently-registered notification channels. Returns an empty array on
// backends that do not support channels (e.g. web).
export function getNotificationChannels(): ReadonlyArray<Readonly<NotificationChannel>> {
  const backend = getNotificationBackend() as NotificationBackend & {
    getNotificationChannels?: () => ReadonlyArray<Readonly<NotificationChannel>>;
  };
  return backend.getNotificationChannels?.() ?? [];
}

// Returns the current notification permission state: 'default' (not yet asked), 'granted', or 'denied'.
export function getNotificationPermission(): NotificationPermission {
  return getNotificationBackend().getPermission();
}

// Returns all locally-scheduled (not yet delivered) notifications.
export function getPendingNotifications(): Promise<ReadonlyArray<Readonly<ScheduledNotification>>> {
  return getNotificationBackend().getPendingNotifications();
}

// True when the host can show notifications. Cheap; reads the active backend.
export function isNotificationSupported(): boolean {
  return getNotificationBackend().isSupported();
}

// Forwards a service-worker click/action event received via postMessage to the given SW backend's
// listeners. Call this from your page's `navigator.serviceWorker.addEventListener('message', ...)`
// handler when the SW posts a `{ type: 'notificationclick', notificationId, actionId? }` message.
export function notifyServiceWorkerBackendAction(
  backend: NotificationBackend,
  message: Readonly<{ type: string; notificationId: string; actionId?: string }>,
): void {
  if (message.type !== 'notificationclick') return;
  const b = backend as NotificationBackend & {
    _dispatchAction?: (notificationId: string, actionId: string) => void;
    _dispatchClick?: (notificationId: string) => void;
  };
  if (message.actionId !== undefined && b._dispatchAction !== undefined) {
    b._dispatchAction(message.notificationId, message.actionId);
  } else if (b._dispatchClick !== undefined) {
    b._dispatchClick(message.notificationId);
  }
}

// Subscribes to notification action-button activations, delivering the notification id and action id.
// Returns an unsubscribe function. On the basic web backend this never fires; a native host or the
// service-worker web backend is required for action delivery.
export function onNotificationAction(listener: (id: string, actionId: string) => void): () => void {
  return getNotificationBackend().subscribeAction(listener);
}

// Subscribes to notification body clicks, delivering the notification id.
// Returns an unsubscribe function. On the basic web backend clicks are delivered per-instance via
// the onclick event (wired by createWebNotificationBackend); a native host delivers a global feed.
export function onNotificationClick(listener: (id: string) => void): () => void {
  return getNotificationBackend().subscribeClick(listener);
}

// Subscribes to notification dismiss/close events, delivering the notification id.
// Returns an unsubscribe function.
export function onNotificationDismiss(listener: (id: string) => void): () => void {
  return getNotificationBackend().subscribeDismiss(listener);
}

// Subscribes to inline-reply text actions, delivering the notification id, action id, and reply text.
// Returns an unsubscribe function. Requires native host or service-worker backend; never fires on
// the basic web backend.
export function onNotificationReply(listener: (id: string, actionId: string, text: string) => void): () => void {
  return getNotificationBackend().subscribeReply(listener);
}

// Subscribes to notification show events, delivering the notification id. Returns an unsubscribe function.
export function onNotificationShow(listener: (id: string) => void): () => void {
  return getNotificationBackend().subscribeShow(listener);
}

// Requests notification permission. Returns the tri-state result: 'granted', 'denied', or 'default'
// (user dismissed the prompt without deciding). 'denied' is also returned when the host lacks the
// notification surface. Use getNotificationPermission() to read the current state without prompting.
export function requestNotificationPermission(): Promise<NotificationPermission> {
  return getNotificationBackend().requestPermission();
}

// Channel management — no-ops on web (no channel model); load-bearing on Android-class native hosts.

// Schedules a local notification for delivery at the time specified in the schedule. Returns the
// notification id (echoes request.id when provided, else a generated id). Returns '' when
// scheduling is not supported. On the basic web backend this uses setTimeout (best-effort,
// cleared on page reload); native backends use the OS scheduler.
export function scheduleNotification(
  request: Readonly<NotificationRequest>,
  schedule: Readonly<NotificationSchedule>,
): Promise<string> {
  return getNotificationBackend().scheduleNotification(request, schedule);
}

// Installs a native host notification backend; pass null to fall back to the web default.
export function setNotificationBackend(backend: NotificationBackend | null): void {
  _backend = backend;
}

// Shows a notification. Returns the notification id (echoes request.id when provided, else a
// generated id). Returns '' when permission is not granted or the host lacks the surface.
export function showNotification(request: Readonly<NotificationRequest>): Promise<string> {
  return getNotificationBackend().notify(request);
}

// Updates a live notification. Partial fields are merged into the existing notification — useful for
// progress bars and live-content updates (e.g. download percentage). Returns true when the update
// was applied; false when the notification is no longer visible or the backend does not support
// updates. The basic web backend simulates updates by closing and re-opening the notification.
export function updateNotification(id: string, partial: Readonly<Partial<NotificationRequest>>): Promise<boolean> {
  return getNotificationBackend().updateNotification(id, partial);
}

function _repeatMs(repeat: NonNullable<NotificationSchedule['repeat']>): number {
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

let _backend: NotificationBackend | null = null;

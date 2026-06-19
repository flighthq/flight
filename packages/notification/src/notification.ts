import type { NotificationBackend, NotificationRequest } from '@flighthq/types';

// Builds the default web backend over the global Notification API. Every touch is guarded for hosts
// where Notification is absent (jsdom, non-secure contexts) and wrapped in try/catch; notify and
// requestPermission resolve to false when unsupported or denied rather than throwing.
export function createWebNotificationBackend(): NotificationBackend {
  return {
    isSupported() {
      return typeof Notification !== 'undefined';
    },
    async requestPermission() {
      if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function') return false;
      try {
        const result = await Notification.requestPermission();
        return result === 'granted';
      } catch {
        return false;
      }
    },
    async notify(request) {
      if (typeof Notification === 'undefined') return false;
      try {
        if (Notification.permission !== 'granted') return false;
        new Notification(request.title, {
          body: request.body,
          icon: request.icon,
          tag: request.tag,
          silent: request.silent,
        });
        return true;
      } catch {
        return false;
      }
    },
    subscribeClick() {
      // Web Notification.onclick is per-instance, not a global feed keyed by tag — a native host
      // (Electron/Tauri) or per-instance wiring is required to deliver clicks by tag.
      return () => {};
    },
    subscribeAction() {
      // Web notifications have no global action feed — action buttons require the Service Worker
      // Notifications API. A native host (Electron/Tauri) or per-instance wiring is required.
      return () => {};
    },
  };
}

// The active notification backend, or a lazily-created web default. There is always a backend.
export function getNotificationBackend(): NotificationBackend {
  if (_backend === null) _backend = createWebNotificationBackend();
  return _backend;
}

// True when the host can show notifications. Cheap; reads the active backend.
export function isNotificationSupported(): boolean {
  return getNotificationBackend().isSupported();
}

// Subscribes to notification action-button activations, delivering the notification tag and action id.
// Returns an unsubscribe function. On web this never fires (no global action feed); a native host is required.
export function onNotificationAction(listener: (tag: string, actionId: string) => void): () => void {
  return getNotificationBackend().subscribeAction(listener);
}

// Subscribes to notification body clicks, delivering the notification tag. Returns an unsubscribe
// function. On web this never fires (clicks are per-instance, not a global feed); a native host is required.
export function onNotificationClick(listener: (tag: string) => void): () => void {
  return getNotificationBackend().subscribeClick(listener);
}

// Requests notification permission. Returns false when denied or the host lacks the surface.
export function requestNotificationPermission(): Promise<boolean> {
  return getNotificationBackend().requestPermission();
}

// Installs a native host notification backend; pass null to fall back to the web default.
export function setNotificationBackend(backend: NotificationBackend | null): void {
  _backend = backend;
}

// Shows a notification. Returns false when permission is not granted or the host lacks the surface.
export function showNotification(request: Readonly<NotificationRequest>): Promise<boolean> {
  return getNotificationBackend().notify(request);
}

let _backend: NotificationBackend | null = null;

import type { NotificationBackend, NotificationCapabilities, NotificationPermission } from '@flighthq/types';

import type { TauriApi } from './tauriModule';

// Maps Flight's NotificationBackend onto Tauri's `@tauri-apps/plugin-notification`. `notify` shows a
// notification via the fire-and-forget `sendNotification` and resolves the request's id (Tauri returns
// no handle, so there is nothing to close/update/enumerate later). `requestPermission` maps directly;
// the sync `getPermission` is served from a value prefetched once at construction (async→sync bridge),
// so it may read 'default' until that first probe resolves. Actions, scheduling, active-list, update,
// and close are outside the modeled Tauri surface and report the contract sentinels ('' / [] / no-op).
export function createTauriNotificationBackend(tauri: TauriApi): NotificationBackend {
  const notification = tauri.notification;
  let nextId = 0;
  // Sync getPermission has no async escape; prefetch the granted state once and cache it.
  let cachedPermission: NotificationPermission = 'default';
  notification
    .isPermissionGranted()
    .then((granted) => {
      cachedPermission = granted ? 'granted' : 'default';
    })
    .catch(() => {
      /* leave the 'default' sentinel */
    });
  return {
    async notify(request) {
      const id = request.id ?? `notification-${nextId++}`;
      try {
        notification.sendNotification({ title: request.title, body: request.body, icon: request.icon });
        return id;
      } catch {
        return '';
      }
    },
    async requestPermission(): Promise<NotificationPermission> {
      try {
        const permission = await notification.requestPermission();
        cachedPermission = permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'default';
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
        actions: false,
        channels: false,
        coldStart: false,
        image: false,
        listActive: false,
        scheduling: false,
        textReply: false,
      };
    },
    async getLaunchNotification() {
      return null;
    },
    async getActiveNotifications() {
      return [];
    },
    async getPendingNotifications() {
      return [];
    },
    async scheduleNotification() {
      // Local scheduling is not wired through this adapter; report unsupported via the '' sentinel.
      return '';
    },
    cancelScheduledNotification() {
      // No scheduling — nothing to cancel.
    },
    closeNotification() {
      // Tauri returns no handle from sendNotification, so there is nothing to dismiss by id.
    },
    closeAllNotifications() {
      // No handle tracking — nothing to dismiss.
    },
    async updateNotification() {
      // Tauri has no in-place update; report not applied.
      return false;
    },
    subscribeClick() {
      // Click delivery is not wired through this adapter; inert unsubscribe.
      return () => {};
    },
    subscribeAction() {
      return () => {};
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

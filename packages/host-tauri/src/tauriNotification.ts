import { createEntity } from '@flighthq/entity/contract';
import type { HostNotificationCapabilities, NotificationPermission, TauriApi } from '@flighthq/types/contract';

// Tauri's notification plugin exposes delivery and asynchronous permission queries, but returns no
// display handle and exposes no close, update, scheduling, enumeration, or event feed through this
// facade. The host therefore declares delivery alone.
export function createTauriNotificationCapabilities(tauri: TauriApi) {
  const notification = tauri.notification;
  let nextId = 0;
  return createEntity({
    delivery: {
      async getPermission(): Promise<NotificationPermission> {
        try {
          return (await notification.isPermissionGranted()) ? 'granted' : 'default';
        } catch {
          return 'denied';
        }
      },
      async notify(request) {
        const id = request.id ?? `notification-${nextId++}`;
        try {
          notification.sendNotification({ body: request.body, icon: request.icon, title: request.title });
          return id;
        } catch {
          return null;
        }
      },
      async requestPermission(): Promise<NotificationPermission> {
        try {
          const permission = await notification.requestPermission();
          return permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'default';
        } catch {
          return 'denied';
        }
      },
    },
  } as const satisfies HostNotificationCapabilities);
}

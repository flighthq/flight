import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createNotificationResource } from '@flighthq/notification/contract';
import type {
  NotificationRequest,
  NotificationRequestField,
  HostNotificationDeliveryProvider,
  HostNotificationLifecycleProvider,
  HostNotificationPermissionProvider,
  TauriApi,
  TauriNotificationCapabilities,
  EntityConstruction,
} from '@flighthq/types/contract';

export function tauriHostNotification(tauri: TauriApi): TauriNotificationCapabilities {
  return tauriNotificationProviders(tauri);
}

export function tauriHostNotificationDelivery(tauri: TauriApi): HostNotificationDeliveryProvider {
  return tauriNotificationProviders(tauri).delivery;
}

export function tauriHostNotificationLifecycle(tauri: TauriApi): HostNotificationLifecycleProvider {
  return tauriNotificationProviders(tauri).lifecycle;
}

export function tauriHostNotificationPermission(tauri: TauriApi): HostNotificationPermissionProvider {
  return tauriNotificationProviders(tauri).permission;
}

function tauriNotificationProviders(tauri: TauriApi): TauriNotificationCapabilities {
  const out = allocateEntity<TauriNotificationCapabilities>();
  configureNotification(out, tauri);
  return finishEntity(out);
}

function configureNotification(out: EntityConstruction<TauriNotificationCapabilities>, tauri: TauriApi): void {
  const notification = tauri.notification;
  let destroyed = false;
  let nextId = 1;
  out.delivery = {
    async notify(request) {
      if (destroyed) return { reason: 'operation-failed' };
      const invalid = getTauriInvalidNotificationRequestFields(request);
      if (invalid.length > 0) return { fields: invalid, reason: 'invalid-request' };
      let granted: boolean;
      try {
        granted = await notification.isPermissionGranted();
      } catch {
        return { reason: 'operation-failed' };
      }
      if (!granted) return { reason: 'permission-denied' };
      const id = request.id ?? `tauri-notification-${nextId++}`;
      try {
        notification.sendNotification({
          body: request.body,
          icon: request.icon,
          title: request.title,
        });
      } catch {
        return { reason: 'operation-failed' };
      }
      return {
        notification: createNotificationResource(id, request.title),
        reason: 'accepted',
      };
    },
  };
  out.lifecycle = {
    async destroy() {
      if (destroyed) return { reason: 'already-destroyed' };
      destroyed = true;
      return { reason: 'ok' };
    },
  };
  out.permission = {
    async getPermission() {
      try {
        return {
          permission: (await notification.isPermissionGranted()) ? 'granted' : 'default',
          reason: 'ok',
        };
      } catch {
        return { reason: 'operation-failed' };
      }
    },
    async requestPermission() {
      try {
        const permission = await notification.requestPermission();
        return {
          reason: permission === 'default' ? 'dismissed' : permission,
        };
      } catch {
        return { reason: 'operation-failed' };
      }
    },
  };
}

function getTauriInvalidNotificationRequestFields(request: Readonly<NotificationRequest>): NotificationRequestField[] {
  const allowed = new Set<NotificationRequestField>(['body', 'icon', 'id', 'title']);
  return (Object.keys(request) as NotificationRequestField[]).filter(
    (field) => request[field] !== undefined && !allowed.has(field),
  );
}

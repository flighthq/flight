import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createNotificationResource } from '@flighthq/notification/contract';
import type {
  NotificationRequest,
  NotificationRequestField,
  HostNotificationDeliveryCapability,
  HostNotificationLifecycleCapability,
  HostNotificationPermissionCapability,
  TauriApi,
  TauriNotificationCapabilities,
} from '@flighthq/types/contract';

export function tauriHostNotification(tauri: TauriApi): TauriNotificationCapabilities {
  const state = createNotificationState(tauri);
  const out = allocateEntity<TauriNotificationCapabilities>();
  out.delivery = createNotificationDelivery(state);
  out.lifecycle = createNotificationLifecycle(state);
  out.permission = createNotificationPermission(state);
  return finishEntity(out);
}

export function tauriHostNotificationDelivery(tauri: TauriApi): HostNotificationDeliveryCapability {
  return createNotificationDelivery(createNotificationState(tauri));
}

export function tauriHostNotificationLifecycle(tauri: TauriApi): HostNotificationLifecycleCapability {
  return createNotificationLifecycle(createNotificationState(tauri));
}

export function tauriHostNotificationPermission(tauri: TauriApi): HostNotificationPermissionCapability {
  return createNotificationPermission(createNotificationState(tauri));
}

interface NotificationState {
  destroyed: boolean;
  nextId: number;
  notification: TauriApi['notification'];
}

function createNotificationState(tauri: TauriApi): NotificationState {
  return { destroyed: false, nextId: 1, notification: tauri.notification };
}

function createNotificationDelivery(state: NotificationState): HostNotificationDeliveryCapability {
  return {
    async notify(request) {
      if (state.destroyed) return { reason: 'operation-failed' };
      const invalid = getTauriInvalidNotificationRequestFields(request);
      if (invalid.length > 0) return { fields: invalid, reason: 'invalid-request' };
      let granted: boolean;
      try {
        granted = await state.notification.isPermissionGranted();
      } catch {
        return { reason: 'operation-failed' };
      }
      if (!granted) return { reason: 'permission-denied' };
      const id = request.id ?? `tauri-notification-${state.nextId++}`;
      try {
        state.notification.sendNotification({
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
}

function createNotificationLifecycle(state: NotificationState): HostNotificationLifecycleCapability {
  return {
    async destroy() {
      if (state.destroyed) return { reason: 'already-destroyed' };
      state.destroyed = true;
      return { reason: 'ok' };
    },
  };
}

function createNotificationPermission(state: NotificationState): HostNotificationPermissionCapability {
  return {
    async getPermission() {
      try {
        return {
          permission: (await state.notification.isPermissionGranted()) ? 'granted' : 'default',
          reason: 'ok',
        };
      } catch {
        return { reason: 'operation-failed' };
      }
    },
    async requestPermission() {
      try {
        const permission = await state.notification.requestPermission();
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

import { createEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronNotification,
  HostNotificationCapabilities,
  NotificationPermission,
} from '@flighthq/types/contract';

// Maps Electron's Notification module onto only the slots it genuinely supports. The factory owns
// live native notifications and independent listener sets; subscribing one consumer never replaces
// another. Electron has no permission prompt, scheduling, active enumeration, update, or inline reply.
export function createElectronNotificationCapabilities(electron: ElectronApi) {
  const actionListeners = new Set<(id: string, actionId: string) => void>();
  const clickListeners = new Set<(id: string) => void>();
  const dismissListeners = new Set<(id: string) => void>();
  const showListeners = new Set<(id: string) => void>();
  const live = new Map<string, ElectronNotification>();
  let nextId = 0;

  return createEntity({
    action: {
      subscribe(listener: (id: string, actionId: string) => void) {
        actionListeners.add(listener);
      },
      unsubscribe(listener: (id: string, actionId: string) => void) {
        actionListeners.delete(listener);
      },
    },
    click: {
      subscribe(listener: (id: string) => void) {
        clickListeners.add(listener);
      },
      unsubscribe(listener: (id: string) => void) {
        clickListeners.delete(listener);
      },
    },
    close: {
      async closeAllNotifications() {
        for (const notification of live.values()) notification.close();
        live.clear();
      },
      async closeNotification(id: string) {
        const notification = live.get(id);
        if (notification === undefined) return;
        notification.close();
        live.delete(id);
      },
    },
    delivery: {
      async getPermission(): Promise<NotificationPermission> {
        return electron.Notification.isSupported() ? 'granted' : 'denied';
      },
      async notify(request) {
        if (!electron.Notification.isSupported()) return null;
        const id = request.id ?? `notification-${nextId++}`;
        const actions = request.actions ?? [];
        const notification = new electron.Notification({
          actions: actions.map((action) => ({ text: action.title, type: 'button' })),
          body: request.body,
          icon: request.icon,
          silent: request.silent,
          title: request.title,
        });
        notification.on('show', () => {
          for (const listener of showListeners) listener(id);
        });
        notification.on('click', () => {
          for (const listener of clickListeners) listener(id);
        });
        notification.on('action', (...args) => {
          const actionId = String(actions[Number(args[1])]?.id ?? '');
          for (const listener of actionListeners) listener(id, actionId);
        });
        notification.on('close', () => {
          live.delete(id);
          for (const listener of dismissListeners) listener(id);
        });
        live.set(id, notification);
        notification.show();
        return id;
      },
      async requestPermission(): Promise<NotificationPermission> {
        return electron.Notification.isSupported() ? 'granted' : 'denied';
      },
    },
    dismiss: {
      subscribe(listener: (id: string) => void) {
        dismissListeners.add(listener);
      },
      unsubscribe(listener: (id: string) => void) {
        dismissListeners.delete(listener);
      },
    },
    show: {
      subscribe(listener: (id: string) => void) {
        showListeners.add(listener);
      },
      unsubscribe(listener: (id: string) => void) {
        showListeners.delete(listener);
      },
    },
  } as const satisfies HostNotificationCapabilities);
}

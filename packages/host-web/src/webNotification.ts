import {
  createWebNotificationBackend,
  installNotificationHostBackend,
  observeNotificationHostResult,
} from '@flighthq/notification/contract';
import type { NotificationBackend, NotificationCapabilities, NotificationPermission } from '@flighthq/types/contract';

export function enableHostWebNotification(): void {
  if (_enabled) return;
  _enabled = true;
  const inner = createWebNotificationBackend();
  const backend: NotificationBackend = {
    cancelScheduledNotification(id) {
      inner.cancelScheduledNotification(id);
    },

    closeAllNotifications() {
      inner.closeAllNotifications();
    },

    closeNotification(id) {
      inner.closeNotification(id);
    },

    getCapabilities(): NotificationCapabilities {
      return inner.getCapabilities();
    },

    async getActiveNotifications() {
      return inner.getActiveNotifications();
    },

    async getLaunchNotification() {
      return inner.getLaunchNotification();
    },

    async getPendingNotifications() {
      return inner.getPendingNotifications();
    },

    getPermission(): NotificationPermission {
      return inner.getPermission();
    },

    isSupported() {
      return inner.isSupported();
    },

    async notify(request) {
      try {
        const id = await inner.notify(request);
        observeNotificationHostResult('notify', id !== '');
        return id;
      } catch {
        observeNotificationHostResult('notify', false);
        return '';
      }
    },

    async requestPermission(): Promise<NotificationPermission> {
      try {
        const result = await inner.requestPermission();
        observeNotificationHostResult('requestPermission', result !== 'denied');
        return result;
      } catch {
        observeNotificationHostResult('requestPermission', false);
        return 'denied';
      }
    },

    async scheduleNotification(request, schedule) {
      return inner.scheduleNotification(request, schedule);
    },

    subscribeAction(listener) {
      return inner.subscribeAction(listener);
    },

    subscribeClick(listener) {
      return inner.subscribeClick(listener);
    },

    subscribeDismiss(listener) {
      return inner.subscribeDismiss(listener);
    },

    subscribeReply(listener) {
      return inner.subscribeReply(listener);
    },

    subscribeShow(listener) {
      return inner.subscribeShow(listener);
    },

    async updateNotification(id, partial) {
      return inner.updateNotification(id, partial);
    },
  };
  installNotificationHostBackend(backend);
}

export function resetHostWebNotificationForTest(): void {
  _enabled = false;
}

let _enabled = false;

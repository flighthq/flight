import type { NotificationBackend, NotificationCapabilities, NotificationPermission } from '@flighthq/types';

import type { ElectronApi, ElectronNotification } from './electronModule';

// Maps Flight's NotificationBackend onto Electron's Notification module. Electron needs no permission
// prompt, so getPermission/requestPermission report 'granted' when supported and 'denied' otherwise.
// notify resolves to the notification id (the request's id, or a generated one), and forwards the
// notification's click/action/show/dismiss events keyed by that id. Each live notification is tracked
// by id so closeNotification/closeAllNotifications can dismiss it. notify resolves '' when unsupported.
export function createElectronNotificationBackend(electron: ElectronApi): NotificationBackend {
  // Listeners owned by this backend, set via the subscribe* methods.
  let clickListener: ((id: string) => void) | null = null;
  let actionListener: ((id: string, actionId: string) => void) | null = null;
  let dismissListener: ((id: string) => void) | null = null;
  let showListener: ((id: string) => void) | null = null;
  // Live notifications keyed by their resolved id, so close* can dismiss them.
  const live = new Map<string, ElectronNotification>();
  let nextId = 0;
  return {
    async notify(request) {
      if (!electron.Notification.isSupported()) return '';
      const id = request.id ?? `notification-${nextId++}`;
      const actions = request.actions ?? [];
      const n = new electron.Notification({
        title: request.title,
        body: request.body,
        icon: request.icon,
        silent: request.silent,
        actions: actions.map((a) => ({ type: 'button', text: a.title })),
      });
      n.on('show', () => showListener?.(id));
      n.on('click', () => clickListener?.(id));
      // Electron's action event passes (event, index); map the index back to the action id.
      n.on('action', (...args) => {
        const index = Number(args[1]);
        actionListener?.(id, String(actions[index]?.id ?? ''));
      });
      n.on('close', () => {
        live.delete(id);
        dismissListener?.(id);
      });
      live.set(id, n);
      n.show();
      return id;
    },
    async requestPermission(): Promise<NotificationPermission> {
      // Electron requires no permission grant; support is the only gate.
      return electron.Notification.isSupported() ? 'granted' : 'denied';
    },
    getPermission(): NotificationPermission {
      return electron.Notification.isSupported() ? 'granted' : 'denied';
    },
    isSupported() {
      return electron.Notification.isSupported();
    },
    getCapabilities(): NotificationCapabilities {
      return {
        actions: true,
        channels: false,
        coldStart: false,
        image: false,
        listActive: false,
        scheduling: false,
        textReply: false,
      };
    },
    async getLaunchNotification() {
      // Electron's main process has no launch-from-notification reporting.
      return null;
    },
    async getActiveNotifications() {
      // Electron does not enumerate shown notifications.
      return [];
    },
    async getPendingNotifications() {
      // No local scheduling support; nothing is ever pending.
      return [];
    },
    async scheduleNotification() {
      // Electron's Notification has no local scheduling; report unsupported via the '' sentinel.
      return '';
    },
    cancelScheduledNotification() {
      // No scheduling support — nothing to cancel.
    },
    closeNotification(id) {
      const n = live.get(id);
      if (!n) return;
      n.close();
      live.delete(id);
    },
    closeAllNotifications() {
      for (const n of live.values()) n.close();
      live.clear();
    },
    async updateNotification() {
      // Electron's Notification has no in-place update; a caller must close and re-notify. Report
      // that the update was not applied rather than silently pretending success.
      return false;
    },
    subscribeClick(listener) {
      clickListener = listener;
      return () => {
        if (clickListener === listener) clickListener = null;
      };
    },
    subscribeAction(listener) {
      actionListener = listener;
      return () => {
        if (actionListener === listener) actionListener = null;
      };
    },
    subscribeDismiss(listener) {
      dismissListener = listener;
      return () => {
        if (dismissListener === listener) dismissListener = null;
      };
    },
    subscribeReply() {
      // Electron's desktop Notification has no inline text-reply action; inert unsubscribe.
      return () => {};
    },
    subscribeShow(listener) {
      showListener = listener;
      return () => {
        if (showListener === listener) showListener = null;
      };
    },
  };
}

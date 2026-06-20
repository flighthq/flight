import type { NotificationBackend } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

// Maps Flight's NotificationBackend onto Electron's Notification module. Electron needs no permission
// prompt, so requestPermission just reports support. Each notify wires the request's tag through the
// backend's click/action listeners; the action event carries an index into the request's actions, which
// the seam translates back to the action id. notify resolves false when notifications are unsupported.
export function createElectronNotificationBackend(electron: ElectronApi): NotificationBackend {
  // Single click/action listeners owned by this backend, set via subscribeClick/subscribeAction.
  let clickListener: ((tag: string) => void) | null = null;
  let actionListener: ((tag: string, actionId: string) => void) | null = null;
  return {
    async notify(request) {
      if (!electron.Notification.isSupported()) return false;
      const actions = request.actions ?? [];
      const n = new electron.Notification({
        title: request.title,
        body: request.body,
        icon: request.icon,
        silent: request.silent,
        actions: actions.map((a) => ({ type: 'button', text: a.title })),
      });
      const tag = request.tag ?? '';
      n.on('click', () => clickListener?.(tag));
      // Electron's action event passes (event, index); map the index back to the action id.
      n.on('action', (...args) => {
        const index = Number(args[1]);
        actionListener?.(tag, String(actions[index]?.id ?? ''));
      });
      n.show();
      return true;
    },
    async requestPermission() {
      // Electron requires no permission grant; support is the only gate.
      return electron.Notification.isSupported();
    },
    isSupported() {
      return electron.Notification.isSupported();
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
  };
}

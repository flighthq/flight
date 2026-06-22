import type { AppBackend, MenuItemTemplate } from '@flighthq/types';

import type { ElectronApi, ElectronMenuItemOptions } from './electronModule';

// Maps Flight's AppBackend onto Electron's `app` module (plus `app.dock` on macOs). Dock-only
// operations no-op or return -1 where there is no dock. Subscribe methods wire an electron event
// listener and return an unsubscribe that removes that exact handler; the wrapper adapts Electron's
// (event, ...) argument shape to Flight's listener signature.
export function createElectronAppBackend(electron: ElectronApi): AppBackend {
  const app = electron.app;
  return {
    getName() {
      return app.getName();
    },
    getVersion() {
      return app.getVersion();
    },
    getLocale() {
      return app.getLocale();
    },
    quit() {
      app.quit();
    },
    relaunch() {
      app.relaunch();
    },
    focus() {
      app.focus();
    },
    requestSingleInstanceLock() {
      return app.requestSingleInstanceLock();
    },
    releaseSingleInstanceLock() {
      app.releaseSingleInstanceLock();
    },
    hasSingleInstanceLock() {
      return app.hasSingleInstanceLock();
    },
    setDockBadge(text) {
      app.dock?.setBadge(text);
    },
    setBadgeCount(count) {
      return app.setBadgeCount(count);
    },
    setDockMenu(items) {
      if (!app.dock) return;
      app.dock.setMenu(electron.Menu.buildFromTemplate(items.map(toMenuItemOptions)));
    },
    bounceDock() {
      return app.dock?.bounce() ?? -1;
    },
    cancelDockBounce(id) {
      app.dock?.cancelBounce(id);
    },
    subscribeActivate(listener) {
      app.on('activate', listener);
      return () => app.removeListener('activate', listener);
    },
    subscribeOpenFile(listener) {
      // Electron passes (event, path); Flight wants just the path.
      const handler = (...args: unknown[]): void => listener(String(args[1] ?? ''));
      app.on('open-file', handler);
      return () => app.removeListener('open-file', handler);
    },
    subscribeSecondInstance(listener) {
      // Electron passes (event, argv, cwd); Flight wants just argv.
      const handler = (...args: unknown[]): void => listener((args[1] as string[]) ?? []);
      app.on('second-instance', handler);
      return () => app.removeListener('second-instance', handler);
    },
  };
}

function toMenuItemOptions(item: Readonly<MenuItemTemplate>): ElectronMenuItemOptions {
  const out: ElectronMenuItemOptions = {
    id: item.id,
    label: item.label,
    type: item.type,
    role: item.role,
    accelerator: item.accelerator,
    enabled: item.enabled,
    checked: item.checked,
  };
  if (item.submenu) out.submenu = item.submenu.map(toMenuItemOptions);
  return out;
}

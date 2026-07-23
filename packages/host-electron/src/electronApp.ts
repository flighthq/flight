import type {
  AppBackend,
  AppLoginItem,
  AppPathKind,
  MenuItemTemplate,
  ElectronApi,
  ElectronMenuItemOptions,
} from '@flighthq/types';

// Maps Flight's AppBackend onto Electron's `app` module (plus `app.dock` on macOs). Dock-only
// operations no-op or return -1 where there is no dock. Subscribe methods wire an electron event
// listener and return an unsubscribe that removes that exact handler; the wrapper adapts Electron's
// (event, ...) argument shape to Flight's listener signature.
export function createElectronAppBackend(electron: ElectronApi): AppBackend {
  const app = electron.app;
  return {
    addRecentDocument(path) {
      app.addRecentDocument(path);
    },
    bounceDock() {
      return app.dock?.bounce() ?? -1;
    },
    cancelAttention(id) {
      // App-level attention is a macOS dock bounce; cancel it by request id.
      app.dock?.cancelBounce(id);
    },
    cancelDockBounce(id) {
      app.dock?.cancelBounce(id);
    },
    clearRecentDocuments() {
      app.clearRecentDocuments();
    },
    focus() {
      app.focus();
    },
    getAppDirectoryPath(kind) {
      return app.getPath(toElectronPathName(kind));
    },
    getAppPath() {
      return app.getAppPath();
    },
    getCommandLine() {
      // Electron exposes no command-line accessor on `app` (it lives on process.argv, outside this
      // dependency-free facade); report the empty sentinel rather than reaching into Node.
      return [];
    },
    getExecutablePath() {
      return app.getPath('exe');
    },
    getLocale() {
      return app.getLocale();
    },
    getLoginItem() {
      const settings = app.getLoginItemSettings();
      const out: AppLoginItem = {
        openAtLogin: settings.openAtLogin,
        openAsHidden: settings.openAsHidden,
        path: '',
        args: [],
      };
      return out;
    },
    getName() {
      return app.getName();
    },
    getPreferredSystemLanguages() {
      return app.getPreferredSystemLanguages();
    },
    getSystemLocale() {
      return app.getSystemLocale();
    },
    getVersion() {
      return app.getVersion();
    },
    hasSingleInstanceLock() {
      return app.hasSingleInstanceLock();
    },
    hideApp() {
      app.hide();
      return true;
    },
    isAppHidden() {
      return app.isHidden();
    },
    quit() {
      app.quit();
    },
    relaunch() {
      app.relaunch();
    },
    releaseSingleInstanceLock() {
      app.releaseSingleInstanceLock();
    },
    requestAttention(_critical) {
      // App-level attention maps to a dock bounce on macOS; returns the bounce id (or -1 with no dock).
      return app.dock?.bounce(_critical ? 'critical' : 'informational') ?? -1;
    },
    requestSingleInstanceLock() {
      return app.requestSingleInstanceLock();
    },
    setActivationPolicy(policy) {
      app.setActivationPolicy(policy);
    },
    setBadgeCount(count) {
      return app.setBadgeCount(count);
    },
    setDockBadge(text) {
      app.dock?.setBadge(text);
    },
    setDockMenu(items) {
      if (!app.dock) return;
      app.dock.setMenu(electron.Menu.buildFromTemplate(items.map(toMenuItemOptions)));
    },
    setLoginItem(settings) {
      app.setLoginItemSettings({
        openAtLogin: settings.openAtLogin,
        openAsHidden: settings.openAsHidden,
        path: settings.path,
        args: settings.args ? [...settings.args] : undefined,
      });
      return true;
    },
    setName(name) {
      app.setName(name);
      return true;
    },
    setUserModelId(id) {
      app.setAppUserModelId(id);
      return true;
    },
    showApp() {
      app.show();
      return true;
    },
    subscribeActivate(listener) {
      app.on('activate', listener);
      return () => app.removeListener('activate', listener);
    },
    subscribeAllWindowsClosed(listener) {
      app.on('window-all-closed', listener);
      return () => app.removeListener('window-all-closed', listener);
    },
    subscribeOpenFile(listener) {
      // Electron passes (event, path); Flight wants just the path.
      const handler = (...args: unknown[]): void => listener(String(args[1] ?? ''));
      app.on('open-file', handler);
      return () => app.removeListener('open-file', handler);
    },
    subscribeQuitRequest(listener) {
      // Electron's 'before-quit' passes (event); event.preventDefault() vetoes the quit, so the host-
      // cancel callback Flight hands the listener calls preventDefault on that event.
      const handler = (...args: unknown[]): void => {
        const event = args[0] as { preventDefault?: () => void } | undefined;
        listener(() => event?.preventDefault?.());
      };
      app.on('before-quit', handler);
      return () => app.removeListener('before-quit', handler);
    },
    subscribeReady(listener) {
      app.on('ready', listener);
      return () => app.removeListener('ready', listener);
    },
    subscribeSecondInstance(listener) {
      // Electron passes (event, argv, cwd); Flight wants just argv.
      const handler = (...args: unknown[]): void => listener((args[1] as string[]) ?? []);
      app.on('second-instance', handler);
      return () => app.removeListener('second-instance', handler);
    },
  };
}

function toElectronPathName(kind: AppPathKind): string {
  if (kind === 'logs') return 'logs';
  if (kind === 'crashDumps') return 'crashDumps';
  return 'userData';
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

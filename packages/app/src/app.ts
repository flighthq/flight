import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  App,
  AppActivationPolicy,
  AppBackend,
  AppLoginItem,
  AppLoginItemLike,
  AppPathKind,
  MenuItemTemplate,
} from '@flighthq/types';

// Adds a path to the system's recent-documents list (Jump List on Windows; macOS recents). No-op on
// web and platforms without a recents list.
export function addAppRecentDocument(path: string): void {
  getAppBackend().addRecentDocument(path);
}

// Begins delivering app events to `app`'s signals by subscribing to the active backend. Wires
// subscribeActivate→onActivate, subscribeAllWindowsClosed→onAllWindowsClosed,
// subscribeOpenFile→onOpenFile, subscribeQuitRequest→onQuitRequest,
// subscribeReady→onReady, subscribeSecondInstance→onSecondInstance.
// Idempotent: a prior subscription is torn down first. Pair with detachApp/disposeApp.
export function attachApp(app: App): void {
  detachApp(app);
  const backend = getAppBackend();
  const unsubscribeActivate = backend.subscribeActivate(() => emitSignal(app.onActivate));
  const unsubscribeAllWindowsClosed = backend.subscribeAllWindowsClosed(() => emitSignal(app.onAllWindowsClosed));
  const unsubscribeOpenFile = backend.subscribeOpenFile((path) => emitSignal(app.onOpenFile, path));
  const unsubscribeQuitRequest = backend.subscribeQuitRequest((cancelHost) => {
    emitSignal(app.onQuitRequest);
    if (app.onQuitRequest.data?.cancelled === true) {
      // A Flight listener vetoed the quit — cancel at the host level too so that Electron (and other
      // native hosts) can call event.preventDefault() and prevent the OS from forcing a quit.
      cancelHost();
    } else {
      backend.quit();
    }
  });
  const unsubscribeReady = backend.subscribeReady(() => emitSignal(app.onReady));
  const unsubscribeSecondInstance = backend.subscribeSecondInstance((argv) => emitSignal(app.onSecondInstance, argv));
  _subscriptions.set(app, () => {
    unsubscribeActivate();
    unsubscribeAllWindowsClosed();
    unsubscribeOpenFile();
    unsubscribeQuitRequest();
    unsubscribeReady();
    unsubscribeSecondInstance();
  });
}

// Starts a dock bounce; returns a request id usable with cancelAppDockBounce, or -1 when unsupported.
export function bounceAppDock(): number {
  return getAppBackend().bounceDock();
}

// Cancels an app-level attention request previously started by requestAppAttention. No-op on web.
export function cancelAppAttention(id: number): void {
  getAppBackend().cancelAttention(id);
}

// Cancels a dock bounce previously started by bounceAppDock.
export function cancelAppDockBounce(id: number): void {
  getAppBackend().cancelDockBounce(id);
}

// Clears the system's recent-documents list (Jump List / macOS recents). No-op on web.
export function clearAppRecentDocuments(): void {
  getAppBackend().clearRecentDocuments();
}

// Allocates an App event entity with inert signals; call attachApp to start delivery.
export function createApp(): App {
  return {
    onActivate: createSignal(),
    onAllWindowsClosed: createSignal(),
    onOpenFile: createSignal(),
    onQuitRequest: createSignal(),
    onReady: createSignal(),
    onSecondInstance: createSignal(),
  };
}

// Allocates an AppLoginItem with default values.
export function createAppLoginItem(): AppLoginItem {
  return { args: [], openAsHidden: false, openAtLogin: false, path: '' };
}

// Builds the default web backend over document/window/navigator. Degrades to empty strings and no-ops
// where the APIs are absent. A web tab is inherently single-instance, so the lock is always held.
export function createWebAppBackend(): AppBackend {
  return {
    addRecentDocument() {
      // No web recent-documents list; no-op.
    },
    bounceDock() {
      return -1;
    },
    cancelAttention() {
      // No web attention API; no-op.
    },
    cancelDockBounce() {
      // No web dock; no-op.
    },
    clearRecentDocuments() {
      // No web recent-documents list; no-op.
    },
    focus() {
      if (typeof window !== 'undefined') {
        try {
          window.focus();
        } catch {
          // Focus may be blocked by the host; ignore.
        }
      }
    },
    getAppDirectoryPath() {
      return '';
    },
    getAppPath() {
      return '';
    },
    getCommandLine() {
      return [];
    },
    getExecutablePath() {
      return '';
    },
    getLocale() {
      return typeof navigator !== 'undefined' ? (navigator.language ?? '') : '';
    },
    getPreferredSystemLanguages() {
      if (typeof navigator !== 'undefined' && Array.isArray(navigator.languages)) {
        return navigator.languages as readonly string[];
      }
      return [];
    },
    getSystemLocale() {
      try {
        return typeof Intl !== 'undefined' ? new Intl.DateTimeFormat().resolvedOptions().locale : '';
      } catch {
        return '';
      }
    },
    getLoginItem() {
      return { args: [], openAsHidden: false, openAtLogin: false, path: '' };
    },
    getName() {
      return typeof document !== 'undefined' ? document.title : '';
    },
    getVersion() {
      return '';
    },
    hasSingleInstanceLock() {
      return true;
    },
    hideApp() {
      // No web application-hide; no-op.
      return false;
    },
    isAppHidden() {
      return false;
    },
    quit() {
      if (typeof window !== 'undefined') {
        try {
          window.close();
        } catch {
          // window.close() is restricted for non-script-opened tabs; ignore.
        }
      }
    },
    relaunch() {
      if (typeof location !== 'undefined') {
        try {
          location.reload();
        } catch {
          // Reload may be blocked in some embedding contexts; ignore.
        }
      }
    },
    releaseSingleInstanceLock() {
      // A web tab cannot relinquish a process-level lock; no-op.
    },
    requestAttention() {
      return -1;
    },
    requestSingleInstanceLock() {
      return true;
    },
    setActivationPolicy() {
      // No macOS activation policy on web; no-op.
    },
    setBadgeCount(count) {
      if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return false;
      try {
        (navigator as Navigator & { setAppBadge(count?: number): Promise<void> }).setAppBadge(count);
        return true;
      } catch {
        return false;
      }
    },
    setDockBadge() {
      // No web dock; no-op.
    },
    setDockMenu() {
      // No web dock menu; a native host (Electron app.dock) is required.
    },
    setLoginItem() {
      // Web tabs have no login-item concept; no-op.
      return false;
    },
    setName() {
      // Cannot rename the application from web context; no-op.
      return false;
    },
    setUserModelId() {
      // AppUserModelID is Windows-only; no-op on web.
      return false;
    },
    showApp() {
      // No web application-show; no-op.
      return false;
    },
    subscribeActivate() {
      return () => {};
    },
    subscribeAllWindowsClosed() {
      return () => {};
    },
    subscribeOpenFile() {
      return () => {};
    },
    subscribeQuitRequest(_listener) {
      // A web tab cannot intercept the browser's quit path; the listener is never called.
      return () => {};
    },
    subscribeReady(listener) {
      // On the web the DOM is already ready by the time script runs; fire on the next microtask.
      const id = Promise.resolve().then(() => listener());
      void id;
      return () => {};
    },
    subscribeSecondInstance() {
      return () => {};
    },
  };
}

// Stops delivery to `app` and forgets its subscription. Safe to call when not attached.
export function detachApp(app: App): void {
  const unsubscribe = _subscriptions.get(app);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(app);
  }
}

// Releases `app` for garbage collection by detaching its backend subscription. The signals remain
// plain GC-managed memory afterward.
export function disposeApp(app: App): void {
  detachApp(app);
}

// Brings the application to the foreground.
export function focusApp(): void {
  getAppBackend().focus();
}

// The active app backend, or a lazily-created web default. There is always a backend.
export function getAppBackend(): AppBackend {
  if (_backend === null) _backend = createWebAppBackend();
  return _backend;
}

// The command-line arguments for this process, or [] on web.
export function getAppCommandLine(): readonly string[] {
  return getAppBackend().getCommandLine();
}

// The value of a named command-line switch, or null when the switch is absent.
export function getAppCommandLineSwitch(name: string): string | null {
  const prefix = `--${name}=`;
  const args = getAppBackend().getCommandLine();
  for (const arg of args) {
    if (arg === `--${name}`) return '';
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return null;
}

// The app-identity-relative directory path for the given kind (userData/logs/crashDumps); '' on web.
// Note: bare OS directories (home, documents, downloads, appData, etc.) live in @flighthq/filesystem.
export function getAppDirectoryPath(kind: AppPathKind): string {
  return getAppBackend().getAppDirectoryPath(kind);
}

// The application executable path, or '' on web.
export function getAppExecutablePath(): string {
  return getAppBackend().getExecutablePath();
}

// The host UI locale (for example 'en-US'), or '' when unknown.
export function getAppLocale(): string {
  return getAppBackend().getLocale();
}

// The application login-item settings. Returns a default with openAtLogin: false on web.
export function getAppLoginItem(): AppLoginItem {
  return getAppBackend().getLoginItem();
}

// The application name, or '' when unknown.
export function getAppName(): string {
  return getAppBackend().getName();
}

// The application bundle/exe directory path, or '' on web.
export function getAppPath(): string {
  return getAppBackend().getAppPath();
}

// The ranked list of preferred system languages (for example ['en-US', 'fr-FR']), in preference
// order; [] when unavailable (on web: navigator.languages).
export function getAppPreferredSystemLanguages(): readonly string[] {
  return getAppBackend().getPreferredSystemLanguages();
}

// The OS-level system locale (for example 'en_US'), which may differ from the UI locale returned
// by getAppLocale; '' when unavailable.
export function getAppSystemLocale(): string {
  return getAppBackend().getSystemLocale();
}

// The application version string, or '' when unknown.
export function getAppVersion(): string {
  return getAppBackend().getVersion();
}

// True when the switch is present in the command line; false otherwise.
export function hasAppCommandLineSwitch(name: string): boolean {
  return getAppCommandLineSwitch(name) !== null;
}

// True when this process currently holds the single-instance lock.
export function hasAppSingleInstanceLock(): boolean {
  return getAppBackend().hasSingleInstanceLock();
}

// Hides the application (macOS hide-all-windows). Returns true when supported. No-op on web.
export function hideApp(): boolean {
  return getAppBackend().hideApp();
}

// True when the application is hidden (macOS only). Always false on web.
export function isAppHidden(): boolean {
  return getAppBackend().isAppHidden();
}

// Quits the application.
export function quitApp(): void {
  getAppBackend().quit();
}

// Relaunches the application.
export function relaunchApp(): void {
  getAppBackend().relaunch();
}

// Releases a previously acquired single-instance lock.
export function releaseAppSingleInstanceLock(): void {
  getAppBackend().releaseSingleInstanceLock();
}

// Draws attention to the application at the OS level (taskbar flash / dock bounce). Returns a
// request id for cancelAppAttention, or -1 when unsupported.
export function requestAppAttention(critical: boolean): number {
  return getAppBackend().requestAttention(critical);
}

// Attempts to acquire the single-instance lock. Returns true when this process owns it; false when
// another instance already holds it.
export function requestAppSingleInstanceLock(): boolean {
  return getAppBackend().requestSingleInstanceLock();
}

// Sets the macOS activation policy, controlling dock presence and Command-Tab visibility. No-op on
// non-macOS and web.
export function setAppActivationPolicy(policy: AppActivationPolicy): void {
  getAppBackend().setActivationPolicy(policy);
}

// Installs a native host app backend; pass null to fall back to the web default.
export function setAppBackend(backend: AppBackend | null): void {
  _backend = backend;
}

// Sets the numeric application badge (taskbar overlay / dock / PWA badge). Returns false when
// unsupported. Canonical home for the app badge — the tray package no longer carries it.
export function setAppBadgeCount(count: number): boolean {
  return getAppBackend().setBadgeCount(count);
}

// Sets the dock/taskbar badge text. Pass '' to clear it.
export function setAppDockBadge(text: string): void {
  getAppBackend().setDockBadge(text);
}

// Sets the macOs dock menu (shown when right-clicking the dock icon). No-op where there is no dock.
export function setAppDockMenu(items: readonly MenuItemTemplate[]): void {
  getAppBackend().setDockMenu(items);
}

// Updates login-item (launch-at-startup) settings. Returns false when unsupported (web, some Linux
// environments). Settings fields not provided keep their current values.
export function setAppLoginItem(settings: Readonly<AppLoginItemLike>): boolean {
  return getAppBackend().setLoginItem(settings);
}

// Sets the application name. Returns false when unsupported (web). On macOS/Windows this updates
// the display name shown in the dock/taskbar.
export function setAppName(name: string): boolean {
  return getAppBackend().setName(name);
}

// Sets the Windows AppUserModelID used for taskbar grouping, badging, and Jump Lists. Returns false
// when unsupported. Should be set at startup before creating any windows.
export function setAppUserModelId(id: string): boolean {
  return getAppBackend().setUserModelId(id);
}

// Shows the application after hideApp (macOS). Returns true when supported. No-op on web.
export function showApp(): boolean {
  return getAppBackend().showApp();
}

let _backend: AppBackend | null = null;
const _subscriptions = new WeakMap<App, () => void>();

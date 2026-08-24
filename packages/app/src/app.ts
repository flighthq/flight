import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  App,
  AppActivationPolicy,
  AppBackend,
  AppLoginItem,
  AppLoginItemLike,
  AppPathKind,
  MenuItemTemplate,
} from '@flighthq/types/contract';
import type { BackendExplanation } from '@flighthq/types/contract';

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

export function explainAppBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

// Brings the application to the foreground.
export function focusApp(): void {
  getAppBackend().focus();
}

export function getAppBackend(): AppBackend {
  return _custom ?? _host ?? _sentinel;
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

export function installAppHostBackend(backend: AppBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

// True when the application is hidden (macOS only). Always false on web.
export function isAppHidden(): boolean {
  return getAppBackend().isAppHidden();
}

export function observeAppHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
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

export function resetAppBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

// Sets the macOS activation policy, controlling dock presence and Command-Tab visibility. No-op on
// non-macOS and web.
export function setAppActivationPolicy(policy: AppActivationPolicy): void {
  getAppBackend().setActivationPolicy(policy);
}

export function setAppBackend(backend: AppBackend | null): void {
  _custom = backend;
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

const _noop = (): (() => void) => () => {};

const _sentinel: AppBackend = {
  addRecentDocument() {},
  bounceDock() {
    return -1;
  },
  cancelAttention() {},
  cancelDockBounce() {},
  clearRecentDocuments() {},
  focus() {},
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
    return '';
  },
  getLoginItem(): AppLoginItem {
    return { args: [], openAsHidden: false, openAtLogin: false, path: '' };
  },
  getName() {
    return '';
  },
  getPreferredSystemLanguages() {
    return [];
  },
  getSystemLocale() {
    try {
      return typeof Intl !== 'undefined' ? new Intl.DateTimeFormat().resolvedOptions().locale : '';
    } catch {
      return '';
    }
  },
  getVersion() {
    return '';
  },
  hasSingleInstanceLock() {
    return false;
  },
  hideApp() {
    return false;
  },
  isAppHidden() {
    return false;
  },
  quit() {},
  relaunch() {},
  releaseSingleInstanceLock() {},
  requestAttention() {
    return -1;
  },
  requestSingleInstanceLock() {
    return false;
  },
  setActivationPolicy() {},
  setBadgeCount() {
    return false;
  },
  setDockBadge() {},
  setDockMenu() {},
  setLoginItem() {
    return false;
  },
  setName() {
    return false;
  },
  setUserModelId() {
    return false;
  },
  showApp() {
    return false;
  },
  subscribeActivate: _noop,
  subscribeAllWindowsClosed: _noop,
  subscribeOpenFile: _noop,
  subscribeQuitRequest: _noop,
  subscribeReady: _noop,
  subscribeSecondInstance: _noop,
};

let _custom: AppBackend | null = null;
let _host: AppBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;
const _subscriptions = new WeakMap<App, () => void>();

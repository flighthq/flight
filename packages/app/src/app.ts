import { createSignal, emitSignal } from '@flighthq/signals';
import type { App, AppBackend, MenuItemTemplate } from '@flighthq/types';

// Begins delivering app events to `app`'s signals by subscribing to the active backend. Wires
// subscribeActivate→onActivate, subscribeOpenFile→onOpenFile, subscribeSecondInstance→onSecondInstance.
// Idempotent: a prior subscription is torn down first. Pair with detachApp/disposeApp.
export function attachApp(app: App): void {
  detachApp(app);
  const backend = getAppBackend();
  const unsubscribeActivate = backend.subscribeActivate(() => emitSignal(app.onActivate));
  const unsubscribeOpenFile = backend.subscribeOpenFile((path) => emitSignal(app.onOpenFile, path));
  const unsubscribeSecondInstance = backend.subscribeSecondInstance((argv) => emitSignal(app.onSecondInstance, argv));
  _subscriptions.set(app, () => {
    unsubscribeActivate();
    unsubscribeOpenFile();
    unsubscribeSecondInstance();
  });
}

// Starts a dock bounce; returns a request id usable with cancelAppDockBounce, or -1 when unsupported.
export function bounceAppDock(): number {
  return getAppBackend().bounceDock();
}

// Cancels a dock bounce previously started by bounceAppDock.
export function cancelAppDockBounce(id: number): void {
  getAppBackend().cancelDockBounce(id);
}

// Allocates an App event entity with inert signals; call attachApp to start delivery.
export function createApp(): App {
  return { onActivate: createSignal(), onOpenFile: createSignal(), onSecondInstance: createSignal() };
}

// Builds the default web backend over document/window/navigator. Degrades to empty strings and no-ops
// where the APIs are absent. A web tab is inherently single-instance, so the lock is always held.
export function createWebAppBackend(): AppBackend {
  return {
    getName() {
      return typeof document !== 'undefined' ? document.title : '';
    },
    getVersion() {
      return '';
    },
    getLocale() {
      return typeof navigator !== 'undefined' ? (navigator.language ?? '') : '';
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
    focus() {
      if (typeof window !== 'undefined') {
        try {
          window.focus();
        } catch {
          // Focus may be blocked by the host; ignore.
        }
      }
    },
    requestSingleInstanceLock() {
      return true;
    },
    releaseSingleInstanceLock() {
      // A web tab cannot relinquish a process-level lock; no-op.
    },
    hasSingleInstanceLock() {
      return true;
    },
    setDockBadge() {
      // No web dock; no-op.
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
    setDockMenu() {
      // No web dock menu; a native host (Electron app.dock) is required.
    },
    bounceDock() {
      return -1;
    },
    cancelDockBounce() {
      // No web dock; no-op.
    },
    subscribeActivate() {
      return () => {};
    },
    subscribeOpenFile() {
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

// The host UI locale (for example 'en-US'), or '' when unknown.
export function getAppLocale(): string {
  return getAppBackend().getLocale();
}

// The application name, or '' when unknown.
export function getAppName(): string {
  return getAppBackend().getName();
}

// The application version string, or '' when unknown.
export function getAppVersion(): string {
  return getAppBackend().getVersion();
}

// True when this process currently holds the single-instance lock.
export function hasAppSingleInstanceLock(): boolean {
  return getAppBackend().hasSingleInstanceLock();
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

// Attempts to acquire the single-instance lock. Returns true when this process owns it; false when
// another instance already holds it.
export function requestAppSingleInstanceLock(): boolean {
  return getAppBackend().requestSingleInstanceLock();
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

// Sets the macOS dock menu (shown when right-clicking the dock icon). No-op where there is no dock.
export function setAppDockMenu(items: readonly MenuItemTemplate[]): void {
  getAppBackend().setDockMenu(items);
}

let _backend: AppBackend | null = null;
const _subscriptions = new WeakMap<App, () => void>();

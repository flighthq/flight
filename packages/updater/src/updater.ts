import { createSignal, emitSignal } from '@flighthq/signals';
import type { AppUpdater, UpdaterBackend } from '@flighthq/types';

// Begins delivering update lifecycle events to `updater`'s signals by subscribing to the active
// backend. Each subscribe* is wired to its matching signal, and every unsubscribe is combined into a
// single WeakMap entry. Idempotent: a prior subscription is torn down first. Pair with
// detachAppUpdater/disposeAppUpdater.
export function attachAppUpdater(updater: AppUpdater): void {
  detachAppUpdater(updater);
  const backend = getUpdaterBackend();
  const unsubscribes = [
    backend.subscribeChecking(() => emitSignal(updater.onChecking)),
    backend.subscribeUpdateAvailable((info) => emitSignal(updater.onUpdateAvailable, info)),
    backend.subscribeUpdateNotAvailable(() => emitSignal(updater.onUpdateNotAvailable)),
    backend.subscribeDownloadProgress((percent) => emitSignal(updater.onDownloadProgress, percent)),
    backend.subscribeUpdateDownloaded((info) => emitSignal(updater.onUpdateDownloaded, info)),
    backend.subscribeError((message) => emitSignal(updater.onError, message)),
  ];
  _subscriptions.set(updater, () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  });
}

// Asks the active backend to check for an available update. Lifecycle results arrive through the
// attached AppUpdater's signals.
export function checkForUpdates(): void {
  getUpdaterBackend().checkForUpdates();
}

// Allocates an AppUpdater event entity with inert signals; call attachAppUpdater to start delivery.
export function createAppUpdater(): AppUpdater {
  return {
    onChecking: createSignal(),
    onDownloadProgress: createSignal(),
    onError: createSignal(),
    onUpdateAvailable: createSignal(),
    onUpdateDownloaded: createSignal(),
    onUpdateNotAvailable: createSignal(),
  };
}

// Builds the default web backend. Auto-update needs a native host, so every command no-ops and every
// subscribe* returns an inert unsubscribe — the browser has no application updater to drive.
export function createWebUpdaterBackend(): UpdaterBackend {
  return {
    setFeedURL() {},
    checkForUpdates() {},
    downloadUpdate() {},
    quitAndInstall() {},
    subscribeChecking() {
      return () => {};
    },
    subscribeUpdateAvailable() {
      return () => {};
    },
    subscribeUpdateNotAvailable() {
      return () => {};
    },
    subscribeDownloadProgress() {
      return () => {};
    },
    subscribeUpdateDownloaded() {
      return () => {};
    },
    subscribeError() {
      return () => {};
    },
  };
}

// Stops delivery to `updater` and forgets its subscription. Safe to call when not attached.
export function detachAppUpdater(updater: AppUpdater): void {
  const unsubscribe = _subscriptions.get(updater);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(updater);
  }
}

// Releases `updater` for garbage collection by detaching its backend subscription. The signals remain
// plain GC-managed memory afterward.
export function disposeAppUpdater(updater: AppUpdater): void {
  detachAppUpdater(updater);
}

// Asks the active backend to download the available update. Progress and completion arrive through
// the attached AppUpdater's signals.
export function downloadUpdate(): void {
  getUpdaterBackend().downloadUpdate();
}

// The active updater backend, or a lazily-created web default. There is always a backend.
export function getUpdaterBackend(): UpdaterBackend {
  if (_backend === null) _backend = createWebUpdaterBackend();
  return _backend;
}

// Quits the application and installs a downloaded update via the active backend.
export function quitAndInstallUpdate(): void {
  getUpdaterBackend().quitAndInstall();
}

// Installs a native host updater backend; pass null to fall back to the web default.
export function setUpdaterBackend(backend: UpdaterBackend | null): void {
  _backend = backend;
}

// Points the active backend at an update feed URL.
export function setUpdaterFeedURL(url: string): void {
  getUpdaterBackend().setFeedURL(url);
}

let _backend: UpdaterBackend | null = null;
const _subscriptions = new WeakMap<AppUpdater, () => void>();

import type { UpdateInfo, UpdaterBackend } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

// Maps Flight's UpdaterBackend onto Electron's built-in autoUpdater (Squirrel). The built-in updater
// auto-downloads on check and emits no progress event, so downloadUpdate folds into checkForUpdates
// and subscribeDownloadProgress is inert. electron-updater would expose richer events.
export function createElectronUpdaterBackend(electron: ElectronApi): UpdaterBackend {
  const autoUpdater = electron.autoUpdater;
  return {
    setFeedURL(url) {
      autoUpdater.setFeedURL({ url });
    },
    checkForUpdates() {
      autoUpdater.checkForUpdates();
    },
    downloadUpdate() {
      // The built-in autoUpdater downloads automatically once a check finds an update.
      autoUpdater.checkForUpdates();
    },
    quitAndInstall() {
      autoUpdater.quitAndInstall();
    },
    subscribeChecking(listener) {
      autoUpdater.on('checking-for-update', listener);
      return () => autoUpdater.removeListener('checking-for-update', listener);
    },
    subscribeUpdateAvailable(listener) {
      const handler = (...args: unknown[]) => listener(toUpdateInfo(args));
      autoUpdater.on('update-available', handler);
      return () => autoUpdater.removeListener('update-available', handler);
    },
    subscribeUpdateNotAvailable(listener) {
      autoUpdater.on('update-not-available', listener);
      return () => autoUpdater.removeListener('update-not-available', listener);
    },
    subscribeDownloadProgress() {
      // The built-in autoUpdater emits no progress event; electron-updater would. Inert unsubscribe.
      return () => {};
    },
    subscribeUpdateDownloaded(listener) {
      const handler = (...args: unknown[]) => listener(toUpdateInfo(args));
      autoUpdater.on('update-downloaded', handler);
      return () => autoUpdater.removeListener('update-downloaded', handler);
    },
    subscribeError(listener) {
      const handler = (...args: unknown[]) =>
        listener(String((args[0] as { message?: string })?.message ?? args[0] ?? ''));
      autoUpdater.on('error', handler);
      return () => autoUpdater.removeListener('error', handler);
    },
  };
}

// Electron emits (event, releaseNotes, releaseName, releaseDate) for update-available/downloaded.
function toUpdateInfo(args: readonly unknown[]): UpdateInfo {
  return {
    version: String(args[2] ?? ''),
    notes: String(args[1] ?? ''),
    releaseDate: String(args[3] ?? ''),
  };
}

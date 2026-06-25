import type { UpdateInfo, UpdaterBackend, UpdaterConfig, UpdaterError } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

// Maps Flight's UpdaterBackend onto Electron's built-in autoUpdater (Squirrel). The built-in updater
// auto-downloads on check and emits no progress event, so downloadUpdate folds into checkForUpdates
// and subscribeDownloadProgress is inert. Channels, config, signature verification, cancel, rollback,
// staging, and verification are electron-updater concepts the built-in updater lacks — they are honest
// no-ops / inert subscriptions here. electron-updater would expose the richer surface.
export function createElectronUpdaterBackend(electron: ElectronApi): UpdaterBackend {
  const autoUpdater = electron.autoUpdater;
  let channel = '';
  let config: UpdaterConfig = { allowPrerelease: false, autoDownload: true, autoInstallOnAppQuit: true };
  return {
    setFeedUrl(url) {
      autoUpdater.setFeedUrl({ url });
    },
    checkForUpdates() {
      autoUpdater.checkForUpdates();
    },
    downloadUpdate() {
      // The built-in autoUpdater downloads automatically once a check finds an update.
      autoUpdater.checkForUpdates();
    },
    cancelDownload() {
      // The built-in autoUpdater has no cancelable download; no-op.
    },
    quitAndInstall() {
      autoUpdater.quitAndInstall();
    },
    rollback() {
      // The built-in autoUpdater cannot roll back an installed update; no-op.
    },
    getChannel() {
      return channel;
    },
    setChannel(next) {
      // Tracked for getChannel; the built-in autoUpdater has no channel switch of its own.
      channel = next;
    },
    getConfig() {
      return config;
    },
    setConfig(next) {
      // Tracked for getConfig; the built-in autoUpdater always auto-downloads regardless.
      config = next;
    },
    setSignatureConfig() {
      // The built-in autoUpdater verifies via the OS code-signing chain, not a Flight signature config; no-op.
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
      const handler = (...args: unknown[]) => {
        const raw = args[0] as { message?: string } | string | undefined;
        const message = typeof raw === 'object' ? (raw?.message ?? '') : String(raw ?? '');
        const error: UpdaterError = { kind: 'Network', message };
        listener(error);
      };
      autoUpdater.on('error', handler);
      return () => autoUpdater.removeListener('error', handler);
    },
    subscribeUpdateCancelled() {
      // No cancel concept in the built-in updater; inert unsubscribe.
      return () => {};
    },
    subscribeUpdateRolledBack() {
      // No rollback concept in the built-in updater; inert unsubscribe.
      return () => {};
    },
    subscribeUpdateStaging() {
      // No staging concept in the built-in updater; inert unsubscribe.
      return () => {};
    },
    subscribeUpdateVerified() {
      // No explicit verification event in the built-in updater; inert unsubscribe.
      return () => {};
    },
  };
}

// Electron emits (event, releaseNotes, releaseName, releaseDate) for update-available/downloaded. The
// fields electron-updater would supply (delta, size, mandatory, OS floor, sha512, rollout) are unknown
// here and carry their sentinels.
function toUpdateInfo(args: readonly unknown[]): UpdateInfo {
  return {
    version: String(args[2] ?? ''),
    notes: String(args[1] ?? ''),
    releaseDate: String(args[3] ?? ''),
    deltaFromVersion: null,
    downloadSizeBytes: -1,
    isMandatory: false,
    minimumOsVersion: null,
    sha512: '',
    stagedRolloutPercent: 100,
  };
}

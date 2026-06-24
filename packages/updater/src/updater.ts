import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  AppUpdater,
  UpdateInfo,
  UpdaterBackend,
  UpdaterConfig,
  UpdaterSignatureConfig,
  UpdaterState,
} from '@flighthq/types';

// Begins delivering update lifecycle events to `updater`'s signals by subscribing to the active
// backend. Each subscribe* is wired to its matching signal, and the phase state is updated on every
// event so getAppUpdaterState reflects the latest lifecycle. Idempotent: a prior subscription is
// torn down first. Pair with detachAppUpdater/disposeAppUpdater.
export function attachAppUpdater(updater: AppUpdater): void {
  detachAppUpdater(updater);
  const backend = getUpdaterBackend();
  const unsubscribes = [
    backend.subscribeChecking(() => {
      _setState(updater, { phase: 'Checking', info: null, progress: null, error: null });
      emitSignal(updater.onChecking);
    }),
    backend.subscribeUpdateAvailable((info) => {
      _setState(updater, { phase: 'UpdateAvailable', info, progress: null, error: null });
      emitSignal(updater.onUpdateAvailable, info);
    }),
    backend.subscribeUpdateNotAvailable(() => {
      _setState(updater, (prev) => ({ ...prev, phase: 'Idle' }));
      emitSignal(updater.onUpdateNotAvailable);
    }),
    backend.subscribeDownloadProgress((progress) => {
      _setState(updater, (prev) => ({ ...prev, phase: 'Downloading', progress }));
      emitSignal(updater.onDownloadProgress, progress);
    }),
    backend.subscribeUpdateDownloaded((info) => {
      _setState(updater, (prev) => ({ ...prev, phase: 'Downloaded', info, progress: null }));
      emitSignal(updater.onUpdateDownloaded, info);
    }),
    backend.subscribeError((error) => {
      _setState(updater, (prev) => ({ ...prev, phase: 'Error', error }));
      emitSignal(updater.onError, error);
    }),
    backend.subscribeUpdateCancelled(() => {
      _setState(updater, (prev) => ({ ...prev, phase: 'Idle' }));
      emitSignal(updater.onUpdateCancelled);
    }),
    backend.subscribeUpdateStaging(() => {
      _setState(updater, (prev) => ({ ...prev, phase: 'Staging' }));
      emitSignal(updater.onUpdateStaging);
    }),
    backend.subscribeUpdateVerified(() => {
      emitSignal(updater.onUpdateVerified);
    }),
    backend.subscribeUpdateRolledBack(() => {
      _setState(updater, (prev) => ({ ...prev, phase: 'Idle', info: null, progress: null, error: null }));
      emitSignal(updater.onUpdateRolledBack);
    }),
  ];
  _subscriptions.set(updater, () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  });
}

// Asks the active backend to cancel a download in progress. Result arrives via onUpdateCancelled or
// onError(kind: 'Cancelled') depending on the backend.
export function cancelAppUpdateDownload(): void {
  getUpdaterBackend().cancelDownload();
}

// Triggers a check; if an update is found and autoDownload is true, also starts the download. This
// is a single-call convenience; results still arrive through signals.
export function checkAndDownloadAppUpdate(): void {
  const config = getUpdaterConfig();
  getUpdaterBackend().checkForUpdates();
  if (config.autoDownload) {
    getUpdaterBackend().downloadUpdate();
  }
}

// Asks the active backend to check for an available update. Lifecycle results arrive through the
// attached AppUpdater's signals.
export function checkForAppUpdate(): void {
  getUpdaterBackend().checkForUpdates();
}

// Allocates an AppUpdater event entity with inert signals and an Idle state; call attachAppUpdater
// to start delivery.
export function createAppUpdater(): AppUpdater {
  const updater: AppUpdater = {
    onChecking: createSignal(),
    onDownloadProgress: createSignal(),
    onError: createSignal(),
    onUpdateAvailable: createSignal(),
    onUpdateCancelled: createSignal(),
    onUpdateDownloaded: createSignal(),
    onUpdateNotAvailable: createSignal(),
    onUpdateRolledBack: createSignal(),
    onUpdateStaging: createSignal(),
    onUpdateVerified: createSignal(),
  };
  _states.set(updater, createUpdaterState());
  return updater;
}

// Allocates an UpdaterConfig with the recommended defaults: manual download, no auto-install, no
// prerelease.
export function createUpdaterConfig(): UpdaterConfig {
  return {
    allowPrerelease: false,
    autoDownload: false,
    autoInstallOnAppQuit: false,
  };
}

// Allocates a zeroed UpdaterState at the Idle phase with all payloads null.
export function createUpdaterState(): UpdaterState {
  return {
    error: null,
    info: null,
    phase: 'Idle',
    progress: null,
  };
}

// Builds the default web backend. Auto-update needs a native host, so every command no-ops and every
// subscribe* returns an inert unsubscribe — the browser has no application updater to drive.
export function createWebUpdaterBackend(): UpdaterBackend {
  let _config: UpdaterConfig = createUpdaterConfig();
  let _channel = 'stable';
  return {
    cancelDownload() {},
    checkForUpdates() {},
    downloadUpdate() {},
    getChannel() {
      return _channel;
    },
    getConfig() {
      return _config;
    },
    quitAndInstall() {},
    rollback() {},
    setChannel(channel) {
      _channel = channel;
    },
    setConfig(config) {
      _config = { ...config };
    },
    setFeedUrl() {},
    setSignatureConfig() {},
    subscribeChecking() {
      return () => {};
    },
    subscribeDownloadProgress() {
      return () => {};
    },
    subscribeError() {
      return () => {};
    },
    subscribeUpdateAvailable() {
      return () => {};
    },
    subscribeUpdateCancelled() {
      return () => {};
    },
    subscribeUpdateDownloaded() {
      return () => {};
    },
    subscribeUpdateNotAvailable() {
      return () => {};
    },
    subscribeUpdateRolledBack() {
      return () => {};
    },
    subscribeUpdateStaging() {
      return () => {};
    },
    subscribeUpdateVerified() {
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
export function downloadAppUpdate(): void {
  getUpdaterBackend().downloadUpdate();
}

// Returns the current queryable lifecycle state for `updater`. This lets a late subscriber or UI
// read whether a check is pending, what update is available, or the last error, without having
// listened since the beginning.
export function getAppUpdaterState(updater: AppUpdater): Readonly<UpdaterState> {
  return _states.get(updater) ?? createUpdaterState();
}

// The active updater backend, or a lazily-created web default. There is always a backend.
export function getUpdaterBackend(): UpdaterBackend {
  if (_backend === null) _backend = createWebUpdaterBackend();
  return _backend;
}

// Returns the active update channel string. Conventional values are 'stable', 'beta', 'alpha'.
export function getUpdaterChannel(): string {
  return getUpdaterBackend().getChannel();
}

// Returns a copy of the active updater configuration.
export function getUpdaterConfig(): Readonly<UpdaterConfig> {
  return getUpdaterBackend().getConfig();
}

// Deterministic check for staged-rollout eligibility. Returns true when the given `rolloutSeed`
// (a number in [0, 1)) falls within the update's staged rollout percentage. A seed derived from a
// stable device/user identifier ensures consistent results across sessions for the same device.
// NOTE: `stagedRolloutPercent` is 0–100; 100 means full rollout.
export function isAppUpdateEligible(info: Readonly<UpdateInfo>, rolloutSeed: number): boolean {
  return rolloutSeed * 100 < info.stagedRolloutPercent;
}

// Quits the application and installs a downloaded update via the active backend.
export function quitAndInstallUpdate(): void {
  getUpdaterBackend().quitAndInstall();
}

// Requests the active backend to roll back the last installed update. The backend must support
// rollback (Squirrel/MSIX); the web default no-ops. Result arrives via onUpdateRolledBack.
export function rollbackAppUpdate(): void {
  getUpdaterBackend().rollback();
}

// Installs a native host updater backend; pass null to fall back to the web default.
export function setUpdaterBackend(backend: UpdaterBackend | null): void {
  _backend = backend;
}

// Sets the active update channel. Conventional values: 'stable', 'beta', 'alpha'. Free string so
// hosts and apps can define their own channels. Layered over the feed URL, not replacing it.
export function setUpdaterChannel(channel: string): void {
  getUpdaterBackend().setChannel(channel);
}

// Applies an updater configuration (auto-download, auto-install-on-quit, allow-prerelease) to the
// active backend.
export function setUpdaterConfig(config: Readonly<UpdaterConfig>): void {
  getUpdaterBackend().setConfig(config);
}

// Points the active backend at an update feed URL.
export function setUpdaterFeedUrl(url: string): void {
  getUpdaterBackend().setFeedUrl(url);
}

// Configures signature/integrity verification for the active backend. Verification executes in the
// host backend; this package owns the configuration contract and the result events. Pass null to
// clear any previously set signature config.
export function setUpdaterSignatureConfig(config: Readonly<UpdaterSignatureConfig> | null): void {
  getUpdaterBackend().setSignatureConfig(config);
}

let _backend: UpdaterBackend | null = null;
const _states = new WeakMap<AppUpdater, UpdaterState>();
const _subscriptions = new WeakMap<AppUpdater, () => void>();

// Updates the per-entity state. Accepts either a full replacement or an updater function.
function _setState(updater: AppUpdater, update: UpdaterState | ((prev: Readonly<UpdaterState>) => UpdaterState)): void {
  const prev = _states.get(updater) ?? createUpdaterState();
  const next = typeof update === 'function' ? update(prev) : update;
  _states.set(updater, next);
}

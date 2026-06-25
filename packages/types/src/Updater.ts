import type { Signal } from './Signal';

export interface UpdateInfo {
  version: string;
  notes: string;
  releaseDate: string;
  // Source version for a delta/differential update, or null for a full download.
  deltaFromVersion: string | null;
  downloadSizeBytes: number;
  isMandatory: boolean;
  // Minimum host OS version required to install, or null when unconstrained.
  minimumOsVersion: string | null;
  sha512: string;
  // Staged-rollout percentage in [0, 100]; 100 means full rollout.
  stagedRolloutPercent: number;
}

// Download/transfer progress for an update in flight.
export interface UpdateProgress {
  bytesPerSecond: number;
  isDelta: boolean;
  percent: number;
  totalBytes: number;
  transferredBytes: number;
}

// A failure surfaced during the update lifecycle. `kind` is an open string so hosts can add their
// own categories; conventional values are 'Network', 'Signature', 'Cancelled'.
export interface UpdaterError {
  kind: string;
  message: string;
}

// Updater behavior configuration. Defaults are conservative: manual download, no auto-install, no
// prerelease.
export interface UpdaterConfig {
  allowPrerelease: boolean;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
}

// Signature/integrity verification configuration for downloaded updates.
export interface UpdaterSignatureConfig {
  algorithm: string;
  publicKey: string;
}

// The current lifecycle phase of an updater. 'Idle' is the resting state; the rest mirror the
// backend events.
export type UpdaterPhase = 'Idle' | 'Checking' | 'UpdateAvailable' | 'Downloading' | 'Downloaded' | 'Staging' | 'Error';

// Queryable lifecycle state for an AppUpdater, so a late subscriber or UI can read the current phase
// and last payloads without having listened from the start.
export interface UpdaterState {
  phase: UpdaterPhase;
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: UpdaterError | null;
}

// Auto-update event entity. Enable delivery with attachAppUpdater; the signals stay inert until then.
export interface AppUpdater {
  onChecking: Signal<() => void>;
  onUpdateAvailable: Signal<(info: Readonly<UpdateInfo>) => void>;
  onUpdateNotAvailable: Signal<() => void>;
  onDownloadProgress: Signal<(progress: Readonly<UpdateProgress>) => void>;
  onUpdateDownloaded: Signal<(info: Readonly<UpdateInfo>) => void>;
  onError: Signal<(error: Readonly<UpdaterError>) => void>;
  onUpdateCancelled: Signal<() => void>;
  onUpdateStaging: Signal<() => void>;
  onUpdateVerified: Signal<() => void>;
  onUpdateRolledBack: Signal<() => void>;
}

// Event seam for auto-update: command methods drive the update lifecycle, and per-event subscribe*
// methods register listeners. The web default no-ops every command and returns inert unsubscribes;
// a native host wires these to its own updater (electron-updater, Sparkle, etc.).
export interface UpdaterBackend {
  cancelDownload(): void;
  checkForUpdates(): void;
  downloadUpdate(): void;
  getChannel(): string;
  getConfig(): Readonly<UpdaterConfig>;
  quitAndInstall(): void;
  rollback(): void;
  setChannel(channel: string): void;
  setConfig(config: Readonly<UpdaterConfig>): void;
  setFeedUrl(url: string): void;
  setSignatureConfig(config: Readonly<UpdaterSignatureConfig> | null): void;
  subscribeChecking(listener: () => void): () => void;
  subscribeDownloadProgress(listener: (progress: Readonly<UpdateProgress>) => void): () => void;
  subscribeError(listener: (error: Readonly<UpdaterError>) => void): () => void;
  subscribeUpdateAvailable(listener: (info: Readonly<UpdateInfo>) => void): () => void;
  subscribeUpdateCancelled(listener: () => void): () => void;
  subscribeUpdateDownloaded(listener: (info: Readonly<UpdateInfo>) => void): () => void;
  subscribeUpdateNotAvailable(listener: () => void): () => void;
  subscribeUpdateRolledBack(listener: () => void): () => void;
  subscribeUpdateStaging(listener: () => void): () => void;
  subscribeUpdateVerified(listener: () => void): () => void;
}

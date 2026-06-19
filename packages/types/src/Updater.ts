import type { Signal } from './Signal';

export interface UpdateInfo {
  version: string;
  notes: string;
  releaseDate: string;
}

// Auto-update event entity. Enable delivery with attachAppUpdater; the signals stay inert until then.
export interface AppUpdater {
  onChecking: Signal<() => void>;
  onUpdateAvailable: Signal<(info: Readonly<UpdateInfo>) => void>;
  onUpdateNotAvailable: Signal<() => void>;
  onDownloadProgress: Signal<(percent: number) => void>;
  onUpdateDownloaded: Signal<(info: Readonly<UpdateInfo>) => void>;
  onError: Signal<(message: string) => void>;
}

// Event seam for auto-update: command methods drive the update lifecycle, and per-event subscribe*
// methods register listeners. The web default no-ops every command and returns inert unsubscribes;
// a native host wires these to its own updater (electron-updater, Sparkle, etc.).
export interface UpdaterBackend {
  setFeedURL(url: string): void;
  checkForUpdates(): void;
  downloadUpdate(): void;
  quitAndInstall(): void;
  subscribeChecking(listener: () => void): () => void;
  subscribeUpdateAvailable(listener: (info: Readonly<UpdateInfo>) => void): () => void;
  subscribeUpdateNotAvailable(listener: () => void): () => void;
  subscribeDownloadProgress(listener: (percent: number) => void): () => void;
  subscribeUpdateDownloaded(listener: (info: Readonly<UpdateInfo>) => void): () => void;
  subscribeError(listener: (message: string) => void): () => void;
}

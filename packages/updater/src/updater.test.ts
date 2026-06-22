import { connectSignal } from '@flighthq/signals';
import type { UpdateInfo, UpdaterBackend } from '@flighthq/types';

import {
  attachAppUpdater,
  checkForUpdates,
  createAppUpdater,
  createWebUpdaterBackend,
  detachAppUpdater,
  disposeAppUpdater,
  downloadUpdate,
  getUpdaterBackend,
  quitAndInstallUpdate,
  setUpdaterBackend,
  setUpdaterFeedUrl,
} from './updater';

interface FakeUpdaterBackend extends UpdaterBackend {
  feedUrl: string;
  checked: number;
  downloaded: number;
  quit: number;
  fireChecking: () => void;
  fireUpdateAvailable: (info: Readonly<UpdateInfo>) => void;
  fireUpdateNotAvailable: () => void;
  fireDownloadProgress: (percent: number) => void;
  fireUpdateDownloaded: (info: Readonly<UpdateInfo>) => void;
  fireError: (message: string) => void;
}

function fakeBackend(): FakeUpdaterBackend {
  let checking: (() => void) | null = null;
  let updateAvailable: ((info: Readonly<UpdateInfo>) => void) | null = null;
  let updateNotAvailable: (() => void) | null = null;
  let downloadProgress: ((percent: number) => void) | null = null;
  let updateDownloaded: ((info: Readonly<UpdateInfo>) => void) | null = null;
  let error: ((message: string) => void) | null = null;
  return {
    feedUrl: '',
    checked: 0,
    downloaded: 0,
    quit: 0,
    setFeedUrl(url) {
      this.feedUrl = url;
    },
    checkForUpdates() {
      this.checked++;
    },
    downloadUpdate() {
      this.downloaded++;
    },
    quitAndInstall() {
      this.quit++;
    },
    subscribeChecking(listener) {
      checking = listener;
      return () => {
        checking = null;
      };
    },
    subscribeUpdateAvailable(listener) {
      updateAvailable = listener;
      return () => {
        updateAvailable = null;
      };
    },
    subscribeUpdateNotAvailable(listener) {
      updateNotAvailable = listener;
      return () => {
        updateNotAvailable = null;
      };
    },
    subscribeDownloadProgress(listener) {
      downloadProgress = listener;
      return () => {
        downloadProgress = null;
      };
    },
    subscribeUpdateDownloaded(listener) {
      updateDownloaded = listener;
      return () => {
        updateDownloaded = null;
      };
    },
    subscribeError(listener) {
      error = listener;
      return () => {
        error = null;
      };
    },
    fireChecking() {
      checking?.();
    },
    fireUpdateAvailable(info) {
      updateAvailable?.(info);
    },
    fireUpdateNotAvailable() {
      updateNotAvailable?.();
    },
    fireDownloadProgress(percent) {
      downloadProgress?.(percent);
    },
    fireUpdateDownloaded(info) {
      updateDownloaded?.(info);
    },
    fireError(message) {
      error?.(message);
    },
  };
}

afterEach(() => setUpdaterBackend(null));

describe('attachAppUpdater', () => {
  it('wires every subscribe to its signal, forwarding payloads', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    const updater = createAppUpdater();
    let checking = 0;
    let notAvailable = 0;
    let availableInfo: Readonly<UpdateInfo> | null = null;
    let downloadedInfo: Readonly<UpdateInfo> | null = null;
    let percent = -1;
    let message = '';
    connectSignal(updater.onChecking, () => checking++);
    connectSignal(updater.onUpdateNotAvailable, () => notAvailable++);
    connectSignal(updater.onUpdateAvailable, (info) => (availableInfo = info));
    connectSignal(updater.onDownloadProgress, (p) => (percent = p));
    connectSignal(updater.onUpdateDownloaded, (info) => (downloadedInfo = info));
    connectSignal(updater.onError, (m) => (message = m));
    attachAppUpdater(updater);

    const info: UpdateInfo = { version: '1.2.3', notes: 'fixes', releaseDate: '2026-06-19' };
    backend.fireChecking();
    backend.fireUpdateAvailable(info);
    backend.fireUpdateNotAvailable();
    backend.fireDownloadProgress(42);
    backend.fireUpdateDownloaded(info);
    backend.fireError('boom');

    expect(checking).toBe(1);
    expect(notAvailable).toBe(1);
    expect(availableInfo).toEqual(info);
    expect(downloadedInfo).toEqual(info);
    expect(percent).toBe(42);
    expect(message).toBe('boom');
  });
});

describe('checkForUpdates', () => {
  it('delegates to the active backend', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    checkForUpdates();
    expect(backend.checked).toBe(1);
  });
});

describe('createAppUpdater', () => {
  it('creates an entity with all six signals', () => {
    const updater = createAppUpdater();
    expect(updater.onChecking).toBeDefined();
    expect(updater.onUpdateAvailable).toBeDefined();
    expect(updater.onUpdateNotAvailable).toBeDefined();
    expect(updater.onDownloadProgress).toBeDefined();
    expect(updater.onUpdateDownloaded).toBeDefined();
    expect(updater.onError).toBeDefined();
  });
});

describe('createWebUpdaterBackend', () => {
  it('no-ops commands and returns inert unsubscribes without throwing', () => {
    const backend = createWebUpdaterBackend();
    expect(() => {
      backend.setFeedUrl('https://example.com/feed');
      backend.checkForUpdates();
      backend.downloadUpdate();
      backend.quitAndInstall();
    }).not.toThrow();
    expect(typeof backend.subscribeChecking(() => {})).toBe('function');
    expect(typeof backend.subscribeError(() => {})).toBe('function');
  });
});

describe('detachAppUpdater', () => {
  it('stops further delivery', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    const updater = createAppUpdater();
    let checking = 0;
    connectSignal(updater.onChecking, () => checking++);
    attachAppUpdater(updater);
    detachAppUpdater(updater);
    backend.fireChecking();
    expect(checking).toBe(0);
  });
});

describe('disposeAppUpdater', () => {
  it('detaches the subscription', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    const updater = createAppUpdater();
    attachAppUpdater(updater);
    expect(() => disposeAppUpdater(updater)).not.toThrow();
  });
});

describe('downloadUpdate', () => {
  it('delegates to the active backend', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    downloadUpdate();
    expect(backend.downloaded).toBe(1);
  });
});

describe('getUpdaterBackend', () => {
  it('falls back to a web backend', () => {
    expect(getUpdaterBackend()).not.toBeNull();
  });
});

describe('quitAndInstallUpdate', () => {
  it('delegates to the active backend', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    quitAndInstallUpdate();
    expect(backend.quit).toBe(1);
  });
});

describe('setUpdaterBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setUpdaterBackend(fakeBackend());
    setUpdaterBackend(null);
    expect(getUpdaterBackend()).not.toBeNull();
  });
});

describe('setUpdaterFeedUrl', () => {
  it('forwards the URL to the active backend', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    setUpdaterFeedUrl('https://example.com/feed');
    expect(backend.feedUrl).toBe('https://example.com/feed');
  });
});

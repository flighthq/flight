import { connectSignal } from '@flighthq/signals';
import type { UpdateInfo, UpdateProgress, UpdaterBackend, UpdaterError } from '@flighthq/types';

import {
  attachAppUpdater,
  cancelAppUpdateDownload,
  checkAndDownloadAppUpdate,
  checkForAppUpdate,
  createAppUpdater,
  createUpdaterConfig,
  createUpdaterState,
  createWebUpdaterBackend,
  detachAppUpdater,
  disposeAppUpdater,
  downloadAppUpdate,
  getAppUpdaterState,
  getUpdaterBackend,
  getUpdaterChannel,
  getUpdaterConfig,
  isAppUpdateEligible,
  quitAndInstallUpdate,
  rollbackAppUpdate,
  setUpdaterBackend,
  setUpdaterChannel,
  setUpdaterConfig,
  setUpdaterFeedUrl,
  setUpdaterSignatureConfig,
} from './updater';

const FULL_UPDATE_INFO: UpdateInfo = {
  deltaFromVersion: null,
  downloadSizeBytes: 10_000_000,
  isMandatory: false,
  minimumOsVersion: null,
  notes: 'fixes',
  releaseDate: '2026-06-19',
  sha512: 'abc123',
  stagedRolloutPercent: 100,
  version: '1.2.3',
};

interface FakeUpdaterBackend extends UpdaterBackend {
  feedUrl: string;
  checked: number;
  downloaded: number;
  cancelled: number;
  quit: number;
  rolledBack: number;
  fireChecking: () => void;
  fireUpdateAvailable: (info: Readonly<UpdateInfo>) => void;
  fireUpdateNotAvailable: () => void;
  fireDownloadProgress: (progress: Readonly<UpdateProgress>) => void;
  fireUpdateDownloaded: (info: Readonly<UpdateInfo>) => void;
  fireError: (error: Readonly<UpdaterError>) => void;
  fireUpdateCancelled: () => void;
  fireUpdateStaging: () => void;
  fireUpdateVerified: () => void;
  fireUpdateRolledBack: () => void;
}

function fakeBackend(): FakeUpdaterBackend {
  let checking: (() => void) | null = null;
  let updateAvailable: ((info: Readonly<UpdateInfo>) => void) | null = null;
  let updateNotAvailable: (() => void) | null = null;
  let downloadProgress: ((progress: Readonly<UpdateProgress>) => void) | null = null;
  let updateDownloaded: ((info: Readonly<UpdateInfo>) => void) | null = null;
  let error: ((error: Readonly<UpdaterError>) => void) | null = null;
  let updateCancelled: (() => void) | null = null;
  let updateStaging: (() => void) | null = null;
  let updateVerified: (() => void) | null = null;
  let updateRolledBack: (() => void) | null = null;
  let channel = 'stable';
  let config = createUpdaterConfig();
  return {
    feedUrl: '',
    checked: 0,
    downloaded: 0,
    cancelled: 0,
    quit: 0,
    rolledBack: 0,
    cancelDownload() {
      this.cancelled++;
    },
    checkForUpdates() {
      this.checked++;
    },
    downloadUpdate() {
      this.downloaded++;
    },
    getChannel() {
      return channel;
    },
    getConfig() {
      return config;
    },
    quitAndInstall() {
      this.quit++;
    },
    rollback() {
      this.rolledBack++;
    },
    setChannel(c) {
      channel = c;
    },
    setConfig(c) {
      config = { ...c };
    },
    setFeedUrl(url) {
      this.feedUrl = url;
    },
    setSignatureConfig() {},
    subscribeChecking(listener) {
      checking = listener;
      return () => {
        checking = null;
      };
    },
    subscribeDownloadProgress(listener) {
      downloadProgress = listener;
      return () => {
        downloadProgress = null;
      };
    },
    subscribeError(listener) {
      error = listener;
      return () => {
        error = null;
      };
    },
    subscribeUpdateAvailable(listener) {
      updateAvailable = listener;
      return () => {
        updateAvailable = null;
      };
    },
    subscribeUpdateCancelled(listener) {
      updateCancelled = listener;
      return () => {
        updateCancelled = null;
      };
    },
    subscribeUpdateDownloaded(listener) {
      updateDownloaded = listener;
      return () => {
        updateDownloaded = null;
      };
    },
    subscribeUpdateNotAvailable(listener) {
      updateNotAvailable = listener;
      return () => {
        updateNotAvailable = null;
      };
    },
    subscribeUpdateRolledBack(listener) {
      updateRolledBack = listener;
      return () => {
        updateRolledBack = null;
      };
    },
    subscribeUpdateStaging(listener) {
      updateStaging = listener;
      return () => {
        updateStaging = null;
      };
    },
    subscribeUpdateVerified(listener) {
      updateVerified = listener;
      return () => {
        updateVerified = null;
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
    fireDownloadProgress(progress) {
      downloadProgress?.(progress);
    },
    fireUpdateDownloaded(info) {
      updateDownloaded?.(info);
    },
    fireError(e) {
      error?.(e);
    },
    fireUpdateCancelled() {
      updateCancelled?.();
    },
    fireUpdateStaging() {
      updateStaging?.();
    },
    fireUpdateVerified() {
      updateVerified?.();
    },
    fireUpdateRolledBack() {
      updateRolledBack?.();
    },
  };
}

afterEach(() => setUpdaterBackend(null));

describe('attachAppUpdater', () => {
  it('is idempotent — re-attach tears down the prior subscription first', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    const updater = createAppUpdater();
    let checking = 0;
    connectSignal(updater.onChecking, () => checking++);
    attachAppUpdater(updater);
    attachAppUpdater(updater); // second attach
    backend.fireChecking();
    // Only one subscription should be active, so checking fires once
    expect(checking).toBe(1);
  });

  it('is safe when not previously attached', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    const updater = createAppUpdater();
    expect(() => attachAppUpdater(updater)).not.toThrow();
  });

  it('wires all ten signals and updates state for each', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    const updater = createAppUpdater();
    let checking = 0;
    let notAvailable = 0;
    let availableInfo: Readonly<UpdateInfo> | null = null;
    let downloadedInfo: Readonly<UpdateInfo> | null = null;
    let progress: Readonly<UpdateProgress> | null = null;
    let receivedError: Readonly<UpdaterError> | null = null;
    let cancelled = 0;
    let staging = 0;
    let verified = 0;
    let rolledBack = 0;

    connectSignal(updater.onChecking, () => checking++);
    connectSignal(updater.onUpdateNotAvailable, () => notAvailable++);
    connectSignal(updater.onUpdateAvailable, (info) => (availableInfo = info));
    connectSignal(updater.onDownloadProgress, (p) => (progress = p));
    connectSignal(updater.onUpdateDownloaded, (info) => (downloadedInfo = info));
    connectSignal(updater.onError, (e) => (receivedError = e));
    connectSignal(updater.onUpdateCancelled, () => cancelled++);
    connectSignal(updater.onUpdateStaging, () => staging++);
    connectSignal(updater.onUpdateVerified, () => verified++);
    connectSignal(updater.onUpdateRolledBack, () => rolledBack++);
    attachAppUpdater(updater);

    const prog: UpdateProgress = {
      bytesPerSecond: 1000,
      isDelta: false,
      percent: 42,
      totalBytes: 100,
      transferredBytes: 42,
    };
    const err: UpdaterError = { kind: 'Network', message: 'timeout' };
    backend.fireChecking();
    backend.fireUpdateAvailable(FULL_UPDATE_INFO);
    backend.fireUpdateNotAvailable();
    backend.fireDownloadProgress(prog);
    backend.fireUpdateDownloaded(FULL_UPDATE_INFO);
    backend.fireError(err);
    backend.fireUpdateCancelled();
    backend.fireUpdateStaging();
    backend.fireUpdateVerified();
    backend.fireUpdateRolledBack();

    expect(checking).toBe(1);
    expect(notAvailable).toBe(1);
    expect(availableInfo).toEqual(FULL_UPDATE_INFO);
    expect(downloadedInfo).toEqual(FULL_UPDATE_INFO);
    expect(progress).toEqual(prog);
    expect(receivedError).toEqual(err);
    expect(cancelled).toBe(1);
    expect(staging).toBe(1);
    expect(verified).toBe(1);
    expect(rolledBack).toBe(1);
  });

  it('updates state machine phases in order', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    const updater = createAppUpdater();
    attachAppUpdater(updater);

    expect(getAppUpdaterState(updater).phase).toBe('Idle');

    backend.fireChecking();
    expect(getAppUpdaterState(updater).phase).toBe('Checking');

    backend.fireUpdateAvailable(FULL_UPDATE_INFO);
    expect(getAppUpdaterState(updater).phase).toBe('UpdateAvailable');
    expect(getAppUpdaterState(updater).info).toEqual(FULL_UPDATE_INFO);

    const prog: UpdateProgress = {
      bytesPerSecond: 500,
      isDelta: false,
      percent: 50,
      totalBytes: 200,
      transferredBytes: 100,
    };
    backend.fireDownloadProgress(prog);
    expect(getAppUpdaterState(updater).phase).toBe('Downloading');
    expect(getAppUpdaterState(updater).progress).toEqual(prog);

    backend.fireUpdateDownloaded(FULL_UPDATE_INFO);
    expect(getAppUpdaterState(updater).phase).toBe('Downloaded');

    backend.fireUpdateStaging();
    expect(getAppUpdaterState(updater).phase).toBe('Staging');
  });

  it('transitions to Error phase when backend fires error', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    const updater = createAppUpdater();
    attachAppUpdater(updater);

    const err: UpdaterError = { kind: 'Signature', message: 'bad sig' };
    backend.fireError(err);
    expect(getAppUpdaterState(updater).phase).toBe('Error');
    expect(getAppUpdaterState(updater).error).toEqual(err);
  });

  it('resets to Idle on cancel and rollback', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    const updater = createAppUpdater();
    attachAppUpdater(updater);

    backend.fireChecking();
    backend.fireUpdateCancelled();
    expect(getAppUpdaterState(updater).phase).toBe('Idle');

    backend.fireChecking();
    backend.fireUpdateRolledBack();
    expect(getAppUpdaterState(updater).phase).toBe('Idle');
    expect(getAppUpdaterState(updater).info).toBeNull();
  });
});

describe('cancelAppUpdateDownload', () => {
  it('delegates to the active backend', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    cancelAppUpdateDownload();
    expect(backend.cancelled).toBe(1);
  });
});

describe('checkAndDownloadAppUpdate', () => {
  it('calls checkForUpdates; also calls downloadUpdate when autoDownload is true', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    backend.setConfig({ allowPrerelease: false, autoDownload: true, autoInstallOnAppQuit: false });
    checkAndDownloadAppUpdate();
    expect(backend.checked).toBe(1);
    expect(backend.downloaded).toBe(1);
  });

  it('only checks when autoDownload is false', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    backend.setConfig({ allowPrerelease: false, autoDownload: false, autoInstallOnAppQuit: false });
    checkAndDownloadAppUpdate();
    expect(backend.checked).toBe(1);
    expect(backend.downloaded).toBe(0);
  });
});

describe('checkForAppUpdate', () => {
  it('delegates to the active backend', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    checkForAppUpdate();
    expect(backend.checked).toBe(1);
  });
});

describe('createAppUpdater', () => {
  it('creates an entity with all ten signals', () => {
    const updater = createAppUpdater();
    expect(updater.onChecking).toBeDefined();
    expect(updater.onUpdateAvailable).toBeDefined();
    expect(updater.onUpdateNotAvailable).toBeDefined();
    expect(updater.onDownloadProgress).toBeDefined();
    expect(updater.onUpdateDownloaded).toBeDefined();
    expect(updater.onError).toBeDefined();
    expect(updater.onUpdateCancelled).toBeDefined();
    expect(updater.onUpdateStaging).toBeDefined();
    expect(updater.onUpdateVerified).toBeDefined();
    expect(updater.onUpdateRolledBack).toBeDefined();
  });

  it('starts in Idle phase with all payloads null', () => {
    const updater = createAppUpdater();
    const state = getAppUpdaterState(updater);
    expect(state.phase).toBe('Idle');
    expect(state.info).toBeNull();
    expect(state.progress).toBeNull();
    expect(state.error).toBeNull();
  });
});

describe('createUpdaterConfig', () => {
  it('returns safe defaults', () => {
    const config = createUpdaterConfig();
    expect(config.autoDownload).toBe(false);
    expect(config.autoInstallOnAppQuit).toBe(false);
    expect(config.allowPrerelease).toBe(false);
  });
});

describe('createUpdaterState', () => {
  it('returns Idle phase with null payloads', () => {
    const state = createUpdaterState();
    expect(state.phase).toBe('Idle');
    expect(state.info).toBeNull();
    expect(state.progress).toBeNull();
    expect(state.error).toBeNull();
  });
});

describe('createWebUpdaterBackend', () => {
  it('no-ops commands and returns inert unsubscribes without throwing', () => {
    const backend = createWebUpdaterBackend();
    expect(() => {
      backend.setFeedUrl('https://example.com/feed');
      backend.checkForUpdates();
      backend.downloadUpdate();
      backend.cancelDownload();
      backend.quitAndInstall();
      backend.rollback();
      backend.setSignatureConfig(null);
      backend.setSignatureConfig({ algorithm: 'ed25519', publicKey: 'abc' });
    }).not.toThrow();
    expect(typeof backend.subscribeChecking(() => {})).toBe('function');
    expect(typeof backend.subscribeError(() => {})).toBe('function');
    expect(typeof backend.subscribeUpdateCancelled(() => {})).toBe('function');
    expect(typeof backend.subscribeUpdateStaging(() => {})).toBe('function');
    expect(typeof backend.subscribeUpdateVerified(() => {})).toBe('function');
    expect(typeof backend.subscribeUpdateRolledBack(() => {})).toBe('function');
  });

  it('stores and returns channel', () => {
    const backend = createWebUpdaterBackend();
    expect(backend.getChannel()).toBe('stable');
    backend.setChannel('beta');
    expect(backend.getChannel()).toBe('beta');
  });

  it('stores and returns config', () => {
    const backend = createWebUpdaterBackend();
    const config = createUpdaterConfig();
    expect(backend.getConfig()).toEqual(config);
    backend.setConfig({ ...config, autoDownload: true });
    expect(backend.getConfig().autoDownload).toBe(true);
  });

  it('returns idle state for every query', () => {
    const backend = createWebUpdaterBackend();
    expect(backend.getChannel()).toBe('stable');
    const config = backend.getConfig();
    expect(config.autoDownload).toBe(false);
    expect(config.autoInstallOnAppQuit).toBe(false);
    expect(config.allowPrerelease).toBe(false);
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

  it('is safe when not attached', () => {
    const updater = createAppUpdater();
    expect(() => detachAppUpdater(updater)).not.toThrow();
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

describe('downloadAppUpdate', () => {
  it('delegates to the active backend', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    downloadAppUpdate();
    expect(backend.downloaded).toBe(1);
  });
});

describe('getAppUpdaterState', () => {
  it('returns Idle state for an updater that has never been attached', () => {
    const updater = createAppUpdater();
    const state = getAppUpdaterState(updater);
    expect(state.phase).toBe('Idle');
  });

  it('is per-entity — two updaters have independent states', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    const a = createAppUpdater();
    const b = createAppUpdater();
    attachAppUpdater(a);
    backend.fireChecking();
    expect(getAppUpdaterState(a).phase).toBe('Checking');
    expect(getAppUpdaterState(b).phase).toBe('Idle');
  });
});

describe('getUpdaterBackend', () => {
  it('falls back to a web backend', () => {
    expect(getUpdaterBackend()).not.toBeNull();
  });
});

describe('getUpdaterChannel', () => {
  it('returns the channel from the active backend', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    backend.setChannel('beta');
    expect(getUpdaterChannel()).toBe('beta');
  });
});

describe('getUpdaterConfig', () => {
  it('returns the config from the active backend', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    expect(getUpdaterConfig().autoDownload).toBe(false);
  });
});

describe('isAppUpdateEligible', () => {
  it('returns true when seed falls within stagedRolloutPercent', () => {
    const info: Readonly<UpdateInfo> = { ...FULL_UPDATE_INFO, stagedRolloutPercent: 50 };
    expect(isAppUpdateEligible(info, 0.4)).toBe(true); // 0.4 * 100 = 40 < 50
  });

  it('returns false when seed is at or above stagedRolloutPercent', () => {
    const info: Readonly<UpdateInfo> = { ...FULL_UPDATE_INFO, stagedRolloutPercent: 50 };
    expect(isAppUpdateEligible(info, 0.5)).toBe(false); // 0.5 * 100 = 50, not < 50
    expect(isAppUpdateEligible(info, 0.9)).toBe(false);
  });

  it('always eligible when stagedRolloutPercent is 100', () => {
    const info: Readonly<UpdateInfo> = { ...FULL_UPDATE_INFO, stagedRolloutPercent: 100 };
    expect(isAppUpdateEligible(info, 0.99)).toBe(true);
  });

  it('never eligible when stagedRolloutPercent is 0', () => {
    const info: Readonly<UpdateInfo> = { ...FULL_UPDATE_INFO, stagedRolloutPercent: 0 };
    expect(isAppUpdateEligible(info, 0)).toBe(false);
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

describe('rollbackAppUpdate', () => {
  it('delegates to the active backend', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    rollbackAppUpdate();
    expect(backend.rolledBack).toBe(1);
  });
});

describe('setUpdaterBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setUpdaterBackend(fakeBackend());
    setUpdaterBackend(null);
    expect(getUpdaterBackend()).not.toBeNull();
  });
});

describe('setUpdaterChannel', () => {
  it('sets the channel on the active backend', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    setUpdaterChannel('alpha');
    expect(backend.getChannel()).toBe('alpha');
  });
});

describe('setUpdaterConfig', () => {
  it('forwards the config to the active backend', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    setUpdaterConfig({ allowPrerelease: true, autoDownload: true, autoInstallOnAppQuit: true });
    const config = backend.getConfig();
    expect(config.allowPrerelease).toBe(true);
    expect(config.autoDownload).toBe(true);
    expect(config.autoInstallOnAppQuit).toBe(true);
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

describe('setUpdaterSignatureConfig', () => {
  it('forwards the config to the active backend without throwing', () => {
    const backend = fakeBackend();
    setUpdaterBackend(backend);
    expect(() => setUpdaterSignatureConfig({ algorithm: 'ed25519', publicKey: 'pubkey' })).not.toThrow();
    expect(() => setUpdaterSignatureConfig(null)).not.toThrow();
  });
});

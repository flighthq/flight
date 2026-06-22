import type { ElectronApi } from './electronModule';
import { createElectronUpdaterBackend } from './updater';

function fakeElectron(): {
  electron: ElectronApi;
  listeners: Map<string, Set<(...args: unknown[]) => void>>;
  calls: { feedUrl?: string; checks: number; quit: number };
} {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const calls = { feedUrl: undefined as string | undefined, checks: 0, quit: 0 };
  const electron = {
    autoUpdater: {
      setFeedUrl: (options: { url: string }) => {
        calls.feedUrl = options.url;
      },
      checkForUpdates: () => {
        calls.checks++;
      },
      quitAndInstall: () => {
        calls.quit++;
      },
      on: (event: string, listener: (...args: unknown[]) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)?.add(listener);
      },
      removeListener: (event: string, listener: (...args: unknown[]) => void) => {
        listeners.get(event)?.delete(listener);
      },
    },
  } as unknown as ElectronApi;
  return { electron, listeners, calls };
}

function emit(listeners: Map<string, Set<(...args: unknown[]) => void>>, event: string, ...args: unknown[]): void {
  for (const listener of listeners.get(event) ?? []) listener(...args);
}

describe('createElectronUpdaterBackend', () => {
  it('drives feed URL, checks, auto-download, and quit commands', () => {
    const { electron, calls } = fakeElectron();
    const backend = createElectronUpdaterBackend(electron);
    backend.setFeedUrl('https://feed.test');
    expect(calls.feedUrl).toBe('https://feed.test');
    backend.checkForUpdates();
    backend.downloadUpdate();
    expect(calls.checks).toBe(2);
    backend.quitAndInstall();
    expect(calls.quit).toBe(1);
  });

  it('subscribeChecking and subscribeUpdateNotAvailable forward bare events', () => {
    const { electron, listeners } = fakeElectron();
    const backend = createElectronUpdaterBackend(electron);
    let checking = 0;
    let notAvailable = 0;
    const unsubA = backend.subscribeChecking(() => checking++);
    const unsubB = backend.subscribeUpdateNotAvailable(() => notAvailable++);
    emit(listeners, 'checking-for-update');
    emit(listeners, 'update-not-available');
    expect(checking).toBe(1);
    expect(notAvailable).toBe(1);
    unsubA();
    unsubB();
    emit(listeners, 'checking-for-update');
    expect(checking).toBe(1);
  });

  it('maps update-available and update-downloaded args into UpdateInfo', () => {
    const { electron, listeners } = fakeElectron();
    const backend = createElectronUpdaterBackend(electron);
    let available: unknown;
    let downloaded: unknown;
    backend.subscribeUpdateAvailable((info) => (available = info));
    backend.subscribeUpdateDownloaded((info) => (downloaded = info));
    emit(listeners, 'update-available', {}, 'release notes', '1.2.3', '2026-01-01');
    emit(listeners, 'update-downloaded', {}, 'dl notes', '4.5.6', '2026-02-02');
    expect(available).toEqual({ version: '1.2.3', notes: 'release notes', releaseDate: '2026-01-01' });
    expect(downloaded).toEqual({ version: '4.5.6', notes: 'dl notes', releaseDate: '2026-02-02' });
  });

  it('subscribeDownloadProgress is inert for the built-in updater', () => {
    const { electron, listeners } = fakeElectron();
    const backend = createElectronUpdaterBackend(electron);
    const unsubscribe = backend.subscribeDownloadProgress(() => {});
    expect(listeners.has('download-progress')).toBe(false);
    expect(() => unsubscribe()).not.toThrow();
  });

  it('subscribeError extracts a message string from the error payload', () => {
    const { electron, listeners } = fakeElectron();
    const backend = createElectronUpdaterBackend(electron);
    let message = '';
    backend.subscribeError((m) => (message = m));
    emit(listeners, 'error', new Error('boom'));
    expect(message).toBe('boom');
  });
});

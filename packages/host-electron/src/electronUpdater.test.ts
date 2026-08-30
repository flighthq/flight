import type { ElectronApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createElectronUpdaterBackend } from './electronUpdater';

type NativeListener = (...args: unknown[]) => void;

interface FakeElectronOptions {
  readonly failAttachFor?: string;
  readonly removeFailures?: Readonly<Record<string, number>>;
}

function fakeElectron(options: FakeElectronOptions = {}): {
  electron: ElectronApi;
  listeners: Map<string, Set<NativeListener>>;
  calls: {
    checks: number;
    feedUrls: string[];
    quit: number;
    remove: string[];
  };
} {
  const listeners = new Map<string, Set<NativeListener>>();
  const remainingRemoveFailures = new Map(Object.entries(options.removeFailures ?? {}));
  const calls = { checks: 0, feedUrls: [] as string[], quit: 0, remove: [] as string[] };
  const electron = {
    autoUpdater: {
      setFeedURL: ({ url }: { url: string }) => {
        calls.feedUrls.push(url);
      },
      checkForUpdates: () => {
        calls.checks++;
      },
      quitAndInstall: () => {
        calls.quit++;
      },
      on: (event: string, listener: NativeListener) => {
        if (event === options.failAttachFor) throw new Error(`attach ${event}`);
        const eventListeners = listeners.get(event) ?? new Set<NativeListener>();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
      },
      removeListener: (event: string, listener: NativeListener) => {
        calls.remove.push(event);
        const failures = remainingRemoveFailures.get(event) ?? 0;
        if (failures > 0) {
          remainingRemoveFailures.set(event, failures - 1);
          throw new Error(`remove ${event}`);
        }
        listeners.get(event)?.delete(listener);
      },
    },
  } as unknown as ElectronApi;
  return { electron, listeners, calls };
}

function emit(listeners: Map<string, Set<NativeListener>>, event: string, ...args: unknown[]): void {
  for (const listener of [...(listeners.get(event) ?? [])]) listener(...args);
}

describe('createElectronUpdaterBackend', () => {
  it('returns an Entity and applies its immutable feed policy at construction', () => {
    const { electron, calls } = fakeElectron();
    const backend = createElectronUpdaterBackend(electron, 'https://updates.test/feed');

    expect(EntityRuntimeKey in backend).toBe(true);
    expect(calls.feedUrls).toEqual(['https://updates.test/feed']);

    backend.destroy();
    expect(calls.feedUrls).toEqual(['https://updates.test/feed']);
  });

  it('runs one awaited Squirrel check through the private native event transaction', async () => {
    const { electron, listeners, calls } = fakeElectron();
    const backend = createElectronUpdaterBackend(electron);

    const pending = backend.check();
    expect(calls.checks).toBe(1);
    emit(listeners, 'checking-for-update');
    emit(listeners, 'update-available', {}, 'available notes', '1.2.3', '2026-01-01');
    emit(listeners, 'update-downloaded', {}, 'downloaded notes', '1.2.3', '2026-01-02');

    const outcome = await pending;
    expect(outcome.reason).toBe('downloaded');
    if (outcome.reason !== 'downloaded') throw new Error('expected downloaded update');
    expect(EntityRuntimeKey in outcome.update).toBe(true);
    expect(outcome.update.info).toEqual({
      downloadSizeBytes: null,
      isMandatory: null,
      minimumOsVersion: null,
      notes: 'downloaded notes',
      releaseDate: '2026-01-02',
      sha512: null,
      version: '1.2.3',
    });

    await expect(backend.install(outcome.update)).resolves.toEqual({ reason: 'ok' });
    expect(calls.quit).toBe(1);
  });

  it('copies and freezes downloaded metadata and uses null for every unknown field', async () => {
    const { electron, listeners } = fakeElectron();
    const backend = createElectronUpdaterBackend(electron);
    const nativeArgs: unknown[] = [{}, '', undefined, ''];

    const pending = backend.check();
    emit(listeners, 'update-downloaded', ...nativeArgs);
    nativeArgs[1] = 'mutated';
    nativeArgs[2] = '9.9.9';

    const outcome = await pending;
    if (outcome.reason !== 'downloaded') throw new Error('expected downloaded update');
    expect(outcome.update.info).toEqual({
      downloadSizeBytes: null,
      isMandatory: null,
      minimumOsVersion: null,
      notes: null,
      releaseDate: null,
      sha512: null,
      version: null,
    });
    expect(Object.isFrozen(outcome.update.info)).toBe(true);
    expect(Object.isFrozen(outcome.update)).toBe(true);
  });

  it('settles not-available and native error with method-tight portable outcomes', async () => {
    const first = fakeElectron();
    const notAvailable = createElectronUpdaterBackend(first.electron).check();
    emit(first.listeners, 'update-not-available');
    await expect(notAvailable).resolves.toEqual({ reason: 'not-available' });

    const second = fakeElectron();
    const failed = createElectronUpdaterBackend(second.electron).check();
    emit(second.listeners, 'error', new Error('native detail'));
    await expect(failed).resolves.toEqual({ reason: 'operation-failed' });
  });

  it('classifies a concurrent check without dispatching a second native operation', async () => {
    const { electron, listeners, calls } = fakeElectron();
    const backend = createElectronUpdaterBackend(electron);

    const first = backend.check();
    await expect(backend.check()).resolves.toEqual({ reason: 'check-in-progress' });
    expect(calls.checks).toBe(1);
    emit(listeners, 'update-not-available');
    await expect(first).resolves.toEqual({ reason: 'not-available' });
  });

  it('rolls back every listener acquired before a partial attach failure', async () => {
    const { electron, listeners, calls } = fakeElectron({ failAttachFor: 'update-not-available' });
    const backend = createElectronUpdaterBackend(electron);

    await expect(backend.check()).resolves.toEqual({ reason: 'operation-failed' });
    expect(calls.checks).toBe(0);
    expect(calls.remove).toEqual(['checking-for-update', 'update-available']);
    expect([...listeners.values()].every((eventListeners) => eventListeners.size === 0)).toBe(true);
  });

  it('attempts all sibling teardowns and retries only the listener whose removal failed', async () => {
    const { electron, listeners, calls } = fakeElectron({
      removeFailures: { 'update-available': 1 },
    });
    const backend = createElectronUpdaterBackend(electron);

    const pending = backend.check();
    emit(listeners, 'update-not-available');
    await expect(pending).resolves.toEqual({ reason: 'operation-failed' });
    expect(calls.remove).toEqual([
      'checking-for-update',
      'update-available',
      'update-not-available',
      'update-downloaded',
      'error',
    ]);

    backend.destroy();
    expect(calls.remove).toEqual([
      'checking-for-update',
      'update-available',
      'update-not-available',
      'update-downloaded',
      'error',
      'update-available',
    ]);
  });

  it('settles an in-flight transaction and deduplicates repeated provider destroy aliases', async () => {
    const { electron, calls } = fakeElectron();
    const backend = createElectronUpdaterBackend(electron);
    const pending = backend.check();

    backend.destroy();
    backend.destroy();

    await expect(pending).resolves.toEqual({ reason: 'operation-failed' });
    expect(calls.remove).toEqual([
      'checking-for-update',
      'update-available',
      'update-not-available',
      'update-downloaded',
      'error',
    ]);
    expect(calls.feedUrls).toEqual([]);
  });
});

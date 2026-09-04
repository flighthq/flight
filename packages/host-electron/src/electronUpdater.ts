import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AppUpdateCheckOutcome,
  AppUpdateInstallOutcome,
  DownloadedUpdate,
  ElectronApi,
  UpdateInfo,
  UpdaterCommandBackend,
  EntityConstruction,
} from '@flighthq/types/contract';

type NativeListener = (...args: unknown[]) => void;
type NativeCleanup = () => void;

interface CheckTransaction {
  active: boolean;
  readonly cleanups: Set<NativeCleanup>;
  readonly resolve: (outcome: AppUpdateCheckOutcome) => void;
}

const CHECK_IN_PROGRESS = Object.freeze({ reason: 'check-in-progress' }) as AppUpdateCheckOutcome;
const NOT_AVAILABLE = Object.freeze({ reason: 'not-available' }) as AppUpdateCheckOutcome;
const OPERATION_FAILED: Readonly<{ reason: 'operation-failed' }> = Object.freeze({ reason: 'operation-failed' });
const INSTALL_OK = Object.freeze({ reason: 'ok' }) as AppUpdateInstallOutcome;

export function createElectronUpdaterBackend(electron: ElectronApi, feedUrl?: string): UpdaterCommandBackend {
  const out = allocateEntity<UpdaterCommandBackend>();
  initializeElectronUpdaterBackend(out, electron, feedUrl);
  return finishEntity(out);
}

// Electron's built-in Squirrel updater downloads as part of checkForUpdates. Native events are scoped
// to one awaited transaction here and never escape as a second public event surface.
export function initializeElectronUpdaterBackend(
  out: EntityConstruction<UpdaterCommandBackend>,
  electron: ElectronApi,
  feedUrl?: string,
): void {
  const autoUpdater = electron.autoUpdater;
  const providerCleanups = new Set<NativeCleanup>();
  const downloadedUpdates = new WeakSet<DownloadedUpdate>();
  let current: CheckTransaction | null = null;
  let destroyed = false;
  if (feedUrl !== undefined) autoUpdater.setFeedURL({ url: feedUrl });
  function attach(transaction: CheckTransaction, event: string, listener: NativeListener): void {
    autoUpdater.on(event, listener);
    const cleanup = () => autoUpdater.removeListener(event, listener);
    transaction.cleanups.add(cleanup);
    providerCleanups.add(cleanup);
  }
  function release(cleanups: Set<NativeCleanup>): unknown | undefined {
    let firstError: unknown;
    let hasError = false;
    for (const cleanup of [...cleanups]) {
      try {
        cleanup();
        cleanups.delete(cleanup);
        providerCleanups.delete(cleanup);
      } catch (error) {
        if (!hasError) firstError = error;
        hasError = true;
      }
    }
    return hasError ? firstError : undefined;
  }
  function settle(transaction: CheckTransaction, outcome: AppUpdateCheckOutcome): void {
    if (!transaction.active) return;
    transaction.active = false;
    if (current === transaction) current = null;
    if (release(transaction.cleanups) !== undefined) {
      transaction.resolve(OPERATION_FAILED);
      return;
    }
    if (outcome.reason === 'downloaded') downloadedUpdates.add(outcome.update);
    transaction.resolve(outcome);
  }
  out.check = (): Promise<AppUpdateCheckOutcome> => {
    if (destroyed) return Promise.resolve(OPERATION_FAILED);
    if (current !== null) return Promise.resolve(CHECK_IN_PROGRESS);

    return new Promise((resolve) => {
      const transaction: CheckTransaction = { active: true, cleanups: new Set(), resolve };
      current = transaction;
      const activeNoop = () => {
        if (!transaction.active) return;
      };
      try {
        attach(transaction, 'checking-for-update', activeNoop);
        attach(transaction, 'update-available', activeNoop);
        attach(transaction, 'update-not-available', () => settle(transaction, NOT_AVAILABLE));
        attach(transaction, 'update-downloaded', (...args) => {
          const update = createDownloadedUpdate(args);
          settle(transaction, Object.freeze({ reason: 'downloaded', update }));
        });
        attach(transaction, 'error', () => settle(transaction, OPERATION_FAILED));
        autoUpdater.checkForUpdates();
      } catch {
        settle(transaction, OPERATION_FAILED);
      }
    });
  };
  out.destroy = (): void => {
    destroyed = true;
    const transaction = current;
    if (transaction !== null && transaction.active) {
      transaction.active = false;
      current = null;
    }
    const cleanupError = release(providerCleanups);
    transaction?.resolve(OPERATION_FAILED);
    if (cleanupError !== undefined) throw cleanupError;
  };
  out.install = async (update): Promise<AppUpdateInstallOutcome> => {
    if (destroyed || !downloadedUpdates.has(update)) return OPERATION_FAILED;
    try {
      autoUpdater.quitAndInstall();
      downloadedUpdates.delete(update);
      return INSTALL_OK;
    } catch {
      return OPERATION_FAILED;
    }
  };
}

// Electron emits (event, releaseNotes, releaseName, releaseDate). Every richer metadata field remains
// explicitly unknown because the built-in updater does not prove it.
function createDownloadedUpdate(args: readonly unknown[]): DownloadedUpdate {
  const info: Readonly<UpdateInfo> = Object.freeze({
    downloadSizeBytes: null,
    isMandatory: null,
    minimumOsVersion: null,
    notes: knownString(args[1]),
    releaseDate: knownString(args[3]),
    sha512: null,
    version: knownString(args[2]),
  });
  return Object.freeze(
    (() => {
      const out = allocateEntity<DownloadedUpdate>();
      out.info = info;
      return finishEntity(out);
    })(),
  );
}

function knownString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

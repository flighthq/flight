import type {
  AppUpdateCheckOutcome,
  AppUpdateInstallOutcome,
  DownloadedUpdate,
  HasUpdaterCommand,
  UpdaterCommandBackend,
} from '@flighthq/types/contract';

const CHECK_IN_PROGRESS = Object.freeze({ reason: 'check-in-progress' }) as AppUpdateCheckOutcome;
const NOT_AVAILABLE = Object.freeze({ reason: 'not-available' }) as AppUpdateCheckOutcome;
const OPERATION_FAILED: Readonly<{ reason: 'operation-failed' }> = Object.freeze({ reason: 'operation-failed' });
const INSTALL_OK = Object.freeze({ reason: 'ok' }) as AppUpdateInstallOutcome;
const _downloadOwners = new WeakMap<DownloadedUpdate, UpdaterCommandBackend>();

export async function checkForAppUpdate(host: HasUpdaterCommand): Promise<AppUpdateCheckOutcome> {
  const provider = host.updater.command;
  try {
    const outcome = await host.updater.command.check();
    switch (outcome.reason) {
      case 'check-in-progress':
        return CHECK_IN_PROGRESS;
      case 'not-available':
        return NOT_AVAILABLE;
      case 'operation-failed':
        return OPERATION_FAILED;
      case 'downloaded': {
        const existingOwner = _downloadOwners.get(outcome.update);
        if (existingOwner !== undefined && existingOwner !== provider) return OPERATION_FAILED;
        _downloadOwners.set(outcome.update, provider);
        return Object.freeze({ reason: 'downloaded', update: outcome.update });
      }
      default:
        return OPERATION_FAILED;
    }
  } catch {
    return OPERATION_FAILED;
  }
}

export function destroyUpdater(host: HasUpdaterCommand): void {
  assertSyncVoid(host.updater.command.destroy());
}

export async function installDownloadedUpdate(
  host: HasUpdaterCommand,
  update: DownloadedUpdate,
): Promise<AppUpdateInstallOutcome> {
  const origin = _downloadOwners.get(update);
  if (origin === undefined) throw new TypeError('Downloaded update did not originate from a completed check');

  try {
    // Keep the direct Host capability path visible while still honoring the handle's exact origin after
    // provider replacement. A different selected provider never observes the downloaded handle.
    const outcome =
      host.updater.command === origin ? await host.updater.command.install(update) : await origin.install(update);
    if (outcome.reason !== 'ok') return OPERATION_FAILED;
    _downloadOwners.delete(update);
    return INSTALL_OK;
  } catch {
    return OPERATION_FAILED;
  }
}

type IsAny<T> = 0 extends 1 & T ? true : false;
function assertSyncVoid<T>(value: T & (IsAny<T> extends true ? never : T extends void ? unknown : never)): void {
  void value;
}

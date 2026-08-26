import { setAppBackend } from '@flighthq/app/contract';
import { setWindowBackend } from '@flighthq/application/contract';
import { setClipboardBackend } from '@flighthq/clipboard/contract';
import { setDialogBackend } from '@flighthq/dialog/contract';
import { setIpcBackend } from '@flighthq/ipc/contract';
import { setMenuBackend } from '@flighthq/menu/contract';
import { setNotificationBackend } from '@flighthq/notification/contract';
import { setPlatformBackend } from '@flighthq/platform/contract';
import { setPowerBackend } from '@flighthq/power/contract';
import { setProtocolBackend } from '@flighthq/protocol/contract';
import { setScreenBackend } from '@flighthq/screen/contract';
import { setShellBackend } from '@flighthq/shell/contract';
import { setShortcutBackend } from '@flighthq/shortcut/contract';
import { setStorageBackend } from '@flighthq/storage/contract';
import { setTrayBackend } from '@flighthq/tray/contract';
import type { ElectronApi, ElectronBackendOptions } from '@flighthq/types/contract';
import { setUpdaterBackend } from '@flighthq/updater/contract';

import { createElectronAppBackend } from './electronApp';
import { createElectronClipboardBackend } from './electronClipboard';
import { createElectronDialogBackend } from './electronDialog';
import { createElectronIpcBackend } from './electronIpc';
import { createElectronMenuBackend } from './electronMenu';
import { createElectronNotificationBackend } from './electronNotification';
import { createElectronPlatformBackend } from './electronPlatform';
import { createElectronPowerBackend } from './electronPower';
import { createElectronProtocolBackend } from './electronProtocol';
import { createElectronScreenBackend } from './electronScreen';
import { createElectronShellBackend } from './electronShell';
import { createElectronShortcutBackend } from './electronShortcut';
import { createElectronStorageBackend } from './electronStorage';
import { createElectronTrayBackend } from './electronTray';
import { createElectronUpdaterBackend } from './electronUpdater';
import { createElectronWindowBackend } from './electronWindow';

// Installs every Electron host backend into its capability package in one call. Run this once in the
// Electron main process, passing the `electron` module plus the real node:fs module (needed for the
// storage backend):
//
//   import * as electron from 'electron';
//   import * as fs from 'node:fs';
//   const electronApi: ElectronApi = { ...electron, fs, Tray: electron.Tray as ElectronApi['Tray'] };
//   registerElectronBackends(electronApi);
//
// After this, the platform/app/window seams resolve to their Electron implementations instead of the
// web defaults. Each set*Backend(null) (per package) reverts to the web default; there is no bulk
// unregister because backends are independent — clear the ones you replaced.
export function registerElectronBackends(electron: ElectronApi, options: Readonly<ElectronBackendOptions> = {}): void {
  setPlatformBackend(createElectronPlatformBackend(electron));
  setAppBackend(createElectronAppBackend(electron));
  setWindowBackend(createElectronWindowBackend(electron));
  setDialogBackend(createElectronDialogBackend(electron));
  setClipboardBackend(createElectronClipboardBackend(electron));
  setMenuBackend(createElectronMenuBackend(electron));
  setTrayBackend(createElectronTrayBackend(electron));
  setShortcutBackend(createElectronShortcutBackend(electron));
  setScreenBackend(createElectronScreenBackend(electron));
  setPowerBackend(createElectronPowerBackend(electron));
  setNotificationBackend(createElectronNotificationBackend(electron));
  setShellBackend(createElectronShellBackend(electron));
  setStorageBackend(createElectronStorageBackend(electron, options.storageFileName));
  setProtocolBackend(createElectronProtocolBackend(electron));
  setUpdaterBackend(createElectronUpdaterBackend(electron));
  setIpcBackend(createElectronIpcBackend(electron));
}

import { setAppBackend } from '@flighthq/app';
import { setWindowBackend } from '@flighthq/application';
import { setClipboardBackend } from '@flighthq/clipboard';
import { setDialogBackend } from '@flighthq/dialog';
import { setIpcBackend } from '@flighthq/ipc';
import { setMenuBackend } from '@flighthq/menu';
import { setNotificationBackend } from '@flighthq/notification';
import { setPlatformBackend } from '@flighthq/platform';
import { setPowerBackend } from '@flighthq/power';
import { setProtocolBackend } from '@flighthq/protocol';
import { setScreenBackend } from '@flighthq/screen';
import { setShellBackend } from '@flighthq/shell';
import { setShortcutBackend } from '@flighthq/shortcut';
import { setStorageBackend } from '@flighthq/storage';
import { setTrayBackend } from '@flighthq/tray';
import { setUpdaterBackend } from '@flighthq/updater';

import { createElectronAppBackend } from './electronApp';
import { createElectronClipboardBackend } from './electronClipboard';
import { createElectronDialogBackend } from './electronDialog';
import { createElectronIpcBackend } from './electronIpc';
import { createElectronMenuBackend } from './electronMenu';
import type { ElectronApi } from './electronModule';
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

export interface ElectronBackendOptions {
  storageFileName?: string;
}

// Installs every Electron host backend into its capability package in one call. Run this once in the
// Electron main process, passing the `electron` module plus the real node:fs module (needed for the
// storage backend):
//
//   import * as electron from 'electron';
//   import * as fs from 'node:fs';
//   registerElectronBackends({ ...electron, fs });
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

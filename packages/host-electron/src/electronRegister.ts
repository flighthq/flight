import { setAppBackend } from '@flighthq/app/contract';
import { setClipboardBackend } from '@flighthq/clipboard/contract';
import { createEntity } from '@flighthq/entity/contract';
import { setIpcBackend } from '@flighthq/ipc/contract';
import { setMenuBackend } from '@flighthq/menu/contract';
import { setPlatformBackend } from '@flighthq/platform/contract';
import { setPowerBackend } from '@flighthq/power/contract';
import { setProtocolBackend } from '@flighthq/protocol/contract';
import { setScreenBackend } from '@flighthq/screen/contract';
import { setShellBackend } from '@flighthq/shell/contract';
import { setShortcutBackend } from '@flighthq/shortcut/contract';
import { setStorageBackend } from '@flighthq/storage/contract';
import { setTrayBackend } from '@flighthq/tray/contract';
import type {
  ElectronApi,
  ElectronBackendOptions,
  HasDialogFile,
  HasDialogMessage,
  HasNotificationAction,
  HasNotificationClick,
  HasNotificationClose,
  HasNotificationDelivery,
  HasNotificationDismiss,
  HasNotificationShow,
  HasWindowAttach,
  HasWindowOpen,
  Host,
} from '@flighthq/types/contract';
import { setUpdaterBackend } from '@flighthq/updater/contract';

import { createElectronAppBackend } from './electronApp';
import { createElectronClipboardBackend } from './electronClipboard';
import { createElectronFileDialogBackend, createElectronMessageDialogBackend } from './electronDialog';
import { createElectronIpcBackend } from './electronIpc';
import { createElectronMenuBackend } from './electronMenu';
import { createElectronNotificationCapabilities } from './electronNotification';
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

// Builds the explicit Electron host and installs capabilities that have not yet migrated from their
// package-local seams. Run this once in the Electron main process, passing the `electron` module plus
// the real node:fs module (needed for the storage backend):
//
//   import * as electron from 'electron';
//   import * as fs from 'node:fs';
//   const electronApi: ElectronApi = { ...electron, fs, Tray: electron.Tray as ElectronApi['Tray'] };
//   registerElectronBackends(electronApi);
//
// Pass the returned host to window, dialog, and notification operations. The remaining set*Backend(null) package seams
// revert independently; there is no bulk unregister because those backends are independent.
export function registerElectronBackends(
  electron: ElectronApi,
  options: Readonly<ElectronBackendOptions> = {},
): Host &
  HasDialogFile &
  HasDialogMessage &
  HasNotificationAction &
  HasNotificationClick &
  HasNotificationClose &
  HasNotificationDelivery &
  HasNotificationDismiss &
  HasNotificationShow &
  HasWindowAttach &
  HasWindowOpen {
  const dialog = {
    file: createElectronFileDialogBackend(electron),
    message: createElectronMessageDialogBackend(electron),
  };
  const notification = createElectronNotificationCapabilities(electron);
  const window = createElectronWindowBackend(electron);
  setPlatformBackend(createElectronPlatformBackend(electron));
  setAppBackend(createElectronAppBackend(electron));
  setClipboardBackend(createElectronClipboardBackend(electron));
  setMenuBackend(createElectronMenuBackend(electron));
  setTrayBackend(createElectronTrayBackend(electron));
  setShortcutBackend(createElectronShortcutBackend(electron));
  setScreenBackend(createElectronScreenBackend(electron));
  setPowerBackend(createElectronPowerBackend(electron));
  setShellBackend(createElectronShellBackend(electron));
  setStorageBackend(createElectronStorageBackend(electron, options.storageFileName));
  setProtocolBackend(createElectronProtocolBackend(electron));
  setUpdaterBackend(createElectronUpdaterBackend(electron));
  setIpcBackend(createElectronIpcBackend(electron));
  return createEntity({
    accessibility: {},
    app: {},
    dialog,
    graphics: {},
    input: {},
    media: {},
    net: {},
    notification,
    storage: {},
    system: {},
    text: {},
    ui: {},
    window,
  });
}

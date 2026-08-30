import { setAppBackend } from '@flighthq/app/contract';
import { createEntity } from '@flighthq/entity/contract';
import { setIpcBackend } from '@flighthq/ipc/contract';
import { setPlatformBackend } from '@flighthq/platform/contract';
import { setPowerBackend } from '@flighthq/power/contract';
import { setProtocolBackend } from '@flighthq/protocol/contract';
import { setShellBackend } from '@flighthq/shell/contract';
import { setShortcutBackend } from '@flighthq/shortcut/contract';
import { setStorageBackend } from '@flighthq/storage/contract';
import { setTrayBackend } from '@flighthq/tray/contract';
import type {
  ElectronApi,
  ElectronBackendOptions,
  EntityRuntimeKey,
  HasClipboardBookmark,
  HasClipboardFormats,
  HasClipboardImage,
  HasClipboardText,
  HasDialogFile,
  HasDialogMessage,
  HasNotificationAction,
  HasNotificationClick,
  HasNotificationClose,
  HasNotificationDelivery,
  HasNotificationDismiss,
  HasNotificationShow,
  HasScreenChange,
  HasScreenQuery,
  HasMenuApplication,
  HasMenuPopup,
  HasMenuSelect,
  HasWindowAttach,
  HasWindowOpen,
  Host,
} from '@flighthq/types/contract';
import { setUpdaterBackend } from '@flighthq/updater/contract';

import { createElectronAppBackend } from './electronApp';
import { createElectronClipboardBackend } from './electronClipboard';
import { createElectronFileDialogBackend, createElectronMessageDialogBackend } from './electronDialog';
import { createElectronIpcBackend } from './electronIpc';
import { createElectronMenuBackends } from './electronMenu';
import { createElectronNotificationCapabilities } from './electronNotification';
import { createElectronPlatformBackend } from './electronPlatform';
import { createElectronPowerBackend } from './electronPower';
import { createElectronProtocolBackend } from './electronProtocol';
import { createElectronScreenCapabilities } from './electronScreen';
import { createElectronShellBackend } from './electronShell';
import { createElectronShortcutBackend } from './electronShortcut';
import { createElectronStorageBackend } from './electronStorage';
import { createElectronTrayBackend } from './electronTray';
import { createElectronUpdaterBackend } from './electronUpdater';
import { createElectronWindowBackend } from './electronWindow';

type ElectronHost = Host &
  HasClipboardBookmark &
  HasClipboardFormats &
  HasClipboardImage &
  HasClipboardText &
  HasDialogFile &
  HasDialogMessage &
  HasNotificationAction &
  HasNotificationClick &
  HasNotificationClose &
  HasNotificationDelivery &
  HasNotificationDismiss &
  HasNotificationShow &
  HasMenuApplication &
  HasMenuPopup &
  HasMenuSelect &
  HasScreenChange &
  HasScreenQuery &
  HasWindowAttach &
  HasWindowOpen;

// Builds the explicit Electron host and installs capabilities that have not yet migrated from their
// package-local seams. Run this once in the Electron main process, passing the `electron` module plus
// the real node:fs module (needed for the storage backend):
//
//   import * as electron from 'electron';
//   import * as fs from 'node:fs';
//   const electronApi: ElectronApi = { ...electron, fs, Tray: electron.Tray as ElectronApi['Tray'] };
//   registerElectronBackends(electronApi);
//
// Pass the returned host to clipboard, window, dialog, and notification operations. The remaining set*Backend(null)
// package seams revert independently; there is no bulk unregister because those backends are independent.
export function registerElectronBackends(
  electron: ElectronApi,
  options: Readonly<ElectronBackendOptions> = {},
): ElectronHost {
  const clipboard = createElectronClipboardBackend(electron);
  const dialog = {
    file: createElectronFileDialogBackend(electron),
    message: createElectronMessageDialogBackend(electron),
  };
  const notification = createElectronNotificationCapabilities(electron);
  const screen = createElectronScreenCapabilities(electron);
  const menu = createElectronMenuBackends(electron);
  const window = createElectronWindowBackend(electron);
  setPlatformBackend(createElectronPlatformBackend(electron));
  setAppBackend(createElectronAppBackend(electron));
  setTrayBackend(createElectronTrayBackend(electron));
  setShortcutBackend(createElectronShortcutBackend(electron));
  setPowerBackend(createElectronPowerBackend(electron));
  setShellBackend(createElectronShellBackend(electron));
  setStorageBackend(createElectronStorageBackend(electron, options.storageFileName));
  setProtocolBackend(createElectronProtocolBackend(electron));
  setUpdaterBackend(createElectronUpdaterBackend(electron));
  setIpcBackend(createElectronIpcBackend(electron));
  return createEntity({
    accessibility: {},
    app: {},
    clipboard: { bookmark: clipboard, formats: clipboard, image: clipboard, text: clipboard },
    dialog,
    graphics: {},
    input: {},
    media: {},
    menu,
    net: {},
    notification,
    screen,
    share: {},
    storage: {},
    system: {},
    text: {},
    ui: {},
    window,
  } satisfies Omit<ElectronHost, typeof EntityRuntimeKey>);
}

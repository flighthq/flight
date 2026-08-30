import { setAppBackend } from '@flighthq/app/contract';
import { createEntity } from '@flighthq/entity/contract';
import { setPlatformBackend } from '@flighthq/platform/contract';
import { setProtocolBackend } from '@flighthq/protocol/contract';
import { setTrayBackend } from '@flighthq/tray/contract';
import type {
  ElectronApi,
  ElectronBackendOptions,
  EntityRuntimeKey,
  HasClipboardBookmark,
  HasClipboardFormats,
  HasClipboardImage,
  HasClipboardText,
  HasDialogDirectoryOpen,
  HasDialogFileOpen,
  HasDialogFileSave,
  HasDialogMessage,
  HasNotificationAction,
  HasNotificationClick,
  HasNotificationClose,
  HasNotificationDelivery,
  HasNotificationDismiss,
  HasNotificationShow,
  HasIpcMessage,
  HasScreenChange,
  HasScreenQuery,
  HasShortcutQuery,
  HasShortcutTrigger,
  HasUpdaterCommand,
  HasMenuApplication,
  HasMenuPopup,
  HasMenuSelect,
  HasStorageLocal,
  HasShellBeep,
  HasShellExternal,
  HasShellPathOpen,
  HasShellPathReveal,
  HasShellTrash,
  HasWindowAttach,
  HasWindowOpen,
  Host,
} from '@flighthq/types/contract';

import { createElectronAppBackend } from './electronApp';
import { createElectronClipboardBackend } from './electronClipboard';
import {
  createElectronDirectoryOpenDialogBackend,
  createElectronFileOpenDialogBackend,
  createElectronFileSaveDialogBackend,
  createElectronMessageDialogBackend,
} from './electronDialog';
import { createElectronIpcMessageBackend } from './electronIpc';
import { createElectronMenuBackends } from './electronMenu';
import { createElectronNotificationCapabilities } from './electronNotification';
import { createElectronPlatformBackend } from './electronPlatform';
import { createElectronPowerBackends } from './electronPower';
import { createElectronProtocolBackend } from './electronProtocol';
import { createElectronScreenCapabilities } from './electronScreen';
import { makeElectronShellCapabilities } from './electronShell';
import { createElectronShortcutQueryBackend, createElectronShortcutTriggerBackend } from './electronShortcut';
import { createElectronStorageBackend } from './electronStorage';
import { createElectronTrayBackend } from './electronTray';
import { createElectronUpdaterBackend } from './electronUpdater';
import { createElectronWindowBackend } from './electronWindow';

type ElectronHost = Host &
  HasClipboardBookmark &
  HasClipboardFormats &
  HasClipboardImage &
  HasClipboardText &
  HasDialogDirectoryOpen &
  HasDialogFileOpen &
  HasDialogFileSave &
  HasDialogMessage &
  HasNotificationAction &
  HasNotificationClick &
  HasNotificationClose &
  HasNotificationDelivery &
  HasNotificationDismiss &
  HasNotificationShow &
  HasMenuApplication &
  HasMenuPopup &
  HasIpcMessage &
  HasMenuSelect &
  HasScreenChange &
  HasScreenQuery &
  HasShortcutQuery &
  HasShortcutTrigger &
  HasStorageLocal &
  HasUpdaterCommand &
  HasShellBeep &
  HasShellExternal &
  HasShellPathOpen &
  HasShellPathReveal &
  HasShellTrash &
  HasWindowAttach &
  HasWindowOpen;

// Builds the explicit Electron host and installs capabilities that have not yet migrated from their
// package-local seams. Run this once in the Electron main process, passing the `electron` module plus
// the real node:fs module (needed for the storage backend):
//
//   import * as electron from 'electron';
//   import * as fs from 'node:fs';
//   const electronApi: ElectronApi = { ...electron, fs, Tray: electron.Tray as ElectronApi['Tray'] };
//   registerElectronBackends(electronApi, { platform: 'windows' });
//
// Pass the returned host to clipboard, window, dialog, notification, and storage operations. Remaining
// ambient package seams revert independently; there is no bulk unregister for those independent backends.
export function registerElectronBackends(
  electron: ElectronApi,
  options: Readonly<ElectronBackendOptions>,
): ElectronHost {
  const clipboard = createElectronClipboardBackend(electron);
  const dialog = {
    directoryOpen: createElectronDirectoryOpenDialogBackend(electron),
    fileOpen: createElectronFileOpenDialogBackend(electron),
    fileSave: createElectronFileSaveDialogBackend(electron),
    message: createElectronMessageDialogBackend(electron),
  };
  const notification = createElectronNotificationCapabilities(electron);
  const screen = createElectronScreenCapabilities(electron);
  const ipc = { message: createElectronIpcMessageBackend(electron) };
  const query = createElectronShortcutQueryBackend(electron);
  const trigger = createElectronShortcutTriggerBackend(electron);
  const menu = createElectronMenuBackends(electron);
  const power = createElectronPowerBackends(electron);
  const storage = createElectronStorageBackend(electron, options.storageFileName);
  const updater = createElectronUpdaterBackend(electron, options.updaterFeedUrl);
  const shell = makeElectronShellCapabilities(electron, options.platform);
  const window = createElectronWindowBackend(electron);
  setPlatformBackend(createElectronPlatformBackend(electron));
  setAppBackend(createElectronAppBackend(electron));
  setTrayBackend(createElectronTrayBackend(electron));
  setProtocolBackend(createElectronProtocolBackend(electron));
  return createEntity({
    accessibility: {},
    app: {},
    clipboard: { bookmark: clipboard, formats: clipboard, image: clipboard, text: clipboard },
    connectivity: {},
    dialog,
    graphics: {},
    input: {},
    ipc,
    media: {},
    menu,
    net: {},
    power,
    notification,
    shortcut: { query, trigger },
    screen,
    share: {},
    shell,
    storage: { local: storage },
    system: {},
    text: {},
    ui: {},
    updater: { command: updater },
    window,
  } satisfies Omit<ElectronHost, typeof EntityRuntimeKey>);
}

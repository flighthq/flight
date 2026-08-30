import { setAppBackend } from '@flighthq/app/contract';
import { createEntity } from '@flighthq/entity/contract';
import { setPlatformBackend } from '@flighthq/platform/contract';
import { setShortcutBackend } from '@flighthq/shortcut/contract';
import { setTrayBackend } from '@flighthq/tray/contract';
import type {
  EntityRuntimeKey,
  HasClipboardText,
  HasDialogDirectoryOpen,
  HasDialogFileOpen,
  HasDialogFileSave,
  HasDialogMessage,
  HasNotificationDelivery,
  HasShellExternal,
  HasShellPathOpen,
  HasShellPathReveal,
  HasMenuApplication,
  HasMenuPopup,
  HasMenuSelect,
  HasWindowAttach,
  HasWindowOpen,
  Host,
  TauriApi,
} from '@flighthq/types/contract';

import { createTauriAppBackend } from './tauriApp';
import { createTauriClipboardBackend } from './tauriClipboard';
import {
  createTauriDirectoryOpenDialogBackend,
  createTauriFileOpenDialogBackend,
  createTauriFileSaveDialogBackend,
  createTauriMessageDialogBackend,
} from './tauriDialog';
import { createTauriMenuBackends } from './tauriMenu';
import { createTauriNotificationCapabilities } from './tauriNotification';
import { createTauriPlatformBackend } from './tauriPlatform';
import { makeTauriShellCapabilities } from './tauriShell';
import { createTauriShortcutBackend } from './tauriShortcut';
import { createTauriTrayBackend } from './tauriTray';
import { createTauriWindowBackend } from './tauriWindow';

type TauriHost = Host &
  HasClipboardText &
  HasDialogDirectoryOpen &
  HasDialogFileOpen &
  HasDialogFileSave &
  HasDialogMessage &
  HasMenuApplication &
  HasMenuPopup &
  HasMenuSelect &
  HasNotificationDelivery &
  HasShellExternal &
  HasShellPathOpen &
  HasShellPathReveal &
  HasWindowAttach &
  HasWindowOpen;

// Builds the explicit Tauri host and installs capabilities that have not yet migrated from their
// package-local seams. Run this once at app startup, passing an object that aggregates the Tauri v2 JS
// API modules and plugins the seams use:
//
//   import * as app from '@tauri-apps/api/app';
//   // …import the other modules/plugins…
//   registerTauriBackends({ app, window, menu, tray, clipboard, dialog, notification, opener, os, globalShortcut, process });
//
// Pass the returned host to clipboard, menu, window, dialog, and notification operations. Unmigrated
// seams Tauri does not cover here (storage, protocol, ipc, power, screen) retain their web
// defaults because a Tauri app runs in a webview; each set*Backend(null) still reverts one of those.
export function registerTauriBackends(tauri: TauriApi): TauriHost {
  const clipboard = createTauriClipboardBackend(tauri);
  const dialog = {
    directoryOpen: createTauriDirectoryOpenDialogBackend(tauri),
    fileOpen: createTauriFileOpenDialogBackend(tauri),
    fileSave: createTauriFileSaveDialogBackend(tauri),
    message: createTauriMessageDialogBackend(tauri),
  };
  const notification = createTauriNotificationCapabilities(tauri);
  const menu = createTauriMenuBackends(tauri);
  const shell = makeTauriShellCapabilities(tauri);
  const window = createTauriWindowBackend(tauri);
  setPlatformBackend(createTauriPlatformBackend(tauri));
  setAppBackend(createTauriAppBackend(tauri));
  setTrayBackend(createTauriTrayBackend(tauri));
  setShortcutBackend(createTauriShortcutBackend(tauri));
  return createEntity({
    accessibility: {},
    app: {},
    clipboard: { text: clipboard },
    connectivity: {},
    dialog,
    graphics: {},
    input: {},
    media: {},
    menu,
    net: {},
    // No power provider: Tauri exposes no battery, idle, session-lock, thermal or keep-awake
    // API through the seams this host wires. The group is empty rather than stubbed.
    power: {},
    notification,
    screen: {},
    share: {},
    shell,
    storage: {},
    system: {},
    text: {},
    ui: {},
    // This injected Tauri API exposes no updater plugin, so no transaction provider is claimed.
    updater: {},
    window,
  } satisfies Omit<TauriHost, typeof EntityRuntimeKey>);
}

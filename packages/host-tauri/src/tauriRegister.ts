import { setAppBackend } from '@flighthq/app/contract';
import { createEntity } from '@flighthq/entity/contract';
import { setPlatformBackend } from '@flighthq/platform/contract';
import { setShellBackend } from '@flighthq/shell/contract';
import { setShortcutBackend } from '@flighthq/shortcut/contract';
import { setTrayBackend } from '@flighthq/tray/contract';
import type {
  EntityRuntimeKey,
  HasClipboardText,
  HasDialogFile,
  HasDialogMessage,
  HasNotificationDelivery,
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
import { createTauriFileDialogBackend, createTauriMessageDialogBackend } from './tauriDialog';
import { createTauriMenuBackends } from './tauriMenu';
import { createTauriNotificationCapabilities } from './tauriNotification';
import { createTauriPlatformBackend } from './tauriPlatform';
import { createTauriShellBackend } from './tauriShell';
import { createTauriShortcutBackend } from './tauriShortcut';
import { createTauriTrayBackend } from './tauriTray';
import { createTauriWindowBackend } from './tauriWindow';

type TauriHost = Host &
  HasClipboardText &
  HasDialogFile &
  HasDialogMessage &
  HasMenuApplication &
  HasMenuPopup &
  HasMenuSelect &
  HasNotificationDelivery &
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
// seams Tauri does not cover here (storage, protocol, updater, ipc, power, screen) retain their web
// defaults because a Tauri app runs in a webview; each set*Backend(null) still reverts one of those.
export function registerTauriBackends(tauri: TauriApi): TauriHost {
  const clipboard = createTauriClipboardBackend(tauri);
  const dialog = {
    file: createTauriFileDialogBackend(tauri),
    message: createTauriMessageDialogBackend(tauri),
  };
  const notification = createTauriNotificationCapabilities(tauri);
  const menu = createTauriMenuBackends(tauri);
  const window = createTauriWindowBackend(tauri);
  setPlatformBackend(createTauriPlatformBackend(tauri));
  setAppBackend(createTauriAppBackend(tauri));
  setTrayBackend(createTauriTrayBackend(tauri));
  setShortcutBackend(createTauriShortcutBackend(tauri));
  setShellBackend(createTauriShellBackend(tauri));
  return createEntity({
    accessibility: {},
    app: {},
    clipboard: { text: clipboard },
    dialog,
    graphics: {},
    input: {},
    media: {},
    menu,
    net: {},
    notification,
    screen: {},
    share: {},
    storage: {},
    system: {},
    text: {},
    ui: {},
    window,
  } satisfies Omit<TauriHost, typeof EntityRuntimeKey>);
}

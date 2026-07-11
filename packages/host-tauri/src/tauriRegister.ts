import { setAppBackend } from '@flighthq/app';
import { setWindowBackend } from '@flighthq/application';
import { setClipboardBackend } from '@flighthq/clipboard';
import { setDialogBackend } from '@flighthq/dialog';
import { setMenuBackend } from '@flighthq/menu';
import { setNotificationBackend } from '@flighthq/notification';
import { setPlatformBackend } from '@flighthq/platform';
import { setShellBackend } from '@flighthq/shell';
import { setShortcutBackend } from '@flighthq/shortcut';
import { setTrayBackend } from '@flighthq/tray';

import { createTauriAppBackend } from './tauriApp';
import { createTauriClipboardBackend } from './tauriClipboard';
import { createTauriDialogBackend } from './tauriDialog';
import { createTauriMenuBackend } from './tauriMenu';
import type { TauriApi } from './tauriModule';
import { createTauriNotificationBackend } from './tauriNotification';
import { createTauriPlatformBackend } from './tauriPlatform';
import { createTauriShellBackend } from './tauriShell';
import { createTauriShortcutBackend } from './tauriShortcut';
import { createTauriTrayBackend } from './tauriTray';
import { createTauriWindowBackend } from './tauriWindow';

// Installs every Tauri host backend into its capability package in one call. Run this once at app
// startup, passing an object that aggregates the Tauri v2 JS API modules and plugins the seams use:
//
//   import * as app from '@tauri-apps/api/app';
//   // …import the other modules/plugins…
//   registerTauriBackends({ app, window, menu, tray, clipboard, dialog, notification, opener, os, globalShortcut, process });
//
// After this, the covered platform/app/window seams resolve to their Tauri implementations instead of
// the web defaults. Seams Tauri does not cover here (storage, protocol, updater, ipc, power, screen)
// are intentionally left registered to their web defaults — a Tauri app runs in a webview, so those
// defaults (e.g. localStorage) keep working. Each set*Backend(null) reverts one capability to web.
export function registerTauriBackends(tauri: TauriApi): void {
  setPlatformBackend(createTauriPlatformBackend(tauri));
  setAppBackend(createTauriAppBackend(tauri));
  setWindowBackend(createTauriWindowBackend(tauri));
  setDialogBackend(createTauriDialogBackend(tauri));
  setClipboardBackend(createTauriClipboardBackend(tauri));
  setMenuBackend(createTauriMenuBackend(tauri));
  setTrayBackend(createTauriTrayBackend(tauri));
  setShortcutBackend(createTauriShortcutBackend(tauri));
  setNotificationBackend(createTauriNotificationBackend(tauri));
  setShellBackend(createTauriShellBackend(tauri));
}

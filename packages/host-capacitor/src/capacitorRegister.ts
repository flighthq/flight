import { setAppBackend } from '@flighthq/app';
import { setClipboardBackend } from '@flighthq/clipboard';
import { setConnectivityBackend } from '@flighthq/connectivity';
import { setDeviceBackend } from '@flighthq/device';
import { setDialogBackend } from '@flighthq/dialog';
import { setFileSystemBackend } from '@flighthq/filesystem';
import { setGeolocationBackend } from '@flighthq/geolocation';
import { setHapticsBackend } from '@flighthq/haptics';
import { setSoftKeyboardBackend } from '@flighthq/keyboard';
import { setNotificationBackend } from '@flighthq/notification';
import { setShareBackend } from '@flighthq/share';
import { setStatusBarBackend } from '@flighthq/statusbar';

import { createCapacitorAppBackend } from './capacitorApp';
import { createCapacitorClipboardBackend } from './capacitorClipboard';
import { createCapacitorConnectivityBackend } from './capacitorConnectivity';
import { createCapacitorDeviceBackend } from './capacitorDevice';
import { createCapacitorDialogBackend } from './capacitorDialog';
import { createCapacitorFileSystemBackend } from './capacitorFileSystem';
import { createCapacitorGeolocationBackend } from './capacitorGeolocation';
import { createCapacitorHapticsBackend } from './capacitorHaptics';
import { createCapacitorKeyboardBackend } from './capacitorKeyboard';
import type { CapacitorApi } from './capacitorModule';
import { createCapacitorNotificationBackend } from './capacitorNotification';
import { createCapacitorShareBackend } from './capacitorShare';
import { createCapacitorStatusBarBackend } from './capacitorStatusBar';

// Installs every Capacitor host backend into its capability package in one call. Run this once at app
// startup, passing an object that aggregates the official Capacitor plugin objects the seams use:
//
//   import { App } from '@capacitor/app';
//   // …import the other plugins…
//   registerCapacitorBackends({ app: App, clipboard: Clipboard, /* … */ statusBar: StatusBar });
//
// After this, the covered mobile seams resolve to their Capacitor implementations instead of the web
// defaults. Seams outside Capacitor's mobile model (window, menu, tray, shortcut, updater, protocol, ipc,
// power, screen, net) are intentionally left registered to their web defaults — a Capacitor app runs in a
// webview, so those defaults keep working. Storage is deliberately not adapted: `StorageBackend` is
// synchronous but `@capacitor/preferences` is async (an unbridgeable mismatch), so localStorage — which
// works in the webview — remains the storage backend. Each set*Backend(null) reverts one capability to web.
export function registerCapacitorBackends(capacitor: CapacitorApi): void {
  setAppBackend(createCapacitorAppBackend(capacitor));
  setClipboardBackend(createCapacitorClipboardBackend(capacitor));
  setConnectivityBackend(createCapacitorConnectivityBackend(capacitor));
  setDeviceBackend(createCapacitorDeviceBackend(capacitor));
  setDialogBackend(createCapacitorDialogBackend(capacitor));
  setFileSystemBackend(createCapacitorFileSystemBackend(capacitor));
  setGeolocationBackend(createCapacitorGeolocationBackend(capacitor));
  setHapticsBackend(createCapacitorHapticsBackend(capacitor));
  setNotificationBackend(createCapacitorNotificationBackend(capacitor));
  setShareBackend(createCapacitorShareBackend(capacitor));
  setSoftKeyboardBackend(createCapacitorKeyboardBackend(capacitor));
  setStatusBarBackend(createCapacitorStatusBarBackend(capacitor));
}

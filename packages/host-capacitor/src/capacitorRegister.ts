import { setAppBackend } from '@flighthq/app/contract';
import { setClipboardBackend } from '@flighthq/clipboard/contract';
import { setConnectivityBackend } from '@flighthq/connectivity/contract';
import { setDeviceBackend } from '@flighthq/device/contract';
import { setFileSystemBackend } from '@flighthq/filesystem/contract';
import { setGeolocationBackend } from '@flighthq/geolocation/contract';
import { setHapticsBackend } from '@flighthq/haptics/contract';
import { setSoftKeyboardBackend } from '@flighthq/keyboard/contract';
import { setNotificationBackend } from '@flighthq/notification/contract';
import { setShareBackend } from '@flighthq/share/contract';
import { setStatusBarBackend } from '@flighthq/statusbar/contract';
import type { CapacitorApi, HasDialogMessage, HasDialogPrompt } from '@flighthq/types/contract';

import { createCapacitorAppBackend } from './capacitorApp';
import { createCapacitorClipboardBackend } from './capacitorClipboard';
import { createCapacitorConnectivityBackend } from './capacitorConnectivity';
import { createCapacitorDeviceBackend } from './capacitorDevice';
import { createCapacitorMessageDialogBackend, createCapacitorPromptDialogBackend } from './capacitorDialog';
import { createCapacitorFileSystemBackend } from './capacitorFileSystem';
import { createCapacitorGeolocationBackend } from './capacitorGeolocation';
import { createCapacitorHapticsBackend } from './capacitorHaptics';
import { createCapacitorKeyboardBackend } from './capacitorKeyboard';
import { createCapacitorNotificationBackend } from './capacitorNotification';
import { createCapacitorShareBackend } from './capacitorShare';
import { createCapacitorStatusBarBackend } from './capacitorStatusBar';

// Installs every still-ambient Capacitor host backend in one call and returns the explicit dialog
// capabilities. Run this once at app startup, passing an object that aggregates the official Capacitor
// plugin objects the seams use:
//
//   import { App } from '@capacitor/app';
//   // …import the other plugins…
//   registerCapacitorBackends({ app: App, clipboard: Clipboard, /* … */ statusBar: StatusBar });
//
// Pass the returned value to message and prompt dialog operations. The other covered mobile seams resolve
// to their Capacitor implementations instead of the web defaults. Seams outside Capacitor's mobile model
// (window, menu, tray, shortcut, updater, protocol, ipc, power, screen, net) are intentionally left
// registered to their web defaults — a Capacitor app runs in a webview, so those defaults keep working.
// Storage is deliberately not adapted: `StorageBackend` is synchronous but `@capacitor/preferences` is
// async (an unbridgeable mismatch), so localStorage remains the storage backend. Each remaining
// set*Backend(null) reverts one package-local capability to web.
export function registerCapacitorBackends(capacitor: CapacitorApi): HasDialogMessage & HasDialogPrompt {
  setAppBackend(createCapacitorAppBackend(capacitor));
  setClipboardBackend(createCapacitorClipboardBackend(capacitor));
  setConnectivityBackend(createCapacitorConnectivityBackend(capacitor));
  setDeviceBackend(createCapacitorDeviceBackend(capacitor));
  setFileSystemBackend(createCapacitorFileSystemBackend(capacitor));
  setGeolocationBackend(createCapacitorGeolocationBackend(capacitor));
  setHapticsBackend(createCapacitorHapticsBackend(capacitor));
  setNotificationBackend(createCapacitorNotificationBackend(capacitor));
  setShareBackend(createCapacitorShareBackend(capacitor));
  setSoftKeyboardBackend(createCapacitorKeyboardBackend(capacitor));
  setStatusBarBackend(createCapacitorStatusBarBackend(capacitor));
  return {
    dialog: {
      message: createCapacitorMessageDialogBackend(capacitor),
      prompt: createCapacitorPromptDialogBackend(capacitor),
    },
  };
}

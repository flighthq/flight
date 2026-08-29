import { setAppBackend } from '@flighthq/app/contract';
import { setClipboardBackend } from '@flighthq/clipboard/contract';
import { setConnectivityBackend } from '@flighthq/connectivity/contract';
import { setDeviceBackend } from '@flighthq/device/contract';
import { setFileSystemBackend } from '@flighthq/filesystem/contract';
import { setGeolocationBackend } from '@flighthq/geolocation/contract';
import { setSoftKeyboardBackend } from '@flighthq/keyboard/contract';
import { setNotificationBackend } from '@flighthq/notification/contract';
import { setShareBackend } from '@flighthq/share/contract';
import { setStatusBarBackend } from '@flighthq/statusbar/contract';
import type { CapacitorApi, HasDialogMessage, HasDialogPrompt, HasInputHaptics, Host } from '@flighthq/types/contract';

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

// The explicit Capacitor host. Dialog and haptics are claimed; every other capability still installs
// through its package-local seam and is NOT represented here, so an empty group means "not yet
// migrated", never "Capacitor cannot do this".
export function capacitorHost(capacitor: CapacitorApi): Host & HasDialogMessage & HasDialogPrompt & HasInputHaptics {
  return {
    accessibility: {},
    app: {},
    dialog: {
      message: createCapacitorMessageDialogBackend(capacitor),
      prompt: createCapacitorPromptDialogBackend(capacitor),
    },
    graphics: {},
    input: { haptics: createCapacitorHapticsBackend(capacitor) },
    media: {},
    net: {},
    storage: {},
    system: {},
    text: {},
    ui: {},
    // Every WindowBackend member is optional, so {} is the honest claim: a Capacitor app runs in a
    // webview and provides no native window operations of its own.
    window: {},
  };
}

// Installs every still-ambient Capacitor host backend in one call and returns the explicit host. Run
// this once at app startup, passing an object that aggregates the official Capacitor plugin objects
// the seams use:
//
//   import { App } from '@capacitor/app';
//   // …import the other plugins…
//   registerCapacitorBackends({ app: App, clipboard: Clipboard, /* … */ statusBar: StatusBar });
//
// Pass the returned host to dialog and haptics operations. The other covered mobile seams resolve to
// their Capacitor implementations instead of the web defaults. Seams outside Capacitor's mobile model
// (window, menu, tray, shortcut, updater, protocol, ipc, power, screen, net) are intentionally left
// registered to their web defaults — a Capacitor app runs in a webview, so those defaults keep working.
// Storage is deliberately not adapted: `StorageBackend` is synchronous but `@capacitor/preferences` is
// async (an unbridgeable mismatch), so localStorage remains the storage backend. Each remaining
// set*Backend(null) reverts one package-local capability to web.
export function registerCapacitorBackends(
  capacitor: CapacitorApi,
): Host & HasDialogMessage & HasDialogPrompt & HasInputHaptics {
  setAppBackend(createCapacitorAppBackend(capacitor));
  setClipboardBackend(createCapacitorClipboardBackend(capacitor));
  setConnectivityBackend(createCapacitorConnectivityBackend(capacitor));
  setDeviceBackend(createCapacitorDeviceBackend(capacitor));
  setFileSystemBackend(createCapacitorFileSystemBackend(capacitor));
  setGeolocationBackend(createCapacitorGeolocationBackend(capacitor));
  setNotificationBackend(createCapacitorNotificationBackend(capacitor));
  setShareBackend(createCapacitorShareBackend(capacitor));
  setSoftKeyboardBackend(createCapacitorKeyboardBackend(capacitor));
  setStatusBarBackend(createCapacitorStatusBarBackend(capacitor));
  return capacitorHost(capacitor);
}

import { setAppBackend } from '@flighthq/app/contract';
import { setDeviceBackend } from '@flighthq/device/contract';
import { createEntity } from '@flighthq/entity/contract';
import { setFileSystemBackend } from '@flighthq/filesystem/contract';
import { setGeolocationBackend } from '@flighthq/geolocation/contract';
import {
  setSoftKeyboardAccessoryBarBackend,
  setSoftKeyboardChangeBackend,
  setSoftKeyboardInfoBackend,
  setSoftKeyboardResizeModeWriteBackend,
  setSoftKeyboardScrollAssistBackend,
  setSoftKeyboardStyleBackend,
  setSoftKeyboardVisibilityBackend,
} from '@flighthq/keyboard/contract';
import { setStatusBarBackend } from '@flighthq/statusbar/contract';
import type {
  CapacitorApi,
  CapacitorShareContentBackend,
  EntityRuntimeKey,
  HasConnectivityChange,
  HasConnectivityStatus,
  HasClipboardImage,
  HasClipboardText,
  HasDialogMessage,
  HasDialogPrompt,
  HasInputHaptics,
  HasNotificationAction,
  HasNotificationClick,
  HasNotificationDelivery,
  HasNotificationScheduling,
  Host,
} from '@flighthq/types/contract';

import { createCapacitorAppBackend } from './capacitorApp';
import { createCapacitorClipboardBackend } from './capacitorClipboard';
import { createCapacitorConnectivityBackend } from './capacitorConnectivity';
import { createCapacitorDeviceBackend } from './capacitorDevice';
import { createCapacitorMessageDialogBackend, createCapacitorPromptDialogBackend } from './capacitorDialog';
import { createCapacitorFileSystemBackend } from './capacitorFileSystem';
import { createCapacitorGeolocationBackend } from './capacitorGeolocation';
import { createCapacitorHapticsBackend } from './capacitorHaptics';
import {
  createCapacitorSoftKeyboardAccessoryBarBackend,
  createCapacitorSoftKeyboardChangeBackend,
  createCapacitorSoftKeyboardInfoBackend,
  createCapacitorSoftKeyboardResizeModeWriteBackend,
  createCapacitorSoftKeyboardScrollAssistBackend,
  createCapacitorSoftKeyboardStyleBackend,
  createCapacitorSoftKeyboardVisibilityBackend,
} from './capacitorKeyboard';
import { createCapacitorNotificationCapabilities } from './capacitorNotification';
import { createCapacitorShareContentBackend } from './capacitorShare';
import { createCapacitorStatusBarBackend } from './capacitorStatusBar';

type CapacitorHost = Host &
  HasClipboardImage &
  HasClipboardText &
  HasConnectivityChange &
  HasConnectivityStatus &
  HasDialogMessage &
  HasDialogPrompt &
  HasInputHaptics &
  HasNotificationAction &
  HasNotificationClick &
  HasNotificationDelivery &
  HasNotificationScheduling & { readonly share: { readonly content: CapacitorShareContentBackend } };

// The explicit Capacitor host. Clipboard, dialog, haptics, notification, and content sharing are claimed; every other capability
// still installs through its package-local seam and is NOT represented here, so an empty group means
// "not yet migrated", never "Capacitor cannot do this".
export function capacitorHost(capacitor: CapacitorApi): CapacitorHost {
  const clipboard = createCapacitorClipboardBackend(capacitor);
  const connectivity = createCapacitorConnectivityBackend(capacitor);
  return createEntity({
    accessibility: {},
    app: {},
    clipboard: { image: clipboard, text: clipboard },
    connectivity: { change: connectivity, status: connectivity },
    dialog: {
      message: createCapacitorMessageDialogBackend(capacitor),
      prompt: createCapacitorPromptDialogBackend(capacitor),
    },
    graphics: {},
    input: { haptics: createCapacitorHapticsBackend(capacitor) },
    media: {},
    // Capacitor exposes no menu capability: a webview app has no native menu bar, and its context
    // menus are the web overlay's job, not Capacitor's.
    menu: {},
    net: {},
    // No power provider: Capacitor exposes no battery, idle, session-lock, thermal or keep-awake
    // API through the seams this host wires. The group is empty rather than stubbed.
    power: {},
    notification: createCapacitorNotificationCapabilities(capacitor),
    screen: {},
    share: { content: createCapacitorShareContentBackend(capacitor) },
    storage: {},
    system: {},
    text: {},
    ui: {},
    // Every WindowBackend member is optional, so {} is the honest claim: a Capacitor app runs in a
    // webview and provides no native window operations of its own.
    window: {},
  } satisfies Omit<CapacitorHost, typeof EntityRuntimeKey>);
}

// Installs every still-ambient Capacitor host backend in one call and returns the explicit host. Run
// this once at app startup, passing an object that aggregates the official Capacitor plugin objects
// the seams use:
//
//   import { App } from '@capacitor/app';
//   // …import the other plugins…
//   registerCapacitorBackends({ app: App, clipboard: Clipboard, /* … */ statusBar: StatusBar });
//
// Pass the returned host to clipboard, dialog, haptics, and notification operations. The other mobile seams remain
// package-local registrations. Storage is deliberately not adapted because its synchronous contract
// cannot express Capacitor Preferences' asynchronous API.
export function registerCapacitorBackends(capacitor: CapacitorApi): CapacitorHost {
  setAppBackend(createCapacitorAppBackend(capacitor));
  setDeviceBackend(createCapacitorDeviceBackend(capacitor));
  setFileSystemBackend(createCapacitorFileSystemBackend(capacitor));
  setGeolocationBackend(createCapacitorGeolocationBackend(capacitor));
  setSoftKeyboardAccessoryBarBackend(createCapacitorSoftKeyboardAccessoryBarBackend(capacitor));
  setSoftKeyboardChangeBackend(createCapacitorSoftKeyboardChangeBackend(capacitor));
  setSoftKeyboardInfoBackend(createCapacitorSoftKeyboardInfoBackend(capacitor));
  setSoftKeyboardResizeModeWriteBackend(createCapacitorSoftKeyboardResizeModeWriteBackend(capacitor));
  setSoftKeyboardScrollAssistBackend(createCapacitorSoftKeyboardScrollAssistBackend(capacitor));
  setSoftKeyboardStyleBackend(createCapacitorSoftKeyboardStyleBackend(capacitor));
  setSoftKeyboardVisibilityBackend(createCapacitorSoftKeyboardVisibilityBackend(capacitor));
  setStatusBarBackend(createCapacitorStatusBarBackend(capacitor));
  return capacitorHost(capacitor);
}

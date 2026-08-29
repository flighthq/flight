import { setAppBackend } from '@flighthq/app/contract';
import { setConnectivityBackend } from '@flighthq/connectivity/contract';
import { setDeviceBackend } from '@flighthq/device/contract';
import { createEntity } from '@flighthq/entity/contract';
import { setFileSystemBackend } from '@flighthq/filesystem/contract';
import { setGeolocationBackend } from '@flighthq/geolocation/contract';
import { setSoftKeyboardBackend } from '@flighthq/keyboard/contract';
import { setShareBackend } from '@flighthq/share/contract';
import { setStatusBarBackend } from '@flighthq/statusbar/contract';
import type {
  CapacitorApi,
  EntityRuntimeKey,
  HasClipboardImage,
  HasClipboardText,
  HasDialogMessage,
  HasDialogPrompt,
  HasInputHaptics,
  HasNotificationAction,
  HasNotificationClick,
  HasNotificationDelivery,
  HasNotificationPendingList,
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
import { createCapacitorKeyboardBackend } from './capacitorKeyboard';
import { createCapacitorNotificationCapabilities } from './capacitorNotification';
import { createCapacitorShareBackend } from './capacitorShare';
import { createCapacitorStatusBarBackend } from './capacitorStatusBar';

type CapacitorHost = Host &
  HasClipboardImage &
  HasClipboardText &
  HasDialogMessage &
  HasDialogPrompt &
  HasInputHaptics &
  HasNotificationAction &
  HasNotificationClick &
  HasNotificationDelivery &
  HasNotificationPendingList &
  HasNotificationScheduling;

// The explicit Capacitor host. Clipboard, dialog, haptics, and notification are claimed; every other capability
// still installs through its package-local seam and is NOT represented here, so an empty group means
// "not yet migrated", never "Capacitor cannot do this".
export function capacitorHost(capacitor: CapacitorApi): CapacitorHost {
  const clipboard = createCapacitorClipboardBackend(capacitor);
  return createEntity({
    accessibility: {},
    app: {},
    clipboard: { image: clipboard, text: clipboard },
    dialog: {
      message: createCapacitorMessageDialogBackend(capacitor),
      prompt: createCapacitorPromptDialogBackend(capacitor),
    },
    graphics: {},
    input: { haptics: createCapacitorHapticsBackend(capacitor) },
    media: {},
    net: {},
    notification: createCapacitorNotificationCapabilities(capacitor),
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
  setConnectivityBackend(createCapacitorConnectivityBackend(capacitor));
  setDeviceBackend(createCapacitorDeviceBackend(capacitor));
  setFileSystemBackend(createCapacitorFileSystemBackend(capacitor));
  setGeolocationBackend(createCapacitorGeolocationBackend(capacitor));
  setShareBackend(createCapacitorShareBackend(capacitor));
  setSoftKeyboardBackend(createCapacitorKeyboardBackend(capacitor));
  setStatusBarBackend(createCapacitorStatusBarBackend(capacitor));
  return capacitorHost(capacitor);
}

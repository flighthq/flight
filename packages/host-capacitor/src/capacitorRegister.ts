import { createEntity } from '@flighthq/entity/contract';
import { setGeolocationBackend } from '@flighthq/geolocation/contract';
import type { CapacitorApi, CapacitorHost, EntityRuntimeKey, MobileOsProfile } from '@flighthq/types/contract';

import { createCapacitorAppCapabilities } from './capacitorApp';
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
import { createCapacitorProtocolCapabilities } from './capacitorProtocol';
import { createCapacitorShareContentBackend } from './capacitorShare';
import { createCapacitorStatusBarBackend } from './capacitorStatusBar';

// The explicit Capacitor host. Every populated slot below is backed by a real plugin operation; empty
// groups make unsupported or not-yet-migrated coverage explicit.
export function capacitorHost<Profile extends MobileOsProfile>(
  capacitor: CapacitorApi,
  profile: Profile,
): CapacitorHost<Profile> {
  const app = createCapacitorAppCapabilities(capacitor, profile);
  const clipboard = createCapacitorClipboardBackend(capacitor);
  const connectivity = createCapacitorConnectivityBackend(capacitor);
  const statusBar = createCapacitorStatusBarBackend(capacitor);
  return createEntity({
    accessibility: {},
    app,
    clipboard: { image: clipboard, text: clipboard },
    connectivity: { change: connectivity, status: connectivity },
    dialog: {
      message: createCapacitorMessageDialogBackend(capacitor),
      prompt: createCapacitorPromptDialogBackend(capacitor),
    },
    graphics: {},
    input: {
      haptics: createCapacitorHapticsBackend(capacitor),
      softKeyboardAccessoryBar: createCapacitorSoftKeyboardAccessoryBarBackend(capacitor),
      softKeyboardChange: createCapacitorSoftKeyboardChangeBackend(capacitor),
      softKeyboardInfo: createCapacitorSoftKeyboardInfoBackend(capacitor),
      softKeyboardResizeModeWrite: createCapacitorSoftKeyboardResizeModeWriteBackend(capacitor),
      softKeyboardScrollAssist: createCapacitorSoftKeyboardScrollAssistBackend(capacitor),
      softKeyboardStyle: createCapacitorSoftKeyboardStyleBackend(capacitor),
      softKeyboardVisibility: createCapacitorSoftKeyboardVisibilityBackend(capacitor),
    },
    // No IPC provider: a Capacitor webview app has no second process to exchange channel messages with.
    ipc: {},
    media: {},
    // Capacitor exposes no menu capability: a webview app has no native menu bar, and its context
    // menus are the web overlay's job, not Capacitor's.
    menu: {},
    midi: {},
    net: {},
    // No power provider: Capacitor exposes no battery, idle, session-lock, thermal or keep-awake
    // API through the seams this host wires. The group is empty rather than stubbed.
    power: {},
    protocol: createCapacitorProtocolCapabilities(capacitor),
    notification: createCapacitorNotificationCapabilities(capacitor),
    // The supported Capacitor plugin set exposes no OS-global shortcut provider.
    shortcut: {},
    screen: {},
    share: { content: createCapacitorShareContentBackend(capacitor) },
    // Capacitor exposes none of Shell's six native command capabilities.
    shell: {},
    storage: { fileSystem: createCapacitorFileSystemBackend(capacitor) },
    system: { device: createCapacitorDeviceBackend(capacitor) },
    text: {},
    tray: {},
    ui: {
      statusBarColor: statusBar,
      statusBarInfo: statusBar,
      statusBarOverlays: statusBar,
      statusBarStyle: statusBar,
      statusBarVisibility: statusBar,
    },
    // The supported Capacitor plugin set has no Squirrel-compatible updater transaction.
    updater: {},
    // Every WindowBackend member is optional, so {} is the honest claim: a Capacitor app runs in a
    // webview and provides no native window operations of its own.
    window: {},
  } satisfies Omit<CapacitorHost<Profile>, typeof EntityRuntimeKey>);
}

// Installs every still-ambient Capacitor host backend in one call and returns the explicit host. Run
// this once at app startup, passing an object that aggregates the official Capacitor plugin objects
// the seams use:
//
//   import { App } from '@capacitor/app';
//   // …import the other plugins…
//   registerCapacitorBackends({ app: App, clipboard: Clipboard, /* … */ statusBar: StatusBar });
//
// Pass the returned host to explicit capability operations. The remaining mobile seams below still use
// package-local registration while their domains migrate.
export function registerCapacitorBackends<Profile extends MobileOsProfile>(
  capacitor: CapacitorApi,
  profile: Profile,
): CapacitorHost<Profile> {
  setGeolocationBackend(createCapacitorGeolocationBackend(capacitor));
  return capacitorHost(capacitor, profile);
}

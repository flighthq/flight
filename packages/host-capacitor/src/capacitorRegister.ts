import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorHost,
  EntityConstruction,
  MobileOsProfile,
  WindowBackend,
} from '@flighthq/types/contract';

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
  const out = allocateEntity<CapacitorHost<Profile>>();
  initializeCapacitorHost(out, capacitor, profile);
  return finishEntity(out);
}

export function initializeCapacitorHost<Profile extends MobileOsProfile>(
  out: EntityConstruction<CapacitorHost<Profile>>,
  capacitor: CapacitorApi,
  profile: Profile,
): void {
  const app = createCapacitorAppCapabilities(capacitor, profile);
  const clipboard = createCapacitorClipboardBackend(capacitor);
  const connectivity = createCapacitorConnectivityBackend(capacitor);
  const statusBar = createCapacitorStatusBarBackend(capacitor);
  out.accessibility = {};
  out.app = app;
  out.clipboard = { image: clipboard, text: clipboard };
  out.connectivity = { change: connectivity, status: connectivity };
  out.dialog = {
    message: createCapacitorMessageDialogBackend(capacitor),
    prompt: createCapacitorPromptDialogBackend(capacitor),
  };
  out.graphics = {};
  out.input = {
    haptics: createCapacitorHapticsBackend(capacitor),
    softKeyboardAccessoryBar: createCapacitorSoftKeyboardAccessoryBarBackend(capacitor),
    softKeyboardChange: createCapacitorSoftKeyboardChangeBackend(capacitor),
    softKeyboardInfo: createCapacitorSoftKeyboardInfoBackend(capacitor),
    softKeyboardResizeModeWrite: createCapacitorSoftKeyboardResizeModeWriteBackend(capacitor),
    softKeyboardScrollAssist: createCapacitorSoftKeyboardScrollAssistBackend(capacitor),
    softKeyboardStyle: createCapacitorSoftKeyboardStyleBackend(capacitor),
    softKeyboardVisibility: createCapacitorSoftKeyboardVisibilityBackend(capacitor),
  };
  out.ipc = {};
  out.media = {};
  out.menu = {};
  out.midi = {};
  out.net = {};
  out.notification = createCapacitorNotificationCapabilities(capacitor);
  out.power = {};
  out.protocol = createCapacitorProtocolCapabilities(capacitor);
  out.screen = {};
  out.share = { content: createCapacitorShareContentBackend(capacitor) };
  out.shell = {};
  out.shortcut = {};
  out.storage = { fileSystem: createCapacitorFileSystemBackend(capacitor) };
  out.system = {
    device: createCapacitorDeviceBackend(capacitor),
    geolocation: createCapacitorGeolocationBackend(capacitor),
  };
  out.text = {};
  out.tray = {};
  out.ui = {
    statusBarColor: statusBar,
    statusBarInfo: statusBar,
    statusBarOverlays: statusBar,
    statusBarStyle: statusBar,
    statusBarVisibility: statusBar,
  };
  out.updater = {};
  out.window = finishEntity(allocateEntity<WindowBackend>());
}

// Returns the explicit Capacitor host. Run this once at app startup, passing an object that aggregates
// the official Capacitor plugin objects the seams use. Pass the returned host to explicit capability
// operations.
export function registerCapacitorBackends<Profile extends MobileOsProfile>(
  capacitor: CapacitorApi,
  profile: Profile,
): CapacitorHost<Profile> {
  return capacitorHost(capacitor, profile);
}

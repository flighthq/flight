import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { DesktopOsProfile, TauriApi, TauriHost } from '@flighthq/types/contract';

import { createTauriAppCapabilities } from './tauriApp';
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
import { createTauriShortcutQueryBackend, createTauriShortcutTriggerBackend } from './tauriShortcut';
import { createTauriTrayCapabilities } from './tauriTray';
import { createTauriWindowBackend } from './tauriWindow';

// Builds the explicit Tauri host and installs capabilities that have not yet migrated from their
// package-local seams. Run this once at app startup, passing an object that aggregates the Tauri v2 JS
// API modules and plugins the seams use:
//
//   import * as app from '@tauri-apps/api/app';
//   // …import the other modules/plugins…
//   registerTauriBackends({ app, window, menu, tray, clipboard, dialog, notification, opener, os, globalShortcut, process }, 'macos');
//
// Pass the returned host to clipboard, menu, window, dialog, and notification operations. Unmigrated
// seams Tauri does not cover here (storage, protocol, ipc, power, screen) retain their web
// defaults because a Tauri app runs in a webview; each set*Backend(null) still reverts one of those.
export function registerTauriBackends<Profile extends DesktopOsProfile>(
  tauri: TauriApi,
  profile: Profile,
): TauriHost<Profile> {
  const clipboard = createTauriClipboardBackend(tauri);
  const app = createTauriAppCapabilities(tauri);
  const dialog = {
    directoryOpen: createTauriDirectoryOpenDialogBackend(tauri),
    fileOpen: createTauriFileOpenDialogBackend(tauri),
    fileSave: createTauriFileSaveDialogBackend(tauri),
    message: createTauriMessageDialogBackend(tauri),
  };
  const notification = createTauriNotificationCapabilities(tauri);
  const query = createTauriShortcutQueryBackend(tauri);
  const trigger = createTauriShortcutTriggerBackend(tauri);
  const menu = createTauriMenuBackends(tauri);
  const shell = makeTauriShellCapabilities(tauri);
  const window = createTauriWindowBackend(tauri);
  const out = allocateEntity<TauriHost<Profile>>();
  out.accessibility = {};
  out.app = app;
  out.clipboard = { text: clipboard };
  out.connectivity = {};
  out.dialog = dialog;
  out.graphics = {};
  out.input = {};
  out.ipc = {};
  out.media = {};
  out.menu = menu;
  out.midi = {};
  out.net = {};
  out.power = {};
  out.protocol = {};
  out.notification = notification;
  out.shortcut = { query, trigger };
  out.screen = {};
  out.share = {};
  out.shell = shell;
  out.storage = {};
  out.system = { platform: createTauriPlatformBackend(tauri) };
  out.text = {};
  out.tray = createTauriTrayCapabilities(tauri, profile);
  out.ui = {};
  out.updater = {};
  out.window = window;
  return finishEntity(out);
}

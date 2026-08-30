import { createEntity } from '@flighthq/entity/contract';
import type {
  DesktopOsProfile,
  EntityRuntimeKey,
  HasClipboardText,
  HasDialogDirectoryOpen,
  HasDialogFileOpen,
  HasDialogFileSave,
  HasDialogMessage,
  HasNotificationDelivery,
  HasNotificationLifecycle,
  HasNotificationPermission,
  HasShellExternal,
  HasShellPathOpen,
  HasShellPathReveal,
  HasShortcutQuery,
  HasShortcutTrigger,
  HasMenuApplication,
  HasMenuPopup,
  HasMenuSelect,
  HasWindowAttach,
  HasWindowOpen,
  Host,
  TauriApi,
} from '@flighthq/types/contract';

import { createTauriAppCapabilities } from './tauriApp';
import type { TauriAppCapabilities } from './tauriApp';
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
import type { TauriTrayCapabilitiesFor } from './tauriTray';
import { createTauriWindowBackend } from './tauriWindow';

type TauriHost<Profile extends DesktopOsProfile> = Host & {
  readonly app: TauriAppCapabilities;
  readonly tray: TauriTrayCapabilitiesFor<Profile>;
} & HasClipboardText &
  HasDialogDirectoryOpen &
  HasDialogFileOpen &
  HasDialogFileSave &
  HasDialogMessage &
  HasMenuApplication &
  HasMenuPopup &
  HasMenuSelect &
  HasNotificationDelivery &
  HasNotificationLifecycle &
  HasNotificationPermission &
  HasShellExternal &
  HasShellPathOpen &
  HasShellPathReveal &
  HasShortcutQuery &
  HasShortcutTrigger &
  HasWindowAttach &
  HasWindowOpen;

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
  return createEntity({
    accessibility: {},
    app,
    clipboard: { text: clipboard },
    connectivity: {},
    dialog,
    graphics: {},
    input: {},
    // No IPC provider: Tauri's event system is not wired to this seam. Its emit/listen pair could supply
    // a message slot, but nothing here builds one, so the group stays honestly empty.
    ipc: {},
    media: {},
    menu,
    midi: {},
    net: {},
    // No power provider: Tauri exposes no battery, idle, session-lock, thermal or keep-awake
    // API through the seams this host wires. The group is empty rather than stubbed.
    power: {},
    protocol: {},
    notification,
    shortcut: { query, trigger },
    screen: {},
    share: {},
    shell,
    storage: {},
    system: { platform: createTauriPlatformBackend(tauri) },
    text: {},
    tray: createTauriTrayCapabilities(tauri, profile),
    ui: {},
    // This injected Tauri API exposes no updater plugin, so no transaction provider is claimed.
    updater: {},
    window,
  } satisfies Omit<TauriHost<Profile>, typeof EntityRuntimeKey>);
}

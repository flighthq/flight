import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  DesktopOsProfile,
  ElectronApi,
  ElectronBackendOptions,
  ElectronHost,
  ElectronIpcTarget,
  ElectronMacosHost,
  EntityConstruction,
  EntityWithoutRuntime,
} from '@flighthq/types/contract';

import { createElectronAppCapabilities } from './electronApp';
import { createElectronClipboardBackend } from './electronClipboard';
import {
  createElectronDirectoryOpenDialogBackend,
  createElectronFileOpenDialogBackend,
  createElectronFileSaveDialogBackend,
  createElectronMessageDialogBackend,
} from './electronDialog';
import {
  createElectronIpcHandleBackend,
  createElectronIpcMessageBackend,
  createElectronIpcTargetedSendBackend,
} from './electronIpc';
import { createElectronMenuBackends } from './electronMenu';
import { createElectronNotificationCapabilities } from './electronNotification';
import { createElectronPlatformBackend } from './electronPlatform';
import { createElectronPowerBackends } from './electronPower';
import { createElectronProtocolCapabilities } from './electronProtocol';
import { createElectronScreenCapabilities } from './electronScreen';
import { makeElectronShellCapabilities } from './electronShell';
import { createElectronShortcutQueryBackend, createElectronShortcutTriggerBackend } from './electronShortcut';
import { createElectronStorageBackend } from './electronStorage';
import { createElectronTrayCapabilities } from './electronTray';
import { createElectronUpdaterBackend } from './electronUpdater';
import { createElectronWindowBackend } from './electronWindow';

export function initializeElectronHost(
  out: EntityConstruction<ElectronHost<DesktopOsProfile>>,
  values: Readonly<EntityWithoutRuntime<ElectronHost<DesktopOsProfile>>>,
): void {
  out.accessibility = values.accessibility;
  out.app = values.app;
  out.clipboard = values.clipboard;
  out.connectivity = values.connectivity;
  out.dialog = values.dialog;
  out.graphics = values.graphics;
  out.input = values.input;
  out.ipc = values.ipc;
  out.media = values.media;
  out.menu = values.menu;
  out.midi = values.midi;
  out.net = values.net;
  out.notification = values.notification;
  out.power = values.power;
  out.protocol = values.protocol;
  out.screen = values.screen;
  out.share = values.share;
  out.shell = values.shell;
  out.shortcut = values.shortcut;
  out.storage = values.storage;
  out.system = values.system;
  out.text = values.text;
  out.tray = values.tray;
  out.ui = values.ui;
  out.updater = values.updater;
  out.window = values.window;
}

// Builds the explicit Electron host and installs capabilities that have not yet migrated from their
// package-local seams. Run this once in the Electron main process, passing the `electron` module plus
// the real node:fs module (needed for the storage backend):
//
//   import * as electron from 'electron';
//   import * as fs from 'node:fs';
//   const electronApi: ElectronApi = { ...electron, fs, Tray: electron.Tray as ElectronApi['Tray'] };
//   registerElectronBackends(electronApi, { platform: 'windows' });
//
// Pass the returned host to clipboard, window, dialog, notification, and storage operations. Remaining
// ambient package seams revert independently; there is no bulk unregister for those independent backends.
export function registerElectronBackends(
  electron: ElectronApi,
  options: Readonly<ElectronBackendOptions> & { readonly platform: 'macos' },
): ElectronMacosHost;
export function registerElectronBackends<Profile extends 'linux' | 'windows'>(
  electron: ElectronApi,
  options: Readonly<ElectronBackendOptions> & { readonly platform: Profile },
): ElectronHost<Profile>;
export function registerElectronBackends(
  electron: ElectronApi,
  options: Readonly<ElectronBackendOptions> & {
    readonly platform: DesktopOsProfile;
  },
): ElectronHost<DesktopOsProfile> | ElectronMacosHost;
export function registerElectronBackends(
  electron: ElectronApi,
  options: Readonly<ElectronBackendOptions> & {
    readonly platform: DesktopOsProfile;
  },
): ElectronHost<DesktopOsProfile> | ElectronMacosHost {
  const clipboard = createElectronClipboardBackend(electron);
  const app = createElectronAppCapabilities(electron, options.platform);
  const dialog = {
    directoryOpen: createElectronDirectoryOpenDialogBackend(electron),
    fileOpen: createElectronFileOpenDialogBackend(electron),
    fileSave: createElectronFileSaveDialogBackend(electron),
    message: createElectronMessageDialogBackend(electron),
  };
  const notification = createElectronNotificationCapabilities(electron, options);
  const screen = createElectronScreenCapabilities(electron);
  const ipc = {
    handle: createElectronIpcHandleBackend(electron),
    message: createElectronIpcMessageBackend(electron),
    targetedSend: createElectronIpcTargetedSendBackend<ElectronIpcTarget>(),
  };
  const query = createElectronShortcutQueryBackend(electron);
  const trigger = createElectronShortcutTriggerBackend(electron);
  const menu = createElectronMenuBackends(electron);
  const power = createElectronPowerBackends(electron);
  const protocol = createElectronProtocolCapabilities(electron);
  const storage = createElectronStorageBackend(electron, options.storageFileName);
  const updater = createElectronUpdaterBackend(electron, options.updaterFeedUrl);
  const shell = makeElectronShellCapabilities(electron, options.platform);
  const window = createElectronWindowBackend(electron);
  const out = allocateEntity<ElectronHost<DesktopOsProfile>>();
  initializeElectronHost(out, {
    accessibility: {},
    app,
    clipboard: { bookmark: clipboard, formats: clipboard, image: clipboard, text: clipboard },
    connectivity: {},
    dialog,
    graphics: {},
    input: {},
    ipc,
    media: {},
    menu,
    midi: {},
    net: {},
    notification,
    power,
    protocol,
    screen,
    share: {},
    shell,
    shortcut: { query, trigger },
    storage: { local: storage },
    system: { platform: createElectronPlatformBackend(electron) },
    text: {},
    tray: createElectronTrayCapabilities(electron, options.platform),
    ui: {},
    updater: { command: updater },
    window,
  });
  return finishEntity(out);
}

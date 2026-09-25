import { readClipboardText } from '@flighthq/clipboard/contract';
import { createHost } from '@flighthq/host/contract';
import { getPlatformName } from '@flighthq/platform/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { TauriApi } from '@flighthq/types/contract';
import { spawnSync } from 'child_process';
import { resolve } from 'path';

import * as contractApi from './contract.ts';
import * as publicApi from './index.ts';

const GROUPS = [
  ['accessibility', 'tauriHostAccessibility'],
  ['app', 'tauriHostApp'],
  ['audio', 'tauriHostAudio'],
  ['audioDecode', 'tauriHostAudioDecode'],
  ['bitmap', 'tauriHostBitmap'],
  ['clipboard', 'tauriHostClipboard'],
  ['compress', 'tauriHostCompress'],
  ['connectivity', 'tauriHostConnectivity'],
  ['decompress', 'tauriHostDecompress'],
  ['device', 'tauriHostDevice'],
  ['dialog', 'tauriHostDialog'],
  ['fileSystem', 'tauriHostFileSystem'],
  ['font', 'tauriHostFont'],
  ['fullscreen', 'tauriHostFullscreen'],
  ['geolocation', 'tauriHostGeolocation'],
  ['gl', 'tauriHostGl'],
  ['glyph', 'tauriHostGlyph'],
  ['haptics', 'tauriHostHaptics'],
  ['image', 'tauriHostImage'],
  ['imageDecode', 'tauriHostImageDecode'],
  ['imageEncode', 'tauriHostImageEncode'],
  ['input', 'tauriHostInput'],
  ['ipc', 'tauriHostIpc'],
  ['lifecycle', 'tauriHostLifecycle'],
  ['mediaSession', 'tauriHostMediaSession'],
  ['menu', 'tauriHostMenu'],
  ['midi', 'tauriHostMidi'],
  ['net', 'tauriHostNet'],
  ['notification', 'tauriHostNotification'],
  ['permissions', 'tauriHostPermissions'],
  ['platform', 'tauriHostPlatformGroup'],
  ['power', 'tauriHostPower'],
  ['preferences', 'tauriHostPreferences'],
  ['protocol', 'tauriHostProtocol'],
  ['screen', 'tauriHostScreen'],
  ['sensors', 'tauriHostSensors'],
  ['share', 'tauriHostShare'],
  ['shell', 'tauriHostShell'],
  ['shortcut', 'tauriHostShortcut'],
  ['socket', 'tauriHostSocket'],
  ['softKeyboard', 'tauriHostSoftKeyboard'],
  ['statusBar', 'tauriHostStatusBar'],
  ['surface', 'tauriHostSurface'],
  ['canvas', 'tauriHostCanvas'],
  ['textSegment', 'tauriHostTextSegment'],
  ['textShaper', 'tauriHostTextShaper'],
  ['tray', 'tauriHostTray'],
  ['updater', 'tauriHostUpdater'],
  ['video', 'tauriHostVideo'],
  ['wgpu', 'tauriHostWgpu'],
  ['window', 'tauriHostWindow'],
] as const;

const LEAVES = [
  ['app', 'hide', 'tauriHostAppHide'],
  ['app', 'locale', 'tauriHostAppLocale'],
  ['app', 'name', 'tauriHostAppName'],
  ['app', 'quit', 'tauriHostAppQuit'],
  ['app', 'relaunch', 'tauriHostAppRelaunch'],
  ['app', 'show', 'tauriHostAppShow'],
  ['app', 'version', 'tauriHostAppVersion'],
  ['clipboard', 'text', 'tauriHostClipboardText'],
  ['dialog', 'directoryOpen', 'tauriHostDirectoryOpenDialog'],
  ['dialog', 'fileOpen', 'tauriHostFileOpenDialog'],
  ['dialog', 'fileSave', 'tauriHostFileSaveDialog'],
  ['dialog', 'message', 'tauriHostMessageDialog'],
  ['menu', 'application', 'tauriHostAppMenu'],
  ['menu', 'popup', 'tauriHostMenuPopup'],
  ['menu', 'select', 'tauriHostMenuSelect'],
  ['notification', 'delivery', 'tauriHostNotificationDelivery'],
  ['notification', 'lifecycle', 'tauriHostNotificationLifecycle'],
  ['notification', 'permission', 'tauriHostNotificationPermission'],
  ['shell', 'external', 'tauriHostShellExternal'],
  ['shell', 'pathOpen', 'tauriHostShellPathOpen'],
  ['shell', 'pathReveal', 'tauriHostShellPathReveal'],
  ['shortcut', 'query', 'tauriHostShortcutQuery'],
  ['shortcut', 'trigger', 'tauriHostShortcutTrigger'],
  ['system', 'platform', 'tauriHostPlatform'],
  ['tray', 'image', 'tauriHostTrayImage'],
  ['tray', 'interactionEvents', 'tauriHostTrayInteractionEvents'],
  ['tray', 'lifecycle', 'tauriHostTrayLifecycle'],
  ['tray', 'menu', 'tauriHostTrayMenu'],
  ['tray', 'menuSelectionEvents', 'tauriHostTrayMenuSelectionEvents'],
  ['tray', 'templateImage', 'tauriHostTrayTemplateImage'],
  ['tray', 'title', 'tauriHostTrayTitle'],
  ['tray', 'tooltip', 'tauriHostTrayTooltip'],
  ['window', '', 'tauriHostWindow'],
] as const;

const UNSUPPORTED_GROUPS = [
  'accessibility',
  'audio',
  'bitmap',
  'canvas',
  'connectivity',
  'device',
  'fileSystem',
  'font',
  'fullscreen',
  'geolocation',
  'gl',
  'glyph',
  'haptics',
  'image',
  'input',
  'ipc',
  'lifecycle',
  'mediaSession',
  'midi',
  'net',
  'permissions',
  'power',
  'preferences',
  'protocol',
  'screen',
  'sensors',
  'share',
  'socket',
  'softKeyboard',
  'statusBar',
  'surface',
  'textSegment',
  'updater',
  'video',
  'wgpu',
] as const;

function fakeTauri(): TauriApi {
  const asyncNoop = async () => {};
  return {
    app: {
      getName: async () => 'FlightApp',
      getVersion: async () => '1.0.0',
      hide: asyncNoop,
      show: asyncNoop,
    },
    clipboard: {
      readText: async () => 'TAURI-TEXT',
      writeText: asyncNoop,
      clear: asyncNoop,
    },
    dialog: {},
    globalShortcut: {},
    menu: {},
    notification: {
      isPermissionGranted: async () => true,
      requestPermission: async () => 'granted',
      sendNotification: () => {},
    },
    opener: {},
    os: { arch: () => 'x86_64', locale: async () => 'en-US', platform: () => 'linux', version: () => '' },
    process: {},
    tray: {},
    window: { getCurrentWindow: () => ({}), LogicalPosition: class {}, LogicalSize: class {} },
  } as unknown as TauriApi;
}

describe('tauriHost', () => {
  it('constructs one Entity with every Host group and exact supported slots', async () => {
    const host = publicApi.tauriHost(fakeTauri(), 'linux');
    const hostGroups = Object.keys(createHost()).sort();
    expect(EntityRuntimeKey in host).toBe(true);
    expect(GROUPS.map(([group]) => group).sort()).toEqual(hostGroups);
    expect(Object.keys(host).sort()).toEqual(hostGroups);
    for (const group of UNSUPPORTED_GROUPS) expect(host[group], group).toEqual({});
    expect(Object.keys(host.app).sort()).toEqual(['hide', 'locale', 'name', 'quit', 'relaunch', 'show', 'version']);
    expect(Object.keys(host.clipboard)).toEqual(['text']);
    expect(Object.keys(host.dialog).sort()).toEqual(['directoryOpen', 'fileOpen', 'fileSave', 'message']);
    expect(Object.keys(host.menu).sort()).toEqual(['app', 'popup', 'select']);
    expect(Object.keys(host.notification).sort()).toEqual(['delivery', 'lifecycle', 'permission']);
    expect(Object.keys(host.shell).sort()).toEqual(['external', 'pathOpen', 'pathReveal']);
    expect(Object.keys(host.shortcut).sort()).toEqual(['query', 'trigger']);
    expect(Object.keys(host.platform)).toEqual(['info']);
    expect(Object.keys(host.tray).sort()).toEqual(['image', 'lifecycle', 'menu', 'menuSelectionEvents', 'title']);
    expect(getPlatformName(host.platform.info)).toBe('linux');
    expect(await readClipboardText(host.clipboard.text)).toBe('TAURI-TEXT');
  });

  it('publishes every full, group, and supported leaf constructor from both lanes', () => {
    const expected = [
      ...new Set(['tauriHost', ...GROUPS.map((entry) => entry[1]), ...LEAVES.map((entry) => entry[2])]),
    ].sort();
    const publicNames = Object.keys(publicApi).sort();
    const contractNames = Object.keys(contractApi).sort();

    expect(publicNames).toEqual(expected);
    expect(contractNames).toEqual(expected);
    for (const name of expected) {
      expect(Reflect.get(publicApi, name), name).toBe(Reflect.get(contractApi, name));
      expect(Reflect.get(publicApi, name), name).toBeTypeOf('function');
    }
  });

  it('keeps profile-specific tray capabilities exact', () => {
    const tauri = fakeTauri();
    expect(Object.keys(publicApi.tauriHostTray(tauri, 'linux')).sort()).toEqual([
      'image',
      'lifecycle',
      'menu',
      'menuSelectionEvents',
      'title',
    ]);
    expect(Object.keys(publicApi.tauriHostTray(tauri, 'windows')).sort()).toEqual([
      'image',
      'interactionEvents',
      'lifecycle',
      'menu',
      'menuSelectionEvents',
      'tooltip',
    ]);
    expect(Object.keys(publicApi.tauriHostTray(tauri, 'macos')).sort()).toEqual([
      'image',
      'interactionEvents',
      'lifecycle',
      'menu',
      'menuSelectionEvents',
      'templateImage',
      'title',
      'tooltip',
    ]);
  });

  it('contains no legacy Tauri constructor identifiers outside historical agent records', () => {
    const root = resolve(__dirname, '../../..');
    const result = spawnSync(
      'git',
      [
        'grep',
        '-n',
        '-E',
        '\\<(create|initialize|register|make)Tauri[A-Z][A-Za-z0-9]*\\>',
        '--',
        ':!agents/**',
        '*.json',
        '*.md',
        '*.ts',
        '*.tsx',
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr || result.stdout).toBe(1);
    expect(result.stdout).toBe('');
  });
});

import { readClipboardText } from '@flighthq/clipboard/contract';
import { getPlatformName } from '@flighthq/platform/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { TauriApi } from '@flighthq/types/contract';
import { readFileSync, readdirSync } from 'fs';
import { extname, resolve } from 'path';

import * as contractApi from './contract';
import * as publicApi from './index';

const GROUPS = [
  ['accessibility', 'tauriHostAccessibility'],
  ['app', 'tauriHostApp'],
  ['clipboard', 'tauriHostClipboard'],
  ['connectivity', 'tauriHostConnectivity'],
  ['dialog', 'tauriHostDialog'],
  ['graphics', 'tauriHostGraphics'],
  ['input', 'tauriHostInput'],
  ['ipc', 'tauriHostIpc'],
  ['media', 'tauriHostMedia'],
  ['menu', 'tauriHostMenu'],
  ['midi', 'tauriHostMidi'],
  ['net', 'tauriHostNet'],
  ['notification', 'tauriHostNotification'],
  ['power', 'tauriHostPower'],
  ['protocol', 'tauriHostProtocol'],
  ['screen', 'tauriHostScreen'],
  ['share', 'tauriHostShare'],
  ['shell', 'tauriHostShell'],
  ['shortcut', 'tauriHostShortcut'],
  ['storage', 'tauriHostStorage'],
  ['system', 'tauriHostSystem'],
  ['text', 'tauriHostText'],
  ['tray', 'tauriHostTray'],
  ['ui', 'tauriHostUi'],
  ['updater', 'tauriHostUpdater'],
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
  ['menu', 'application', 'tauriHostMenuApplication'],
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
  'connectivity',
  'graphics',
  'input',
  'ipc',
  'media',
  'midi',
  'net',
  'power',
  'protocol',
  'screen',
  'share',
  'storage',
  'text',
  'ui',
  'updater',
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
  it('constructs one Entity with all 26 direct groups and exact supported slots', async () => {
    const host = publicApi.tauriHost(fakeTauri(), 'linux');
    expect(EntityRuntimeKey in host).toBe(true);
    expect(GROUPS).toHaveLength(26);
    expect(Object.keys(host).sort()).toEqual(GROUPS.map(([group]) => group).sort());
    for (const group of UNSUPPORTED_GROUPS) expect(host[group], group).toEqual({});
    expect(Object.keys(host.app).sort()).toEqual(['hide', 'locale', 'name', 'quit', 'relaunch', 'show', 'version']);
    expect(Object.keys(host.clipboard)).toEqual(['text']);
    expect(Object.keys(host.dialog).sort()).toEqual(['directoryOpen', 'fileOpen', 'fileSave', 'message']);
    expect(Object.keys(host.menu).sort()).toEqual(['application', 'popup', 'select']);
    expect(Object.keys(host.notification).sort()).toEqual(['delivery', 'lifecycle', 'permission']);
    expect(Object.keys(host.shell).sort()).toEqual(['external', 'pathOpen', 'pathReveal']);
    expect(Object.keys(host.shortcut).sort()).toEqual(['query', 'trigger']);
    expect(Object.keys(host.system)).toEqual(['platform']);
    expect(Object.keys(host.tray).sort()).toEqual(['image', 'lifecycle', 'menu', 'menuSelectionEvents', 'title']);
    expect(getPlatformName(host.system.platform)).toBe('linux');
    expect(await readClipboardText(host.clipboard.text)).toBe('TAURI-TEXT');
  });

  it('publishes every full, group, and supported leaf constructor from both lanes', () => {
    const expected = [
      ...new Set(['tauriHost', ...GROUPS.map((entry) => entry[1]), ...LEAVES.map((entry) => entry[2])]),
    ].sort();
    const publicNames = Object.keys(publicApi).sort();
    const contractNames = Object.keys(contractApi).sort();

    expect(expected).toHaveLength(59);
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
    const matches: string[] = [];
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, 'utf8');
      if (/\b(?:create|initialize|register|make)Tauri[A-Z][A-Za-z0-9]*\b/u.test(source)) {
        matches.push(file.slice(root.length + 1));
      }
    }
    expect(matches).toEqual([]);
  });
});

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (['.git', 'agents', 'dist', 'node_modules'].includes(entry.name)) continue;
      files.push(...sourceFiles(resolve(directory, entry.name)));
    } else if (['.json', '.md', '.ts', '.tsx'].includes(extname(entry.name))) {
      files.push(resolve(directory, entry.name));
    }
  }
  return files;
}

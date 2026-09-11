import { getAppName } from '@flighthq/app/contract';
import { readClipboardText } from '@flighthq/clipboard/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { ElectronApi } from '@flighthq/types/contract';

import * as contractApi from './contract';
import { electronHost } from './electronRegister';
import * as publicApi from './index';

const GROUPS = [
  ['accessibility', 'electronHostAccessibilityGroup'],
  ['app', 'electronHostApp'],
  ['clipboard', 'electronHostClipboard'],
  ['connectivity', 'electronHostConnectivity'],
  ['dialog', 'electronHostDialog'],
  ['graphics', 'electronHostGraphics'],
  ['input', 'electronHostInput'],
  ['ipc', 'electronHostIpc'],
  ['media', 'electronHostMedia'],
  ['menu', 'electronHostMenu'],
  ['midi', 'electronHostMidi'],
  ['net', 'electronHostNetGroup'],
  ['notification', 'electronHostNotification'],
  ['power', 'electronHostPower'],
  ['protocol', 'electronHostProtocol'],
  ['screen', 'electronHostScreen'],
  ['share', 'electronHostShare'],
  ['shell', 'electronHostShell'],
  ['shortcut', 'electronHostShortcut'],
  ['storage', 'electronHostStorageGroup'],
  ['system', 'electronHostSystem'],
  ['text', 'electronHostText'],
  ['tray', 'electronHostTray'],
  ['ui', 'electronHostUi'],
  ['updater', 'electronHostUpdater'],
  ['window', 'electronHostWindow'],
] as const;

const LEAVES = [
  'electronHostAppActivate',
  'electronHostAppActivationPolicy',
  'electronHostAppAllWindowsClosed',
  'electronHostAppBadge',
  'electronHostAppDock',
  'electronHostAppFocus',
  'electronHostAppHiddenQuery',
  'electronHostAppHide',
  'electronHostAppLocale',
  'electronHostAppLoginItem',
  'electronHostAppName',
  'electronHostAppNameWrite',
  'electronHostAppOpenFile',
  'electronHostAppPath',
  'electronHostAppQuit',
  'electronHostAppQuitRequest',
  'electronHostAppReady',
  'electronHostAppRecentDocuments',
  'electronHostAppRelaunch',
  'electronHostAppSecondInstance',
  'electronHostAppShow',
  'electronHostAppSingleInstance',
  'electronHostAppUserModelId',
  'electronHostAppVersion',
  'electronHostClipboardBookmark',
  'electronHostClipboardFormats',
  'electronHostClipboardImage',
  'electronHostClipboardText',
  'electronHostDirectoryOpenDialog',
  'electronHostFileOpenDialog',
  'electronHostFileSaveDialog',
  'electronHostIpcHandle',
  'electronHostIpcInvoke',
  'electronHostIpcMessage',
  'electronHostIpcSend',
  'electronHostIpcTargetedSend',
  'electronHostMenuApplication',
  'electronHostMenuPopup',
  'electronHostMenuSelect',
  'electronHostMessageDialog',
  'electronHostNotificationAction',
  'electronHostNotificationClick',
  'electronHostNotificationClose',
  'electronHostNotificationDelivery',
  'electronHostNotificationDismiss',
  'electronHostNotificationLifecycle',
  'electronHostNotificationReceived',
  'electronHostNotificationReply',
  'electronHostPlatform',
  'electronHostPowerBatteryHealth',
  'electronHostPowerChange',
  'electronHostPowerIdle',
  'electronHostPowerKeepAwake',
  'electronHostPowerSessionLock',
  'electronHostPowerStatus',
  'electronHostPowerSuspension',
  'electronHostPowerThermal',
  'electronHostProtocolDefault',
  'electronHostProtocolOpen',
  'electronHostProtocolRegistration',
  'electronHostProtocolRegistrationQuery',
  'electronHostProtocolUnregistration',
  'electronHostScreenChange',
  'electronHostScreenQuery',
  'electronHostShellBeep',
  'electronHostShellExternal',
  'electronHostShellPathOpen',
  'electronHostShellPathReveal',
  'electronHostShellShortcutLink',
  'electronHostShellTrash',
  'electronHostShortcutQuery',
  'electronHostShortcutTrigger',
  'electronHostStorage',
  'electronHostTrayBalloon',
  'electronHostTrayBalloonEvents',
  'electronHostTrayBounds',
  'electronHostTrayDoubleClickPolicy',
  'electronHostTrayDropEvents',
  'electronHostTrayImage',
  'electronHostTrayInteractionEvents',
  'electronHostTrayLifecycle',
  'electronHostTrayMenu',
  'electronHostTrayMenuSelectionEvents',
  'electronHostTrayPopupMenu',
  'electronHostTrayPressedImage',
  'electronHostTrayTemplateImage',
  'electronHostTrayTitle',
  'electronHostTrayTooltip',
  'electronHostUpdaterCommand',
] as const;

// A fake Electron API broad enough that every host constructor can close over its injected dependency
// without calling missing native operations during construction.
function fakeElectron(): ElectronApi {
  const noop = () => {};
  const off = () => () => {};
  return {
    app: {
      getName: () => 'ElectronApp',
      getLocale: () => 'en-US',
      getPath: () => '/userData',
      on: noop,
      removeListener: noop,
    },
    clipboard: {
      readText: () => 'ELECTRON-TEXT',
    },
    fs: {
      existsSync: () => false,
      readFileSync: () => '{}',
      renameSync: noop,
      unlinkSync: noop,
      writeFileSync: noop,
    },
    globalShortcut: {},
    screen: { on: noop, removeListener: noop },
    powerMonitor: { on: noop, removeListener: noop },
    powerSaveBlocker: {},
    nativeImage: {},
    ipcMain: { on: noop, removeListener: noop },
    autoUpdater: { on: noop, removeListener: noop },
    shell: {},
    dialog: {},
    Menu: {
      buildFromTemplate: () => ({ popup: noop }),
      setApplicationMenu: noop,
    },
    // The remaining members are unused at registration time.
    _off: off,
  } as unknown as ElectronApi;
}

describe('electronHost', () => {
  it('exports exactly the canonical full, 26 group, and supported leaf constructors from both lanes', () => {
    const expected = [...new Set(['electronHost', ...GROUPS.map((entry) => entry[1]), ...LEAVES])].sort();
    expect(expected).toHaveLength(116);
    for (const api of [publicApi, contractApi]) {
      const names = Object.keys(api)
        .filter((name) => /^electronHost(?:$|[A-Z])/u.test(name))
        .sort();
      expect(names).toEqual(expected);
      expect(
        Object.keys(api).filter((name) =>
          /^(?:createElectron|initializeElectron|makeElectron|registerElectron)/u.test(name),
        ),
      ).toEqual([]);
      for (const name of names) expect(Reflect.get(api, name), name).toBeTypeOf('function');
    }
    for (const name of expected) expect(Reflect.get(publicApi, name)).toBe(Reflect.get(contractApi, name));
  });

  it('constructs all 26 Host groups through explicit canonical boundaries', () => {
    const host = electronHost(fakeElectron(), { platform: 'linux' }) as unknown as Record<string, unknown>;
    expect(GROUPS).toHaveLength(26);
    expect(Object.keys(host).sort()).toEqual(GROUPS.map((entry) => entry[0]).sort());
    for (const [path] of GROUPS) expect(host[path], path).not.toBeUndefined();
  });

  it('routes capability seams to the Electron backends without throwing', async () => {
    const host = electronHost(fakeElectron(), {
      platform: 'linux',
    });
    expect(host.media).toEqual({});
    expect(EntityRuntimeKey in host).toBe(true);
    expect(host.dialog.directoryOpen.open).toBeTypeOf('function');
    expect(host.dialog.fileOpen.open).toBeTypeOf('function');
    expect(host.dialog.fileSave.save).toBeTypeOf('function');
    expect(host.dialog.message.confirm).toBeTypeOf('function');
    expect(host.notification.delivery.notify).toBeTypeOf('function');
    expect(host.notification.close.closeAllNotifications).toBeTypeOf('function');
    expect(host.ipc.handle.handle).toBeTypeOf('function');
    expect(host.ipc.message.subscribe).toBeTypeOf('function');
    expect(host.ipc.targetedSend.send).toBeTypeOf('function');
    expect(EntityRuntimeKey in host.shortcut.query).toBe(true);
    expect(EntityRuntimeKey in host.shortcut.trigger).toBe(true);
    expect(EntityRuntimeKey in host.updater.command).toBe(true);
    expect(host.updater.command.check).toBeTypeOf('function');
    expect(Object.keys(host.clipboard).sort()).toEqual(['bookmark', 'formats', 'image', 'text']);
    expect(host.connectivity).toEqual({});
    expect(host.storage.local.getItem('missing')).toEqual({
      reason: 'ok',
      value: null,
    });
    expect(host.window.open).toBeTypeOf('function');
    expect(getAppName(host.app.name)).toBe('ElectronApp');
    expect(await readClipboardText(host.clipboard.text)).toBe('ELECTRON-TEXT');
  });

  it('constructs the exact six Shell slots from an injected platform fact', () => {
    const windowsHost = electronHost(fakeElectron(), {
      platform: 'windows',
    });
    const linuxHost = electronHost(fakeElectron(), {
      platform: 'linux',
    });
    expect(Object.keys(windowsHost.shell).sort()).toEqual([
      'beep',
      'external',
      'pathOpen',
      'pathReveal',
      'shortcutLink',
      'trash',
    ]);
    expect(Object.keys(linuxHost.shell).sort()).toEqual(['beep', 'external', 'pathOpen', 'pathReveal', 'trash']);
    for (const provider of Object.values(windowsHost.shell)) expect(EntityRuntimeKey in provider).toBe(true);
  });
});

import { getAppName } from '@flighthq/app/contract';
import { readClipboardText } from '@flighthq/clipboard/contract';
import { createHost } from '@flighthq/host/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { ElectronApi, Entity } from '@flighthq/types/contract';

import * as contractApi from './contract';
import { electronHost } from './electronRegister';
import * as publicApi from './index';

const GROUPS = [
  ['accessibility', 'electronHostAccessibilityGroup'],
  ['app', 'electronHostApp'],
  ['audio', 'electronHostAudioGroup'],
  ['bitmap', 'electronHostBitmapGroup'],
  ['clipboard', 'electronHostClipboard'],
  ['connectivity', 'electronHostConnectivityGroup'],
  ['device', 'electronHostDeviceGroup'],
  ['dialog', 'electronHostDialog'],
  ['fileSystem', 'electronHostFileSystemGroup'],
  ['font', 'electronHostFontGroup'],
  ['fullscreen', 'electronHostFullscreenGroup'],
  ['geolocation', 'electronHostGeolocationGroup'],
  ['gl', 'electronHostGlGroup'],
  ['glyph', 'electronHostGlyphGroup'],
  ['haptics', 'electronHostHapticsGroup'],
  ['image', 'electronHostImageGroup'],
  ['input', 'electronHostInputGroup'],
  ['ipc', 'electronHostIpc'],
  ['lifecycle', 'electronHostLifecycleGroup'],
  ['mediaSession', 'electronHostMediaSessionGroup'],
  ['menu', 'electronHostMenu'],
  ['midi', 'electronHostMidiGroup'],
  ['net', 'electronHostNetGroup'],
  ['notification', 'electronHostNotification'],
  ['permissions', 'electronHostPermissionsGroup'],
  ['platform', 'electronHostPlatformGroup'],
  ['power', 'electronHostPower'],
  ['preferences', 'electronHostStorageGroup'],
  ['protocol', 'electronHostProtocol'],
  ['screen', 'electronHostScreen'],
  ['sensors', 'electronHostSensorsGroup'],
  ['share', 'electronHostShareGroup'],
  ['shell', 'electronHostShell'],
  ['shortcut', 'electronHostShortcut'],
  ['socket', 'electronHostSocketGroup'],
  ['softKeyboard', 'electronHostSoftKeyboardGroup'],
  ['statusBar', 'electronHostStatusBarGroup'],
  ['surface', 'electronHostSurfaceGroup'],
  ['textSegment', 'electronHostTextSegmentGroup'],
  ['textShaper', 'electronHostTextShaperGroup'],
  ['tray', 'electronHostTray'],
  ['updater', 'electronHostUpdater'],
  ['video', 'electronHostVideoGroup'],
  ['wgpu', 'electronHostWgpuGroup'],
  ['window', 'electronHostWindow'],
] as const;

const LEAVES = [
  'electronHostAppActivate',
  'electronHostAppActivationPolicy',
  'electronHostAppAllWindowsClosed',
  'electronHostAppBadge',
  'electronHostAppDock',
  'electronHostAppFocus',
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
  'electronHostWindowAppearance',
  'electronHostWindowAttach',
  'electronHostWindowAttention',
  'electronHostWindowContentProtection',
  'electronHostWindowFocus',
  'electronHostWindowFullscreen',
  'electronHostWindowGeometry',
  'electronHostWindowHierarchy',
  'electronHostWindowLifecycle',
  'electronHostWindowProgress',
  'electronHostWindowShadow',
  'electronHostWindowShell',
  'electronHostWindowSizeConstraints',
  'electronHostWindowState',
  'electronHostWindowVisibility',
  'electronHostWindowZOrder',
] as const;

const AUXILIARY_EXPORTS = [
  'getApplicationWindowForElectronId',
  'getElectronBrowserWindow',
  'getElectronWindowId',
] as const;

type ElectronLeafResult = ReturnType<(typeof publicApi)[(typeof LEAVES)[number]]>;
type ElectronLeafProvidersAreEntities = Exclude<ElectronLeafResult, undefined> extends Entity ? true : false;
type ElectronFullHostIsEntity = ReturnType<typeof publicApi.electronHost> extends Entity ? true : false;

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
  it('exports exactly the canonical full, group, and supported leaf constructors from both lanes', () => {
    const expected = [...new Set(['electronHost', ...GROUPS.map((entry) => entry[1]), ...LEAVES])].sort();
    const expectedSurface = [...expected, ...AUXILIARY_EXPORTS].sort();
    for (const api of [publicApi, contractApi]) {
      expect(Object.keys(api).sort()).toEqual(expectedSurface);
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

  it('types the full host and every supported leaf result as an Entity', () => {
    expectTypeOf<ElectronFullHostIsEntity>().toEqualTypeOf<true>();
    expectTypeOf<ElectronLeafProvidersAreEntities>().toEqualTypeOf<true>();
  });

  it('constructs every Host group through explicit canonical boundaries', () => {
    const host = electronHost(fakeElectron(), { platform: 'linux' }) as unknown as Record<string, unknown>;
    const hostGroups = Object.keys(createHost())
      .filter((key) => key !== String(EntityRuntimeKey))
      .sort();
    expect(GROUPS.map((entry) => entry[0]).sort()).toEqual(hostGroups);
    expect(
      Object.keys(host)
        .filter((key) => key !== String(EntityRuntimeKey))
        .sort(),
    ).toEqual(hostGroups);
    for (const [path] of GROUPS) expect(host[path], path).not.toBeUndefined();
  });

  it('routes capability seams to the Electron backends without throwing', async () => {
    const host = electronHost(fakeElectron(), {
      platform: 'linux',
    });
    expect(host.audio).toEqual({});
    expect(host.video).toEqual({});
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
    expect(host.preferences.local.getItem('missing')).toEqual({
      reason: 'ok',
      value: null,
    });
    expect(host.window.lifecycle.open).toBeTypeOf('function');
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

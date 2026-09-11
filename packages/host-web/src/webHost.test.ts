import { EntityRuntimeKey } from '@flighthq/types/contract';

import * as contractApi from './contract';
import * as publicApi from './index';

const GROUPS = [
  ['accessibility', 'webHostAccessibilityGroup'],
  ['app', 'webHostApp'],
  ['clipboard', 'webHostClipboard'],
  ['connectivity', 'webHostConnectivity'],
  ['dialog', 'webHostDialog'],
  ['graphics', 'webHostGraphics'],
  ['input', 'webHostInput'],
  ['ipc', 'webHostIpc'],
  ['media', 'webHostMedia'],
  ['menu', 'webHostMenu'],
  ['midi', 'webHostMidi'],
  ['net', 'webHostNetGroup'],
  ['notification', 'webHostNotification'],
  ['power', 'webHostPower'],
  ['protocol', 'webHostProtocol'],
  ['screen', 'webHostScreen'],
  ['share', 'webHostShare'],
  ['shell', 'webHostShell'],
  ['shortcut', 'webHostShortcut'],
  ['storage', 'webHostStorageGroup'],
  ['system', 'webHostSystem'],
  ['text', 'webHostText'],
  ['tray', 'webHostTray'],
  ['ui', 'webHostUi'],
  ['updater', 'webHostUpdater'],
  ['window', 'webHostWindow'],
] as const;

const LEAVES = [
  ['accessibility', 'provider', 'webHostAccessibility'],
  ['app', 'badge', 'webHostAppBadge'],
  ['app', 'exit', 'webHostApplicationExit'],
  ['app', 'focus', 'webHostAppFocus'],
  ['app', 'locale', 'webHostAppLocale'],
  ['app', 'loop', 'webHostLoop'],
  ['app', 'name', 'webHostAppName'],
  ['app', 'quit', 'webHostAppQuit'],
  ['app', 'ready', 'webHostAppReady'],
  ['app', 'relaunch', 'webHostAppRelaunch'],
  ['app', 'visibility', 'webHostApplicationVisibility'],
  ['clipboard', 'change', 'webHostClipboardChange'],
  ['clipboard', 'formats', 'webHostClipboardFormats'],
  ['clipboard', 'image', 'webHostClipboardImage'],
  ['clipboard', 'text', 'webHostClipboardText'],
  ['connectivity', 'change', 'webHostConnectivityChange'],
  ['connectivity', 'reachability', 'webHostConnectivityReachability'],
  ['connectivity', 'status', 'webHostConnectivityStatus'],
  ['dialog', 'directoryOpen', 'webHostDirectoryOpenDialog'],
  ['dialog', 'fileOpen', 'webHostFileOpenDialog'],
  ['dialog', 'fileSave', 'webHostFileSaveDialog'],
  ['dialog', 'imageOpen', 'webHostImageOpenDialog'],
  ['dialog', 'message', 'webHostMessageDialog'],
  ['dialog', 'photoCapture', 'webHostPhotoCaptureDialog'],
  ['dialog', 'prompt', 'webHostPromptDialog'],
  ['dialog', 'videoCapture', 'webHostVideoCaptureDialog'],
  ['graphics', 'bitmapEncode', 'webHostBitmapEncode'],
  ['graphics', 'bitmapReadback', 'webHostBitmapReadback'],
  ['graphics', 'image', 'webHostImage'],
  ['graphics', 'renderContext', 'webHostRenderContext'],
  ['graphics', 'renderSurface', 'webHostRenderSurface'],
  ['input', 'dropFile', 'webHostInputDropFile'],
  ['input', 'focus', 'webHostInputFocus'],
  ['input', 'haptics', 'webHostHaptics'],
  ['input', 'pointerLock', 'webHostInputPointerLock'],
  ['input', 'softKeyboardChange', 'webHostSoftKeyboardChange'],
  ['input', 'softKeyboardInfo', 'webHostSoftKeyboardInfo'],
  ['input', 'softKeyboardVisibility', 'webHostSoftKeyboardVisibility'],
  ['input', 'target', 'webHostInputTarget'],
  ['media', 'audioCodec', 'webHostAudio'],
  ['media', 'audioDevice', 'webHostAudioDevice'],
  ['media', 'session', 'webHostMediaSession'],
  ['media', 'sessionAction', 'webHostMediaSessionAction'],
  ['media', 'video', 'webHostVideo'],
  ['menu', 'highlight', 'webHostMenuHighlight'],
  ['menu', 'popup', 'webHostMenuPopup'],
  ['net', 'http', 'webHostNet'],
  ['net', 'socket', 'webHostSocket'],
  ['power', 'change', 'webHostPowerChange'],
  ['power', 'keepAwake', 'webHostPowerKeepAwake'],
  ['power', 'status', 'webHostPowerStatus'],
  ['power', 'suspension', 'webHostPowerSuspension'],
  ['protocol', 'launch', 'webHostProtocolLaunch'],
  ['protocol', 'registration', 'webHostProtocolRegistration'],
  ['screen', 'change', 'webHostScreenChange'],
  ['screen', 'details', 'webHostScreenDetails'],
  ['screen', 'permissionChange', 'webHostScreenPermissionChange'],
  ['screen', 'query', 'webHostScreenQuery'],
  ['share', 'content', 'webHostShareContent'],
  ['share', 'files', 'webHostShareFiles'],
  ['shell', 'external', 'webHostShellExternal'],
  ['storage', 'change', 'webHostStorageChange'],
  ['storage', 'fileSystem', 'webHostFileSystem'],
  ['storage', 'local', 'webHostStorage'],
  ['storage', 'persistenceQuery', 'webHostStoragePersistenceQuery'],
  ['storage', 'persistenceRequest', 'webHostStoragePersistenceRequest'],
  ['system', 'device', 'webHostDevice'],
  ['system', 'geolocation', 'webHostGeolocation'],
  ['system', 'lifecycle', 'webHostLifecycle'],
  ['system', 'platform', 'webHostPlatform'],
  ['system', 'sensors', 'webHostSensors'],
  ['text', 'fontLoading', 'webHostFontLoading'],
  ['text', 'glyphRasterizer', 'webHostGlyphRasterizer'],
  ['ui', 'fullscreen', 'webHostFullscreen'],
  ['ui', 'statusBarColor', 'webHostStatusBarColor'],
  ['window', '', 'webHostWindow'],
] as const;

const CONTRACT_ONLY_BACKEND_ALIASES = [
  'webLifecycleBackend',
  'webPowerKeepAwakeBackend',
  'webPowerSuspensionBackend',
  'webSensorsBackend',
] as const;
const PUBLIC_ONLY_BACKEND_ALIASES = ['webNetBackend', 'webSocketBackend'] as const;
const SHARED_BACKEND_ALIASES = [
  'webAccessibilityBackend',
  'webApplicationExitBackend',
  'webApplicationVisibilityBackend',
  'webAudioBackend',
  'webAudioDeviceBackend',
  'webBitmapEncodeBackend',
  'webBitmapReadbackBackend',
  'webClipboardBackend',
  'webConnectivityBackend',
  'webDeviceBackend',
  'webDirectoryOpenDialogBackend',
  'webFileOpenDialogBackend',
  'webFileSaveDialogBackend',
  'webFileSystemBackend',
  'webFontLoadingBackend',
  'webFullscreenBackend',
  'webGeolocationBackend',
  'webGlyphRasterizerBackend',
  'webHapticsBackend',
  'webImageBackend',
  'webImageOpenDialogBackend',
  'webInputDropFileBackend',
  'webInputFocusBackend',
  'webInputPointerLockBackend',
  'webInputTargetBackend',
  'webLoopBackend',
  'webMediaSessionActionBackend',
  'webMediaSessionBackend',
  'webMenuHighlightBackend',
  'webMenuPopupBackend',
  'webMessageDialogBackend',
  'webPhotoCaptureDialogBackend',
  'webPlatformBackend',
  'webPromptDialogBackend',
  'webRenderContextBackend',
  'webRenderSurfaceBackend',
  'webShareContentBackend',
  'webShareFilesBackend',
  'webShellExternalBackend',
  'webStatusBarColorBackend',
  'webStorageBackend',
  'webVideoCapabilityBackend',
  'webVideoCaptureDialogBackend',
  'webWindowBackend',
] as const;

describe('webHost', () => {
  it('composes all 26 direct groups from their separately exported identities', () => {
    const host = publicApi.webHost as unknown as Record<string, unknown>;
    expect(EntityRuntimeKey in publicApi.webHost).toBe(true);
    expect(GROUPS).toHaveLength(26);
    for (const [path, exportName] of GROUPS) {
      expect(Reflect.get(publicApi, exportName), exportName).toBe(Reflect.get(contractApi, exportName));
      expect(host[path], path).toBe(Reflect.get(publicApi, exportName));
    }
  });

  it('composes all 76 supported leaves from their separately exported identities', () => {
    const host = publicApi.webHost as unknown as Record<string, unknown>;
    expect(LEAVES).toHaveLength(76);
    for (const [group, path, exportName] of LEAVES) {
      const groupValue = host[group] as Record<string, unknown>;
      const composed = group === 'window' ? groupValue : groupValue[path];
      expect(Reflect.get(publicApi, exportName), exportName).toBe(Reflect.get(contractApi, exportName));
      expect(composed, `${group}.${path}`).toBe(Reflect.get(publicApi, exportName));
    }
  });

  it('exports exactly the canonical full, group, and leaf names from both lanes', () => {
    const expected = [
      ...new Set(['webHost', ...GROUPS.map((entry) => entry[1]), ...LEAVES.map((entry) => entry[2])]),
    ].sort();
    const publicNames = Object.keys(publicApi)
      .filter((name) => /^webHost(?:$|[A-Z])/u.test(name))
      .sort();
    const contractNames = Object.keys(contractApi)
      .filter((name) => /^webHost(?:$|[A-Z])/u.test(name))
      .sort();

    expect(expected).toHaveLength(102);
    expect(publicNames).toEqual(expected);
    expect(contractNames).toEqual(expected);
  });

  it('uses the narrow Group suffix only for unavoidable leaf collisions', () => {
    expect(publicApi.webHostAccessibilityGroup.provider).toBe(publicApi.webHostAccessibility);
    expect(publicApi.webHostNetGroup.http).toBe(publicApi.webHostNet);
    expect(publicApi.webHostStorageGroup.local).toBe(publicApi.webHostStorage);
    expect(publicApi.webHost.window).toBe(publicApi.webHostWindow);
  });

  it('retains the reproducible 46-public and 48-contract backend alias lanes until Phase 3', () => {
    const publicNames = Object.keys(publicApi)
      .filter((name) => /^web[A-Z].*Backend$/u.test(name))
      .sort();
    const contractNames = Object.keys(contractApi)
      .filter((name) => /^web[A-Z].*Backend$/u.test(name))
      .sort();

    expect(publicNames).toEqual([...SHARED_BACKEND_ALIASES, ...PUBLIC_ONLY_BACKEND_ALIASES].sort());
    expect(contractNames).toEqual([...SHARED_BACKEND_ALIASES, ...CONTRACT_ONLY_BACKEND_ALIASES].sort());
    expect(new Set([...publicNames, ...contractNames]).size).toBe(50);
  });
});

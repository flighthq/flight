import { createHost } from '@flighthq/entity/contract';
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
  ['input', 'ingress', 'webHostInputIngress'],
  ['input', 'pointerLock', 'webHostInputPointerLock'],
  ['input', 'softKeyboardChange', 'webHostSoftKeyboardChange'],
  ['input', 'softKeyboardInfo', 'webHostSoftKeyboardInfo'],
  ['input', 'softKeyboardVisibility', 'webHostSoftKeyboardVisibility'],
  ['input', 'target', 'webHostInputTarget'],
  ['media', 'audioCodec', 'webHostAudio'],
  ['media', 'audioDevice', 'webHostAudioDevice'],
  ['media', 'audioMixer', 'webHostAudioMixer'],
  ['media', 'session', 'webHostMediaSession'],
  ['media', 'sessionAction', 'webHostMediaSessionAction'],
  ['media', 'video', 'webHostVideo'],
  ['menu', 'highlight', 'webHostMenuHighlight'],
  ['menu', 'popup', 'webHostMenuPopup'],
  ['net', 'http', 'webHostNet'],
  ['net', 'socket', 'webHostSocket'],
  ['notification', 'permission', 'webHostNotificationPermission'],
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
  ['system', 'permissions', 'webHostPermissions'],
  ['system', 'platform', 'webHostPlatform'],
  ['system', 'sensors', 'webHostSensors'],
  ['text', 'fontLoading', 'webHostFontLoading'],
  ['text', 'glyphRasterizer', 'webHostGlyphRasterizer'],
  ['ui', 'fullscreen', 'webHostFullscreen'],
  ['ui', 'statusBarColor', 'webHostStatusBarColor'],
  ['window', '', 'webHostWindow'],
] as const;

describe('webHost', () => {
  it('composes every Host group from its separately exported identity', () => {
    const host = publicApi.webHost as unknown as Record<string, unknown>;
    expect(EntityRuntimeKey in publicApi.webHost).toBe(true);
    expect(GROUPS.map((entry) => entry[0]).sort()).toEqual(hostGroupNames(createHost()));
    for (const [path, exportName] of GROUPS) {
      expect(Reflect.get(publicApi, exportName), exportName).toBe(Reflect.get(contractApi, exportName));
      expect(host[path], path).toBe(Reflect.get(publicApi, exportName));
    }
  });

  it('composes each supported leaf from its separately exported identity', () => {
    const host = publicApi.webHost as unknown as Record<string, unknown>;
    for (const [group, path, exportName] of LEAVES) {
      const groupValue = host[group] as Record<string, unknown>;
      const composed = group === 'window' ? groupValue : groupValue[path];
      expect(Reflect.get(publicApi, exportName), exportName).toBe(Reflect.get(contractApi, exportName));
      expect(composed, `${group}.${path}`).toBe(Reflect.get(publicApi, exportName));
    }
  });

  it('exports only webHost values that the full Host composes, identically from both lanes', () => {
    const host = publicApi.webHost as unknown as Record<string, unknown>;
    const composed = new Set<unknown>([publicApi.webHost]);
    for (const group of hostGroupNames(publicApi.webHost)) {
      composed.add(host[group]);
      for (const leaf of Object.values(host[group] as object)) composed.add(leaf);
    }
    const publicNames = Object.keys(publicApi)
      .filter((name) => /^webHost(?:$|[A-Z])/u.test(name))
      .sort();
    const contractNames = Object.keys(contractApi)
      .filter((name) => /^webHost(?:$|[A-Z])/u.test(name))
      .sort();

    expect(contractNames).toEqual(publicNames);
    expect(publicNames.filter((name) => !composed.has(Reflect.get(publicApi, name)))).toEqual([]);
  });

  it('uses the narrow Group suffix only for unavoidable leaf collisions', () => {
    expect(publicApi.webHostAccessibilityGroup.provider).toBe(publicApi.webHostAccessibility);
    expect(publicApi.webHostNetGroup.http).toBe(publicApi.webHostNet);
    expect(publicApi.webHostStorageGroup.local).toBe(publicApi.webHostStorage);
    expect(publicApi.webHost.window).toBe(publicApi.webHostWindow);
  });

  it('does not expose the removed Backend aliases, partial Hosts, or capability aliases', () => {
    for (const api of [publicApi, contractApi]) {
      const names = Object.keys(api);
      expect(names.filter((name) => /^web[A-Z].*Backend$/u.test(name))).toEqual([]);
      expect(names.filter((name) => /^web(?!Host$)[A-Z].*Host$/u.test(name))).toEqual([]);
      expect(names).not.toContain('webPowerCapabilities');
      expect(names).not.toContain('webScreenCapabilities');
    }
  });
});

function hostGroupNames(host: object): string[] {
  return Object.keys(host)
    .filter((key) => key !== String(EntityRuntimeKey))
    .sort();
}

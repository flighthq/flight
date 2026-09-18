import { createHost } from '@flighthq/host/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import * as contractApi from './contract';
import * as publicApi from './index';

// Every top-level group of the ratified flat Host. A group is a plain struct of independently-coverable
// capability slots, so it is composed here from separately importable consts rather than from the
// super-groups that used to gather several domains.
const GROUPS = [
  ['accessibility', 'webHostAccessibilityGroup'],
  ['app', 'webHostApp'],
  ['audio', 'webHostAudioGroup'],
  ['bitmap', 'webHostBitmap'],
  ['canvas', 'webHostCanvasGroup'],
  ['clipboard', 'webHostClipboard'],
  ['connectivity', 'webHostConnectivity'],
  ['device', 'webHostDeviceGroup'],
  ['dialog', 'webHostDialog'],
  ['fileSystem', 'webHostFileSystemGroup'],
  ['font', 'webHostFont'],
  ['fullscreen', 'webHostFullscreenGroup'],
  ['geolocation', 'webHostGeolocationGroup'],
  ['gl', 'webHostGlGroup'],
  ['glyph', 'webHostGlyph'],
  ['haptics', 'webHostHapticsGroup'],
  ['image', 'webHostImageGroup'],
  ['input', 'webHostInput'],
  ['ipc', 'webHostIpc'],
  ['lifecycle', 'webHostLifecycleGroup'],
  ['mediaSession', 'webHostMediaSessionGroup'],
  ['menu', 'webHostMenu'],
  ['midi', 'webHostMidi'],
  ['net', 'webHostNetGroup'],
  ['notification', 'webHostNotification'],
  ['permissions', 'webHostPermissionsGroup'],
  ['platform', 'webHostPlatformGroup'],
  ['power', 'webHostPower'],
  ['preferences', 'webHostPreferences'],
  ['protocol', 'webHostProtocol'],
  ['screen', 'webHostScreen'],
  ['sensors', 'webHostSensorsGroup'],
  ['share', 'webHostShare'],
  ['shell', 'webHostShell'],
  ['shortcut', 'webHostShortcut'],
  ['socket', 'webHostSocketGroup'],
  ['softKeyboard', 'webHostSoftKeyboard'],
  ['statusBar', 'webHostStatusBar'],
  ['target', 'webHostTargetGroup'],
  ['textSegment', 'webHostTextSegment'],
  ['textShaper', 'webHostTextShaper'],
  ['tray', 'webHostTray'],
  ['updater', 'webHostUpdater'],
  ['video', 'webHostVideoGroup'],
  ['wgpu', 'webHostWgpu'],
  ['window', 'webHostWindow'],
] as const;

// Every slot web fills, addressed by the group that owns it. A slot web cannot serve is absent rather
// than inert: an omitted slot is the honest report, where a stubbed capability would be
// indistinguishable from a real one. The groups above with no entry here are the absent ones.
const LEAVES = [
  ['accessibility', 'tree', 'webHostAccessibility'],
  ['app', 'badge', 'webHostAppBadge'],
  ['app', 'exit', 'webHostApplicationExit'],
  ['app', 'focus', 'webHostAppFocus'],
  ['app', 'locale', 'webHostAppLocale'],
  ['app', 'loop', 'webHostLoop'],
  ['app', 'name', 'webHostAppName'],
  ['app', 'quit', 'webHostAppQuit'],
  ['app', 'ready', 'webHostAppReady'],
  ['app', 'relaunch', 'webHostAppRelaunch'],
  ['audio', 'codec', 'webHostAudio'],
  ['audio', 'device', 'webHostAudioDevice'],
  ['audio', 'mixer', 'webHostAudioMixer'],
  ['bitmap', 'encode', 'webHostBitmapEncode'],
  ['bitmap', 'readback', 'webHostBitmapReadback'],
  ['canvas', 'context', 'webHostCanvas'],
  ['clipboard', 'change', 'webHostClipboardChange'],
  ['clipboard', 'formats', 'webHostClipboardFormats'],
  ['clipboard', 'image', 'webHostClipboardImage'],
  ['clipboard', 'text', 'webHostClipboardText'],
  ['connectivity', 'change', 'webHostConnectivityChange'],
  ['connectivity', 'reachability', 'webHostConnectivityReachability'],
  ['connectivity', 'status', 'webHostConnectivityStatus'],
  ['device', 'info', 'webHostDevice'],
  ['dialog', 'directoryOpen', 'webHostDirectoryOpenDialog'],
  ['dialog', 'fileOpen', 'webHostFileOpenDialog'],
  ['dialog', 'fileSave', 'webHostFileSaveDialog'],
  ['dialog', 'imageOpen', 'webHostImageOpenDialog'],
  ['dialog', 'message', 'webHostMessageDialog'],
  ['dialog', 'photoCapture', 'webHostPhotoCaptureDialog'],
  ['dialog', 'prompt', 'webHostPromptDialog'],
  ['dialog', 'videoCapture', 'webHostVideoCaptureDialog'],
  ['fileSystem', 'access', 'webHostFileSystem'],
  ['font', 'loader', 'webHostFontLoading'],
  ['fullscreen', 'element', 'webHostFullscreen'],
  ['geolocation', 'position', 'webHostGeolocation'],
  ['gl', 'context', 'webHostGl'],
  ['glyph', 'rasterizer', 'webHostGlyphRasterizer'],
  ['haptics', 'engine', 'webHostHaptics'],
  ['image', 'loader', 'webHostImage'],
  ['input', 'dropFile', 'webHostInputDropFile'],
  ['input', 'focus', 'webHostInputFocus'],
  ['input', 'ingress', 'webHostInputIngress'],
  ['input', 'pointerLock', 'webHostInputPointerLock'],
  ['lifecycle', 'state', 'webHostLifecycle'],
  ['mediaSession', 'action', 'webHostMediaSessionAction'],
  ['mediaSession', 'control', 'webHostMediaSession'],
  ['menu', 'highlight', 'webHostMenuHighlight'],
  ['menu', 'popup', 'webHostMenuPopup'],
  ['net', 'http', 'webHostNet'],
  ['socket', 'connection', 'webHostSocket'],
  ['notification', 'permission', 'webHostNotificationPermission'],
  ['permissions', 'query', 'webHostPermissions'],
  ['platform', 'info', 'webHostPlatform'],
  ['power', 'change', 'webHostPowerChange'],
  ['power', 'keepAwake', 'webHostPowerKeepAwake'],
  ['power', 'status', 'webHostPowerStatus'],
  ['power', 'suspension', 'webHostPowerSuspension'],
  ['preferences', 'change', 'webHostStorageChange'],
  ['preferences', 'local', 'webHostStorage'],
  ['preferences', 'persistenceQuery', 'webHostStoragePersistenceQuery'],
  ['preferences', 'persistenceRequest', 'webHostStoragePersistenceRequest'],
  ['protocol', 'launch', 'webHostProtocolLaunch'],
  ['protocol', 'registration', 'webHostProtocolRegistration'],
  ['screen', 'change', 'webHostScreenChange'],
  ['screen', 'details', 'webHostScreenDetails'],
  ['screen', 'permissionChange', 'webHostScreenPermissionChange'],
  ['screen', 'query', 'webHostScreenQuery'],
  ['sensors', 'query', 'webHostSensors'],
  ['share', 'content', 'webHostShareContent'],
  ['share', 'files', 'webHostShareFiles'],
  ['shell', 'external', 'webHostShellExternal'],
  ['softKeyboard', 'change', 'webHostSoftKeyboardChange'],
  ['softKeyboard', 'info', 'webHostSoftKeyboardInfo'],
  ['softKeyboard', 'visibility', 'webHostSoftKeyboardVisibility'],
  ['statusBar', 'color', 'webHostStatusBarColor'],
  ['target', 'display', 'webHostTargetDisplay'],
  ['target', 'prepare', 'webHostTarget'],
  ['target', 'resize', 'webHostTargetResize'],
  ['video', 'playback', 'webHostVideo'],
  ['window', 'appearance', 'webHostWindowAppearance'],
  ['window', 'attach', 'webHostWindowAttach'],
  ['window', 'focus', 'webHostWindowFocus'],
  ['window', 'fullscreen', 'webHostWindowFullscreen'],
  ['window', 'geometry', 'webHostWindowGeometry'],
  ['window', 'lifecycle', 'webHostWindowLifecycle'],
] as const;

// The one escape hatch: a group whose const name would collide with a leaf's takes the Group suffix.
const GROUP_SUFFIXED = [
  'webHostAccessibilityGroup',
  'webHostAudioGroup',
  'webHostCanvasGroup',
  'webHostDeviceGroup',
  'webHostFileSystemGroup',
  'webHostFullscreenGroup',
  'webHostGeolocationGroup',
  'webHostGlGroup',
  'webHostHapticsGroup',
  'webHostImageGroup',
  'webHostLifecycleGroup',
  'webHostMediaSessionGroup',
  'webHostNetGroup',
  'webHostPermissionsGroup',
  'webHostPlatformGroup',
  'webHostSensorsGroup',
  'webHostSocketGroup',
  'webHostTargetGroup',
  'webHostVideoGroup',
];

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
      expect(Reflect.get(publicApi, exportName), exportName).toBe(Reflect.get(contractApi, exportName));
      expect(groupValue[path], `${group}.${path}`).toBe(Reflect.get(publicApi, exportName));
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
    expect(
      Object.keys(publicApi)
        .filter((name) => name.endsWith('Group'))
        .sort(),
    ).toEqual(GROUP_SUFFIXED);
    expect(publicApi.webHostAccessibilityGroup.tree).toBe(publicApi.webHostAccessibility);
    expect(publicApi.webHostCanvasGroup.context).toBe(publicApi.webHostCanvas);
    expect(publicApi.webHostNetGroup.http).toBe(publicApi.webHostNet);
    expect(publicApi.webHostPreferences.local).toBe(publicApi.webHostStorage);
    expect(publicApi.webHostGlGroup.context).toBe(publicApi.webHostGl);
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

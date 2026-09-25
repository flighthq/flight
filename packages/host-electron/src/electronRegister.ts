import { createHost } from '@flighthq/host/contract';
import type {
  DesktopOsProfile,
  ElectronApi,
  ElectronHost,
  ElectronHostOptions,
  ElectronMacosHost,
  EntityRuntimeKey,
  Host,
} from '@flighthq/types/contract';

import { electronHostApp } from './electronApp.ts';
import { electronHostClipboard } from './electronClipboard.ts';
import {
  electronHostAccessibilityGroup,
  electronHostAudioDecodeGroup,
  electronHostAudioGroup,
  electronHostBitmapGroup,
  electronHostConnectivityGroup,
  electronHostDeviceGroup,
  electronHostFileSystemGroup,
  electronHostFontGroup,
  electronHostFullscreenGroup,
  electronHostGeolocationGroup,
  electronHostGlGroup,
  electronHostGlyphGroup,
  electronHostHapticsGroup,
  electronHostImageDecodeGroup,
  electronHostImageEncodeGroup,
  electronHostImageGroup,
  electronHostInputGroup,
  electronHostLifecycleGroup,
  electronHostMediaSessionGroup,
  electronHostMidiGroup,
  electronHostNetGroup,
  electronHostPermissionsGroup,
  electronHostSensorsGroup,
  electronHostShareGroup,
  electronHostSocketGroup,
  electronHostSoftKeyboardGroup,
  electronHostStatusBarGroup,
  electronHostCanvasGroup,
  electronHostCompressGroup,
  electronHostSurfaceGroup,
  electronHostTextSegmentGroup,
  electronHostDecompressGroup,
  electronHostTextShaperGroup,
  electronHostVideoGroup,
  electronHostWgpuGroup,
} from './electronDefaultHostGroups.ts';
import { electronHostDialog } from './electronDialog.ts';
import { electronHostIpc } from './electronIpc.ts';
import { electronHostMenu } from './electronMenu.ts';
import { electronHostNotification } from './electronNotification.ts';
import { electronHostPlatformGroup } from './electronPlatform.ts';
import { electronHostPower } from './electronPower.ts';
import { electronHostProtocol } from './electronProtocol.ts';
import { electronHostScreen } from './electronScreen.ts';
import { electronHostShell } from './electronShell.ts';
import { electronHostShortcut } from './electronShortcut.ts';
import { electronHostStorageGroup } from './electronStorage.ts';
import { electronHostTray } from './electronTray.ts';
import { electronHostUpdater } from './electronUpdater.ts';
import { electronHostWindow } from './electronWindow.ts';

// Constructs the explicit Electron host from an injected Electron API and platform profile. Every
// group is built through its separately exported constructor, including exact empty groups for
// unsupported coverage; no process-wide registration or ambient state is installed.
export function electronHost(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions> & { readonly platform: 'macos' },
): ElectronMacosHost;
export function electronHost<Profile extends 'linux' | 'windows'>(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions> & { readonly platform: Profile },
): ElectronHost<Profile>;
export function electronHost(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions>,
): ElectronHost<DesktopOsProfile> | ElectronMacosHost;
export function electronHost(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions>,
): ElectronHost<DesktopOsProfile> | ElectronMacosHost {
  const groups = {
    accessibility: electronHostAccessibilityGroup(electron),
    app: electronHostApp(electron, options.platform),
    audio: electronHostAudioGroup(electron),
    audioDecode: electronHostAudioDecodeGroup(electron),
    bitmap: electronHostBitmapGroup(electron),
    canvas: electronHostCanvasGroup(electron),
    clipboard: electronHostClipboard(electron),
    compress: electronHostCompressGroup(electron),
    connectivity: electronHostConnectivityGroup(electron),
    device: electronHostDeviceGroup(electron),
    dialog: electronHostDialog(electron),
    fileSystem: electronHostFileSystemGroup(electron),
    font: electronHostFontGroup(electron),
    fullscreen: electronHostFullscreenGroup(electron),
    geolocation: electronHostGeolocationGroup(electron),
    gl: electronHostGlGroup(electron),
    glyph: electronHostGlyphGroup(electron),
    haptics: electronHostHapticsGroup(electron),
    image: electronHostImageGroup(electron),
    imageDecode: electronHostImageDecodeGroup(electron),
    imageEncode: electronHostImageEncodeGroup(electron),
    input: electronHostInputGroup(electron),
    ipc: electronHostIpc(electron),
    lifecycle: electronHostLifecycleGroup(electron),
    mediaSession: electronHostMediaSessionGroup(electron),
    menu: electronHostMenu(electron),
    midi: electronHostMidiGroup(electron),
    net: electronHostNetGroup(electron),
    notification: electronHostNotification(electron, options),
    permissions: electronHostPermissionsGroup(electron),
    platform: electronHostPlatformGroup(electron),
    power: electronHostPower(electron),
    preferences: electronHostStorageGroup(electron, options.storageFileName),
    protocol: electronHostProtocol(electron),
    screen: electronHostScreen(electron),
    sensors: electronHostSensorsGroup(electron),
    share: electronHostShareGroup(electron),
    shell: electronHostShell(electron, options.platform),
    shortcut: electronHostShortcut(electron),
    socket: electronHostSocketGroup(electron),
    softKeyboard: electronHostSoftKeyboardGroup(electron),
    statusBar: electronHostStatusBarGroup(electron),
    surface: electronHostSurfaceGroup(electron),
    textSegment: electronHostTextSegmentGroup(electron),
    decompress: electronHostDecompressGroup(electron),
    textShaper: electronHostTextShaperGroup(electron),
    tray: electronHostTray(electron, options.platform),
    updater: electronHostUpdater(electron, options.updaterFeedUrl),
    video: electronHostVideoGroup(electron),
    wgpu: electronHostWgpuGroup(electron),
    window: electronHostWindow(electron),
  } as const satisfies Omit<Host, typeof EntityRuntimeKey>;
  return createHost(groups) as ElectronHost<DesktopOsProfile> | ElectronMacosHost;
}

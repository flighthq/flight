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

import { electronHostApp } from './electronApp';
import { electronHostClipboard } from './electronClipboard';
import {
  electronHostAccessibilityGroup,
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
} from './electronDefaultHostGroups';
import { electronHostDialog } from './electronDialog';
import { electronHostIpc } from './electronIpc';
import { electronHostMenu } from './electronMenu';
import { electronHostNotification } from './electronNotification';
import { electronHostPlatformGroup } from './electronPlatform';
import { electronHostPower } from './electronPower';
import { electronHostProtocol } from './electronProtocol';
import { electronHostScreen } from './electronScreen';
import { electronHostShell } from './electronShell';
import { electronHostShortcut } from './electronShortcut';
import { electronHostStorageGroup } from './electronStorage';
import { electronHostTray } from './electronTray';
import { electronHostUpdater } from './electronUpdater';
import { electronHostWindow } from './electronWindow';

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

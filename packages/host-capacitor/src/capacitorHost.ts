import { createHost } from '@flighthq/host/contract';
import type { CapacitorApi, CapacitorHost, EntityRuntimeKey, MobileOsProfile } from '@flighthq/types/contract';

import { capacitorHostApp } from './capacitorApp.ts';
import { capacitorHostClipboard } from './capacitorClipboard.ts';
import { capacitorHostConnectivity } from './capacitorConnectivity.ts';
import {
  capacitorHostAccessibility,
  capacitorHostAudio,
  capacitorHostAudioDecode,
  capacitorHostBitmap,
  capacitorHostFont,
  capacitorHostFullscreen,
  capacitorHostGl,
  capacitorHostGlyph,
  capacitorHostImage,
  capacitorHostImageDecode,
  capacitorHostImageEncode,
  capacitorHostInput,
  capacitorHostIpc,
  capacitorHostLifecycle,
  capacitorHostMediaSession,
  capacitorHostMenu,
  capacitorHostMidi,
  capacitorHostNet,
  capacitorHostPermissions,
  capacitorHostPlatform,
  capacitorHostPower,
  capacitorHostPreferences,
  capacitorHostScreen,
  capacitorHostSensors,
  capacitorHostShell,
  capacitorHostShortcut,
  capacitorHostSocket,
  capacitorHostCanvas,
  capacitorHostCompress,
  capacitorHostSurface,
  capacitorHostTextSegment,
  capacitorHostDecompress,
  capacitorHostTextShaper,
  capacitorHostTray,
  capacitorHostUpdater,
  capacitorHostVideo,
  capacitorHostWgpu,
  capacitorHostWindow,
} from './capacitorDefaultHostGroups.ts';
import { capacitorHostDialog } from './capacitorDialog.ts';
import { capacitorHostHapticsGroup, capacitorHostSoftKeyboardGroup } from './capacitorInputHost.ts';
import { capacitorHostNotification } from './capacitorNotification.ts';
import { capacitorHostProtocol } from './capacitorProtocol.ts';
import { capacitorHostShare } from './capacitorShare.ts';
import { capacitorHostStatusBarGroup } from './capacitorStatusBar.ts';
import { capacitorHostFileSystemGroup } from './capacitorStorageHost.ts';
import { capacitorHostDeviceGroup, capacitorHostGeolocationGroup } from './capacitorSystemHost.ts';

// The explicit Capacitor host. Every populated slot below is backed by a real plugin operation; empty
// groups make unsupported or not-yet-migrated coverage explicit.
export function capacitorHost<Profile extends MobileOsProfile>(
  capacitor: CapacitorApi,
  profile: Profile,
): CapacitorHost<Profile> {
  return createHost({
    accessibility: capacitorHostAccessibility(),
    app: capacitorHostApp(capacitor, profile),
    audio: capacitorHostAudio(),
    audioDecode: capacitorHostAudioDecode(),
    bitmap: capacitorHostBitmap(),
    canvas: capacitorHostCanvas(),
    clipboard: capacitorHostClipboard(capacitor),
    compress: capacitorHostCompress(),
    connectivity: capacitorHostConnectivity(capacitor),
    device: capacitorHostDeviceGroup(capacitor),
    dialog: capacitorHostDialog(capacitor),
    fileSystem: capacitorHostFileSystemGroup(capacitor),
    font: capacitorHostFont(),
    fullscreen: capacitorHostFullscreen(),
    geolocation: capacitorHostGeolocationGroup(capacitor),
    gl: capacitorHostGl(),
    glyph: capacitorHostGlyph(),
    haptics: capacitorHostHapticsGroup(capacitor),
    image: capacitorHostImage(),
    imageDecode: capacitorHostImageDecode(),
    imageEncode: capacitorHostImageEncode(),
    input: capacitorHostInput(),
    ipc: capacitorHostIpc(),
    lifecycle: capacitorHostLifecycle(),
    mediaSession: capacitorHostMediaSession(),
    menu: capacitorHostMenu(),
    midi: capacitorHostMidi(),
    net: capacitorHostNet(),
    notification: capacitorHostNotification(capacitor),
    permissions: capacitorHostPermissions(),
    platform: capacitorHostPlatform(),
    power: capacitorHostPower(),
    preferences: capacitorHostPreferences(),
    protocol: capacitorHostProtocol(capacitor),
    screen: capacitorHostScreen(),
    sensors: capacitorHostSensors(),
    share: capacitorHostShare(capacitor),
    shell: capacitorHostShell(),
    shortcut: capacitorHostShortcut(),
    socket: capacitorHostSocket(),
    softKeyboard: capacitorHostSoftKeyboardGroup(capacitor),
    statusBar: capacitorHostStatusBarGroup(capacitor),
    surface: capacitorHostSurface(),
    textSegment: capacitorHostTextSegment(),
    decompress: capacitorHostDecompress(),
    textShaper: capacitorHostTextShaper(),
    tray: capacitorHostTray(),
    updater: capacitorHostUpdater(),
    video: capacitorHostVideo(),
    wgpu: capacitorHostWgpu(),
    window: capacitorHostWindow(),
  } as const satisfies Omit<CapacitorHost<Profile>, typeof EntityRuntimeKey>);
}

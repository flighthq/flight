import { createHost } from '@flighthq/host/contract';
import type { CapacitorApi, CapacitorHost, EntityRuntimeKey, MobileOsProfile } from '@flighthq/types/contract';

import { capacitorHostApp } from './capacitorApp';
import { capacitorHostClipboard } from './capacitorClipboard';
import { capacitorHostConnectivity } from './capacitorConnectivity';
import {
  capacitorHostAccessibility,
  capacitorHostAudio,
  capacitorHostBitmap,
  capacitorHostFont,
  capacitorHostFullscreen,
  capacitorHostGl,
  capacitorHostGlyph,
  capacitorHostImage,
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
  capacitorHostSurface,
  capacitorHostTextSegment,
  capacitorHostTextShaper,
  capacitorHostTray,
  capacitorHostUpdater,
  capacitorHostVideo,
  capacitorHostWgpu,
  capacitorHostWindow,
} from './capacitorDefaultHostGroups';
import { capacitorHostDialog } from './capacitorDialog';
import { capacitorHostHapticsGroup, capacitorHostSoftKeyboardGroup } from './capacitorInputHost';
import { capacitorHostNotification } from './capacitorNotification';
import { capacitorHostProtocol } from './capacitorProtocol';
import { capacitorHostShare } from './capacitorShare';
import { capacitorHostStatusBarGroup } from './capacitorStatusBar';
import { capacitorHostFileSystemGroup } from './capacitorStorageHost';
import { capacitorHostDeviceGroup, capacitorHostGeolocationGroup } from './capacitorSystemHost';

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
    bitmap: capacitorHostBitmap(),
    clipboard: capacitorHostClipboard(capacitor),
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
    textShaper: capacitorHostTextShaper(),
    tray: capacitorHostTray(),
    updater: capacitorHostUpdater(),
    video: capacitorHostVideo(),
    wgpu: capacitorHostWgpu(),
    window: capacitorHostWindow(),
  } as const satisfies Omit<CapacitorHost<Profile>, typeof EntityRuntimeKey>);
}

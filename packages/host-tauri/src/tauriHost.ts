import { createHost } from '@flighthq/host/contract';
import type { DesktopOsProfile, EntityRuntimeKey, TauriApi, TauriHost } from '@flighthq/types/contract';

import { tauriHostApp } from './tauriApp';
import { tauriHostClipboard } from './tauriClipboard';
import { tauriHostDialog } from './tauriDialog';
import { tauriHostMenu } from './tauriMenu';
import { tauriHostNotification } from './tauriNotification';
import { tauriHostPlatformGroup } from './tauriPlatform';
import { tauriHostShell } from './tauriShell';
import { tauriHostShortcut } from './tauriShortcut';
import { tauriHostTray } from './tauriTray';
import {
  tauriHostAccessibility,
  tauriHostAudio,
  tauriHostBitmap,
  tauriHostConnectivity,
  tauriHostDevice,
  tauriHostFileSystem,
  tauriHostFont,
  tauriHostFullscreen,
  tauriHostGeolocation,
  tauriHostGl,
  tauriHostGlyph,
  tauriHostHaptics,
  tauriHostImage,
  tauriHostInput,
  tauriHostIpc,
  tauriHostLifecycle,
  tauriHostMediaSession,
  tauriHostMidi,
  tauriHostNet,
  tauriHostPermissions,
  tauriHostPower,
  tauriHostPreferences,
  tauriHostProtocol,
  tauriHostScreen,
  tauriHostSensors,
  tauriHostShare,
  tauriHostSocket,
  tauriHostSoftKeyboard,
  tauriHostStatusBar,
  tauriHostSurface,
  tauriHostTextSegment,
  tauriHostTextShaper,
  tauriHostUpdater,
  tauriHostVideo,
  tauriHostWgpu,
} from './tauriUnsupportedHostGroups';
import { tauriHostWindow } from './tauriWindow';

// Builds the explicit Tauri host from an injected aggregate of the Tauri v2 JS API modules and
// plugins. Unsupported groups are constructed explicitly so capability absence remains honest.
export function tauriHost<Profile extends DesktopOsProfile>(tauri: TauriApi, profile: Profile): TauriHost<Profile> {
  return createHost({
    accessibility: tauriHostAccessibility(),
    app: tauriHostApp(tauri),
    audio: tauriHostAudio(),
    bitmap: tauriHostBitmap(),
    clipboard: tauriHostClipboard(tauri),
    connectivity: tauriHostConnectivity(),
    device: tauriHostDevice(),
    dialog: tauriHostDialog(tauri),
    fileSystem: tauriHostFileSystem(),
    font: tauriHostFont(),
    fullscreen: tauriHostFullscreen(),
    geolocation: tauriHostGeolocation(),
    gl: tauriHostGl(),
    glyph: tauriHostGlyph(),
    haptics: tauriHostHaptics(),
    image: tauriHostImage(),
    input: tauriHostInput(),
    ipc: tauriHostIpc(),
    lifecycle: tauriHostLifecycle(),
    mediaSession: tauriHostMediaSession(),
    menu: tauriHostMenu(tauri),
    midi: tauriHostMidi(),
    net: tauriHostNet(),
    notification: tauriHostNotification(tauri),
    permissions: tauriHostPermissions(),
    platform: tauriHostPlatformGroup(tauri),
    power: tauriHostPower(),
    preferences: tauriHostPreferences(),
    protocol: tauriHostProtocol(),
    screen: tauriHostScreen(),
    sensors: tauriHostSensors(),
    share: tauriHostShare(),
    shell: tauriHostShell(tauri),
    shortcut: tauriHostShortcut(tauri),
    socket: tauriHostSocket(),
    softKeyboard: tauriHostSoftKeyboard(),
    statusBar: tauriHostStatusBar(),
    surface: tauriHostSurface(),
    textSegment: tauriHostTextSegment(),
    textShaper: tauriHostTextShaper(),
    tray: tauriHostTray(tauri, profile),
    updater: tauriHostUpdater(),
    video: tauriHostVideo(),
    wgpu: tauriHostWgpu(),
    window: tauriHostWindow(tauri),
  } as const satisfies Omit<TauriHost<Profile>, typeof EntityRuntimeKey>);
}

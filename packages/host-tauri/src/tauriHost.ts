import { createHost } from '@flighthq/host/contract';
import type { DesktopOsProfile, EntityRuntimeKey, TauriApi, TauriHost } from '@flighthq/types/contract';

import { tauriHostApp } from './tauriApp.ts';
import { tauriHostClipboard } from './tauriClipboard.ts';
import { tauriHostDialog } from './tauriDialog.ts';
import { tauriHostMenu } from './tauriMenu.ts';
import { tauriHostNotification } from './tauriNotification.ts';
import { tauriHostPlatformGroup } from './tauriPlatform.ts';
import { tauriHostShell } from './tauriShell.ts';
import { tauriHostShortcut } from './tauriShortcut.ts';
import { tauriHostTray } from './tauriTray.ts';
import {
  tauriHostAccessibility,
  tauriHostAudio,
  tauriHostAudioDecode,
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
  tauriHostImageDecode,
  tauriHostImageEncode,
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
  tauriHostCanvas,
  tauriHostCompress,
  tauriHostSurface,
  tauriHostTextSegment,
  tauriHostDecompress,
  tauriHostTextShaper,
  tauriHostUpdater,
  tauriHostVideo,
  tauriHostWgpu,
} from './tauriUnsupportedHostGroups.ts';
import { tauriHostWindow } from './tauriWindow.ts';

// Builds the explicit Tauri host from an injected aggregate of the Tauri v2 JS API modules and
// plugins. Unsupported groups are constructed explicitly so capability absence remains honest.
export function tauriHost<Profile extends DesktopOsProfile>(tauri: TauriApi, profile: Profile): TauriHost<Profile> {
  return createHost({
    accessibility: tauriHostAccessibility(),
    app: tauriHostApp(tauri),
    audio: tauriHostAudio(),
    audioDecode: tauriHostAudioDecode(),
    bitmap: tauriHostBitmap(),
    canvas: tauriHostCanvas(),
    clipboard: tauriHostClipboard(tauri),
    compress: tauriHostCompress(),
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
    imageDecode: tauriHostImageDecode(),
    imageEncode: tauriHostImageEncode(),
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
    decompress: tauriHostDecompress(),
    textShaper: tauriHostTextShaper(),
    tray: tauriHostTray(tauri, profile),
    updater: tauriHostUpdater(),
    video: tauriHostVideo(),
    wgpu: tauriHostWgpu(),
    window: tauriHostWindow(tauri),
  } as const satisfies Omit<TauriHost<Profile>, typeof EntityRuntimeKey>);
}

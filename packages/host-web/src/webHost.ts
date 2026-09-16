import { createHost } from '@flighthq/host/contract';
import type { EntityRuntimeKey, WebHost } from '@flighthq/types/contract';

import { webHostAccessibilityGroup } from './webAccessibilityHost';
import { webHostApp } from './webAppHost';
import { webHostAudioGroup } from './webAudioHost';
import { webHostBitmap } from './webBitmapHost';
import { webHostClipboard } from './webClipboardHost';
import { webHostConnectivity } from './webConnectivityHost';
import { webHostDeviceGroup } from './webDeviceHost';
import { webHostDialog } from './webDialogHost';
import { webHostFileSystemGroup } from './webFileSystemHost';
import { webHostFont } from './webFontHost';
import { webHostFullscreenGroup } from './webFullscreenHost';
import { webHostGeolocationGroup } from './webGeolocationHost';
import { webHostGlGroup } from './webGlHost';
import { webHostGlyph } from './webGlyphHost';
import { webHostHapticsGroup } from './webHapticsHost';
import { webHostImageGroup } from './webImageHost';
import { webHostInput } from './webInputHost';
import { webHostIpc } from './webIpcHost';
import { webHostLifecycleGroup } from './webLifecycleHost';
import { webHostMediaSessionGroup } from './webMediaSessionHost';
import { webHostMenu } from './webMenuHost';
import { webHostMidi } from './webMidiHost';
import { webHostNetGroup } from './webNetHost';
import { webHostNotification } from './webNotificationHost';
import { webHostPermissionsGroup } from './webPermissionsHost';
import { webHostPlatformGroup } from './webPlatformHost';
import { webHostPower } from './webPowerHost';
import { webHostPreferences } from './webPreferencesHost';
import { webHostProtocol } from './webProtocolHost';
import { webHostScreen } from './webScreenHost';
import { webHostSensorsGroup } from './webSensorsHost';
import { webHostShare } from './webShareHost';
import { webHostShell } from './webShellHost';
import { webHostShortcut } from './webShortcutHost';
import { webHostSoftKeyboard } from './webSoftKeyboardHost';
import { webHostStatusBar } from './webStatusBarHost';
import { webHostSurfaceGroup } from './webSurfaceHost';
import { webHostTextSegment } from './webTextSegmentHost';
import { webHostTextShaper } from './webTextShaperHost';
import { webHostTray } from './webTrayHost';
import { webHostUpdater } from './webUpdaterHost';
import { webHostVideoGroup } from './webVideoHost';
import { webHostWgpu } from './webWgpuHost';
import { webHostWindow } from './webWindowHost';

// `satisfies Omit<WebHost, …>` is what keeps WebHost honest in the direction that matters: a slot it
// claims that no group fills fails to typecheck here. The converse — a group gaining a slot WebHost does
// not list — is NOT caught at this site, because the group value is an identifier and `satisfies` only
// excess-checks a fresh object literal. That direction cannot mislead, though: WebHost would understate,
// and the first caller to reach for the new slot gets a type error naming the gap. The annotation on the
// const then publishes WebHost as the host's type — a named struct in C++ rather than an anonymous
// structural row, and for a caller a host whose filled slots are stated.
const groups = {
  accessibility: webHostAccessibilityGroup,
  app: webHostApp,
  audio: webHostAudioGroup,
  bitmap: webHostBitmap,
  clipboard: webHostClipboard,
  connectivity: webHostConnectivity,
  device: webHostDeviceGroup,
  dialog: webHostDialog,
  fileSystem: webHostFileSystemGroup,
  font: webHostFont,
  fullscreen: webHostFullscreenGroup,
  geolocation: webHostGeolocationGroup,
  gl: webHostGlGroup,
  glyph: webHostGlyph,
  haptics: webHostHapticsGroup,
  image: webHostImageGroup,
  input: webHostInput,
  ipc: webHostIpc,
  lifecycle: webHostLifecycleGroup,
  mediaSession: webHostMediaSessionGroup,
  menu: webHostMenu,
  midi: webHostMidi,
  net: webHostNetGroup,
  notification: webHostNotification,
  permissions: webHostPermissionsGroup,
  platform: webHostPlatformGroup,
  power: webHostPower,
  preferences: webHostPreferences,
  protocol: webHostProtocol,
  screen: webHostScreen,
  sensors: webHostSensorsGroup,
  share: webHostShare,
  shell: webHostShell,
  shortcut: webHostShortcut,
  softKeyboard: webHostSoftKeyboard,
  statusBar: webHostStatusBar,
  surface: webHostSurfaceGroup,
  textSegment: webHostTextSegment,
  textShaper: webHostTextShaper,
  tray: webHostTray,
  updater: webHostUpdater,
  video: webHostVideoGroup,
  wgpu: webHostWgpu,
  window: webHostWindow,
} as const satisfies Omit<WebHost, typeof EntityRuntimeKey>;

export const webHost: WebHost = createHost(groups);

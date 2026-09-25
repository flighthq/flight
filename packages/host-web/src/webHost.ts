import { createHost } from '@flighthq/host/contract';
import type { EntityRuntimeKey, WebHost } from '@flighthq/types/contract';

import { webHostAccessibilityGroup } from './webAccessibilityHost.ts';
import { webHostApp } from './webAppHost.ts';
import { webHostAudioDecode } from './webAudioDecodeHost.ts';
import { webHostAudioGroup } from './webAudioHost.ts';
import { webHostBitmap } from './webBitmapHost.ts';
import { webHostCanvasGroup } from './webCanvasHost.ts';
import { webHostClipboard } from './webClipboardHost.ts';
import { webHostCompress } from './webCompressHost.ts';
import { webHostConnectivity } from './webConnectivityHost.ts';
import { webHostDecompress } from './webDecompressHost.ts';
import { webHostDeviceGroup } from './webDeviceHost.ts';
import { webHostDialog } from './webDialogHost.ts';
import { webHostFileSystemGroup } from './webFileSystemHost.ts';
import { webHostFont } from './webFontHost.ts';
import { webHostFullscreenGroup } from './webFullscreenHost.ts';
import { webHostGeolocationGroup } from './webGeolocationHost.ts';
import { webHostGlGroup } from './webGlHost.ts';
import { webHostGlyph } from './webGlyphHost.ts';
import { webHostHapticsGroup } from './webHapticsHost.ts';
import { webHostImageDecode } from './webImageDecodeHost.ts';
import { webHostImageEncode } from './webImageEncodeHost.ts';
import { webHostImageGroup } from './webImageHost.ts';
import { webHostInput } from './webInputHost.ts';
import { webHostIpc } from './webIpcHost.ts';
import { webHostLifecycleGroup } from './webLifecycleHost.ts';
import { webHostMediaSessionGroup } from './webMediaSessionHost.ts';
import { webHostMenu } from './webMenuHost.ts';
import { webHostMidi } from './webMidiHost.ts';
import { webHostNetGroup } from './webNetHost.ts';
import { webHostNotification } from './webNotificationHost.ts';
import { webHostPermissionsGroup } from './webPermissionsHost.ts';
import { webHostPlatformGroup } from './webPlatformHost.ts';
import { webHostPower } from './webPowerHost.ts';
import { webHostPreferences } from './webPreferencesHost.ts';
import { webHostProtocol } from './webProtocolHost.ts';
import { webHostScreen } from './webScreenHost.ts';
import { webHostSensorsGroup } from './webSensorsHost.ts';
import { webHostShare } from './webShareHost.ts';
import { webHostShell } from './webShellHost.ts';
import { webHostShortcut } from './webShortcutHost.ts';
import { webHostSocketGroup } from './webSocketHost.ts';
import { webHostSoftKeyboard } from './webSoftKeyboardHost.ts';
import { webHostStatusBar } from './webStatusBarHost.ts';
import { webHostSurfaceGroup } from './webSurfaceHost.ts';
import { webHostTextSegment } from './webTextSegmentHost.ts';
import { webHostTextShaperGroup } from './webTextShaperHost.ts';
import { webHostTray } from './webTrayHost.ts';
import { webHostUpdater } from './webUpdaterHost.ts';
import { webHostVideoGroup } from './webVideoHost.ts';
import { webHostWgpu } from './webWgpuHost.ts';
import { webHostWindow } from './webWindowHost.ts';

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
  audioDecode: webHostAudioDecode,
  bitmap: webHostBitmap,
  canvas: webHostCanvasGroup,
  clipboard: webHostClipboard,
  compress: webHostCompress,
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
  imageDecode: webHostImageDecode,
  imageEncode: webHostImageEncode,
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
  socket: webHostSocketGroup,
  softKeyboard: webHostSoftKeyboard,
  statusBar: webHostStatusBar,
  surface: webHostSurfaceGroup,
  textSegment: webHostTextSegment,
  decompress: webHostDecompress,
  textShaper: webHostTextShaperGroup,
  tray: webHostTray,
  updater: webHostUpdater,
  video: webHostVideoGroup,
  wgpu: webHostWgpu,
  window: webHostWindow,
} as const satisfies Omit<WebHost, typeof EntityRuntimeKey>;

export const webHost: WebHost = createHost(groups);

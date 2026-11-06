import type { HostAppCapabilities, HostFullscreenCapabilities, HostWindowCapabilities } from '@flighthq/app/contract';
import type { HostAudioCodecCapability, HostAudioDecodeCapabilities } from '@flighthq/audio/contract';
import type { HostClipboardCapabilities } from '@flighthq/clipboard/contract';
import type { HostDeviceCapabilities } from '@flighthq/device/contract';
import type {
  HostBitmapCapabilities,
  HostCompressCapabilities,
  HostConnectivityCapabilities,
  HostDecompressCapabilities,
  HostDialogCapabilities,
  HostFileSystemCapabilities,
  HostFontCapabilities,
  HostGeolocationCapabilities,
  HostGlyphCapabilities,
  HostImageCapabilities,
  HostMidiCapabilities,
  HostNotificationCapabilities,
  HostPermissionsCapabilities,
  HostProtocolCapabilities,
  HostShareCapabilities,
  HostUpdaterCapabilities,
} from '@flighthq/host/contract';
import type { HostInputCapabilities } from '@flighthq/input/contract';
import type { HostIpcCapabilities } from '@flighthq/ipc/contract';
import type {
  HostSoftKeyboardAccessoryBarCapability,
  HostSoftKeyboardChangeCapability,
  HostSoftKeyboardInfoCapability,
  HostSoftKeyboardResizeModeWriteCapability,
  HostSoftKeyboardScrollAssistCapability,
  HostSoftKeyboardStyleCapability,
  HostSoftKeyboardVisibilityCapability,
} from '@flighthq/keyboard/contract';
import type { HostLifecycleCapabilities } from '@flighthq/lifecycle/contract';
import type { HostMediaSessionCapabilities } from '@flighthq/mediasession/contract';
import type { HostMenuCapabilities } from '@flighthq/menu/contract';
import type { HostNetCapabilities } from '@flighthq/net/contract';
import type { HostPlatformCapabilities } from '@flighthq/platform/contract';
import type { HostPowerCapabilities } from '@flighthq/power/contract';
import type { HostPreferencesCapabilities } from '@flighthq/preferences/contract';
import type { HostWgpuCapabilities } from '@flighthq/render-wgpu/contract';
import type { HostScreenCapabilities } from '@flighthq/screen/contract';
import type { HostSensorsCapabilities } from '@flighthq/sensors/contract';
import type { HostShellCapabilities } from '@flighthq/shell/contract';
import type { HostShortcutCapabilities } from '@flighthq/shortcut/contract';
import type { HostSocketCapabilities } from '@flighthq/socket/contract';
import type { HostStatusBarCapabilities } from '@flighthq/statusbar/contract';
import type { HostCanvasCapabilities, HostSurfaceCapabilities } from '@flighthq/surface/contract';
import type { HostTrayCapabilities } from '@flighthq/tray/contract';
import type { HostVideoCapabilities } from '@flighthq/video/contract';

export type { HostScreenCapabilities } from '@flighthq/screen/contract';
export type { HostSensorsCapabilities } from '@flighthq/sensors/contract';
export type { HostShortcutCapabilities } from '@flighthq/shortcut/contract';
export type { HostStatusBarCapabilities } from '@flighthq/statusbar/contract';
export type { HostPlatformCapabilities } from '@flighthq/platform/contract';

import type { HostAccessibilityCapability } from '@flighthq/accessibility/contract';

import type { Entity } from './Entity.ts';
import type { HostHapticsCapabilities } from './Haptics.ts';
import type { HostAudioDeviceCapability } from './HostAudioDevice.ts';
import type { HostAudioMixerCapability } from './HostAudioMixer.ts';
import type { HostGlCapability } from './HostGl.ts';
import type { HostImageDecodeCapabilities } from './HostImageDecode.ts';
import type { HostImageEncodeCapabilities } from './HostImageEncode.ts';
import type { HostTextSegmenterCapability } from './TextSegment.ts';
import type { HostTextShaperCapability } from './TextShaper.ts';

/** @deprecated Import `HostInputCapabilities` from `@flighthq/input/contract`. */
export type { HostInputCapabilities } from '@flighthq/input/contract';
export type { HostMediaSessionCapabilities } from '@flighthq/mediasession/contract';
export type { HostIpcCapabilities } from '@flighthq/ipc/contract';

export interface Host extends Entity {
  readonly accessibility: HostAccessibilityCapabilities;
  readonly app: HostAppCapabilities;
  readonly audio: HostAudioCapabilities;
  readonly audioDecode: HostAudioDecodeCapabilities;
  readonly bitmap: HostBitmapCapabilities;
  readonly canvas: HostCanvasCapabilities;
  readonly clipboard: HostClipboardCapabilities;
  readonly compress: HostCompressCapabilities;
  readonly connectivity: HostConnectivityCapabilities;
  readonly decompress: HostDecompressCapabilities;
  readonly device: HostDeviceCapabilities;
  readonly dialog: HostDialogCapabilities;
  readonly fileSystem: HostFileSystemCapabilities;
  readonly font: HostFontCapabilities;
  readonly fullscreen: HostFullscreenCapabilities;
  readonly geolocation: HostGeolocationCapabilities;
  readonly gl: HostGlCapabilities;
  readonly glyph: HostGlyphCapabilities;
  readonly haptics: HostHapticsCapabilities;
  readonly image: HostImageCapabilities;
  readonly imageDecode: HostImageDecodeCapabilities;
  readonly imageEncode: HostImageEncodeCapabilities;
  readonly input: HostInputCapabilities;
  readonly ipc: HostIpcCapabilities;
  readonly lifecycle: HostLifecycleCapabilities;
  readonly mediaSession: HostMediaSessionCapabilities;
  readonly menu: HostMenuCapabilities;
  readonly midi: HostMidiCapabilities;
  readonly net: HostNetCapabilities;
  readonly notification: HostNotificationCapabilities;
  readonly permissions: HostPermissionsCapabilities;
  readonly platform: HostPlatformCapabilities;
  readonly power: HostPowerCapabilities;
  readonly preferences: HostPreferencesCapabilities;
  readonly protocol: HostProtocolCapabilities;
  readonly screen: HostScreenCapabilities;
  readonly sensors: HostSensorsCapabilities;
  readonly share: HostShareCapabilities;
  readonly shell: HostShellCapabilities;
  readonly shortcut: HostShortcutCapabilities;
  readonly socket: HostSocketCapabilities;
  readonly softKeyboard: HostSoftKeyboardCapabilities;
  readonly statusBar: HostStatusBarCapabilities;
  readonly surface: HostSurfaceCapabilities;
  readonly textSegment: HostTextSegmentCapabilities;
  readonly textShaper: HostTextShaperCapabilities;
  readonly tray: HostTrayCapabilities;
  readonly updater: HostUpdaterCapabilities;
  readonly video: HostVideoCapabilities;
  readonly wgpu: HostWgpuCapabilities;
  readonly window: HostWindowCapabilities;
}

export interface HostAccessibilityCapabilities {
  readonly tree?: HostAccessibilityCapability;
}

export interface HostAudioCapabilities {
  readonly codec?: HostAudioCodecCapability;
  readonly device?: HostAudioDeviceCapability;
  readonly mixer?: HostAudioMixerCapability;
}

export interface HostGlCapabilities {
  readonly context?: HostGlCapability;
}

export interface HostSoftKeyboardCapabilities {
  readonly accessoryBar?: HostSoftKeyboardAccessoryBarCapability;
  readonly change?: HostSoftKeyboardChangeCapability;
  readonly info?: HostSoftKeyboardInfoCapability;
  readonly resizeModeWrite?: HostSoftKeyboardResizeModeWriteCapability;
  readonly scrollAssist?: HostSoftKeyboardScrollAssistCapability;
  readonly style?: HostSoftKeyboardStyleCapability;
  readonly visibility?: HostSoftKeyboardVisibilityCapability;
}

export interface HostTextSegmentCapabilities {
  readonly segmenter?: HostTextSegmenterCapability;
}

export interface HostTextShaperCapabilities {
  readonly shaper?: HostTextShaperCapability;
}

export type { HostWgpuCapabilities } from '@flighthq/render-wgpu/contract';

/** @deprecated Import from `@flighthq/host/contract`. */
export type {
  HostConnectivityCapabilities,
  HostPermissionsCapabilities,
  HostUpdaterCapabilities,
  HostProtocolCapabilities,
  HostBitmapCapabilities,
  HostCompressCapabilities,
  HostDecompressCapabilities,
  HostDialogCapabilities,
  HostFileSystemCapabilities,
  HostFontCapabilities,
  HostGeolocationCapabilities,
  HostGlyphCapabilities,
  HostImageCapabilities,
  HostMidiCapabilities,
  HostNotificationCapabilities,
  HostShareCapabilities,
  WebScreenCapabilities,
} from '@flighthq/host/contract';

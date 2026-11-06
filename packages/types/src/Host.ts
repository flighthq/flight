import type { HostAppCapabilities, HostFullscreenCapabilities, HostWindowCapabilities } from '@flighthq/app/contract';
import type { HostAudioCodecCapability, HostAudioDecodeCapabilities } from '@flighthq/audio/contract';
import type { HostClipboardCapabilities } from '@flighthq/clipboard/contract';
import type { HostDeviceCapabilities } from '@flighthq/device/contract';
import type {
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
  HostProtocolCapabilities,
  HostShareCapabilities,
} from '@flighthq/host/contract';
import type { HostInputCapabilities } from '@flighthq/input/contract';
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
import type { HostMenuCapabilities } from '@flighthq/menu/contract';
import type { HostNetCapabilities } from '@flighthq/net/contract';
import type { HostPowerCapabilities } from '@flighthq/power/contract';
import type { HostPreferencesCapabilities } from '@flighthq/preferences/contract';
import type { HostWgpuCapabilities } from '@flighthq/render-wgpu/contract';
import type { HostScreenCapabilities } from '@flighthq/screen/contract';
import type { HostSensorsCapabilities } from '@flighthq/sensors/contract';
import type { HostShellCapabilities } from '@flighthq/shell/contract';
import type { HostSocketCapabilities } from '@flighthq/socket/contract';
import type { HostStatusBarCapabilities } from '@flighthq/statusbar/contract';
import type { HostCanvasCapabilities, HostSurfaceCapabilities } from '@flighthq/surface/contract';

export type { HostScreenCapabilities } from '@flighthq/screen/contract';
export type { HostSensorsCapabilities } from '@flighthq/sensors/contract';
export type { HostStatusBarCapabilities } from '@flighthq/statusbar/contract';

import type { HostAccessibilityCapability } from './Accessibility.ts';
import type {
  HostConnectivityChangeCapability,
  HostConnectivityReachabilityCapability,
  HostConnectivityStatusCapability,
} from './Connectivity.ts';
import type { Entity } from './Entity.ts';
import type { HostHapticsCapabilities } from './Haptics.ts';
import type { HostAudioDeviceCapability } from './HostAudioDevice.ts';
import type { HostAudioMixerCapability } from './HostAudioMixer.ts';
import type { HostGlCapability } from './HostGl.ts';
import type { HostImageDecodeCapabilities } from './HostImageDecode.ts';
import type { HostImageEncodeCapabilities } from './HostImageEncode.ts';
import type { HostVideoCapability } from './HostVideo.ts';
import type {
  HostIpcHandleCapability,
  HostIpcInvokeCapability,
  HostIpcMessageCapability,
  HostIpcSendCapability,
  HostIpcTargetedSendCapability,
} from './Ipc.ts';
import type { HostMediaSessionActionCapability, HostMediaSessionCapability } from './MediaSession.ts';
import type { HostPermissionsCapability } from './Permission.ts';
import type { HostPlatformCapability } from './Platform.ts';
import type { HostShortcutQueryCapability, HostShortcutTriggerCapability } from './Shortcut.ts';
import type { HostTextSegmenterCapability } from './TextSegment.ts';
import type { HostTextShaperCapability } from './TextShaper.ts';
import type {
  HostTrayBalloonCapability,
  HostTrayBalloonEventsCapability,
  HostTrayBoundsCapability,
  HostTrayDoubleClickPolicyCapability,
  HostTrayDropEventsCapability,
  HostTrayImageCapability,
  HostTrayInteractionEventsCapability,
  HostTrayLifecycleCapability,
  HostTrayMenuCapability,
  HostTrayMenuSelectionEventsCapability,
  HostTrayPopupMenuCapability,
  HostTrayPressedImageCapability,
  HostTrayTemplateImageCapability,
  HostTrayTitleCapability,
  HostTrayTooltipCapability,
} from './Tray.ts';
import type { HostUpdaterCommandCapability } from './Updater.ts';

/** @deprecated Import `HostInputCapabilities` from `@flighthq/input/contract`. */
export type { HostInputCapabilities } from '@flighthq/input/contract';

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

export interface HostConnectivityCapabilities {
  readonly change?: HostConnectivityChangeCapability;
  readonly reachability?: HostConnectivityReachabilityCapability;
  readonly status?: HostConnectivityStatusCapability;
}

export interface HostGlCapabilities {
  readonly context?: HostGlCapability;
}

export interface HostIpcCapabilities {
  readonly handle?: HostIpcHandleCapability;
  readonly invoke?: HostIpcInvokeCapability;
  readonly message?: HostIpcMessageCapability;
  readonly send?: HostIpcSendCapability;
  readonly targetedSend?: HostIpcTargetedSendCapability;
}

export interface HostMediaSessionCapabilities {
  readonly action?: HostMediaSessionActionCapability;
  readonly control?: HostMediaSessionCapability;
}

export interface HostPermissionsCapabilities {
  readonly query?: HostPermissionsCapability;
}

export interface HostPlatformCapabilities {
  readonly info?: HostPlatformCapability;
}

export interface HostShortcutCapabilities {
  readonly query?: HostShortcutQueryCapability;
  readonly trigger?: HostShortcutTriggerCapability;
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

export interface HostTrayCapabilities {
  readonly balloon?: HostTrayBalloonCapability;
  readonly balloonEvents?: HostTrayBalloonEventsCapability;
  readonly bounds?: HostTrayBoundsCapability;
  readonly doubleClickPolicy?: HostTrayDoubleClickPolicyCapability;
  readonly dropEvents?: HostTrayDropEventsCapability;
  readonly image?: HostTrayImageCapability;
  readonly interactionEvents?: HostTrayInteractionEventsCapability;
  readonly lifecycle?: HostTrayLifecycleCapability;
  readonly menu?: HostTrayMenuCapability;
  readonly menuSelectionEvents?: HostTrayMenuSelectionEventsCapability;
  readonly popupMenu?: HostTrayPopupMenuCapability;
  readonly pressedImage?: HostTrayPressedImageCapability;
  readonly templateImage?: HostTrayTemplateImageCapability;
  readonly title?: HostTrayTitleCapability;
  readonly tooltip?: HostTrayTooltipCapability;
}

export interface HostUpdaterCapabilities {
  readonly command?: HostUpdaterCommandCapability;
}

export interface HostVideoCapabilities {
  readonly playback?: HostVideoCapability;
}

export type { HostWgpuCapabilities } from '@flighthq/render-wgpu/contract';

/** @deprecated Import from `@flighthq/host/contract`. */
export type {
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

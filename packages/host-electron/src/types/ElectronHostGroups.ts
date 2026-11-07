import type { HostAppCapabilities, HostFullscreenCapabilities, HostWindowCapabilities } from '@flighthq/app/contract';
import type { HostAudioDecodeCapabilities } from '@flighthq/audio/contract';
import type { HostClipboardCapabilities } from '@flighthq/clipboard/contract';
import type { HostDeviceCapabilities } from '@flighthq/device/contract';
import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { HostHapticsCapabilities } from '@flighthq/haptics/contract';
import type {
  HostAccessibilityCapabilities,
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
  HostSoftKeyboardCapabilities,
  HostTextSegmentCapabilities,
  HostUpdaterCapabilities,
} from '@flighthq/host/contract';
import type { HostImageDecodeCapabilities, HostImageEncodeCapabilities } from '@flighthq/image-codec/contract';
import type { HostInputCapabilities } from '@flighthq/input/contract';
import type { HostIpcCapabilities } from '@flighthq/ipc/contract';
import type { HostLifecycleCapabilities } from '@flighthq/lifecycle/contract';
import type { HostAudioCapabilities } from '@flighthq/media/contract';
import type { HostMediaSessionCapabilities } from '@flighthq/mediasession/contract';
import type { HostMenuCapabilities } from '@flighthq/menu/contract';
import type { HostNetCapabilities } from '@flighthq/net/contract';
import type { HostPlatformCapabilities } from '@flighthq/platform/contract';
import type { HostPowerCapabilities } from '@flighthq/power/contract';
import type { HostPreferencesCapabilities } from '@flighthq/preferences/contract';
import type { HostGlCapabilities } from '@flighthq/render-gl/contract';
import type { HostWgpuCapabilities } from '@flighthq/render-wgpu/contract';
import type { HostScreenCapabilities } from '@flighthq/screen/contract';
import type { HostSensorsCapabilities } from '@flighthq/sensors/contract';
import type { HostShellCapabilities } from '@flighthq/shell/contract';
import type { HostShortcutCapabilities } from '@flighthq/shortcut/contract';
import type { HostSocketCapabilities } from '@flighthq/socket/contract';
import type { HostStatusBarCapabilities } from '@flighthq/statusbar/contract';
import type { HostCanvasCapabilities, HostSurfaceCapabilities } from '@flighthq/surface/contract';
import type { HostTextShaperCapabilities } from '@flighthq/textshaper/contract';
import type { HostTrayCapabilities } from '@flighthq/tray/contract';
import type { HostVideoCapabilities } from '@flighthq/video/contract';

// Every capability group this provider's host carries (D26: there is no aggregate host; each provider
// declares its own). Groups the provider does not realize are present but empty.
export interface ElectronHostGroups extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
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

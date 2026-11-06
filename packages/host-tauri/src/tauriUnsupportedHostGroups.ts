import type { HostFullscreenCapabilities } from '@flighthq/app/contract';
import type { HostAudioDecodeCapabilities } from '@flighthq/audio/contract';
import type { HostDeviceCapabilities } from '@flighthq/device/contract';
import type { HostHapticsCapabilities } from '@flighthq/haptics/contract';
import {
  webHostAudioDecode,
  webHostImageDecode,
  webHostImageEncode,
  webHostTextShaperGroup,
} from '@flighthq/host-web/contract';
import type { HostProtocolCapabilities } from '@flighthq/host/contract';
import type { HostUpdaterCapabilities } from '@flighthq/host/contract';
import type { HostPermissionsCapabilities } from '@flighthq/host/contract';
import type { HostConnectivityCapabilities } from '@flighthq/host/contract';
import type {
  HostAccessibilityCapabilities,
  HostSoftKeyboardCapabilities,
  HostTextSegmentCapabilities,
} from '@flighthq/host/contract';
import type {
  HostBitmapCapabilities,
  HostFileSystemCapabilities,
  HostFontCapabilities,
  HostGeolocationCapabilities,
  HostGlyphCapabilities,
  HostImageCapabilities,
  HostMidiCapabilities,
  HostShareCapabilities,
  HostCompressCapabilities,
  HostDecompressCapabilities,
} from '@flighthq/host/contract';
import type { HostImageDecodeCapabilities, HostImageEncodeCapabilities } from '@flighthq/image-codec/contract';
import type { HostInputCapabilities } from '@flighthq/input/contract';
import type { HostIpcCapabilities } from '@flighthq/ipc/contract';
import type { HostLifecycleCapabilities } from '@flighthq/lifecycle/contract';
import type { HostAudioCapabilities } from '@flighthq/media/contract';
import type { HostMediaSessionCapabilities } from '@flighthq/mediasession/contract';
import type { HostNetCapabilities } from '@flighthq/net/contract';
import type { HostPowerCapabilities } from '@flighthq/power/contract';
import type { HostPreferencesCapabilities } from '@flighthq/preferences/contract';
import type { HostGlCapabilities } from '@flighthq/render-gl/contract';
import type { HostWgpuCapabilities } from '@flighthq/render-wgpu/contract';
import type { HostScreenCapabilities } from '@flighthq/screen/contract';
import type { HostSensorsCapabilities } from '@flighthq/sensors/contract';
import type { HostSocketCapabilities } from '@flighthq/socket/contract';
import type { HostStatusBarCapabilities } from '@flighthq/statusbar/contract';
import type { HostCanvasCapabilities, HostSurfaceCapabilities } from '@flighthq/surface/contract';
import type { HostTextShaperCapabilities } from '@flighthq/textshaper/contract';
import type { HostVideoCapabilities } from '@flighthq/video/contract';

// These constructors make the deliberately unsupported Tauri groups explicit. Returning an empty
// group is truthful and keeps capability absence structural rather than installing sentinel providers.
export function tauriHostAccessibility(): HostAccessibilityCapabilities {
  return {};
}

export function tauriHostAudio(): HostAudioCapabilities {
  return {};
}

export function tauriHostAudioDecode(): HostAudioDecodeCapabilities {
  return webHostAudioDecode;
}

export function tauriHostBitmap(): HostBitmapCapabilities {
  return {};
}

export function tauriHostCanvas(): HostCanvasCapabilities {
  return {};
}

export function tauriHostCompress(): HostCompressCapabilities {
  return {};
}

export function tauriHostConnectivity(): HostConnectivityCapabilities {
  return {};
}

export function tauriHostDecompress(): HostDecompressCapabilities {
  return {};
}

export function tauriHostDevice(): HostDeviceCapabilities {
  return {};
}

export function tauriHostFileSystem(): HostFileSystemCapabilities {
  return {};
}

export function tauriHostFont(): HostFontCapabilities {
  return {};
}

export function tauriHostFullscreen(): HostFullscreenCapabilities {
  return {};
}

export function tauriHostGeolocation(): HostGeolocationCapabilities {
  return {};
}

export function tauriHostGl(): HostGlCapabilities {
  return {};
}

export function tauriHostGlyph(): HostGlyphCapabilities {
  return {};
}

export function tauriHostHaptics(): HostHapticsCapabilities {
  return {};
}

export function tauriHostImage(): HostImageCapabilities {
  return {};
}

export function tauriHostImageDecode(): HostImageDecodeCapabilities {
  return webHostImageDecode;
}

export function tauriHostImageEncode(): HostImageEncodeCapabilities {
  return webHostImageEncode;
}

export function tauriHostInput(): HostInputCapabilities {
  return {};
}

export function tauriHostIpc(): HostIpcCapabilities {
  return {};
}

export function tauriHostLifecycle(): HostLifecycleCapabilities {
  return {};
}

export function tauriHostMediaSession(): HostMediaSessionCapabilities {
  return {};
}

export function tauriHostMidi(): HostMidiCapabilities {
  return {};
}

export function tauriHostNet(): HostNetCapabilities {
  return {};
}

export function tauriHostPermissions(): HostPermissionsCapabilities {
  return {};
}

export function tauriHostPower(): HostPowerCapabilities {
  return {};
}

export function tauriHostPreferences(): HostPreferencesCapabilities {
  return {};
}

export function tauriHostProtocol(): HostProtocolCapabilities {
  return {};
}

export function tauriHostScreen(): HostScreenCapabilities {
  return {};
}

export function tauriHostSensors(): HostSensorsCapabilities {
  return {};
}

export function tauriHostShare(): HostShareCapabilities {
  return {};
}

export function tauriHostSocket(): HostSocketCapabilities {
  return {};
}

export function tauriHostSoftKeyboard(): HostSoftKeyboardCapabilities {
  return {};
}

export function tauriHostStatusBar(): HostStatusBarCapabilities {
  return {};
}

export function tauriHostSurface(): HostSurfaceCapabilities {
  return {};
}

export function tauriHostTextSegment(): HostTextSegmentCapabilities {
  return {};
}

export function tauriHostTextShaper(): HostTextShaperCapabilities {
  return webHostTextShaperGroup;
}

export function tauriHostUpdater(): HostUpdaterCapabilities {
  return {};
}

export function tauriHostVideo(): HostVideoCapabilities {
  return {};
}

export function tauriHostWgpu(): HostWgpuCapabilities {
  return {};
}

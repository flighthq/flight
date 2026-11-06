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
import type { HostPermissionsCapabilities } from '@flighthq/host/contract';
import type { HostConnectivityCapabilities } from '@flighthq/host/contract';
import type {
  HostAccessibilityCapabilities,
  HostSoftKeyboardCapabilities,
  HostTextSegmentCapabilities,
} from '@flighthq/host/contract';
import type {
  HostBitmapCapabilities,
  HostCompressCapabilities,
  HostFileSystemCapabilities,
  HostFontCapabilities,
  HostGeolocationCapabilities,
  HostGlyphCapabilities,
  HostImageCapabilities,
  HostMidiCapabilities,
  HostShareCapabilities,
  HostDecompressCapabilities,
} from '@flighthq/host/contract';
import type { HostImageDecodeCapabilities, HostImageEncodeCapabilities } from '@flighthq/image-codec/contract';
import type { HostInputCapabilities } from '@flighthq/input/contract';
import type { HostLifecycleCapabilities } from '@flighthq/lifecycle/contract';
import type { HostAudioCapabilities } from '@flighthq/media/contract';
import type { HostMediaSessionCapabilities } from '@flighthq/mediasession/contract';
import type { HostNetCapabilities } from '@flighthq/net/contract';
import type { HostGlCapabilities } from '@flighthq/render-gl/contract';
import type { HostWgpuCapabilities } from '@flighthq/render-wgpu/contract';
import type { HostSensorsCapabilities } from '@flighthq/sensors/contract';
import type { HostSocketCapabilities } from '@flighthq/socket/contract';
import type { HostStatusBarCapabilities } from '@flighthq/statusbar/contract';
import type { HostCanvasCapabilities, HostSurfaceCapabilities } from '@flighthq/surface/contract';
import type { HostTextShaperCapabilities } from '@flighthq/textshaper/contract';
import type { HostVideoCapabilities } from '@flighthq/video/contract';

import type { ElectronApi } from './types/index.ts';

// Unsupported groups still have named constructors so the full Electron host has the same explicit
// 45-group composition boundary as every other canonical Host. Empty means absent, never stubbed.
export function electronHostAccessibilityGroup(_electron: ElectronApi): HostAccessibilityCapabilities {
  return {};
}

export function electronHostAudioDecodeGroup(_electron: ElectronApi): HostAudioDecodeCapabilities {
  return webHostAudioDecode;
}

export function electronHostAudioGroup(_electron: ElectronApi): HostAudioCapabilities {
  return {};
}

export function electronHostBitmapGroup(_electron: ElectronApi): HostBitmapCapabilities {
  return {};
}

export function electronHostCanvasGroup(_electron: ElectronApi): HostCanvasCapabilities {
  return {};
}

export function electronHostCompressGroup(_electron: ElectronApi): HostCompressCapabilities {
  return {};
}

export function electronHostConnectivityGroup(_electron: ElectronApi): HostConnectivityCapabilities {
  return {};
}

export function electronHostDecompressGroup(_electron: ElectronApi): HostDecompressCapabilities {
  return {};
}

export function electronHostDeviceGroup(_electron: ElectronApi): HostDeviceCapabilities {
  return {};
}

export function electronHostFileSystemGroup(_electron: ElectronApi): HostFileSystemCapabilities {
  return {};
}

export function electronHostFontGroup(_electron: ElectronApi): HostFontCapabilities {
  return {};
}

export function electronHostFullscreenGroup(_electron: ElectronApi): HostFullscreenCapabilities {
  return {};
}

export function electronHostGeolocationGroup(_electron: ElectronApi): HostGeolocationCapabilities {
  return {};
}

export function electronHostGlGroup(_electron: ElectronApi): HostGlCapabilities {
  return {};
}

export function electronHostGlyphGroup(_electron: ElectronApi): HostGlyphCapabilities {
  return {};
}

export function electronHostHapticsGroup(_electron: ElectronApi): HostHapticsCapabilities {
  return {};
}

export function electronHostImageDecodeGroup(_electron: ElectronApi): HostImageDecodeCapabilities {
  return webHostImageDecode;
}

export function electronHostImageEncodeGroup(_electron: ElectronApi): HostImageEncodeCapabilities {
  return webHostImageEncode;
}

export function electronHostImageGroup(_electron: ElectronApi): HostImageCapabilities {
  return {};
}

export function electronHostInputGroup(_electron: ElectronApi): HostInputCapabilities {
  return {};
}

export function electronHostLifecycleGroup(_electron: ElectronApi): HostLifecycleCapabilities {
  return {};
}

export function electronHostMediaSessionGroup(_electron: ElectronApi): HostMediaSessionCapabilities {
  return {};
}

export function electronHostMidiGroup(_electron: ElectronApi): HostMidiCapabilities {
  return {};
}

export function electronHostNetGroup(_electron: ElectronApi): HostNetCapabilities {
  return {};
}

export function electronHostPermissionsGroup(_electron: ElectronApi): HostPermissionsCapabilities {
  return {};
}

export function electronHostSensorsGroup(_electron: ElectronApi): HostSensorsCapabilities {
  return {};
}

export function electronHostShareGroup(_electron: ElectronApi): HostShareCapabilities {
  return {};
}

export function electronHostSocketGroup(_electron: ElectronApi): HostSocketCapabilities {
  return {};
}

export function electronHostSoftKeyboardGroup(_electron: ElectronApi): HostSoftKeyboardCapabilities {
  return {};
}

export function electronHostStatusBarGroup(_electron: ElectronApi): HostStatusBarCapabilities {
  return {};
}

export function electronHostSurfaceGroup(_electron: ElectronApi): HostSurfaceCapabilities {
  return {};
}

export function electronHostTextSegmentGroup(_electron: ElectronApi): HostTextSegmentCapabilities {
  return {};
}

export function electronHostTextShaperGroup(_electron: ElectronApi): HostTextShaperCapabilities {
  return webHostTextShaperGroup;
}

export function electronHostVideoGroup(_electron: ElectronApi): HostVideoCapabilities {
  return {};
}

export function electronHostWgpuGroup(_electron: ElectronApi): HostWgpuCapabilities {
  return {};
}

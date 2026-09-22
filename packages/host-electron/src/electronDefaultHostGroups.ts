import {
  webHostAudioDecode,
  webHostImageDecode,
  webHostImageEncode,
  webHostTextShaperGroup,
} from '@flighthq/host-web/contract';
import type {
  ElectronApi,
  HostAccessibilityCapabilities,
  HostAudioCapabilities,
  HostAudioDecodeCapabilities,
  HostBitmapCapabilities,
  HostCompressCapabilities,
  HostConnectivityCapabilities,
  HostDeviceCapabilities,
  HostFileSystemCapabilities,
  HostFontCapabilities,
  HostFullscreenCapabilities,
  HostGeolocationCapabilities,
  HostGlCapabilities,
  HostGlyphCapabilities,
  HostHapticsCapabilities,
  HostImageCapabilities,
  HostImageDecodeCapabilities,
  HostImageEncodeCapabilities,
  HostInputCapabilities,
  HostLifecycleCapabilities,
  HostMediaSessionCapabilities,
  HostMidiCapabilities,
  HostNetCapabilities,
  HostPermissionsCapabilities,
  HostSensorsCapabilities,
  HostShareCapabilities,
  HostSocketCapabilities,
  HostSoftKeyboardCapabilities,
  HostStatusBarCapabilities,
  HostCanvasCapabilities,
  HostSurfaceCapabilities,
  HostTextSegmentCapabilities,
  HostDecompressCapabilities,
  HostTextShaperCapabilities,
  HostVideoCapabilities,
  HostWgpuCapabilities,
} from '@flighthq/types/contract';

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

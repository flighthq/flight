import type {
  HostAccessibilityCapabilities,
  HostAudioCapabilities,
  HostBitmapCapabilities,
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
  HostInputCapabilities,
  HostIpcCapabilities,
  HostLifecycleCapabilities,
  HostMediaSessionCapabilities,
  HostMidiCapabilities,
  HostNetCapabilities,
  HostPermissionsCapabilities,
  HostPowerCapabilities,
  HostPreferencesCapabilities,
  HostProtocolCapabilities,
  HostScreenCapabilities,
  HostSensorsCapabilities,
  HostShareCapabilities,
  HostSocketCapabilities,
  HostSoftKeyboardCapabilities,
  HostStatusBarCapabilities,
  HostCanvasCapabilities,
  HostSurfaceCapabilities,
  HostTextSegmentCapabilities,
  HostTextShaperCapabilities,
  HostUpdaterCapabilities,
  HostVideoCapabilities,
  HostWgpuCapabilities,
} from '@flighthq/types/contract';

// These constructors make the deliberately unsupported Tauri groups explicit. Returning an empty
// group is truthful and keeps capability absence structural rather than installing sentinel providers.
export function tauriHostAccessibility(): HostAccessibilityCapabilities {
  return {};
}

export function tauriHostAudio(): HostAudioCapabilities {
  return {};
}

export function tauriHostBitmap(): HostBitmapCapabilities {
  return {};
}

export function tauriHostCanvas(): HostCanvasCapabilities {
  return {};
}

export function tauriHostConnectivity(): HostConnectivityCapabilities {
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
  return {};
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

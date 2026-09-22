import { webHostTextShaperGroup } from '@flighthq/host-web/contract';
import type {
  HostAccessibilityCapabilities,
  HostAudioCapabilities,
  HostBitmapCapabilities,
  HostFontCapabilities,
  HostFullscreenCapabilities,
  HostGlCapabilities,
  HostGlyphCapabilities,
  HostImageCapabilities,
  HostInputCapabilities,
  HostIpcCapabilities,
  HostLifecycleCapabilities,
  HostMediaSessionCapabilities,
  HostMenuCapabilities,
  HostMidiCapabilities,
  HostNetCapabilities,
  HostPermissionsCapabilities,
  HostPlatformCapabilities,
  HostPowerCapabilities,
  HostPreferencesCapabilities,
  HostScreenCapabilities,
  HostSensorsCapabilities,
  HostShellCapabilities,
  HostShortcutCapabilities,
  HostSocketCapabilities,
  HostCanvasCapabilities,
  HostSurfaceCapabilities,
  HostTextSegmentCapabilities,
  HostDecompressCapabilities,
  HostTextShaperCapabilities,
  HostTrayCapabilities,
  HostUpdaterCapabilities,
  HostVideoCapabilities,
  HostWgpuCapabilities,
  HostWindowCapabilities,
} from '@flighthq/types/contract';

// Groups Capacitor does not cover. Returning an explicit empty group keeps capability absence
// structural: a missing slot is the honest report, where an inert method would be indistinguishable
// from a real one.
export function capacitorHostAccessibility(): HostAccessibilityCapabilities {
  return {};
}

export function capacitorHostAudio(): HostAudioCapabilities {
  return {};
}

export function capacitorHostBitmap(): HostBitmapCapabilities {
  return {};
}

export function capacitorHostCanvas(): HostCanvasCapabilities {
  return {};
}

export function capacitorHostDecompress(): HostDecompressCapabilities {
  return {};
}

export function capacitorHostFont(): HostFontCapabilities {
  return {};
}

export function capacitorHostFullscreen(): HostFullscreenCapabilities {
  return {};
}

export function capacitorHostGl(): HostGlCapabilities {
  return {};
}

export function capacitorHostGlyph(): HostGlyphCapabilities {
  return {};
}

export function capacitorHostImage(): HostImageCapabilities {
  return {};
}

export function capacitorHostInput(): HostInputCapabilities {
  return {};
}

export function capacitorHostIpc(): HostIpcCapabilities {
  return {};
}

export function capacitorHostLifecycle(): HostLifecycleCapabilities {
  return {};
}

export function capacitorHostMediaSession(): HostMediaSessionCapabilities {
  return {};
}

export function capacitorHostMenu(): HostMenuCapabilities {
  return {};
}

export function capacitorHostMidi(): HostMidiCapabilities {
  return {};
}

export function capacitorHostNet(): HostNetCapabilities {
  return {};
}

export function capacitorHostPermissions(): HostPermissionsCapabilities {
  return {};
}

export function capacitorHostPlatform(): HostPlatformCapabilities {
  return {};
}

export function capacitorHostPower(): HostPowerCapabilities {
  return {};
}

export function capacitorHostPreferences(): HostPreferencesCapabilities {
  return {};
}

export function capacitorHostScreen(): HostScreenCapabilities {
  return {};
}

export function capacitorHostSensors(): HostSensorsCapabilities {
  return {};
}

export function capacitorHostShell(): HostShellCapabilities {
  return {};
}

export function capacitorHostShortcut(): HostShortcutCapabilities {
  return {};
}

export function capacitorHostSocket(): HostSocketCapabilities {
  return {};
}

export function capacitorHostSurface(): HostSurfaceCapabilities {
  return {};
}

export function capacitorHostTextSegment(): HostTextSegmentCapabilities {
  return {};
}

export function capacitorHostTextShaper(): HostTextShaperCapabilities {
  return webHostTextShaperGroup;
}

export function capacitorHostTray(): HostTrayCapabilities {
  return {};
}

export function capacitorHostUpdater(): HostUpdaterCapabilities {
  return {};
}

export function capacitorHostVideo(): HostVideoCapabilities {
  return {};
}

export function capacitorHostWgpu(): HostWgpuCapabilities {
  return {};
}

export function capacitorHostWindow(): HostWindowCapabilities {
  return {};
}

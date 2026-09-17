import type {
  Host,
  HostAudioDeviceCapability,
  HostAudioMixerCapability,
  HostBitmapEncodeCapability,
  HostBitmapReadbackCapability,
  HostClipboardFormatsCapability,
  HostDeviceCapability,
  HostFileSystemCapability,
  HostFontLoadingCapability,
  HostGeolocationCapability,
  HostGlyphRasterizerCapability,
  HostHapticsCapability,
  HostImageCapability,
  HostInputIngressCapability,
  HostLifecycleCapability,
  HostNetCapability,
  HostNotificationPermissionCapability,
  HostPlatformCapability,
  HostPowerKeepAwakeCapability,
  HostPreferencesCapability,
  HostScreenQueryCapability,
  HostSensorsCapability,
  HostSocketCapability,
  HostSoftKeyboardInfoCapability,
  HostStoragePersistenceQueryCapability,
  HostTextSegmenterCapability,
  HostTextShaperCapability,
  HostVideoCapability,
  HostWgpuCapability,
} from '@flighthq/types/contract';

// Typed accessors for the capability slots a Flight package actually takes as a function parameter. Each
// is named after the capability interface it returns — `HostVideoCapability` -> `getHostVideo` — so the
// name says both what comes back and that a Host is where it comes from, and typing `getHost` in an
// editor lists the capabilities a host can carry.
//
// The group access is optional-chained even though `Host` declares every group non-optional: these are
// the diagnostic tier, reached exactly when a host is suspected of being malformed, and a structurally
// built stand-in with a group missing must produce `null` rather than a TypeError. The `?.` is at exactly
// one level — the slot below it is optional by declaration and the `??` handles it.
//
// Coverage is deliberately a subset of every optional slot on every group; `explainHost` reports the same
// subset and hostExplain.ts states how it was drawn.

export function getHostAudioDevice(host: Readonly<Host>): HostAudioDeviceCapability | null {
  return host.audio?.device ?? null;
}

export function getHostAudioMixer(host: Readonly<Host>): HostAudioMixerCapability | null {
  return host.audio?.mixer ?? null;
}

export function getHostBitmapEncode(host: Readonly<Host>): HostBitmapEncodeCapability | null {
  return host.bitmap?.encode ?? null;
}

export function getHostBitmapReadback(host: Readonly<Host>): HostBitmapReadbackCapability | null {
  return host.bitmap?.readback ?? null;
}

export function getHostClipboardFormats(host: Readonly<Host>): HostClipboardFormatsCapability | null {
  return host.clipboard?.formats ?? null;
}

export function getHostDevice(host: Readonly<Host>): HostDeviceCapability | null {
  return host.device?.info ?? null;
}

export function getHostFileSystem(host: Readonly<Host>): HostFileSystemCapability | null {
  return host.fileSystem?.access ?? null;
}

export function getHostFontLoading(host: Readonly<Host>): HostFontLoadingCapability | null {
  return host.font?.loader ?? null;
}

export function getHostGeolocation(host: Readonly<Host>): HostGeolocationCapability | null {
  return host.geolocation?.position ?? null;
}

export function getHostGlyphRasterizer(host: Readonly<Host>): HostGlyphRasterizerCapability | null {
  return host.glyph?.rasterizer ?? null;
}

export function getHostHaptics(host: Readonly<Host>): HostHapticsCapability | null {
  return host.haptics?.engine ?? null;
}

export function getHostImage(host: Readonly<Host>): HostImageCapability | null {
  return host.image?.loader ?? null;
}

export function getHostInputIngress(host: Readonly<Host>): HostInputIngressCapability | null {
  return host.input?.ingress ?? null;
}

export function getHostLifecycle(host: Readonly<Host>): HostLifecycleCapability | null {
  return host.lifecycle?.state ?? null;
}

export function getHostNet(host: Readonly<Host>): HostNetCapability | null {
  return host.net?.http ?? null;
}

export function getHostNotificationPermission(host: Readonly<Host>): HostNotificationPermissionCapability | null {
  return host.notification?.permission ?? null;
}

export function getHostPlatform(host: Readonly<Host>): HostPlatformCapability | null {
  return host.platform?.info ?? null;
}

export function getHostPowerKeepAwake(host: Readonly<Host>): HostPowerKeepAwakeCapability | null {
  return host.power?.keepAwake ?? null;
}

export function getHostPreferences(host: Readonly<Host>): HostPreferencesCapability | null {
  return host.preferences?.local ?? null;
}

export function getHostScreenQuery(host: Readonly<Host>): HostScreenQueryCapability | null {
  return host.screen?.query ?? null;
}

export function getHostSensors(host: Readonly<Host>): HostSensorsCapability | null {
  return host.sensors?.query ?? null;
}

export function getHostSocket(host: Readonly<Host>): HostSocketCapability | null {
  return host.socket?.connection ?? null;
}

export function getHostSoftKeyboardInfo(host: Readonly<Host>): HostSoftKeyboardInfoCapability | null {
  return host.softKeyboard?.info ?? null;
}

export function getHostStoragePersistenceQuery(host: Readonly<Host>): HostStoragePersistenceQueryCapability | null {
  return host.preferences?.persistenceQuery ?? null;
}

export function getHostTextSegmenter(host: Readonly<Host>): HostTextSegmenterCapability | null {
  return host.textSegment?.segmenter ?? null;
}

export function getHostTextShaper(host: Readonly<Host>): HostTextShaperCapability | null {
  return host.textShaper?.shaper ?? null;
}

export function getHostVideo(host: Readonly<Host>): HostVideoCapability | null {
  return host.video?.playback ?? null;
}

export function getHostWgpu(host: Readonly<Host>): HostWgpuCapability | null {
  return host.wgpu?.context ?? null;
}

export function hasHostAudioDevice(host: Readonly<Host>): boolean {
  return getHostAudioDevice(host) !== null;
}

export function hasHostAudioMixer(host: Readonly<Host>): boolean {
  return getHostAudioMixer(host) !== null;
}

export function hasHostBitmapEncode(host: Readonly<Host>): boolean {
  return getHostBitmapEncode(host) !== null;
}

export function hasHostBitmapReadback(host: Readonly<Host>): boolean {
  return getHostBitmapReadback(host) !== null;
}

export function hasHostClipboardFormats(host: Readonly<Host>): boolean {
  return getHostClipboardFormats(host) !== null;
}

export function hasHostDevice(host: Readonly<Host>): boolean {
  return getHostDevice(host) !== null;
}

export function hasHostFileSystem(host: Readonly<Host>): boolean {
  return getHostFileSystem(host) !== null;
}

export function hasHostFontLoading(host: Readonly<Host>): boolean {
  return getHostFontLoading(host) !== null;
}

export function hasHostGeolocation(host: Readonly<Host>): boolean {
  return getHostGeolocation(host) !== null;
}

export function hasHostGlyphRasterizer(host: Readonly<Host>): boolean {
  return getHostGlyphRasterizer(host) !== null;
}

export function hasHostHaptics(host: Readonly<Host>): boolean {
  return getHostHaptics(host) !== null;
}

export function hasHostImage(host: Readonly<Host>): boolean {
  return getHostImage(host) !== null;
}

export function hasHostInputIngress(host: Readonly<Host>): boolean {
  return getHostInputIngress(host) !== null;
}

export function hasHostLifecycle(host: Readonly<Host>): boolean {
  return getHostLifecycle(host) !== null;
}

export function hasHostNet(host: Readonly<Host>): boolean {
  return getHostNet(host) !== null;
}

export function hasHostNotificationPermission(host: Readonly<Host>): boolean {
  return getHostNotificationPermission(host) !== null;
}

export function hasHostPlatform(host: Readonly<Host>): boolean {
  return getHostPlatform(host) !== null;
}

export function hasHostPowerKeepAwake(host: Readonly<Host>): boolean {
  return getHostPowerKeepAwake(host) !== null;
}

export function hasHostPreferences(host: Readonly<Host>): boolean {
  return getHostPreferences(host) !== null;
}

export function hasHostScreenQuery(host: Readonly<Host>): boolean {
  return getHostScreenQuery(host) !== null;
}

export function hasHostSensors(host: Readonly<Host>): boolean {
  return getHostSensors(host) !== null;
}

export function hasHostSocket(host: Readonly<Host>): boolean {
  return getHostSocket(host) !== null;
}

export function hasHostSoftKeyboardInfo(host: Readonly<Host>): boolean {
  return getHostSoftKeyboardInfo(host) !== null;
}

export function hasHostStoragePersistenceQuery(host: Readonly<Host>): boolean {
  return getHostStoragePersistenceQuery(host) !== null;
}

export function hasHostTextSegmenter(host: Readonly<Host>): boolean {
  return getHostTextSegmenter(host) !== null;
}

export function hasHostTextShaper(host: Readonly<Host>): boolean {
  return getHostTextShaper(host) !== null;
}

export function hasHostVideo(host: Readonly<Host>): boolean {
  return getHostVideo(host) !== null;
}

export function hasHostWgpu(host: Readonly<Host>): boolean {
  return getHostWgpu(host) !== null;
}

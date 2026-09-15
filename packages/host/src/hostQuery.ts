import type {
  Host,
  HostAudioDeviceProvider,
  HostAudioMixerProvider,
  HostBidiClassProvider,
  HostBitmapEncodeProvider,
  HostBitmapReadbackProvider,
  HostClipboardFormatsProvider,
  HostDeviceProvider,
  HostFileSystemProvider,
  HostFontLoadingProvider,
  HostGeolocationProvider,
  HostGlyphRasterizerProvider,
  HostHapticsProvider,
  HostImageProvider,
  HostInputIngressProvider,
  HostLifecycleProvider,
  HostNetProvider,
  HostNotificationPermissionProvider,
  HostPathBooleanProvider,
  HostPlatformProvider,
  HostPowerKeepAwakeProvider,
  HostScreenQueryProvider,
  HostSensorsProvider,
  HostSocketProvider,
  HostSoftKeyboardInfoProvider,
  HostStorageProvider,
  HostStoragePersistenceQueryProvider,
  HostTextSegmenterProvider,
  HostTextShaperProvider,
  HostVideoProvider,
  HostWgpuProvider,
} from '@flighthq/types/contract';

// Typed accessors for the provider slots a Flight package actually takes as a function parameter. Each
// is named after the provider interface it returns — `HostVideoProvider` -> `getHostVideo` — so the name
// says both what comes back and that a Host is where it comes from, and typing `getHost` in an editor
// lists the capabilities a host can carry.
//
// The group access is optional-chained even though `Host` declares every group non-optional: these are
// the diagnostic tier, reached exactly when a host is suspected of being malformed, and a structurally
// built stand-in with a group missing must produce `null` rather than a TypeError.
//
// Coverage is deliberately a subset of every optional slot on every group; `explainHost` reports the same
// subset and hostExplain.ts states how it was drawn.

export function getHostAudioDevice(host: Readonly<Host>): HostAudioDeviceProvider | null {
  return host.media?.audioDevice ?? null;
}

export function getHostAudioMixer(host: Readonly<Host>): HostAudioMixerProvider | null {
  return host.media?.audioMixer ?? null;
}

export function getHostBidiClass(host: Readonly<Host>): HostBidiClassProvider | null {
  return host.text?.bidiClass ?? null;
}

export function getHostBitmapEncode(host: Readonly<Host>): HostBitmapEncodeProvider | null {
  return host.graphics?.bitmapEncode ?? null;
}

export function getHostBitmapReadback(host: Readonly<Host>): HostBitmapReadbackProvider | null {
  return host.graphics?.bitmapReadback ?? null;
}

export function getHostClipboardFormats(host: Readonly<Host>): HostClipboardFormatsProvider | null {
  return host.clipboard?.formats ?? null;
}

export function getHostDevice(host: Readonly<Host>): HostDeviceProvider | null {
  return host.system?.device ?? null;
}

export function getHostFileSystem(host: Readonly<Host>): HostFileSystemProvider | null {
  return host.storage?.fileSystem ?? null;
}

export function getHostFontLoading(host: Readonly<Host>): HostFontLoadingProvider | null {
  return host.text?.fontLoading ?? null;
}

export function getHostGeolocation(host: Readonly<Host>): HostGeolocationProvider | null {
  return host.system?.geolocation ?? null;
}

export function getHostGlyphRasterizer(host: Readonly<Host>): HostGlyphRasterizerProvider | null {
  return host.text?.glyphRasterizer ?? null;
}

export function getHostHaptics(host: Readonly<Host>): HostHapticsProvider | null {
  return host.input?.haptics ?? null;
}

export function getHostImage(host: Readonly<Host>): HostImageProvider | null {
  return host.graphics?.image ?? null;
}

export function getHostInputIngress(host: Readonly<Host>): HostInputIngressProvider | null {
  return host.input?.ingress ?? null;
}

export function getHostLifecycle(host: Readonly<Host>): HostLifecycleProvider | null {
  return host.system?.lifecycle ?? null;
}

export function getHostNet(host: Readonly<Host>): HostNetProvider | null {
  return host.net?.http ?? null;
}

export function getHostNotificationPermission(host: Readonly<Host>): HostNotificationPermissionProvider | null {
  return host.notification?.permission ?? null;
}

export function getHostPathBoolean(host: Readonly<Host>): HostPathBooleanProvider | null {
  return host.graphics?.pathBoolean ?? null;
}

export function getHostPlatform(host: Readonly<Host>): HostPlatformProvider | null {
  return host.system?.platform ?? null;
}

export function getHostPowerKeepAwake(host: Readonly<Host>): HostPowerKeepAwakeProvider | null {
  return host.power?.keepAwake ?? null;
}

export function getHostScreenQuery(host: Readonly<Host>): HostScreenQueryProvider | null {
  return host.screen?.query ?? null;
}

export function getHostSensors(host: Readonly<Host>): HostSensorsProvider | null {
  return host.system?.sensors ?? null;
}

export function getHostSocket(host: Readonly<Host>): HostSocketProvider | null {
  return host.net?.socket ?? null;
}

export function getHostSoftKeyboardInfo(host: Readonly<Host>): HostSoftKeyboardInfoProvider | null {
  return host.input?.softKeyboardInfo ?? null;
}

export function getHostStorage(host: Readonly<Host>): HostStorageProvider | null {
  return host.storage?.local ?? null;
}

export function getHostStoragePersistenceQuery(host: Readonly<Host>): HostStoragePersistenceQueryProvider | null {
  return host.storage?.persistenceQuery ?? null;
}

export function getHostTextSegmenter(host: Readonly<Host>): HostTextSegmenterProvider | null {
  return host.text?.segmenter ?? null;
}

export function getHostTextShaper(host: Readonly<Host>): HostTextShaperProvider | null {
  return host.text?.shaper ?? null;
}

export function getHostVideo(host: Readonly<Host>): HostVideoProvider | null {
  return host.media?.video ?? null;
}

export function getHostWgpu(host: Readonly<Host>): HostWgpuProvider | null {
  return host.graphics?.wgpuHost ?? null;
}

export function hasHostAudioDevice(host: Readonly<Host>): boolean {
  return getHostAudioDevice(host) !== null;
}

export function hasHostAudioMixer(host: Readonly<Host>): boolean {
  return getHostAudioMixer(host) !== null;
}

export function hasHostBidiClass(host: Readonly<Host>): boolean {
  return getHostBidiClass(host) !== null;
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

export function hasHostPathBoolean(host: Readonly<Host>): boolean {
  return getHostPathBoolean(host) !== null;
}

export function hasHostPlatform(host: Readonly<Host>): boolean {
  return getHostPlatform(host) !== null;
}

export function hasHostPowerKeepAwake(host: Readonly<Host>): boolean {
  return getHostPowerKeepAwake(host) !== null;
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

export function hasHostStorage(host: Readonly<Host>): boolean {
  return getHostStorage(host) !== null;
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

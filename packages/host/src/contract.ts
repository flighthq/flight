// Generated from crates/flight-host/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  getBackendExplanationLayerString,
  getBackendExplanationViabilityString,
  parseBackendExplanationLayer,
  parseBackendExplanationViability,
} from './backendExplanation.ts';
export type { BackendExplanation, BackendExplanationLayer, BackendExplanationViability } from './backendExplanation.ts';
export {
  getBackendOperationExplanationLayerString,
  parseBackendOperationExplanationLayer,
} from './backendOperationExplanation.ts';
export type { BackendOperationExplanation, BackendOperationExplanationLayer } from './backendOperationExplanation.ts';
export { enableHostGuards } from './enableHostGuards.ts';
export { createHost, initializeHost } from './host.ts';
export {
  explainHost,
  explainHostAudioDevice,
  explainHostAudioMixer,
  explainHostImage,
  explainHostInputIngress,
  explainHostTextSegmenter,
  explainHostTextShaper,
  explainHostVideo,
} from './hostExplain.ts';
export { explainHostCapabilitySlot } from './hostExplanation.ts';
export type {
  HostCapabilityBackend,
  HostCapabilityCoverage,
  HostCapabilityExplanation,
  HostCapabilityGroupExplanation,
  HostExplanation,
} from './hostExplanation.ts';
export {
  getHostAudioDevice,
  getHostAudioMixer,
  getHostBitmapEncode,
  getHostBitmapReadback,
  getHostClipboardFormats,
  getHostDevice,
  getHostFileSystem,
  getHostFontLoading,
  getHostGeolocation,
  getHostGlyphRasterizer,
  getHostHaptics,
  getHostImage,
  getHostInputIngress,
  getHostLifecycle,
  getHostNet,
  getHostNotificationPermission,
  getHostPlatform,
  getHostPowerKeepAwake,
  getHostPreferences,
  getHostPreferencesPersistenceQuery,
  getHostScreenQuery,
  getHostSensors,
  getHostSocket,
  getHostSoftKeyboardInfo,
  getHostTextSegmenter,
  getHostTextShaper,
  getHostVideo,
  getHostWgpu,
  hasHostAudioDevice,
  hasHostAudioMixer,
  hasHostBitmapEncode,
  hasHostBitmapReadback,
  hasHostClipboardFormats,
  hasHostDevice,
  hasHostFileSystem,
  hasHostFontLoading,
  hasHostGeolocation,
  hasHostGlyphRasterizer,
  hasHostHaptics,
  hasHostImage,
  hasHostInputIngress,
  hasHostLifecycle,
  hasHostNet,
  hasHostNotificationPermission,
  hasHostPlatform,
  hasHostPowerKeepAwake,
  hasHostPreferences,
  hasHostPreferencesPersistenceQuery,
  hasHostScreenQuery,
  hasHostSensors,
  hasHostSocket,
  hasHostSoftKeyboardInfo,
  hasHostTextSegmenter,
  hasHostTextShaper,
  hasHostVideo,
  hasHostWgpu,
} from './hostQuery.ts';
export type { InputIngressSource } from './inputIngressSource.ts';
export type { ProviderRef } from './providerRef.ts';

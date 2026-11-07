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
export type {
  AudioBufferHandle,
  AudioBusNodeHandle,
  AudioDeviceHandle,
  AudioMixerGraphHandle,
  AudioSourceHandle,
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
  HostImageSource,
  HostMidiCapabilities,
  HostNotificationCapabilities,
  HostPermissionsCapabilities,
  HostProtocolCapabilities,
  HostShareCapabilities,
  HostSoftKeyboardCapabilities,
  HostTextSegmentCapabilities,
  HostUpdaterCapabilities,
  WebScreenCapabilities,
} from './hostCapabilities.ts';
export { explainHostCapabilitySlot } from './hostExplanation.ts';
export type {
  HostCapabilityBackend,
  HostCapabilityCoverage,
  HostCapabilityExplanation,
  HostCapabilityGroupExplanation,
  HostExplanation,
} from './hostExplanation.ts';
export type { InputIngressSource } from './inputIngressSource.ts';
export type { ProviderRef } from './providerRef.ts';

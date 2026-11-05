// Acyclic build entry selected by contract-only projects through the `.audio-types` module suffix.
// The published @flighthq/audio/contract entry remains contract.ts, which also exposes runtime atoms.
export { AudioResourceFailureKind, AudioResourceReferenceKind } from './types.ts';
export type {
  AudioChannelState,
  AudioDecoder,
  AudioDecoderRegistry,
  AudioPlayOptions,
  AudioResource,
  AudioResourceFailure,
  AudioResourceFetch,
  AudioResourceReference,
  AudioResourceReferenceResolutionExplanation,
  AudioResourceUrl,
  EmbeddedAudioResourceReference,
  ExternalAudioResourceReference,
  HostAudioCodecCapability,
  HostAudioDecodeCapabilities,
  HostAudioDecodeFormatCapability,
} from './types.ts';

import type {
  AudioResourceFailureKind as AudioResourceFailureKindContract,
  AudioResourceReferenceKind as AudioResourceReferenceKindContract,
} from '@flighthq/audio/contract';

/** @deprecated Import audio-owned contracts from `@flighthq/audio/contract`. */
export const AudioResourceReferenceKind = {
  Embedded: 'Embedded',
  External: 'External',
} as const;

export type AudioResourceReferenceKind = AudioResourceReferenceKindContract;

/** @deprecated Import audio-owned contracts from `@flighthq/audio/contract`. */
export const AudioResourceFailureKind = {
  Error: 'Error',
  Unavailable: 'Unavailable',
} as const;

export type AudioResourceFailureKind = AudioResourceFailureKindContract;

/** @deprecated Import audio-owned contracts from `@flighthq/audio/contract`. */
export type {
  AudioDecoder,
  AudioDecoderRegistry,
  AudioResourceFailure,
  AudioResourceFetch,
  AudioResourceReference,
  AudioResourceReferenceResolutionExplanation,
  EmbeddedAudioResourceReference,
  ExternalAudioResourceReference,
} from '@flighthq/audio/contract';

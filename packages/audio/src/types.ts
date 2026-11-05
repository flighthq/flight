import type { EntityRaw } from '@flighthq/entity/contract';
import type { ResourceResolutionState } from '@flighthq/resource/contract';

/** Audio channel playback lifecycle. The owning channel lives in media; audio owns this vocabulary. */
export type AudioChannelState = 'complete' | 'paused' | 'playing' | 'stopped';

/** Caller overrides accepted when media begins playing an AudioResource. */
export interface AudioPlayOptions {
  currentTime?: number;
  gain?: number;
  loops?: number;
  playbackRate?: number;
}

/** Decoded PCM resource. */
export interface AudioResource extends EntityRaw {
  buffer: AudioBuffer | null;
}

/** One ordered candidate source for loadAudioResourceFromUrls. */
export interface AudioResourceUrl {
  url: string;
  type?: string;
}

/** Platform audio-container playability query. */
export interface HostAudioCodecCapability {
  canPlayType(mimeType: string): boolean;
}

/** One standard audio container the platform can turn into samples. */
export interface HostAudioDecodeFormatCapability {
  decode(bytes: Readonly<Uint8Array>, signal: AbortSignal): Promise<AudioBuffer | null>;
}

/** The standard audio containers a host can decode, one named slot each. */
export interface HostAudioDecodeCapabilities {
  readonly aac?: HostAudioDecodeFormatCapability;
  readonly flac?: HostAudioDecodeFormatCapability;
  readonly mp3?: HostAudioDecodeFormatCapability;
  readonly mp4?: HostAudioDecodeFormatCapability;
  readonly ogg?: HostAudioDecodeFormatCapability;
  readonly wav?: HostAudioDecodeFormatCapability;
  readonly webm?: HostAudioDecodeFormatCapability;
}

export const AudioResourceReferenceKind = {
  Embedded: 'Embedded',
  External: 'External',
} as const;

export type AudioResourceReferenceKind = (typeof AudioResourceReferenceKind)[keyof typeof AudioResourceReferenceKind];

export const AudioResourceFailureKind = {
  Error: 'Error',
  Unavailable: 'Unavailable',
} as const;

export type AudioResourceFailureKind = (typeof AudioResourceFailureKind)[keyof typeof AudioResourceFailureKind];

/** A serialization-safe failure retained on an audio reference. */
export interface AudioResourceFailure extends EntityRaw {
  kind: AudioResourceFailureKind;
  message: string;
  name: string | null;
}

interface AudioResourceReferenceBase extends EntityRaw {
  failure: AudioResourceFailure | null;
  mimeType: string | null;
  name: string | null;
  resource: AudioResource;
  state: ResourceResolutionState;
}

/** An encoded audio reference whose bytes are already available. */
export interface EmbeddedAudioResourceReference extends AudioResourceReferenceBase {
  kind: 'Embedded';
  bytes: Uint8Array;
}

/** An encoded audio reference that must be fetched from a URI. */
export interface ExternalAudioResourceReference extends AudioResourceReferenceBase {
  kind: 'External';
  uri: string;
  basePath: string | null;
}

export type AudioResourceReference = EmbeddedAudioResourceReference | ExternalAudioResourceReference;

/** Caller-owned fetch seam for an external reference. */
export type AudioResourceFetch = (
  ref: Readonly<ExternalAudioResourceReference>,
  signal: AbortSignal,
) => Promise<AudioResource | null>;

/** Caller-owned decoder for an audio format the platform does not decode. */
export type AudioDecoder = (bytes: Uint8Array, mimeType: string, signal: AbortSignal) => Promise<AudioResource | null>;

/** Lookup-only caller registry keyed by MIME essence. */
export type AudioDecoderRegistry = ReadonlyMap<string, AudioDecoder>;

/** Detached diagnostic view of reference resolution. */
export interface AudioResourceReferenceResolutionExplanation {
  failure: AudioResourceFailure | null;
  kind: AudioResourceReferenceKind;
  retryable: boolean;
  state: ResourceResolutionState;
}

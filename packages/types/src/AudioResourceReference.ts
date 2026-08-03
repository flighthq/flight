import type { AudioResource } from './AudioResource';
import type { ResourceResolutionState } from './ResourceResolutionState';

// A lightweight, plain-data reference to encoded audio a document parser emits synchronously instead of
// decoding inline. The exact counterpart of ImageResourceReference: a document owns these as sidecar
// data, each reference names the AudioResources waiting on it, and their `buffer` stays null until a
// separate caller-driven pass resolves the ref and binds the decoded samples. This is what lets parse
// stay synchronous and format-symmetric while the heavy async decode happens later.
//
// The reference is subject-neutral by the same construction as the image lane: it names bytes and the
// resources waiting on them, and nothing about a timeline, a node, or a document. A 2D document
// (`Scene2DDocument`) carries these today; a 3D scene with positional audio would carry the same
// references and differ only in how it discovers them.
//
// Nothing here plays. Decoding fills an AudioResource's buffer; starting a channel is `@flighthq/media`'s
// job, driven by an explicit caller or a registered TimelineAudioEvent handler. A document stays static.
//
// Two members, discriminated by `kind`:
//   Embedded — the encoded bytes are already in hand (a SWF DefineSound payload, an MP3 chunk carved
//              out of a container). Resolution is a pure decode.
//   External — the audio lives at a URI the caller must fetch. Resolution fetches, then decodes.

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

// A serialization-safe failure cause retained on the reference. Raw thrown values and Error objects stay
// inside the async operation; diagnostics get the stable category, name, and message only.
export interface AudioResourceFailure {
  kind: AudioResourceFailureKind;
  message: string;
  name: string | null;
}

interface AudioResourceReferenceBase {
  // Null until a terminal failure. Reset/retry clears it before the next request.
  failure: AudioResourceFailure | null;
  // The audio MIME type (`audio/mpeg`, `audio/wav`) when known — detected from the embedded bytes or
  // declared by the container. Null when it must be inferred at resolve time, which the resolver does.
  mimeType: string | null;
  // AudioResources consuming this reference. The document owns references as sidecar data; AudioResource
  // stays format/resource agnostic. A sound cued from forty frames decodes once and fills one resource
  // every cue already points at.
  resources?: AudioResource[];
  // Advanced by the resolver: Unresolved → Loading → Resolved | Failed. Read it to drive a loading HUD or
  // to hold playback until audio is ready; each AudioResource's `buffer` is non-null only once `state`
  // reaches Resolved.
  state: ResourceResolutionState;
}

// The encoded bytes are already available; resolution decodes them through @flighthq/audio.
export interface EmbeddedAudioResourceReference extends AudioResourceReferenceBase {
  kind: 'Embedded';
  bytes: Uint8Array;
}

// The audio must be fetched from `uri` before decoding. `uri` may be absolute or relative; a relative
// `uri` resolves against `basePath` (the directory the container was loaded from), null when the
// container carried no base. The fetch itself is a swappable seam the resolver owns.
export interface ExternalAudioResourceReference extends AudioResourceReferenceBase {
  kind: 'External';
  uri: string;
  basePath: string | null;
}

export type AudioResourceReference = EmbeddedAudioResourceReference | ExternalAudioResourceReference;

// The swappable fetch seam an External reference resolves through. The web backend fetches a URL; a
// native host substitutes its own. Returns null for an expected miss rather than throwing.
export type AudioResourceFetch = (
  ref: Readonly<ExternalAudioResourceReference>,
  signal: AbortSignal,
) => Promise<AudioResource | null>;

export interface AudioResourceReferenceResolutionExplanation {
  failure: AudioResourceFailure | null;
  kind: AudioResourceReferenceKind;
  retryable: boolean;
  state: ResourceResolutionState;
}

import type { AudioResource } from './AudioResource';
import type { Entity } from './Entity';
import type { ResourceResolutionState } from './ResourceResolutionState';

// A lightweight, plain-data reference to encoded audio a document parser emits synchronously instead of
// decoding inline. The exact counterpart of ImageResourceReference: a document owns these as sidecar
// data, each reference names the AudioResources waiting on it, and their `buffer` stays null until a
// separate caller-driven pass resolves the ref and binds the decoded samples. This is what lets parse
// stay synchronous and format-symmetric while the heavy async decode happens later.
//
// The reference is subject-neutral by the same construction as the image lane: it names bytes and the
// resource waiting on them, and nothing about a timeline, a node, or a document. A 2D document
// (`Scene2DDocument`) carries these today; a 3D scene with positional audio would carry the same
// references and differ only in how it discovers them. It names what *receives* the samples, never what
// asks for them — a cue is an asker, and a reference that listed cues could not serve a caller-driven
// play, a positional source, or the library sounds no timeline ever triggers.
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
export interface AudioResourceFailure extends Entity {
  kind: AudioResourceFailureKind;
  message: string;
  name: string | null;
}

interface AudioResourceReferenceBase extends Entity {
  // Null until a terminal failure. Reset/retry clears it before the next request.
  failure: AudioResourceFailure | null;
  // The audio MIME type (`audio/mpeg`, `audio/wav`) when known — detected from the embedded bytes or
  // declared by the container. Null when it must be inferred at resolve time, which the resolver does.
  mimeType: string | null;
  // The authoring-time export name, when the container recorded one. A sound every cue reaches needs no
  // name; a sound no timeline triggers — a library sound the format published for code to start — has
  // nothing else to find it by, and dropping the name would strand it in the document unreachable.
  name: string | null;
  // The single AudioResource this reference fills. One encoded payload decodes to one buffer, so there is
  // one sink: a sound cued from forty frames is forty cues holding this same resource, and concurrent
  // sounds are separate cues over separate references rather than several sinks here. It exists before
  // its samples do, so a cue can hold it while the bytes are still undecoded.
  resource: AudioResource;
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

// Decodes encoded audio the platform cannot. Registered against the MIME type's essence, so one
// registration serves every parameter combination a container emits for that format — a SWF ADPCM sound
// tagged `audio/vnd.adobe.swf-adpcm; rate=22050; channels=1` reaches the decoder registered for the bare
// type, and reads the rate it needs off the parameters. Returns null for an expected failure rather than
// throwing. Anything the platform already understands needs no registration.
export type AudioDecoder = (bytes: Uint8Array, mimeType: string, signal: AbortSignal) => Promise<AudioResource | null>;

export interface AudioResourceReferenceResolutionExplanation {
  failure: AudioResourceFailure | null;
  kind: AudioResourceReferenceKind;
  retryable: boolean;
  state: ResourceResolutionState;
}

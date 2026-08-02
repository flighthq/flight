import type { Image } from './Image';
import type { ResourceResolutionState } from './ResourceResolutionState';
import type { Texture } from './Texture';

// A lightweight, plain-data reference to a texture image source that a document parser emits
// synchronously instead of decoding inline. A document owns these references as sidecar data; each
// reference names its consuming `textures`, whose `source` remains null until a separate caller-driven
// pass resolves the ref and binds the live Image. This is the seam that lets parse stay synchronous and
// format-symmetric across every scene-format while the heavy async decode/fetch happens later, under a
// visibility/priority policy.
//
// The reference is dimension-neutral by construction: it names bytes and the textures waiting on them,
// and nothing about a mesh, a material, or a display object. A 2D document (`Scene2DDocument`) and a 3D
// scene (`Scene3D`) carry the same references and differ only in how they discover them.
//
// Two members, discriminated by `kind`:
//   Embedded — the encoded image bytes are already in hand (a payload carved out of the container,
//              e.g. a PNG/JPEG chunk inside an AWD or GLB). Resolution is a pure decode.
//   External — the image lives at a URI the caller must fetch (a glTF `.bin`-sibling image, an
//              AWD external-URL texture). Resolution fetches, then decodes.
//
// A closed union for v1: a native host adds reach by swapping the resolver's fetch backend for
// External, not by inventing a new ref kind. Opening the union later (a third member) is additive.

export const ImageResourceReferenceKind = {
  Embedded: 'Embedded',
  External: 'External',
} as const;

export type ImageResourceReferenceKind = (typeof ImageResourceReferenceKind)[keyof typeof ImageResourceReferenceKind];

export const ImageResourceFailureKind = {
  Error: 'Error',
  Unavailable: 'Unavailable',
} as const;

export type ImageResourceFailureKind = (typeof ImageResourceFailureKind)[keyof typeof ImageResourceFailureKind];

// A serialization-safe failure cause retained on the reference. Raw thrown values and Error objects
// stay inside the async operation; diagnostics get the stable category, name, and message only.
export interface ImageResourceFailure {
  kind: ImageResourceFailureKind;
  message: string;
  name: string | null;
}

interface ImageResourceReferenceBase {
  // Null until a terminal failure. Reset/retry clears it before the next request.
  failure: ImageResourceFailure | null;
  // The image MIME type (`image/png`, `image/jpeg`) when known — detected from the embedded bytes
  // or declared by the container. Null when it must be inferred at resolve time (e.g. from an
  // external URI's extension or the fetch response), which the resolver does.
  mimeType: string | null;
  // Advanced by the resolver: Unresolved → Loading → Resolved | Failed. Read it to drive a loading
  // HUD or a fade-in; the Texture's `storage.image` is non-null only once `state` reaches Resolved.
  state: ResourceResolutionState;
  // Textures consuming this reference. The scene owns references as sidecar data; Texture stays
  // format/resource agnostic.
  textures?: Texture[];
}

// The encoded image bytes are already available; resolution decodes them through @flighthq/image-codec.
export interface EmbeddedImageResourceReference extends ImageResourceReferenceBase {
  kind: 'Embedded';
  bytes: Uint8Array;
}

// The image must be fetched from `uri` before decoding. `uri` may be absolute or relative; a
// relative `uri` resolves against `basePath` (the directory the container was loaded from), null
// when the container carried no base. The fetch itself is a swappable seam the resolver owns.
export interface ExternalImageResourceReference extends ImageResourceReferenceBase {
  kind: 'External';
  uri: string;
  basePath: string | null;
}

export type ImageResourceReference = EmbeddedImageResourceReference | ExternalImageResourceReference;

// The swappable fetch seam an External reference resolves through. The web backend fetches a URL; a
// native host substitutes its own. Returns null for an expected miss rather than throwing.
export type ImageResourceFetch = (
  ref: Readonly<ExternalImageResourceReference>,
  signal: AbortSignal,
) => Promise<Image | null>;

export interface ImageResourceReferenceResolutionExplanation {
  failure: ImageResourceFailure | null;
  kind: ImageResourceReferenceKind;
  retryable: boolean;
  state: ResourceResolutionState;
}

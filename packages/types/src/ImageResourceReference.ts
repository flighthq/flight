// A lightweight, plain-data reference to a texture image source that a document parser emits
// synchronously instead of decoding inline. A document owns these references as sidecar data; each
// reference names its consuming `textures`, whose `source` remains null until a separate caller-driven
// pass resolves the ref and binds the live TextureSource. This is the seam that lets parse stay synchronous and
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

/** @deprecated Import from `@flighthq/image/contract`; a structural copy kept for compatibility. */
export const ImageResourceReferenceKind = {
  Embedded: 'Embedded',
  External: 'External',
} as const;

export type ImageResourceReferenceKind = (typeof ImageResourceReferenceKind)[keyof typeof ImageResourceReferenceKind];

/** @deprecated Import from `@flighthq/image/contract`; a structural copy kept for compatibility. */
export const ImageResourceFailureKind = {
  Error: 'Error',
  Unavailable: 'Unavailable',
} as const;

export type ImageResourceFailureKind = (typeof ImageResourceFailureKind)[keyof typeof ImageResourceFailureKind];

/** @deprecated Import from `@flighthq/image/contract`. */
export type {
  ImageResourceFailure,
  EmbeddedImageResourceReference,
  ExternalImageResourceReference,
  ImageResourceReference,
  ImageResourceFetch,
  ImageResourceReferenceResolutionExplanation,
} from '@flighthq/image/contract';

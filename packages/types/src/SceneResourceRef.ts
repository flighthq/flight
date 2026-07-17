import type { ResourceResolutionState } from './ResourceResolutionState';

// A lightweight, plain-data reference to a texture's image source that a scene/mesh parser emits
// synchronously instead of decoding inline. It rides on a Texture (`Texture.resource`) with its
// `image` left null; a separate, caller-driven pass (@flighthq/scene-resources) resolves the ref
// into a live ImageResource and binds it onto the Texture, advancing `state` as it goes. This is
// the seam that lets parse stay synchronous and format-symmetric across every scene-format while
// the heavy async decode/fetch happens later, under a visibility/priority policy.
//
// Two members, discriminated by `kind`:
//   Embedded — the encoded image bytes are already in hand (a payload carved out of the container,
//              e.g. a PNG/JPEG chunk inside an AWD or GLB). Resolution is a pure decode.
//   External — the image lives at a URI the caller must fetch (a glTF `.bin`-sibling image, an
//              AWD external-URL texture). Resolution fetches, then decodes.
//
// A closed union for v1: a native host adds reach by swapping the resolver's fetch backend for
// External, not by inventing a new ref kind. Opening the union later (a third member) is additive.

export const SceneResourceRefKind = {
  Embedded: 'Embedded',
  External: 'External',
} as const;

export type SceneResourceRefKind = (typeof SceneResourceRefKind)[keyof typeof SceneResourceRefKind];

interface SceneResourceRefBase {
  // The image MIME type (`image/png`, `image/jpeg`) when known — detected from the embedded bytes
  // or declared by the container. Null when it must be inferred at resolve time (e.g. from an
  // external URI's extension or the fetch response), which the resolver does.
  mimeType: string | null;
  // Advanced by the resolver: Unresolved → Loading → Resolved | Failed. Read it to drive a loading
  // HUD or a fade-in; the Texture's `image` is non-null only once `state` reaches Resolved.
  state: ResourceResolutionState;
}

// The encoded image bytes are already available; resolution decodes them through @flighthq/image-codec.
export interface EmbeddedSceneResourceRef extends SceneResourceRefBase {
  kind: 'Embedded';
  bytes: Uint8Array;
}

// The image must be fetched from `uri` before decoding. `uri` may be absolute or relative; a
// relative `uri` resolves against `basePath` (the directory the container was loaded from), null
// when the container carried no base. The fetch itself is a swappable seam the resolver owns.
export interface ExternalSceneResourceRef extends SceneResourceRefBase {
  kind: 'External';
  uri: string;
  basePath: string | null;
}

export type SceneResourceRef = EmbeddedSceneResourceRef | ExternalSceneResourceRef;

// The lifecycle state of one ImageResourceReference as it moves from a parser-emitted reference to a
// live, decoded image bound onto its Texture. Queryable plain data the caller (a loading HUD, a
// fade controller, analytics) reads directly off the ref; the resolver advances it.
//
//   Unresolved — emitted by the parser, not yet requested. The Texture's `image` is still null.
//   Loading    — the resolver has started decoding/fetching this ref (in flight).
//   Resolved   — the image is decoded and bound onto the Texture's `image`.
//   Failed     — decode or fetch failed; the Texture stays unbound (an expected outcome, not a throw).
//
// A closed, Flight-owned enumerable: a const namespace with a PascalCase value union (the value IS
// the serialized string, and ports to a C/C++ `enum class` with no re-casing). Resolution is not a
// hot loop, so the resolver switches on it directly.
export const ResourceResolutionState = {
  Failed: 'Failed',
  Loading: 'Loading',
  Resolved: 'Resolved',
  Unresolved: 'Unresolved',
} as const;

export type ResourceResolutionState = (typeof ResourceResolutionState)[keyof typeof ResourceResolutionState];

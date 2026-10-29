// Generated from crates/flight-resource/src/resource_resolution_state.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * The lifecycle state of one resource reference (image or audio) as it moves from a
 * parser-emitted reference to a live, decoded resource. Queryable plain data that callers
 * (a loading HUD, a fade controller, analytics) read directly off the reference; the resolver
 * advances it.
 *
 * - `Unresolved`: emitted by the parser, not yet requested.
 * - `Loading`: the resolver has started decoding or fetching (in flight).
 * - `Resolved`: decoded and bound.
 * - `Failed`: decode or fetch failed; an expected outcome, not a throw.
 *
 * TS: a closed const namespace whose values are the serialized strings, identical to the
 * variant names: `'Failed'`, `'Loading'`, `'Resolved'`, `'Unresolved'`.
 * C++ `enum class` with no re-casing.
 */
export const ResourceResolutionState = {
  Failed: 'Failed',
  Loading: 'Loading',
  Resolved: 'Resolved',
  Unresolved: 'Unresolved',
} as const;
export type ResourceResolutionState = (typeof ResourceResolutionState)[keyof typeof ResourceResolutionState];

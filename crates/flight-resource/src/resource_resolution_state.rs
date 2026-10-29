//! flight-compiler: string-union ResourceResolutionState=exact
//! flight-compiler: string-union-value ResourceResolutionState Failed "Failed"
//! flight-compiler: string-union-value ResourceResolutionState Loading "Loading"
//! flight-compiler: string-union-value ResourceResolutionState Resolved "Resolved"
//! flight-compiler: string-union-value ResourceResolutionState Unresolved "Unresolved"

/// The lifecycle state of one resource reference (image or audio) as it moves from a
/// parser-emitted reference to a live, decoded resource. Queryable plain data that callers
/// (a loading HUD, a fade controller, analytics) read directly off the reference; the resolver
/// advances it.
///
/// - `Unresolved`: emitted by the parser, not yet requested.
/// - `Loading`: the resolver has started decoding or fetching (in flight).
/// - `Resolved`: decoded and bound.
/// - `Failed`: decode or fetch failed; an expected outcome, not a throw.
///
/// TS: a closed const namespace whose values are the serialized strings, identical to the
/// variant names: `'Failed'`, `'Loading'`, `'Resolved'`, `'Unresolved'`.
/// C++ `enum class` with no re-casing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResourceResolutionState {
    Failed,
    Loading,
    Resolved,
    Unresolved,
}

//! Explicit mode resolution and substitution for flight document scene tokens (TS
//! `@flighthq/tokens`): a scene's token table resolved for one mode through an open per-kind
//! resolver registry, then substituted into its node fields as a new scene entry.

mod flight_document_scene_tokens;
mod flight_document_token_reference;
mod substitute_flight_document_scene_tokens;

pub mod contract;

// Public lane: the pinned TS `index.ts` re-exports every module in full (`export *`), so the root
// and the contract lane carry the same names.
pub use contract::*;

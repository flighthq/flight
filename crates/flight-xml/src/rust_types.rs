//! flight-compiler: rust-only
//!
//! Rust keeps XML tree types on its root and contract lanes. TypeScript already owns the matching
//! public type in `@flighthq/types`, so these Rust re-exports do not widen the XML package lanes.

pub use super::types::*;

//! Atlas-backed batches of independently transformed quads (TS `@flighthq/quadbatch`).

mod quad_batch;
mod types;

pub mod contract;

// The pinned TS index re-exports the whole quadBatch module.
pub use contract::*;

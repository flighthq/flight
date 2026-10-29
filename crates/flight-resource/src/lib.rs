//! Resource reference lifecycle shared by audio and image (D8: `resource` crate).

mod resource_resolution_state;

pub mod contract;

// Public lane equals the contract lane, mirroring TS `index.ts` and `contract.ts`, which both export
// all of resource_resolution_state.
pub use contract::*;

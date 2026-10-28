//! The full contract lane, mirroring TS `contract.ts`: every public free function and type.
//! Consumers that need the complete surface (other Flight crates, internal seams) import here;
//! the crate root exposes only the curated public lane from TS `index.ts` plus type sugar.

pub use super::transform_velocity::*;
pub use super::velocity_explanation::*;
pub use super::velocity_sample::*;
pub use super::velocity_store::*;
pub use super::velocity2d::*;

//! The full contract lane, mirroring TS `contract.ts`: every public free function and type.
//! Consumers that need the complete surface (other Flight crates, internal seams) import here;
//! the crate root exposes only the curated public lane from TS `index.ts` plus Rust sugar.

pub use super::connection::*;
pub use super::emitter::*;
pub use super::internal::*;
pub use super::safe::*;
pub use super::scope::*;
pub use super::signal::*;
pub use super::slot::*;
pub use super::throttle::*;
pub use super::types::*;

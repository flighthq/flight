//! The full contract lane, mirroring TS `contract.ts`: every public free function and type.
//! Consumers that need the complete surface (other Flight crates, internal seams) import here;
//! the crate root exposes only the curated public lane from TS `index.ts` plus type sugar.

pub use super::enable_tray_guards::*;
pub use super::host_explain::*;
pub use super::results::*;
pub use super::tray::*;
pub use super::types::*;

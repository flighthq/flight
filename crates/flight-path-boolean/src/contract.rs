//! The full contract lane, mirroring TS `contract.ts`: every public free function and type.
//! Consumers that need the complete surface (other Flight crates, internal seams) import here;
//! the crate root exposes only the curated public lane from TS `index.ts` plus type sugar.

pub use super::boolean_paths::*;
pub use super::explain_path_boolean::*;
pub use super::martinez_kernel::*;
pub use super::offset_path::*;
pub use super::resolve_path_regions::*;
pub use super::simplify_path::*;
pub use super::union_all_paths::*;
pub use super::write_path_boolean_contours::*;

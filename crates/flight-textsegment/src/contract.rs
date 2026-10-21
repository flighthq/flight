//! The full contract lane, mirroring TS `contract.ts`: every public free function and type.
//! Consumers that need the complete surface (other Flight crates, internal seams) import here;
//! the crate root exposes only the curated public lane from TS `index.ts` plus required types.

pub use super::enable_text_segment_guards::*;
pub use super::text_segment::*;
pub use super::text_segment_boundary::*;
pub use super::text_segment_guards::*;
pub use super::text_segmenter_backend::*;
pub use super::types::*;

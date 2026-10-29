//! The full contract lane, mirroring TS `contract.ts`: every public free function and type.

pub use crate::marquee_mode_native::{
    get_marquee_selection_mode_string, parse_marquee_selection_mode,
};
pub use crate::selection_compat::*;
// The TypeScript-only contract types; the generator derives their contract lane from this re-export.
#[allow(unused_imports)]
pub use crate::selection_compat_types::*;

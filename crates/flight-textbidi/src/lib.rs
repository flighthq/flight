mod bidi_class_kernel;
mod enable_text_bidi_guards;
mod get_bidi_runs;
mod reorder_bidi_line;
mod resolve_bidi_levels;
mod text_bidi_guards;
mod types;

pub mod contract;

// Public lane and authority for generated TS `index.ts`: exactly the pinned package-root exports.
// Rust-only types, constructors, initializers, guard seams, and enum string tables stay available
// from `contract`.
pub use contract::COMPACT_BIDI_CLASS_KERNEL;
pub use contract::disable_text_bidi_guards;
pub use contract::enable_text_bidi_guards;
pub use contract::explain_bidi_class_kernel;
pub use contract::get_bidi_runs;
pub use contract::reorder_bidi_line;
pub use contract::resolve_bidi_levels;

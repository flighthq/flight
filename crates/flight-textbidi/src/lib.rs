mod bidi_class_kernel;
mod enable_text_bidi_guards;
mod get_bidi_runs;
mod reorder_bidi_line;
mod resolve_bidi_levels;
mod text_bidi_guards;
mod types;

pub mod contract;

// Public lane: the exports of the pinned TS `index.ts`, plus the Rust types their signatures use.
// Contract-only enum string tables remain in `contract`.
pub use contract::BidiClass;
pub use contract::BidiClassKernel;
pub use contract::BidiClassKernelCoverage;
pub use contract::BidiClassKernelExplanation;
pub use contract::BidiClassKernelKind;
pub use contract::BidiCodePointRange;
pub use contract::BidiDirection;
pub use contract::BidiRun;
pub use contract::BidiRunDirection;
pub use contract::COMPACT_BIDI_CLASS_KERNEL;
pub use contract::TextBidiGuard;
pub use contract::create_compact_bidi_class_kernel;
pub use contract::disable_text_bidi_guards;
pub use contract::enable_text_bidi_guards;
pub use contract::explain_bidi_class_kernel;
pub use contract::get_bidi_runs;
pub use contract::initialize_compact_bidi_class_kernel;
pub use contract::reorder_bidi_line;
pub use contract::report_text_bidi_compact_table_miss;
pub use contract::resolve_bidi_levels;
pub use contract::set_text_bidi_guard;

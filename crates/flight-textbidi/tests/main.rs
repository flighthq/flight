mod bidi_class_kernel_test;
mod bidi_conformance_test;
mod enable_text_bidi_guards_test;
mod get_bidi_runs_test;
mod reorder_bidi_line_test;
mod resolve_bidi_levels_test;
mod text_bidi_guards_test;
mod types_test;

pub(crate) static GUARD_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

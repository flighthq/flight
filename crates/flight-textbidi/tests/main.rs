use std::sync::{Mutex, MutexGuard, PoisonError};

pub(crate) static GUARD_TEST_LOCK: Mutex<()> = Mutex::new(());

pub(crate) struct TextBidiGuardTestLock {
    _lock: MutexGuard<'static, ()>,
}

/// Serializes tests that install the process-global guard with every test that can emit a compact
/// table miss. Resetting on both edges also isolates later tests when an assertion panics.
pub(crate) fn lock_text_bidi_guard_test() -> TextBidiGuardTestLock {
    let lock = GUARD_TEST_LOCK
        .lock()
        .unwrap_or_else(PoisonError::into_inner);
    flight_textbidi::contract::set_text_bidi_guard(None);
    return TextBidiGuardTestLock { _lock: lock };
}

impl Drop for TextBidiGuardTestLock {
    fn drop(&mut self) {
        flight_textbidi::contract::set_text_bidi_guard(None);
    }
}

#[path = "bidi_class_kernel_test.rs"]
mod flight_textbidi_bidi_class_kernel_test;
#[path = "bidi_conformance_test.rs"]
mod flight_textbidi_bidi_conformance_test;
#[path = "enable_text_bidi_guards_test.rs"]
mod flight_textbidi_enable_text_bidi_guards_test;
#[path = "get_bidi_runs_test.rs"]
mod flight_textbidi_get_bidi_runs_test;
#[path = "reorder_bidi_line_test.rs"]
mod flight_textbidi_reorder_bidi_line_test;
#[path = "resolve_bidi_levels_test.rs"]
mod flight_textbidi_resolve_bidi_levels_test;
#[path = "text_bidi_guards_test.rs"]
mod flight_textbidi_text_bidi_guards_test;
#[path = "types_test.rs"]
mod flight_textbidi_types_test;

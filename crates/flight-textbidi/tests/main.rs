use std::sync::{Mutex, MutexGuard, PoisonError};

mod bidi_class_kernel_test;
mod bidi_conformance_test;
mod enable_text_bidi_guards_test;
mod get_bidi_runs_test;
mod reorder_bidi_line_test;
mod resolve_bidi_levels_test;
mod text_bidi_guards_test;
mod types_test;

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
    flight_textbidi::set_text_bidi_guard(None);
    return TextBidiGuardTestLock { _lock: lock };
}

impl Drop for TextBidiGuardTestLock {
    fn drop(&mut self) {
        flight_textbidi::set_text_bidi_guard(None);
    }
}

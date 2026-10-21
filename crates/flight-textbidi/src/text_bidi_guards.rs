use std::sync::{Mutex, PoisonError};

use crate::types::TextBidiGuard;

// A panicking diagnostic must not poison future bidi operations. The callback is cloned while the
// slot is locked and invoked only after releasing the lock.
// flight-lint: allow(hidden-state) opt-in dev-only diagnostics callback (D5): it cannot change bidi results, defaults to None, and the pinned TS contract keeps the same module-level seam
static GUARD: Mutex<Option<TextBidiGuard>> = Mutex::new(None);

pub fn report_text_bidi_compact_table_miss(codepoint: u32) {
    let guard = GUARD.lock().unwrap_or_else(PoisonError::into_inner).clone();
    if let Some(guard) = guard {
        guard(codepoint);
    }
}

pub fn set_text_bidi_guard(guard: Option<TextBidiGuard>) {
    *GUARD.lock().unwrap_or_else(PoisonError::into_inner) = guard;
}

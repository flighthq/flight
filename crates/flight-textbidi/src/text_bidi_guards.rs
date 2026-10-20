use std::cell::Cell;

use crate::types::TextBidiGuard;

thread_local! {
    static GUARD: Cell<Option<fn(u32)>> = const { Cell::new(None) };
}

pub fn report_text_bidi_compact_table_miss(codepoint: u32) {
    GUARD.with(|g| {
        if let Some(guard) = g.get() {
            guard(codepoint);
        }
    });
}

pub fn set_text_bidi_guard(guard: Option<TextBidiGuard>) {
    GUARD.with(|g| g.set(guard));
}

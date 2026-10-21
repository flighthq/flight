use std::cell::Cell;

use crate::types::TextBidiGuard;

thread_local! {
    // flight-lint: allow(hidden-state) opt-in dev-only diagnostics callback (D5): it cannot change bidi results, defaults to None, and the pinned TS contract keeps the same module-level seam pending an explicit text/log diagnostics state interface
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

use std::cell::RefCell;

use crate::types::TextSegmentGuard;

// flight-lint: allow(hidden-state) opt-in diagnostics guard (D5): defaults to None, does not change segmentation semantics, and mirrors the TS module-level guard seam
thread_local! {
    static GUARD: RefCell<Option<TextSegmentGuard>> = const { RefCell::new(None) };
}

pub fn report_text_segmenter_unavailable() {
    GUARD.with(|g| {
        let guard = g.borrow().clone();
        if let Some(guard) = guard {
            guard();
        }
    });
}

pub fn set_text_segment_guard(guard: Option<TextSegmentGuard>) {
    GUARD.with(|g| *g.borrow_mut() = guard);
}

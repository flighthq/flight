use std::cell::Cell;

// flight-lint: allow(hidden-state) opt-in diagnostics guard (D5): defaults to None, does not change segmentation semantics, and mirrors the TS module-level guard seam
thread_local! {
    static GUARD: Cell<Option<fn()>> = const { Cell::new(None) };
}

pub fn report_text_segmenter_unavailable() {
    GUARD.with(|g| {
        if let Some(guard) = g.get() {
            guard();
        }
    });
}

pub fn set_text_segment_guard(guard: Option<fn()>) {
    GUARD.with(|g| g.set(guard));
}

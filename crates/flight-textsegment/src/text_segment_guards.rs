use std::cell::Cell;

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

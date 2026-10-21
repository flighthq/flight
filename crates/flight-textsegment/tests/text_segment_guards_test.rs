use flight_textsegment::contract::{report_text_segmenter_unavailable, set_text_segment_guard};
use std::cell::Cell;
use std::sync::Arc;

thread_local! {
    static FIRST_COUNT: Cell<u32> = const { Cell::new(0) };
    static SECOND_COUNT: Cell<u32> = const { Cell::new(0) };
}

fn first_guard() {
    FIRST_COUNT.with(|c| c.set(c.get() + 1));
}

fn second_guard() {
    SECOND_COUNT.with(|c| c.set(c.get() + 1));
}

mod report_text_segmenter_unavailable {
    use super::*;

    #[test]
    fn is_silent_when_no_guard_is_installed() {
        set_text_segment_guard(None);
        // Should not panic
        report_text_segmenter_unavailable();
    }
}

mod set_text_segment_guard {
    use super::*;

    #[test]
    fn replaces_the_active_callback() {
        FIRST_COUNT.with(|c| c.set(0));
        SECOND_COUNT.with(|c| c.set(0));
        set_text_segment_guard(Some(Arc::new(first_guard)));
        set_text_segment_guard(Some(Arc::new(second_guard)));
        report_text_segmenter_unavailable();
        assert_eq!(FIRST_COUNT.with(|c| c.get()), 0);
        assert_eq!(SECOND_COUNT.with(|c| c.get()), 1);
        set_text_segment_guard(None);
    }
}

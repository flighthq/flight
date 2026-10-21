use std::sync::{Arc, Mutex};

use flight_textbidi::*;

use crate::GUARD_TEST_LOCK;

mod report_text_bidi_compact_table_miss {
    use super::*;

    #[test]
    fn is_silent_when_no_guard_is_installed() {
        let _lock = GUARD_TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        set_text_bidi_guard(None);
        report_text_bidi_compact_table_miss(0x4E2D);
    }
}

mod set_text_bidi_guard {
    use super::*;

    #[test]
    fn replaces_the_active_callback() {
        let _lock = GUARD_TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let first = Arc::new(Mutex::new(Vec::new()));
        let second = Arc::new(Mutex::new(Vec::new()));

        let first_entries = first.clone();
        let first_guard: TextBidiGuard = Arc::new(move |codepoint| {
            first_entries.lock().unwrap().push(codepoint);
        });
        let second_entries = second.clone();
        let second_guard: TextBidiGuard = Arc::new(move |codepoint| {
            second_entries.lock().unwrap().push(codepoint);
        });

        set_text_bidi_guard(Some(first_guard));
        set_text_bidi_guard(Some(second_guard));
        report_text_bidi_compact_table_miss(0x4E2D);
        set_text_bidi_guard(None);

        assert!(first.lock().unwrap().is_empty());
        assert_eq!(*second.lock().unwrap(), vec![0x4E2D]);
    }
}

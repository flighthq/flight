use flight_textbidi::*;

mod report_text_bidi_compact_table_miss {
    use super::*;

    #[test]
    fn is_silent_when_no_guard_is_installed() {
        set_text_bidi_guard(None);
        // Should not panic
        report_text_bidi_compact_table_miss(0x4E2D);
    }
}

mod set_text_bidi_guard_test {
    use super::*;

    #[test]
    fn replaces_the_active_callback() {
        use std::cell::RefCell;

        thread_local! {
            static FIRST: RefCell<Vec<u32>> = const { RefCell::new(Vec::new()) };
            static SECOND: RefCell<Vec<u32>> = const { RefCell::new(Vec::new()) };
        }

        fn first_guard(codepoint: u32) {
            FIRST.with(|v| v.borrow_mut().push(codepoint));
        }
        fn second_guard(codepoint: u32) {
            SECOND.with(|v| v.borrow_mut().push(codepoint));
        }

        FIRST.with(|v| v.borrow_mut().clear());
        SECOND.with(|v| v.borrow_mut().clear());

        set_text_bidi_guard(Some(first_guard));
        set_text_bidi_guard(Some(second_guard));
        report_text_bidi_compact_table_miss(0x4E2D);

        let first_entries = FIRST.with(|v| v.borrow().clone());
        let second_entries = SECOND.with(|v| v.borrow().clone());
        assert!(first_entries.is_empty());
        assert_eq!(second_entries, vec![0x4E2D]);

        set_text_bidi_guard(None);
    }
}

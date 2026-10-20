use flight_textbidi::*;

mod disable_text_bidi_guards_test {
    use super::*;

    #[test]
    fn restores_silent_compact_fallback() {
        clear_log_once_keys();
        clear_log_entries();
        set_log_sink(true);
        enable_text_bidi_guards();
        disable_text_bidi_guards();
        resolve_bidi_levels(
            &compact_bidi_class_kernel(),
            "\u{4E2D}",
            BidiDirection::Ltr,
        );
        let entries = get_log_entries();
        assert!(entries.is_empty());
        set_log_sink(false);
    }
}

mod enable_text_bidi_guards_test {
    use super::*;

    #[test]
    fn warns_once_and_names_the_kernel_fixing_call_for_uncovered_code_points() {
        clear_log_once_keys();
        clear_log_entries();
        set_log_sink(true);
        enable_text_bidi_guards();
        resolve_bidi_levels(
            &compact_bidi_class_kernel(),
            "\u{4E2D}\u{6587}",
            BidiDirection::Ltr,
        );
        let entries = get_log_entries();
        assert_eq!(entries.len(), 1);
        assert!(entries[0].data.message.contains("BidiClassKernel"));
        disable_text_bidi_guards();
        set_log_sink(false);
    }

    #[test]
    fn stays_silent_for_compact_table_coverage() {
        clear_log_once_keys();
        clear_log_entries();
        set_log_sink(true);
        enable_text_bidi_guards();
        resolve_bidi_levels(
            &compact_bidi_class_kernel(),
            "abc \u{05E9}\u{05DC}\u{05D5}\u{05DD} \u{0627}\u{0628}\u{062A}",
            BidiDirection::Auto,
        );
        let entries = get_log_entries();
        assert!(entries.is_empty());
        disable_text_bidi_guards();
        set_log_sink(false);
    }

    #[test]
    fn stays_silent_for_an_explicit_non_compact_kernel() {
        clear_log_once_keys();
        clear_log_entries();
        set_log_sink(true);
        enable_text_bidi_guards();
        let custom = BidiClassKernel {
            get_bidi_class: |_| BidiClass::L,
            is_compact: false,
        };
        resolve_bidi_levels(&custom, "\u{4E2D}", BidiDirection::Ltr);
        let entries = get_log_entries();
        assert!(entries.is_empty());
        disable_text_bidi_guards();
        set_log_sink(false);
    }
}

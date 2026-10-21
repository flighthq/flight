use flight_entity::allocate_entity;
use flight_textbidi::contract::LogEntry;
use flight_textbidi::contract::clear_log_entries;
use flight_textbidi::contract::clear_log_once_keys;
use flight_textbidi::contract::get_log_entries;
use flight_textbidi::contract::set_log_sink;
use flight_textbidi::*;

fn get_message(entry: &LogEntry) -> Option<&str> {
    return Some(&entry.data.message);
}

fn start_log_capture() {
    clear_log_once_keys();
    clear_log_entries();
    set_log_sink(true);
}

mod disable_text_bidi_guards {
    use super::*;

    #[test]
    fn restores_silent_compact_fallback() {
        start_log_capture();
        enable_text_bidi_guards();
        disable_text_bidi_guards();
        resolve_bidi_levels(&COMPACT_BIDI_CLASS_KERNEL, "\u{4E2D}", BidiDirection::Ltr);
        assert!(get_log_entries().is_empty());
        set_log_sink(false);
    }
}

mod enable_text_bidi_guards {
    use super::*;

    #[test]
    fn warns_once_and_names_the_kernel_fixing_call_for_uncovered_code_points() {
        start_log_capture();
        enable_text_bidi_guards();
        resolve_bidi_levels(
            &COMPACT_BIDI_CLASS_KERNEL,
            "\u{4E2D}\u{6587}",
            BidiDirection::Ltr,
        );
        let entries = get_log_entries();
        assert_eq!(entries.len(), 1);
        assert!(
            get_message(&entries[0])
                .unwrap()
                .contains("BidiClassKernel")
        );
        disable_text_bidi_guards();
        set_log_sink(false);
    }

    #[test]
    fn stays_silent_for_compact_table_coverage() {
        start_log_capture();
        enable_text_bidi_guards();
        resolve_bidi_levels(
            &COMPACT_BIDI_CLASS_KERNEL,
            "abc \u{05E9}\u{05DC}\u{05D5}\u{05DD} \u{0627}\u{0628}\u{062A}",
            BidiDirection::Auto,
        );
        assert!(get_log_entries().is_empty());
        disable_text_bidi_guards();
        set_log_sink(false);
    }

    #[test]
    fn stays_silent_for_an_explicit_non_compact_kernel() {
        start_log_capture();
        enable_text_bidi_guards();
        let mut custom: BidiClassKernel = allocate_entity();
        custom.get_bidi_class = |_| BidiClass::L;
        resolve_bidi_levels(&custom, "\u{4E2D}", BidiDirection::Ltr);
        assert!(get_log_entries().is_empty());
        disable_text_bidi_guards();
        set_log_sink(false);
    }
}

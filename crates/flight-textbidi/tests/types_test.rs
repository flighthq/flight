use flight_textbidi::contract::*;

mod clear_log_entries {
    use super::*;

    #[test]
    fn clears_captured_entries_without_disabling_capture() {
        clear_log_once_keys();
        set_log_sink(true);
        log_once(
            "clear-entries",
            LogLevel::Warn,
            LogData {
                message: "first".to_string(),
            },
            "test",
        );
        assert_eq!(get_log_entries().len(), 1);
        clear_log_entries();
        assert!(get_log_entries().is_empty());
        set_log_sink(false);
    }
}

mod clear_log_once_keys {
    use super::*;

    #[test]
    fn allows_the_same_key_to_be_captured_again() {
        clear_log_once_keys();
        clear_log_entries();
        set_log_sink(true);
        let data = || LogData {
            message: "again".to_string(),
        };
        log_once("clear-once", LogLevel::Warn, data(), "test");
        clear_log_entries();
        clear_log_once_keys();
        log_once("clear-once", LogLevel::Warn, data(), "test");
        assert_eq!(get_log_entries().len(), 1);
        set_log_sink(false);
    }
}

mod get_bidi_class_kernel_coverage_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_bidi_class_kernel_coverage_string(BidiClassKernelCoverage::CommonScriptRanges),
            "common-script-ranges"
        );
        assert_eq!(
            get_bidi_class_kernel_coverage_string(BidiClassKernelCoverage::ProviderDefined),
            "provider-defined"
        );
    }
}

mod get_bidi_class_kernel_kind_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_bidi_class_kernel_kind_string(BidiClassKernelKind::Compact),
            "compact"
        );
        assert_eq!(
            get_bidi_class_kernel_kind_string(BidiClassKernelKind::Custom),
            "custom"
        );
    }
}

mod get_bidi_class_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_string() {
        let values = [
            (BidiClass::L, "L"),
            (BidiClass::R, "R"),
            (BidiClass::AL, "AL"),
            (BidiClass::EN, "EN"),
            (BidiClass::ES, "ES"),
            (BidiClass::ET, "ET"),
            (BidiClass::AN, "AN"),
            (BidiClass::CS, "CS"),
            (BidiClass::NSM, "NSM"),
            (BidiClass::BN, "BN"),
            (BidiClass::B, "B"),
            (BidiClass::S, "S"),
            (BidiClass::WS, "WS"),
            (BidiClass::ON, "ON"),
            (BidiClass::LRE, "LRE"),
            (BidiClass::RLE, "RLE"),
            (BidiClass::LRO, "LRO"),
            (BidiClass::RLO, "RLO"),
            (BidiClass::PDF, "PDF"),
            (BidiClass::LRI, "LRI"),
            (BidiClass::RLI, "RLI"),
            (BidiClass::FSI, "FSI"),
            (BidiClass::PDI, "PDI"),
        ];
        for (value, string) in values {
            assert_eq!(get_bidi_class_string(value), string);
        }
    }
}

mod get_bidi_direction_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_bidi_direction_string(BidiDirection::Ltr), "ltr");
        assert_eq!(get_bidi_direction_string(BidiDirection::Rtl), "rtl");
        assert_eq!(get_bidi_direction_string(BidiDirection::Auto), "auto");
    }
}

mod get_bidi_run_direction_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_bidi_run_direction_string(BidiRunDirection::Ltr), "ltr");
        assert_eq!(get_bidi_run_direction_string(BidiRunDirection::Rtl), "rtl");
    }
}

mod get_log_entries {
    use super::*;

    #[test]
    fn returns_the_captured_structured_entries() {
        clear_log_once_keys();
        clear_log_entries();
        set_log_sink(true);
        log_once(
            "get-entries",
            LogLevel::Warn,
            LogData {
                message: "captured".to_string(),
            },
            "textbidi-test",
        );
        let entries = get_log_entries();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].key, "get-entries");
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].data.message, "captured");
        assert_eq!(entries[0].source, "textbidi-test");
        set_log_sink(false);
    }
}

mod log_once {
    use super::*;

    #[test]
    fn captures_only_the_first_entry_for_a_key() {
        clear_log_once_keys();
        clear_log_entries();
        set_log_sink(true);
        log_once(
            "once",
            LogLevel::Warn,
            LogData {
                message: "first".to_string(),
            },
            "test",
        );
        log_once(
            "once",
            LogLevel::Warn,
            LogData {
                message: "second".to_string(),
            },
            "test",
        );
        let entries = get_log_entries();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].data.message, "first");
        set_log_sink(false);
    }
}

mod parse_bidi_class {
    use super::*;

    #[test]
    fn parses_every_exact_ts_string_and_rejects_other_spelling() {
        let strings = [
            "L", "R", "AL", "EN", "ES", "ET", "AN", "CS", "NSM", "BN", "B", "S", "WS", "ON", "LRE",
            "RLE", "LRO", "RLO", "PDF", "LRI", "RLI", "FSI", "PDI",
        ];
        for string in strings {
            let value = parse_bidi_class(string).unwrap();
            assert_eq!(get_bidi_class_string(value), string);
        }
        assert_eq!(parse_bidi_class("l"), None);
    }
}

mod parse_bidi_class_kernel_coverage {
    use super::*;

    #[test]
    fn parses_only_the_exact_ts_strings() {
        assert_eq!(
            parse_bidi_class_kernel_coverage("common-script-ranges"),
            Some(BidiClassKernelCoverage::CommonScriptRanges)
        );
        assert_eq!(
            parse_bidi_class_kernel_coverage("provider-defined"),
            Some(BidiClassKernelCoverage::ProviderDefined)
        );
        assert_eq!(parse_bidi_class_kernel_coverage("custom"), None);
    }
}

mod parse_bidi_class_kernel_kind {
    use super::*;

    #[test]
    fn parses_only_the_exact_ts_strings() {
        assert_eq!(
            parse_bidi_class_kernel_kind("compact"),
            Some(BidiClassKernelKind::Compact)
        );
        assert_eq!(
            parse_bidi_class_kernel_kind("custom"),
            Some(BidiClassKernelKind::Custom)
        );
        assert_eq!(parse_bidi_class_kernel_kind("Compact"), None);
    }
}

mod parse_bidi_direction {
    use super::*;

    #[test]
    fn parses_only_the_exact_ts_strings() {
        assert_eq!(parse_bidi_direction("ltr"), Some(BidiDirection::Ltr));
        assert_eq!(parse_bidi_direction("rtl"), Some(BidiDirection::Rtl));
        assert_eq!(parse_bidi_direction("auto"), Some(BidiDirection::Auto));
        assert_eq!(parse_bidi_direction("LTR"), None);
    }
}

mod parse_bidi_run_direction {
    use super::*;

    #[test]
    fn parses_only_the_exact_ts_strings() {
        assert_eq!(parse_bidi_run_direction("ltr"), Some(BidiRunDirection::Ltr));
        assert_eq!(parse_bidi_run_direction("rtl"), Some(BidiRunDirection::Rtl));
        assert_eq!(parse_bidi_run_direction("auto"), None);
    }
}

mod set_log_sink {
    use super::*;

    #[test]
    fn enables_and_disables_temporary_capture() {
        clear_log_once_keys();
        clear_log_entries();
        set_log_sink(false);
        log_once(
            "disabled",
            LogLevel::Warn,
            LogData {
                message: "ignored".to_string(),
            },
            "test",
        );
        assert!(get_log_entries().is_empty());
        set_log_sink(true);
        log_once(
            "enabled",
            LogLevel::Warn,
            LogData {
                message: "captured".to_string(),
            },
            "test",
        );
        assert_eq!(get_log_entries().len(), 1);
        set_log_sink(false);
    }
}

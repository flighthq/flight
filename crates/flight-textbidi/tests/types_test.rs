//! flight-compiler: rust-only

use flight_textbidi::contract::*;

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

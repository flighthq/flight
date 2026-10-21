use flight_entity::allocate_entity;
use flight_textbidi::*;

// Hebrew word (four strong-R letters).
const HEBREW: &str = "\u{05E9}\u{05DC}\u{05D5}\u{05DD}";

// Arabic letters (bidi class AL).
const ARABIC: &str = "\u{0627}\u{0628}\u{062A}\u{062B}\u{062C}";

// Bidi control characters.
const LRE: &str = "\u{202A}";
const RLE: &str = "\u{202B}";
const PDF: &str = "\u{202C}";

mod get_bidi_runs {
    use super::*;

    #[test]
    fn routes_class_lookups_through_an_explicit_kernel() {
        let mut right_to_left: BidiClassKernel = allocate_entity();
        right_to_left.get_bidi_class = |_| BidiClass::R;
        assert_eq!(
            get_bidi_runs(&right_to_left, "abc", BidiDirection::Ltr),
            vec![BidiRun {
                start: 0,
                end: 3,
                level: 1,
                direction: BidiRunDirection::Rtl
            }]
        );
    }

    #[test]
    fn isolates_interleaved_callers_that_pass_different_backends() {
        let mut right_to_left: BidiClassKernel = allocate_entity();
        right_to_left.get_bidi_class = |_| BidiClass::R;
        let mut left_to_right: BidiClassKernel = allocate_entity();
        left_to_right.get_bidi_class = |_| BidiClass::L;
        assert_eq!(
            get_bidi_runs(&right_to_left, "abc", BidiDirection::Ltr),
            vec![BidiRun {
                start: 0,
                end: 3,
                level: 1,
                direction: BidiRunDirection::Rtl
            }]
        );
        assert_eq!(
            get_bidi_runs(&left_to_right, "abc", BidiDirection::Ltr),
            vec![BidiRun {
                start: 0,
                end: 3,
                level: 0,
                direction: BidiRunDirection::Ltr
            }]
        );
        assert_eq!(
            get_bidi_runs(&right_to_left, "abc", BidiDirection::Ltr),
            vec![BidiRun {
                start: 0,
                end: 3,
                level: 1,
                direction: BidiRunDirection::Rtl
            }]
        );
    }

    #[test]
    fn produces_distinct_level_runs_for_arabic_text_with_embedded_european_numbers() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{} 123 {}", ARABIC, ARABIC);
        let runs = get_bidi_runs(kernel, &text, BidiDirection::Auto);
        assert_eq!(
            runs,
            vec![
                BidiRun {
                    start: 0,
                    end: 6,
                    level: 1,
                    direction: BidiRunDirection::Rtl
                },
                BidiRun {
                    start: 6,
                    end: 9,
                    level: 2,
                    direction: BidiRunDirection::Ltr
                },
                BidiRun {
                    start: 9,
                    end: 15,
                    level: 1,
                    direction: BidiRunDirection::Rtl
                },
            ]
        );
    }

    #[test]
    fn produces_distinct_runs_from_an_explicit_rle_embedding_in_an_ltr_paragraph() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("ab{}{}{}cd", RLE, HEBREW, PDF);
        let runs = get_bidi_runs(kernel, &text, BidiDirection::Auto);
        assert_eq!(
            runs,
            vec![
                BidiRun {
                    start: 0,
                    end: 3,
                    level: 0,
                    direction: BidiRunDirection::Ltr
                },
                BidiRun {
                    start: 3,
                    end: 7,
                    level: 1,
                    direction: BidiRunDirection::Rtl
                },
                BidiRun {
                    start: 7,
                    end: 10,
                    level: 0,
                    direction: BidiRunDirection::Ltr
                },
            ]
        );
    }

    #[test]
    fn produces_distinct_runs_from_an_explicit_lre_embedding_in_an_rtl_paragraph() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{}{}ab{}{}", HEBREW, LRE, PDF, HEBREW);
        let runs = get_bidi_runs(kernel, &text, BidiDirection::Auto);
        assert_eq!(
            runs,
            vec![
                BidiRun {
                    start: 0,
                    end: 5,
                    level: 1,
                    direction: BidiRunDirection::Rtl
                },
                BidiRun {
                    start: 5,
                    end: 7,
                    level: 2,
                    direction: BidiRunDirection::Ltr
                },
                BidiRun {
                    start: 7,
                    end: 12,
                    level: 1,
                    direction: BidiRunDirection::Rtl
                },
            ]
        );
    }

    #[test]
    fn returns_a_single_rtl_run_for_pure_rtl_text() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        assert_eq!(
            get_bidi_runs(kernel, ARABIC, BidiDirection::Auto),
            vec![BidiRun {
                start: 0,
                end: 5,
                level: 1,
                direction: BidiRunDirection::Rtl
            }]
        );
    }

    #[test]
    fn returns_a_single_ltr_run_for_pure_ltr_text() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        assert_eq!(
            get_bidi_runs(kernel, "hello", BidiDirection::Auto),
            vec![BidiRun {
                start: 0,
                end: 5,
                level: 0,
                direction: BidiRunDirection::Ltr
            }]
        );
    }

    #[test]
    fn returns_no_runs_for_empty_text() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        assert_eq!(
            get_bidi_runs(kernel, "", BidiDirection::Auto),
            Vec::<BidiRun>::new()
        );
    }

    #[test]
    fn returns_ranges_in_utf16_code_units_for_an_astral_codepoint() {
        let mut left_to_right: BidiClassKernel = allocate_entity();
        left_to_right.get_bidi_class = |_| BidiClass::L;
        assert_eq!(
            get_bidi_runs(&left_to_right, "a\u{1F600}b", BidiDirection::Ltr),
            vec![BidiRun {
                start: 0,
                end: 4,
                level: 0,
                direction: BidiRunDirection::Ltr,
            }]
        );
    }

    #[test]
    fn splits_a_mixed_string_into_ltr_rtl_ltr_runs_with_correct_ranges() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("hello {} world", HEBREW);
        assert_eq!(
            get_bidi_runs(kernel, &text, BidiDirection::Auto),
            vec![
                BidiRun {
                    start: 0,
                    end: 6,
                    level: 0,
                    direction: BidiRunDirection::Ltr
                },
                BidiRun {
                    start: 6,
                    end: 10,
                    level: 1,
                    direction: BidiRunDirection::Rtl
                },
                BidiRun {
                    start: 10,
                    end: 16,
                    level: 0,
                    direction: BidiRunDirection::Ltr
                },
            ]
        );
    }
}

//! flight-compiler: target-native

use flight_entity::allocate_entity;
use flight_textbidi::contract::*;

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
    fn clears_stale_runs_and_reuses_storage_with_exact_utf16_ranges_and_logical_order() {
        let mut kernel: BidiClassKernel = allocate_entity();
        kernel.get_bidi_class = |codepoint| {
            return if codepoint == 0x05d0 {
                BidiClass::R
            } else {
                BidiClass::L
            };
        };
        let mut out = Vec::with_capacity(8);
        out.push(BidiRun {
            start: 99,
            end: 100,
            level: 255,
            direction: BidiRunDirection::Rtl,
        });
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        let cases = [
            (
                "a😀אz",
                vec![
                    BidiRun {
                        start: 0,
                        end: 3,
                        level: 0,
                        direction: BidiRunDirection::Ltr,
                    },
                    BidiRun {
                        start: 3,
                        end: 4,
                        level: 1,
                        direction: BidiRunDirection::Rtl,
                    },
                    BidiRun {
                        start: 4,
                        end: 5,
                        level: 0,
                        direction: BidiRunDirection::Ltr,
                    },
                ],
            ),
            (
                "א",
                vec![BidiRun {
                    start: 0,
                    end: 1,
                    level: 1,
                    direction: BidiRunDirection::Rtl,
                }],
            ),
            ("", vec![]),
        ];
        for (text, expected) in cases {
            get_bidi_runs(&mut out, &kernel, text, BidiDirection::Auto);
            assert_eq!(out, expected);
            assert_eq!(out.as_ptr(), pointer);
            assert_eq!(out.capacity(), capacity);
        }
    }

    #[test]
    fn routes_class_lookups_through_an_explicit_kernel() {
        let mut right_to_left: BidiClassKernel = allocate_entity();
        right_to_left.get_bidi_class = |_| BidiClass::R;
        let mut runs = Vec::new();
        get_bidi_runs(&mut runs, &right_to_left, "abc", BidiDirection::Ltr);
        assert_eq!(
            runs,
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
        let mut runs = Vec::new();
        get_bidi_runs(&mut runs, &right_to_left, "abc", BidiDirection::Ltr);
        assert_eq!(
            runs,
            vec![BidiRun {
                start: 0,
                end: 3,
                level: 1,
                direction: BidiRunDirection::Rtl
            }]
        );
        let mut runs = Vec::new();
        get_bidi_runs(&mut runs, &left_to_right, "abc", BidiDirection::Ltr);
        assert_eq!(
            runs,
            vec![BidiRun {
                start: 0,
                end: 3,
                level: 0,
                direction: BidiRunDirection::Ltr
            }]
        );
        let mut runs = Vec::new();
        get_bidi_runs(&mut runs, &right_to_left, "abc", BidiDirection::Ltr);
        assert_eq!(
            runs,
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
        let mut runs = Vec::new();
        get_bidi_runs(&mut runs, kernel, &text, BidiDirection::Auto);
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
        let mut runs = Vec::new();
        get_bidi_runs(&mut runs, kernel, &text, BidiDirection::Auto);
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
        let mut runs = Vec::new();
        get_bidi_runs(&mut runs, kernel, &text, BidiDirection::Auto);
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
        let mut runs = Vec::new();
        get_bidi_runs(&mut runs, kernel, ARABIC, BidiDirection::Auto);
        assert_eq!(
            runs,
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
        let mut runs = Vec::new();
        get_bidi_runs(&mut runs, kernel, "hello", BidiDirection::Auto);
        assert_eq!(
            runs,
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
        let mut runs = Vec::new();
        get_bidi_runs(&mut runs, kernel, "", BidiDirection::Auto);
        assert_eq!(runs, Vec::<BidiRun>::new());
    }

    #[test]
    fn returns_ranges_in_utf16_code_units_for_an_astral_codepoint() {
        let mut left_to_right: BidiClassKernel = allocate_entity();
        left_to_right.get_bidi_class = |_| BidiClass::L;
        let mut runs = Vec::new();
        get_bidi_runs(&mut runs, &left_to_right, "a\u{1F600}b", BidiDirection::Ltr);
        assert_eq!(
            runs,
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
        let mut runs = Vec::new();
        get_bidi_runs(&mut runs, kernel, &text, BidiDirection::Auto);
        assert_eq!(
            runs,
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

use flight_entity::allocate_entity;
use flight_textbidi::*;

// Hebrew word (four strong-R letters).
const HEBREW: &str = "\u{05E9}\u{05DC}\u{05D5}\u{05DD}";

// Arabic letters (bidi class AL).
const ARABIC: &str = "\u{0627}\u{0628}\u{062A}\u{062B}\u{062C}";

// Arabic-Indic digits (bidi class AN).
const ARABIC_DIGITS: &str = "\u{0660}\u{0661}\u{0662}";

// Bidi control characters.
const LRE: &str = "\u{202A}";
const RLE: &str = "\u{202B}";
const PDF: &str = "\u{202C}";
const LRO: &str = "\u{202D}";
const RLO: &str = "\u{202E}";
const LRI: &str = "\u{2066}";
const RLI: &str = "\u{2067}";
const FSI: &str = "\u{2068}";
const PDI: &str = "\u{2069}";

mod resolve_bidi_levels {
    use super::*;

    #[test]
    fn routes_class_lookups_through_an_explicit_kernel() {
        let mut right_to_left: BidiClassKernel = allocate_entity();
        right_to_left.get_bidi_class = |_| BidiClass::R;
        assert_eq!(
            resolve_bidi_levels(&right_to_left, "abc", BidiDirection::Ltr).as_ref(),
            &[1, 1, 1]
        );
    }

    #[test]
    fn isolates_interleaved_callers_that_pass_different_backends() {
        let mut right_to_left: BidiClassKernel = allocate_entity();
        right_to_left.get_bidi_class = |_| BidiClass::R;
        let mut left_to_right: BidiClassKernel = allocate_entity();
        left_to_right.get_bidi_class = |_| BidiClass::L;
        assert_eq!(
            resolve_bidi_levels(&right_to_left, "abc", BidiDirection::Ltr).as_ref(),
            &[1, 1, 1]
        );
        assert_eq!(
            resolve_bidi_levels(&left_to_right, "abc", BidiDirection::Ltr).as_ref(),
            &[0, 0, 0]
        );
        assert_eq!(
            resolve_bidi_levels(&right_to_left, "abc", BidiDirection::Ltr).as_ref(),
            &[1, 1, 1]
        );
    }

    #[test]
    fn assigns_level_0_to_a_pure_ltr_string() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        assert_eq!(
            resolve_bidi_levels(kernel, "hello", BidiDirection::Auto).as_ref(),
            &[0, 0, 0, 0, 0]
        );
    }

    #[test]
    fn assigns_level_1_to_a_pure_rtl_hebrew_string_under_auto_base() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        assert_eq!(
            resolve_bidi_levels(kernel, HEBREW, BidiDirection::Auto).as_ref(),
            &[1, 1, 1, 1]
        );
    }

    #[test]
    fn converts_arabic_indic_digits_to_an_and_keeps_them_at_level_1_in_an_rtl_paragraph() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{}{}", ARABIC, ARABIC_DIGITS);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[1, 1, 1, 1, 1, 2, 2, 2]);
    }

    #[test]
    fn converts_en_after_al_to_an_via_w2_in_an_rtl_paragraph() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{}123", ARABIC);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[1, 1, 1, 1, 1, 2, 2, 2]);
    }

    #[test]
    fn derives_an_rtl_paragraph_from_a_leading_strong_r_character_under_auto() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{} ab", HEBREW);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[1, 1, 1, 1, 1, 2, 2]);
    }

    #[test]
    fn embeds_an_rtl_run_at_an_odd_level_inside_an_ltr_paragraph() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("hello {} world", HEBREW);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(
            levels.as_ref(),
            &[0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]
        );
    }

    #[test]
    fn gives_european_numbers_in_an_rtl_context_an_even_ltr_level_above_the_rtl_text() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{} 123", HEBREW);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[1, 1, 1, 1, 1, 2, 2, 2]);
    }

    #[test]
    fn keeps_an_explicit_ltr_base_at_level_0_for_pure_ltr_text_even_with_a_leading_number() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        assert_eq!(
            resolve_bidi_levels(kernel, "12ab", BidiDirection::Ltr).as_ref(),
            &[0, 0, 0, 0]
        );
    }

    #[test]
    fn keeps_en_as_level_0_after_l_via_w7_in_an_ltr_paragraph() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let levels = resolve_bidi_levels(kernel, "abc 123 def", BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    }

    #[test]
    fn pushes_an_lre_embedding_to_level_2_inside_an_rtl_paragraph() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{}{}ab{}{}", HEBREW, LRE, PDF, HEBREW);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1]);
    }

    #[test]
    fn pushes_an_rle_embedding_to_level_1_inside_an_ltr_paragraph() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("ab{}{}{}cd", RLE, HEBREW, PDF);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
    }

    #[test]
    fn raises_the_paragraph_level_for_an_explicit_rtl_base() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("hello {} world", HEBREW);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Rtl);
        assert_eq!(
            levels.as_ref(),
            &[2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]
        );
    }

    #[test]
    fn resets_trailing_whitespace_to_the_paragraph_level_via_l1() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("abc {}   ", HEBREW);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
    }

    #[test]
    fn resolves_an_lri_isolate_to_an_even_level_inside_an_rtl_paragraph() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{}{}ab{}{}", HEBREW, LRI, PDI, HEBREW);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1]);
    }

    #[test]
    fn resolves_an_rli_isolate_to_an_odd_level_inside_an_ltr_paragraph() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("ab{}{}{}cd", RLI, HEBREW, PDI);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
    }

    #[test]
    fn resolves_an_fsi_isolate_by_scoring_its_content() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("ab{}{}{}cd", FSI, HEBREW, PDI);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
    }

    #[test]
    fn resolves_an_fsi_with_ltr_content_as_lri() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{}{}ab{}{}", HEBREW, FSI, PDI, HEBREW);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1]);
    }

    #[test]
    fn resolves_mixed_neutrals_between_same_direction_strong_types_via_n1() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let levels = resolve_bidi_levels(kernel, "abc!?@def", BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[0, 0, 0, 0, 0, 0, 0, 0, 0]);
    }

    #[test]
    fn resolves_neutrals_between_r_and_r_to_r_via_n1_in_an_rtl_paragraph() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{}!?{}", HEBREW, HEBREW);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    }

    #[test]
    fn resolves_neutrals_between_opposite_strong_types_to_the_embedding_direction_via_n2() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("abc!{}", HEBREW);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[0, 0, 0, 0, 1, 1, 1, 1]);
    }

    #[test]
    fn resolves_both_brackets_from_enclosed_opposite_direction_text_via_n0() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{}({})abc", HEBREW, HEBREW);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Ltr);
        assert_eq!(levels.as_ref(), &[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0]);
    }

    #[test]
    fn pairs_nested_brackets_within_one_isolating_run_sequence() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{}([abc]){}", HEBREW, HEBREW);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Rtl);
        assert_eq!(
            levels.as_ref(),
            &[1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1]
        );
    }

    #[test]
    fn resolves_an_lro_override_forcing_all_content_to_l() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("a{}{}{}b", LRO, HEBREW, PDF);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[0, 0, 2, 2, 2, 2, 0, 0]);
    }

    #[test]
    fn resolves_an_rlo_override_forcing_all_content_to_r() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{}{}ab{}{}", HEBREW, RLO, PDF, HEBREW);
        let levels = resolve_bidi_levels(kernel, &text, BidiDirection::Auto);
        assert_eq!(levels.as_ref(), &[1, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 1]);
    }

    #[test]
    fn returns_one_level_per_utf16_code_unit_for_an_astral_codepoint() {
        let mut left_to_right: BidiClassKernel = allocate_entity();
        left_to_right.get_bidi_class = |_| BidiClass::L;
        assert_eq!(
            resolve_bidi_levels(&left_to_right, "a\u{1F600}b", BidiDirection::Ltr),
            vec![0, 0, 0, 0].into_boxed_slice()
        );
    }

    #[test]
    fn returns_an_empty_array_for_empty_text() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        assert_eq!(
            resolve_bidi_levels(kernel, "", BidiDirection::Auto),
            Vec::<u8>::new().into_boxed_slice()
        );
    }
}

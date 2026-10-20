use flight_textbidi::*;

const RLI: &str = "\u{2067}";
const PDI: &str = "\u{2069}";
const RLE: &str = "\u{202B}";
const PDF: &str = "\u{202C}";

mod bidi_conformance_fixtures {
    use super::*;

    #[test]
    fn covers_weak_chains_neutral_sos_eos_numbers_in_rtl_and_isolates() {
        let kernel = compact_bidi_class_kernel();

        struct Fixture {
            direction: BidiDirection,
            text: String,
            levels: Vec<u8>,
        }

        let fixtures = vec![
            Fixture {
                direction: BidiDirection::Ltr,
                text: "a1-2b".to_string(),
                levels: vec![0, 0, 0, 0, 0],
            },
            Fixture {
                direction: BidiDirection::Rtl,
                text: "!\u{05D0}\u{05D1}!".to_string(),
                levels: vec![1, 1, 1, 1],
            },
            Fixture {
                direction: BidiDirection::Rtl,
                text: "\u{05D0}\u{05D1} 12".to_string(),
                levels: vec![1, 1, 1, 2, 2],
            },
            Fixture {
                direction: BidiDirection::Ltr,
                text: format!("a{}\u{05D0}\u{05D1}{}b", RLI, PDI),
                levels: vec![0, 0, 1, 1, 0, 0],
            },
        ];

        for fixture in &fixtures {
            assert_eq!(
                resolve_bidi_levels(&kernel, &fixture.text, fixture.direction),
                fixture.levels,
                "Failed for text: {:?}",
                fixture.text
            );
        }
    }

    #[test]
    fn caps_explicit_embedding_depth_and_ignores_overflow_embeddings() {
        let kernel = compact_bidi_class_kernel();
        let text = format!("{}a{}", RLE.repeat(126), PDF.repeat(126));
        let levels = resolve_bidi_levels(&kernel, &text, BidiDirection::Ltr);
        assert_eq!(levels[126], 126);
    }

    #[test]
    fn reorders_a_resolved_rtl_number_fixture_while_preserving_digit_order() {
        let kernel = compact_bidi_class_kernel();
        let text = "\u{05D0}\u{05D1} 12";
        let levels = resolve_bidi_levels(&kernel, text, BidiDirection::Rtl);
        let mut visual: Vec<usize> = Vec::new();
        reorder_bidi_line(&levels, 0, levels.len(), &mut visual);
        assert_eq!(visual, vec![3, 4, 2, 1, 0]);
    }
}

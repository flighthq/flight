use flight_textbidi::*;

const RLI: &str = "\u{2067}";
const PDI: &str = "\u{2069}";
const RLE: &str = "\u{202B}";
const PDF: &str = "\u{202C}";

mod bidi_conformance_fixtures {
    use super::*;

    #[test]
    fn covers_weak_chains_neutral_sos_eos_numbers_in_rtl_and_isolates() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;

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
            let mut levels = Vec::new();
            resolve_bidi_levels(&mut levels, kernel, &fixture.text, fixture.direction);
            assert_eq!(
                levels.as_slice(),
                fixture.levels.as_slice(),
                "Failed for text: {:?}",
                fixture.text
            );
        }
    }

    #[test]
    fn caps_explicit_embedding_depth_and_ignores_overflow_embeddings() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = format!("{}a{}", RLE.repeat(126), PDF.repeat(126));
        let mut levels = Vec::new();
        resolve_bidi_levels(&mut levels, kernel, &text, BidiDirection::Ltr);
        assert_eq!(levels[126], 126);
    }

    #[test]
    fn reorders_a_resolved_rtl_number_fixture_while_preserving_digit_order() {
        let kernel = &*COMPACT_BIDI_CLASS_KERNEL;
        let text = "\u{05D0}\u{05D1} 12";
        let mut levels = Vec::new();
        resolve_bidi_levels(&mut levels, kernel, text, BidiDirection::Rtl);
        let mut visual: Vec<usize> = Vec::new();
        reorder_bidi_line(&mut visual, &levels, 0, levels.len());
        assert_eq!(visual, vec![3, 4, 2, 1, 0]);
    }
}

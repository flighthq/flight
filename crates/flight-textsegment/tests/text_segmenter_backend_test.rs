use flight_textsegment::*;

const FAMILY: &str = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}";

fn custom_backend_segment(
    text: &str,
    _granularity: TextSegmentGranularity,
    _locale: Option<&str>,
) -> Vec<TextSegment> {
    vec![TextSegment {
        start: 0,
        end: text.encode_utf16().count(),
        text: text.to_string(),
        is_word_like: None,
    }]
}

fn create_recording_backend() -> HostTextSegmenterCapability {
    HostTextSegmenterCapability {
        segment: custom_backend_segment,
    }
}

mod explain_text_segmenter_backend {
    use super::*;

    #[test]
    fn reports_the_bundled_intl_capability_as_available() {
        assert_eq!(
            explain_text_segmenter_backend(&WEB_TEXT_SEGMENTER_BACKEND),
            TextSegmenterExplanation {
                available: true,
                backend: TextSegmenterKind::WebIntl,
                intl_segmenter_available: true,
            }
        );
    }

    #[test]
    fn identifies_a_custom_capability_independently_of_intl_availability() {
        assert_eq!(
            explain_text_segmenter_backend(&create_recording_backend()),
            TextSegmenterExplanation {
                available: true,
                backend: TextSegmenterKind::Custom,
                intl_segmenter_available: true,
            }
        );
    }
}

mod web_text_segmenter_backend {
    use super::*;

    #[test]
    fn provides_the_stable_bundled_intl_fallback() {
        let backend = *WEB_TEXT_SEGMENTER_BACKEND;
        let text = format!("a{}b", FAMILY);
        let texts: Vec<String> = (backend.segment)(&text, TextSegmentGranularity::Grapheme, None)
            .iter()
            .map(|s| s.text.clone())
            .collect();
        assert_eq!(texts, vec!["a", FAMILY, "b"]);
    }

    #[test]
    fn segments_a_zwj_family_emoji_as_a_single_grapheme() {
        let backend = *WEB_TEXT_SEGMENTER_BACKEND;
        let text = format!("a{}b", FAMILY);
        let segments = (backend.segment)(&text, TextSegmentGranularity::Grapheme, None);
        let texts: Vec<&str> = segments.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(texts, vec!["a", FAMILY, "b"]);
        assert_eq!(segments[0].start, 0);
        assert_eq!(segments[0].end, 1);
        assert_eq!(segments[1].start, 1);
        assert_eq!(segments[1].end, 9);
        assert_eq!(segments[2].start, 9);
        assert_eq!(segments[2].end, 10);
    }

    #[test]
    fn reports_is_word_like_for_word_granularity_and_omits_it_otherwise() {
        let backend = *WEB_TEXT_SEGMENTER_BACKEND;
        let words = (backend.segment)("Hi there", TextSegmentGranularity::Word, None);
        assert!(words.iter().all(|s| s.is_word_like.is_some()));
        let graphemes = (backend.segment)("Hi", TextSegmentGranularity::Grapheme, None);
        assert!(graphemes.iter().all(|s| s.is_word_like.is_none()));
    }

    #[test]
    fn produces_gap_free_start_end_offsets_covering_the_whole_string() {
        let backend = *WEB_TEXT_SEGMENTER_BACKEND;
        let segments = (backend.segment)("abc", TextSegmentGranularity::Grapheme, None);
        assert_eq!(
            segments,
            vec![
                TextSegment {
                    start: 0,
                    end: 1,
                    text: "a".to_string(),
                    is_word_like: None,
                },
                TextSegment {
                    start: 1,
                    end: 2,
                    text: "b".to_string(),
                    is_word_like: None,
                },
                TextSegment {
                    start: 2,
                    end: 3,
                    text: "c".to_string(),
                    is_word_like: None,
                },
            ]
        );
    }
}

use flight_textsegment::*;
use std::cell::RefCell;

const FAMILY: &str = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}";

fn first_tag_segment(
    _text: &str,
    _granularity: TextSegmentGranularity,
    _locale: Option<&str>,
) -> Vec<TextSegment> {
    vec![TextSegment {
        start: 0,
        end: 5,
        text: "first".to_string(),
        is_word_like: None,
    }]
}

fn second_tag_segment(
    _text: &str,
    _granularity: TextSegmentGranularity,
    _locale: Option<&str>,
) -> Vec<TextSegment> {
    vec![TextSegment {
        start: 0,
        end: 6,
        text: "second".to_string(),
        is_word_like: None,
    }]
}

thread_local! {
    static SEEN_LOCALE: RefCell<Option<String>> = const { RefCell::new(None) };
}

fn locale_tracking_segment(
    text: &str,
    _granularity: TextSegmentGranularity,
    locale: Option<&str>,
) -> Vec<TextSegment> {
    SEEN_LOCALE.with(|v| *v.borrow_mut() = locale.map(|s| s.to_string()));
    vec![TextSegment {
        start: 0,
        end: text.encode_utf16().count(),
        text: text.to_string(),
        is_word_like: None,
    }]
}

mod segment_graphemes {
    use super::*;

    #[test]
    fn isolates_callers_that_interleave_different_explicit_hosts() {
        let first = HostTextSegmenterCapability {
            segment: first_tag_segment,
        };
        let second = HostTextSegmenterCapability {
            segment: second_tag_segment,
        };
        assert_eq!(segment_graphemes(&first, "hi", None)[0].text, "first");
        assert_eq!(segment_graphemes(&second, "hi", None)[0].text, "second");
        assert_eq!(segment_graphemes(&first, "hi", None)[0].text, "first");
    }

    #[test]
    fn treats_a_zwj_family_emoji_as_one_grapheme() {
        let backend = web_text_segmenter_backend();
        let text = format!("a{}b", FAMILY);
        let segments = segment_graphemes(&backend, &text, None);
        let texts: Vec<&str> = segments.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(texts, vec!["a", FAMILY, "b"]);
        assert_eq!(segments[1].start, 1);
        assert_eq!(segments[1].end, 9);
        assert_eq!(segments[2].start, 9);
        assert_eq!(segments[2].end, 10);
    }

    #[test]
    fn treats_a_base_plus_combining_mark_as_one_grapheme() {
        let backend = web_text_segmenter_backend();
        let precomposed = segment_graphemes(&backend, "éx", None);
        let precomposed_texts: Vec<&str> = precomposed.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(precomposed_texts, vec!["é", "x"]);

        let segments = segment_graphemes(&backend, "e\u{0301}x", None);
        let texts: Vec<&str> = segments.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(texts, vec!["e\u{0301}", "x"]);
        assert_eq!(segments[0].start, 0);
        assert_eq!(segments[0].end, 2);
        assert_eq!(segments[1].start, 2);
        assert_eq!(segments[1].end, 3);
    }

    #[test]
    fn threads_the_locale_argument_to_the_active_backend() {
        SEEN_LOCALE.with(|v| *v.borrow_mut() = Some("unset".to_string()));
        let fake = HostTextSegmenterCapability {
            segment: locale_tracking_segment,
        };
        segment_graphemes(&fake, "hi", Some("de-DE"));
        SEEN_LOCALE.with(|v| {
            assert_eq!(*v.borrow(), Some("de-DE".to_string()));
        });
    }
}

mod segment_sentences {
    use super::*;

    #[test]
    fn splits_into_sentences() {
        let backend = web_text_segmenter_backend();
        let segments = segment_sentences(&backend, "Hi. Bye.", None);
        let texts: Vec<String> = segments.iter().map(|s| s.text.trim().to_string()).collect();
        assert_eq!(texts, vec!["Hi.", "Bye."]);
    }

    #[test]
    fn uses_utf_16_offsets_for_surrogate_pairs() {
        let backend = web_text_segmenter_backend();
        let segments = segment_sentences(&backend, "😀. Bye.", None);
        assert_eq!(segments[0].start, 0);
        assert_eq!(segments[0].end, 4);
        assert_eq!(segments[1].start, 4);
        assert_eq!(segments[1].end, 8);
    }
}

mod segment_words {
    use super::*;

    #[test]
    fn marks_words_as_word_like_and_punctuation_whitespace_as_not() {
        let backend = web_text_segmenter_backend();
        let segments = segment_words(&backend, "Hello, world.", None);
        let words: Vec<&str> = segments
            .iter()
            .filter(|s| s.is_word_like == Some(true))
            .map(|s| s.text.as_str())
            .collect();
        assert_eq!(words, vec!["Hello", "world"]);
        let comma = segments.iter().find(|s| s.text == ",");
        assert_eq!(comma.unwrap().is_word_like, Some(false));
        let space = segments.iter().find(|s| s.text == " ");
        assert_eq!(space.unwrap().is_word_like, Some(false));
    }
}

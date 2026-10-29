//! flight-compiler: target-native

use flight_textsegment::*;
use std::cell::RefCell;

const FAMILY: &str = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}";

struct SegmentCall {
    text: String,
    granularity: TextSegmentGranularity,
    locale: Option<String>,
    text_pointers: Vec<usize>,
}

fn assert_reuses_output_and_preserves_host_records(
    query: fn(&mut Vec<TextSegment>, &HostTextSegmenterCapability, &str, Option<&str>),
    granularity: TextSegmentGranularity,
) {
    SEGMENT_CALLS.with(|calls| calls.borrow_mut().clear());
    let host = HostTextSegmenterCapability {
        segment: record_tracking_segment,
    };
    let mut out = Vec::with_capacity(8);
    out.push(TextSegment {
        start: 99,
        end: 100,
        text: "stale".to_string(),
        is_word_like: Some(false),
    });
    let pointer = out.as_ptr();
    let capacity = out.capacity();
    let cases = [
        (
            "a😀z",
            Some("de-DE"),
            vec![
                TextSegment {
                    start: 0,
                    end: 3,
                    text: "a😀".to_string(),
                    is_word_like: Some(true),
                },
                TextSegment {
                    start: 3,
                    end: 4,
                    text: "z".to_string(),
                    is_word_like: Some(false),
                },
            ],
        ),
        (
            "x",
            None,
            vec![TextSegment {
                start: 0,
                end: 1,
                text: "x".to_string(),
                is_word_like: None,
            }],
        ),
        ("", Some("ja-JP"), vec![]),
    ];
    for (index, (text, locale, expected)) in cases.into_iter().enumerate() {
        query(&mut out, &host, text, locale);
        assert_eq!(out, expected);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
        SEGMENT_CALLS.with(|calls| {
            let calls = calls.borrow();
            assert_eq!(calls.len(), index + 1);
            let call = &calls[index];
            assert_eq!(call.text, text);
            assert_eq!(call.granularity, granularity);
            assert_eq!(call.locale.as_deref(), locale);
            let text_pointers: Vec<usize> = out
                .iter()
                .map(|segment| segment.text.as_ptr() as usize)
                .collect();
            assert_eq!(text_pointers, call.text_pointers);
        });
    }
}

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
    static SEGMENT_CALLS: RefCell<Vec<SegmentCall>> = const { RefCell::new(Vec::new()) };
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

fn record_tracking_segment(
    text: &str,
    granularity: TextSegmentGranularity,
    locale: Option<&str>,
) -> Vec<TextSegment> {
    let segments = match text {
        "a😀z" => vec![
            TextSegment {
                start: 0,
                end: 3,
                text: "a😀".to_string(),
                is_word_like: Some(true),
            },
            TextSegment {
                start: 3,
                end: 4,
                text: "z".to_string(),
                is_word_like: Some(false),
            },
        ],
        "x" => vec![TextSegment {
            start: 0,
            end: 1,
            text: "x".to_string(),
            is_word_like: None,
        }],
        "" => vec![],
        _ => panic!("unexpected host input"),
    };
    SEGMENT_CALLS.with(|calls| {
        calls.borrow_mut().push(SegmentCall {
            text: text.to_string(),
            granularity,
            locale: locale.map(str::to_string),
            text_pointers: segments
                .iter()
                .map(|segment| segment.text.as_ptr() as usize)
                .collect(),
        });
    });
    return segments;
}

mod segment_graphemes {
    use super::*;

    #[test]
    fn clears_and_reuses_output_while_moving_unchanged_host_records() {
        assert_reuses_output_and_preserves_host_records(
            segment_graphemes,
            TextSegmentGranularity::Grapheme,
        );
    }

    #[test]
    fn isolates_callers_that_interleave_different_explicit_hosts() {
        let first = HostTextSegmenterCapability {
            segment: first_tag_segment,
        };
        let second = HostTextSegmenterCapability {
            segment: second_tag_segment,
        };
        let mut segments = Vec::new();
        segment_graphemes(&mut segments, &first, "hi", None);
        assert_eq!(segments[0].text, "first");
        segment_graphemes(&mut segments, &second, "hi", None);
        assert_eq!(segments[0].text, "second");
        segment_graphemes(&mut segments, &first, "hi", None);
        assert_eq!(segments[0].text, "first");
    }

    #[test]
    fn treats_a_zwj_family_emoji_as_one_grapheme() {
        let backend = *WEB_TEXT_SEGMENTER_BACKEND;
        let text = format!("a{}b", FAMILY);
        let mut segments = Vec::new();
        segment_graphemes(&mut segments, &backend, &text, None);
        let texts: Vec<&str> = segments.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(texts, vec!["a", FAMILY, "b"]);
        assert_eq!(segments[1].start, 1);
        assert_eq!(segments[1].end, 9);
        assert_eq!(segments[2].start, 9);
        assert_eq!(segments[2].end, 10);
    }

    #[test]
    fn treats_a_base_plus_combining_mark_as_one_grapheme() {
        let backend = *WEB_TEXT_SEGMENTER_BACKEND;
        let mut precomposed = Vec::new();
        segment_graphemes(&mut precomposed, &backend, "éx", None);
        let precomposed_texts: Vec<&str> = precomposed.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(precomposed_texts, vec!["é", "x"]);

        let mut segments = Vec::new();
        segment_graphemes(&mut segments, &backend, "e\u{0301}x", None);
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
        let mut segments = Vec::new();
        segment_graphemes(&mut segments, &fake, "hi", Some("de-DE"));
        SEEN_LOCALE.with(|v| {
            assert_eq!(*v.borrow(), Some("de-DE".to_string()));
        });
    }
}

mod segment_sentences {
    use super::*;

    #[test]
    fn clears_and_reuses_output_while_moving_unchanged_host_records() {
        assert_reuses_output_and_preserves_host_records(
            segment_sentences,
            TextSegmentGranularity::Sentence,
        );
    }

    #[test]
    fn splits_into_sentences() {
        let backend = *WEB_TEXT_SEGMENTER_BACKEND;
        let mut segments = Vec::new();
        segment_sentences(&mut segments, &backend, "Hi. Bye.", None);
        let texts: Vec<String> = segments.iter().map(|s| s.text.trim().to_string()).collect();
        assert_eq!(texts, vec!["Hi.", "Bye."]);
    }

    #[test]
    fn uses_utf_16_offsets_for_surrogate_pairs() {
        let backend = *WEB_TEXT_SEGMENTER_BACKEND;
        let mut segments = Vec::new();
        segment_sentences(&mut segments, &backend, "😀. Bye.", None);
        assert_eq!(segments[0].start, 0);
        assert_eq!(segments[0].end, 4);
        assert_eq!(segments[1].start, 4);
        assert_eq!(segments[1].end, 8);
    }
}

mod segment_words {
    use super::*;

    #[test]
    fn clears_and_reuses_output_while_moving_unchanged_host_records() {
        assert_reuses_output_and_preserves_host_records(
            segment_words,
            TextSegmentGranularity::Word,
        );
    }

    #[test]
    fn marks_words_as_word_like_and_punctuation_whitespace_as_not() {
        let backend = *WEB_TEXT_SEGMENTER_BACKEND;
        let mut segments = Vec::new();
        segment_words(&mut segments, &backend, "Hello, world.", None);
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

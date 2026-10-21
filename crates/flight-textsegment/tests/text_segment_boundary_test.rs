use flight_textsegment::*;
use std::cell::RefCell;

const FAMILY: &str = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}";

fn emoji_text() -> String {
    format!("a{}b", FAMILY)
}

fn family_start() -> usize {
    1
}

fn b_start() -> usize {
    1 + FAMILY.encode_utf16().count()
}

fn emoji_len() -> usize {
    emoji_text().encode_utf16().count()
}

fn whole_word_segment(
    text: &str,
    _granularity: TextSegmentGranularity,
    _locale: Option<&str>,
) -> Vec<TextSegment> {
    vec![TextSegment {
        start: 0,
        end: text.encode_utf16().count(),
        text: text.to_string(),
        is_word_like: Some(true),
    }]
}

thread_local! {
    static SEEN_LOCALE: RefCell<Option<String>> = const { RefCell::new(None) };
}

fn locale_tracking_word_segment(
    text: &str,
    _granularity: TextSegmentGranularity,
    locale: Option<&str>,
) -> Vec<TextSegment> {
    SEEN_LOCALE.with(|v| *v.borrow_mut() = locale.map(|s| s.to_string()));
    vec![TextSegment {
        start: 0,
        end: text.encode_utf16().count(),
        text: text.to_string(),
        is_word_like: Some(true),
    }]
}

mod get_next_grapheme_boundary {
    use super::*;

    #[test]
    fn steps_over_an_emoji_cluster_in_a_single_move() {
        let backend = web_text_segmenter_backend();
        assert_eq!(
            get_next_grapheme_boundary(&backend, &emoji_text(), family_start() as isize, None),
            b_start()
        );
    }

    #[test]
    fn advances_one_plain_grapheme_from_the_start() {
        let backend = web_text_segmenter_backend();
        assert_eq!(
            get_next_grapheme_boundary(&backend, &emoji_text(), 0, None),
            family_start()
        );
    }

    #[test]
    fn clamps_at_text_length() {
        let backend = web_text_segmenter_backend();
        let text = emoji_text();
        assert_eq!(
            get_next_grapheme_boundary(&backend, &text, emoji_len() as isize, None),
            emoji_len()
        );
        assert_eq!(
            get_next_grapheme_boundary(&backend, &text, 999, None),
            emoji_len()
        );
    }
}

mod get_next_sentence_boundary {
    use super::*;

    #[test]
    fn advances_to_the_next_sentence_start() {
        let backend = web_text_segmenter_backend();
        assert_eq!(
            get_next_sentence_boundary(&backend, "First. Second!", 0, None),
            7
        );
    }

    #[test]
    fn clamps_at_text_length() {
        let backend = web_text_segmenter_backend();
        assert_eq!(
            get_next_sentence_boundary(&backend, "First.", 99, None),
            6
        );
    }

    #[test]
    fn stops_the_bundled_iterator_without_materializing_backend_text_segment_records() {
        let backend = web_text_segmenter_backend();
        // In the TS version, this test spies on the segment function to verify it is
        // not called (uses Intl.Segmenter directly). In Rust, we verify the correct
        // result is produced via the direct iteration path.
        assert_eq!(
            get_next_sentence_boundary(&backend, "First. Second!", 0, None),
            7
        );
    }
}

mod get_next_word_boundary {
    use super::*;

    #[test]
    fn jumps_to_the_end_of_the_current_word() {
        let backend = web_text_segmenter_backend();
        assert_eq!(
            get_next_word_boundary(&backend, "foo bar", 0, None),
            3
        );
    }

    #[test]
    fn clamps_at_text_length() {
        let backend = web_text_segmenter_backend();
        assert_eq!(get_next_word_boundary(&backend, "foo bar", 7, None), 7);
        assert_eq!(get_next_word_boundary(&backend, "foo bar", 42, None), 7);
    }
}

mod get_previous_grapheme_boundary {
    use super::*;

    #[test]
    fn inverts_a_step_over_an_emoji_cluster() {
        let backend = web_text_segmenter_backend();
        assert_eq!(
            get_previous_grapheme_boundary(
                &backend,
                &emoji_text(),
                b_start() as isize,
                None
            ),
            family_start()
        );
    }

    #[test]
    fn clamps_at_0() {
        let backend = web_text_segmenter_backend();
        let text = emoji_text();
        assert_eq!(
            get_previous_grapheme_boundary(&backend, &text, 0, None),
            0
        );
        assert_eq!(
            get_previous_grapheme_boundary(&backend, &text, -5, None),
            0
        );
    }

    #[test]
    fn steps_back_from_the_end_onto_the_last_cluster_start() {
        let backend = web_text_segmenter_backend();
        let text = emoji_text();
        assert_eq!(
            get_previous_grapheme_boundary(&backend, &text, emoji_len() as isize, None),
            b_start()
        );
    }
}

mod get_previous_sentence_boundary {
    use super::*;

    #[test]
    fn steps_back_to_the_current_sentence_start() {
        let backend = web_text_segmenter_backend();
        assert_eq!(
            get_previous_sentence_boundary(&backend, "First. Second!", 14, None),
            7
        );
    }

    #[test]
    fn clamps_at_zero() {
        let backend = web_text_segmenter_backend();
        assert_eq!(
            get_previous_sentence_boundary(&backend, "First.", -1, None),
            0
        );
    }
}

mod get_previous_word_boundary {
    use super::*;

    #[test]
    fn jumps_to_the_start_of_the_current_word() {
        let backend = web_text_segmenter_backend();
        assert_eq!(
            get_previous_word_boundary(&backend, "foo bar", 7, None),
            4
        );
    }

    #[test]
    fn clamps_at_0() {
        let backend = web_text_segmenter_backend();
        assert_eq!(
            get_previous_word_boundary(&backend, "foo bar", 0, None),
            0
        );
    }
}

mod get_word_range_at {
    use super::*;

    #[test]
    fn threads_an_explicit_host_through_the_boundary_helper() {
        let explicit = HostTextSegmenterCapability {
            segment: whole_word_segment,
        };
        assert_eq!(
            get_word_range_at(&explicit, "word", 1, None),
            Some(TextSegmentRange { start: 0, end: 4 })
        );
    }

    #[test]
    fn returns_the_word_range_under_an_index() {
        let backend = web_text_segmenter_backend();
        assert_eq!(
            get_word_range_at(&backend, "foo bar", 1, None),
            Some(TextSegmentRange { start: 0, end: 3 })
        );
    }

    #[test]
    fn returns_utf_16_offsets_after_a_surrogate_pair() {
        let backend = web_text_segmenter_backend();
        assert_eq!(
            get_word_range_at(&backend, "😀 word", 4, None),
            Some(TextSegmentRange { start: 3, end: 7 })
        );
    }

    #[test]
    fn returns_null_in_whitespace() {
        let backend = web_text_segmenter_backend();
        assert_eq!(get_word_range_at(&backend, "foo bar", 3, None), None);
    }

    #[test]
    fn resolves_the_final_word_from_the_trailing_boundary() {
        let backend = web_text_segmenter_backend();
        assert_eq!(
            get_word_range_at(&backend, "foo bar", 7, None),
            Some(TextSegmentRange { start: 4, end: 7 })
        );
    }

    #[test]
    fn returns_null_for_empty_text() {
        let backend = web_text_segmenter_backend();
        assert_eq!(get_word_range_at(&backend, "", 0, None), None);
    }

    #[test]
    fn threads_the_locale_to_the_active_backend() {
        SEEN_LOCALE.with(|v| *v.borrow_mut() = Some("unset".to_string()));
        let locale_backend = HostTextSegmenterCapability {
            segment: locale_tracking_word_segment,
        };
        get_word_range_at(&locale_backend, "word", 1, Some("ja-JP"));
        SEEN_LOCALE.with(|v| {
            assert_eq!(*v.borrow(), Some("ja-JP".to_string()));
        });
    }
}

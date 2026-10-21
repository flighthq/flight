use flight_textsegment::contract::{
    get_text_segment_granularity_string, get_text_segmenter_kind_string,
    parse_text_segment_granularity, parse_text_segmenter_kind,
};
use flight_textsegment::*;

mod get_text_segment_granularity_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_text_segment_granularity_string(TextSegmentGranularity::Grapheme),
            "grapheme"
        );
        assert_eq!(
            get_text_segment_granularity_string(TextSegmentGranularity::Word),
            "word"
        );
        assert_eq!(
            get_text_segment_granularity_string(TextSegmentGranularity::Sentence),
            "sentence"
        );
    }
}

mod get_text_segmenter_kind_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_text_segmenter_kind_string(TextSegmenterKind::Custom),
            "custom"
        );
        assert_eq!(
            get_text_segmenter_kind_string(TextSegmenterKind::WebIntl),
            "web-intl"
        );
    }
}

mod parse_text_segment_granularity {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_text_segment_granularity("grapheme"),
            Some(TextSegmentGranularity::Grapheme)
        );
        assert_eq!(
            parse_text_segment_granularity("word"),
            Some(TextSegmentGranularity::Word)
        );
        assert_eq!(
            parse_text_segment_granularity("sentence"),
            Some(TextSegmentGranularity::Sentence)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_text_segment_granularity("Grapheme"), None);
        assert_eq!(parse_text_segment_granularity("line"), None);
        assert_eq!(parse_text_segment_granularity(""), None);
    }
}

mod parse_text_segmenter_kind {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_text_segmenter_kind("custom"),
            Some(TextSegmenterKind::Custom)
        );
        assert_eq!(
            parse_text_segmenter_kind("web-intl"),
            Some(TextSegmenterKind::WebIntl)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_text_segmenter_kind("Custom"), None);
        assert_eq!(parse_text_segmenter_kind("web_intl"), None);
        assert_eq!(parse_text_segmenter_kind(""), None);
    }
}

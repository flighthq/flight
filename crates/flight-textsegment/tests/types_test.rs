use flight_textsegment::*;
use flight_textsegment::contract::{
    get_text_segmenter_kind_string, parse_text_segmenter_kind,
};

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

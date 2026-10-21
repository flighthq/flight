use flight_bitmapfont_formats::*;

#[test]
fn explanation_format_strings_match_the_source_vocabulary() {
    assert_eq!(
        get_bitmap_font_parse_explanation_format_string(BitmapFontParseExplanationFormat::Fnt),
        "fnt"
    );
    assert_eq!(
        get_bitmap_font_parse_explanation_format_string(BitmapFontParseExplanationFormat::Json),
        "json"
    );
    assert_eq!(
        get_bitmap_font_parse_explanation_format_string(BitmapFontParseExplanationFormat::Unknown),
        "unknown"
    );
    assert_eq!(
        get_bitmap_font_parse_explanation_format_string(BitmapFontParseExplanationFormat::Xml),
        "xml"
    );
}

#[test]
fn explanation_reason_strings_match_the_source_vocabulary() {
    assert_eq!(
        get_bitmap_font_parse_explanation_reason_string(
            BitmapFontParseExplanationReason::InvalidData
        ),
        "invalid-data"
    );
    assert_eq!(
        get_bitmap_font_parse_explanation_reason_string(
            BitmapFontParseExplanationReason::MissingChars
        ),
        "missing-chars"
    );
    assert_eq!(
        get_bitmap_font_parse_explanation_reason_string(
            BitmapFontParseExplanationReason::MissingCommon
        ),
        "missing-common"
    );
    assert_eq!(
        get_bitmap_font_parse_explanation_reason_string(BitmapFontParseExplanationReason::Ok),
        "ok"
    );
    assert_eq!(
        get_bitmap_font_parse_explanation_reason_string(
            BitmapFontParseExplanationReason::UnresolvedPage
        ),
        "unresolved-page"
    );
}

mod get_bitmap_font_parse_explanation_format_string {
    use super::*;

    #[test]
    fn exposes_the_format_vocabulary() {
        assert_eq!(
            get_bitmap_font_parse_explanation_format_string(BitmapFontParseExplanationFormat::Fnt),
            "fnt"
        );
    }
}

mod get_bitmap_font_parse_explanation_reason_string {
    use super::*;

    #[test]
    fn exposes_the_reason_vocabulary() {
        assert_eq!(
            get_bitmap_font_parse_explanation_reason_string(BitmapFontParseExplanationReason::Ok),
            "ok"
        );
    }
}

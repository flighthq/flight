use std::sync::Arc;

use flight_bitmapfont_formats::*;

use crate::support::atlas;

fn resolving() -> BitmapFontParseOptions {
    return BitmapFontParseOptions {
        resolve_page: Some(Arc::new(|_id, _file| Some(atlas()))),
    };
}

#[test]
fn explanation_returns_invalid_data_for_empty_and_arbitrary_text() {
    for text in ["", "arbitrary text"] {
        let explanation = explain_bitmap_font_parse(text, None);
        assert_eq!(
            explanation.detected_format,
            BitmapFontParseExplanationFormat::Unknown
        );
        assert_eq!(
            explanation.reason,
            BitmapFontParseExplanationReason::InvalidData
        );
        assert!(!explanation.success);
        assert_eq!(explanation.char_count, 0);
    }
}

#[test]
fn explanation_json_reports_missing_common_and_missing_chars() {
    let missing_common = explain_bitmap_font_parse(
        r#"{"chars":[{"id":65,"page":0}],"pages":["font.png"]}"#,
        None,
    );
    assert_eq!(
        missing_common.detected_format,
        BitmapFontParseExplanationFormat::Json
    );
    assert_eq!(
        missing_common.reason,
        BitmapFontParseExplanationReason::MissingCommon
    );
    assert_eq!(missing_common.char_count, 1);
    assert_eq!(missing_common.page_count, 1);

    let missing_chars =
        explain_bitmap_font_parse(r#"{"common":{"lineHeight":32,"base":24},"chars":[]}"#, None);
    assert_eq!(
        missing_chars.reason,
        BitmapFontParseExplanationReason::MissingChars
    );
}

#[test]
fn explanation_json_reports_unresolved_and_ok_pages() {
    let text = r#"{
      "common":{"lineHeight":32,"base":24},
      "chars":[{"id":65,"page":0}],
      "pages":["font.png"]
    }"#;
    let unresolved = explain_bitmap_font_parse(text, None);
    assert_eq!(
        unresolved.reason,
        BitmapFontParseExplanationReason::UnresolvedPage
    );
    assert_eq!(unresolved.unresolved_pages, vec![0]);
    let ok = explain_bitmap_font_parse(text, Some(&resolving()));
    assert_eq!(ok.reason, BitmapFontParseExplanationReason::Ok);
    assert!(ok.success);
    assert!(ok.unresolved_pages.is_empty());
}

#[test]
fn explanation_json_counts_chars_object_and_kernings() {
    let text = r#"{
      "common":{"lineHeight":32,"base":24},
      "chars":{"A":{"id":65},"bad":{},"B":{"id":66,"page":1}},
      "pages":["a.png","b.png"],
      "kernings":[{"first":65,"second":66,"amount":-1},{"first":65}]
    }"#;
    let explanation = explain_bitmap_font_parse(text, Some(&resolving()));
    assert_eq!(explanation.char_count, 2);
    assert_eq!(explanation.kerning_count, 1);
    assert_eq!(explanation.page_count, 2);
    assert_eq!(explanation.reason, BitmapFontParseExplanationReason::Ok);
}

#[test]
fn explanation_fnt_reports_missing_common_missing_chars_and_ok() {
    let missing_common =
        explain_bitmap_font_parse("page id=0 file=\"font.png\"\nchar id=65 page=0", None);
    assert_eq!(
        missing_common.detected_format,
        BitmapFontParseExplanationFormat::Fnt
    );
    assert_eq!(
        missing_common.reason,
        BitmapFontParseExplanationReason::MissingCommon
    );

    let missing_chars = explain_bitmap_font_parse(
        "common lineHeight=32 base=24 scaleW=256 scaleH=256 pages=1\n",
        None,
    );
    assert_eq!(
        missing_chars.reason,
        BitmapFontParseExplanationReason::MissingChars
    );

    let ok = explain_bitmap_font_parse(
        concat!(
            "common lineHeight=32 base=24 scaleW=256 scaleH=256 pages=1\n",
            "page id=0 file=\"font.png\"\n",
            "char id=65 page=0\n",
            "kerning first=65 second=66 amount=-1"
        ),
        Some(&resolving()),
    );
    assert_eq!(ok.reason, BitmapFontParseExplanationReason::Ok);
    assert_eq!(ok.char_count, 1);
    assert_eq!(ok.kerning_count, 1);
}

#[test]
fn explanation_xml_reports_ok_and_missing_common() {
    let ok = explain_bitmap_font_parse(
        concat!(
            "<font><common lineHeight=\"32\" base=\"24\"/>",
            "<pages><page id=\"0\"/></pages>",
            "<chars><char id=\"65\" page=\"0\"/></chars>",
            "<kernings><kerning first=\"65\" second=\"66\" amount=\"-1\"/></kernings>",
            "</font>"
        ),
        Some(&resolving()),
    );
    assert_eq!(ok.detected_format, BitmapFontParseExplanationFormat::Xml);
    assert_eq!(ok.reason, BitmapFontParseExplanationReason::Ok);
    assert_eq!(ok.kerning_count, 1);

    let missing = explain_bitmap_font_parse("<font><chars><char id=\"65\"/></chars></font>", None);
    assert_eq!(
        missing.reason,
        BitmapFontParseExplanationReason::MissingCommon
    );
}

#[test]
fn explanation_preserves_first_reference_order_for_multiple_unresolved_pages() {
    let text = r#"{
      "common":{"lineHeight":32,"base":24},
      "chars":[{"id":65,"page":1},{"id":66,"page":0},{"id":67,"page":1}],
      "pages":["font0.png","font1.png"]
    }"#;
    let explanation = explain_bitmap_font_parse(text, None);
    assert_eq!(explanation.unresolved_pages, vec![1, 0]);
    assert_eq!(
        explanation.reason,
        BitmapFontParseExplanationReason::UnresolvedPage
    );
}

#[test]
fn explanation_fnt_common_presence_does_not_require_numeric_fields() {
    let explanation = explain_bitmap_font_parse(
        "common lineHeight=nope base=also-nope\nchar id=65",
        Some(&resolving()),
    );
    assert_eq!(explanation.reason, BitmapFontParseExplanationReason::Ok);
}

mod explain_bitmap_font_parse {
    use super::*;

    #[test]
    fn exposes_the_parse_explanation() {
        assert_eq!(
            explain_bitmap_font_parse("", None).reason,
            BitmapFontParseExplanationReason::InvalidData
        );
    }
}

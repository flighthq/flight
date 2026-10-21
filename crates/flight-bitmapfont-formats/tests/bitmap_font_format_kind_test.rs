use flight_bitmapfont_formats::*;

fn kind(text: &str) -> Option<BitmapFontFormatKind> {
    return read_bitmap_font_format_kind(text.as_bytes());
}

#[test]
fn reads_exact_binary_version_three_header() {
    assert_eq!(
        read_bitmap_font_format_kind(&[66, 77, 70, 3]),
        Some(BITMAP_FONT_FORMAT_KIND_BM_FONT_BINARY.to_string())
    );
    assert_eq!(read_bitmap_font_format_kind(&[66, 77, 70, 2]), None);
}

#[test]
fn reads_xml_only_for_font_root_after_prolog_markup() {
    assert_eq!(
        kind("  <?xml version=\"1.0\"?><!--x--><!DOCTYPE font><font/>").as_deref(),
        Some(BITMAP_FONT_FORMAT_KIND_BM_FONT_XML)
    );
    assert_eq!(kind("<plist><font/></plist>"), None);
    assert_eq!(kind("<Font/>"), None);
}

#[test]
fn reads_json_only_with_common_and_chars_blocks() {
    assert_eq!(
        kind(r#"{"chars":[],"common":{}}"#).as_deref(),
        Some(BITMAP_FONT_FORMAT_KIND_BM_FONT_JSON)
    );
    assert_eq!(kind(r#"{"common":{}}"#), None);
    assert_eq!(kind(r#"{"chars":[]}"#), None);
    assert_eq!(kind("{bad"), None);
}

#[test]
fn reads_text_only_from_the_first_nonempty_grammar_block() {
    for tag in ["info", "common", "page", "char", "chars"] {
        assert_eq!(
            kind(&format!("\n {tag} value=1")).as_deref(),
            Some(BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT)
        );
    }
    assert_eq!(kind("ordinary prose\ncommon base=1"), None);
    assert_eq!(kind("kernings count=1"), None);
}

#[test]
fn empty_unknown_and_each_supported_input_have_at_most_one_kind() {
    assert_eq!(read_bitmap_font_format_kind(&[]), None);
    assert_eq!(kind("  \n\t"), None);
    let corpus: Vec<Vec<u8>> = vec![
        vec![66, 77, 70, 3],
        b"<font/>".to_vec(),
        br#"{"chars":[],"common":{}}"#.to_vec(),
        b"common lineHeight=1 base=1".to_vec(),
    ];
    for bytes in corpus {
        assert!(read_bitmap_font_format_kind(&bytes).is_some());
    }
}

mod read_bitmap_font_format_kind {
    use super::*;

    #[test]
    fn exposes_pure_byte_discrimination() {
        assert_eq!(read_bitmap_font_format_kind(&[]), None);
    }
}

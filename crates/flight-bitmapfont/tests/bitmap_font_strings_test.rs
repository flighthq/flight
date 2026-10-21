use super::*;

mod get_bitmap_font_encoding_string {
    use super::*;

    #[test]
    fn exposes_the_canonical_encoding_vocabulary() {
        assert_eq!(
            get_bitmap_font_encoding_string(BitmapFontEncoding::Msdf),
            "msdf"
        );
        assert_eq!(
            get_bitmap_font_encoding_string(BitmapFontEncoding::Raster),
            "raster"
        );
        assert_eq!(
            get_bitmap_font_encoding_string(BitmapFontEncoding::Sdf),
            "sdf"
        );
    }
}

mod get_bitmap_font_glyph_explanation_reason_string {
    use super::*;

    #[test]
    fn exposes_the_canonical_explanation_vocabulary() {
        assert_eq!(
            get_bitmap_font_glyph_explanation_reason_string(
                BitmapFontGlyphExplanationReason::EmptyGlyph
            ),
            "empty-glyph"
        );
        assert_eq!(
            get_bitmap_font_glyph_explanation_reason_string(
                BitmapFontGlyphExplanationReason::NoGlyph
            ),
            "no-glyph"
        );
        assert_eq!(
            get_bitmap_font_glyph_explanation_reason_string(
                BitmapFontGlyphExplanationReason::NoPages
            ),
            "no-pages"
        );
        assert_eq!(
            get_bitmap_font_glyph_explanation_reason_string(BitmapFontGlyphExplanationReason::Ok),
            "ok"
        );
    }
}

mod get_bitmap_font_guard_log_key_string {
    use super::*;

    #[test]
    fn exposes_the_exact_once_key() {
        assert_eq!(
            get_bitmap_font_guard_log_key_string(BitmapFontGuardLogKey::PageOutOfRange),
            "bitmapfont:page-out-of-range"
        );
    }
}

mod get_bitmap_font_guard_reason_string {
    use super::*;

    #[test]
    fn exposes_the_exact_guard_reason() {
        assert_eq!(
            get_bitmap_font_guard_reason_string(BitmapFontGuardReason::PageOutOfRange),
            "page-out-of-range"
        );
    }
}

mod parse_bitmap_font_encoding {
    use super::*;

    #[test]
    fn parses_known_values_and_rejects_unknown_values() {
        assert_eq!(
            parse_bitmap_font_encoding("msdf"),
            Some(BitmapFontEncoding::Msdf)
        );
        assert_eq!(
            parse_bitmap_font_encoding("raster"),
            Some(BitmapFontEncoding::Raster)
        );
        assert_eq!(
            parse_bitmap_font_encoding("sdf"),
            Some(BitmapFontEncoding::Sdf)
        );
        assert_eq!(parse_bitmap_font_encoding("SDF"), None);
    }
}

mod parse_bitmap_font_glyph_explanation_reason {
    use super::*;

    #[test]
    fn parses_every_reason_and_rejects_unknown_values() {
        for reason in [
            BitmapFontGlyphExplanationReason::EmptyGlyph,
            BitmapFontGlyphExplanationReason::NoGlyph,
            BitmapFontGlyphExplanationReason::NoPages,
            BitmapFontGlyphExplanationReason::Ok,
        ] {
            assert_eq!(
                parse_bitmap_font_glyph_explanation_reason(
                    get_bitmap_font_glyph_explanation_reason_string(reason)
                ),
                Some(reason)
            );
        }
        assert_eq!(parse_bitmap_font_glyph_explanation_reason("missing"), None);
    }
}

mod parse_bitmap_font_guard_log_key {
    use super::*;

    #[test]
    fn parses_the_once_key_and_rejects_unknown_values() {
        assert_eq!(
            parse_bitmap_font_guard_log_key("bitmapfont:page-out-of-range"),
            Some(BitmapFontGuardLogKey::PageOutOfRange)
        );
        assert_eq!(parse_bitmap_font_guard_log_key("page-out-of-range"), None);
    }
}

mod parse_bitmap_font_guard_reason {
    use super::*;

    #[test]
    fn parses_the_guard_reason_and_rejects_unknown_values() {
        assert_eq!(
            parse_bitmap_font_guard_reason("page-out-of-range"),
            Some(BitmapFontGuardReason::PageOutOfRange)
        );
        assert_eq!(parse_bitmap_font_guard_reason("other"), None);
    }
}

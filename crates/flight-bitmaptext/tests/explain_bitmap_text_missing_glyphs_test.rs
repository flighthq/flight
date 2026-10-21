use super::*;

mod explain_bitmap_text_missing_glyphs {
    use super::*;

    #[test]
    fn returns_empty_when_all_codepoints_have_glyphs() {
        let result =
            explain_bitmap_text_missing_glyphs(&create_limited_glyph_source(&[0x41, 0x42]), "AB");
        assert!(result.missing_codepoints.is_empty());
        assert_eq!(result.total_codepoints, 2);
    }

    #[test]
    fn reports_missing_codepoints_in_first_seen_order() {
        let result =
            explain_bitmap_text_missing_glyphs(&create_limited_glyph_source(&[0x41]), "ABC");
        assert_eq!(result.missing_codepoints, vec![0x42, 0x43]);
        assert_eq!(result.total_codepoints, 3);
    }

    #[test]
    fn deduplicates_repeated_missing_codepoints() {
        let result =
            explain_bitmap_text_missing_glyphs(&create_limited_glyph_source(&[0x41]), "ABBA");
        assert_eq!(result.missing_codepoints, vec![0x42]);
        assert_eq!(result.total_codepoints, 4);
    }

    #[test]
    fn skips_newlines_and_carriage_returns() {
        let result = explain_bitmap_text_missing_glyphs(
            &create_limited_glyph_source(&[0x41, 0x42]),
            "A\nB\r",
        );
        assert!(result.missing_codepoints.is_empty());
        assert_eq!(result.total_codepoints, 2);
    }

    #[test]
    fn returns_zero_totals_for_empty_text() {
        let result = explain_bitmap_text_missing_glyphs(&create_limited_glyph_source(&[]), "");
        assert!(result.missing_codepoints.is_empty());
        assert_eq!(result.total_codepoints, 0);
    }
}

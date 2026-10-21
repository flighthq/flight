use super::*;

fn explanation_data() -> BitmapFontData {
    let mut data = font_data();
    data.glyphs = vec![glyph(65, 7, 8, None), glyph(32, 0, 0, None)];
    return data;
}

mod explain_bitmap_font_glyph {
    use super::*;

    #[test]
    fn reports_ok_for_a_renderable_glyph() {
        let font = create_bitmap_font(&guard_state(), &explanation_data());
        assert_eq!(
            explain_bitmap_font_glyph(&font, 65),
            BitmapFontGlyphExplanation {
                glyph_height: 8,
                glyph_width: 7,
                page: 0,
                page_count: 1,
                reason: BitmapFontGlyphExplanationReason::Ok,
                renderable: true,
            }
        );
    }

    #[test]
    fn distinguishes_an_absent_codepoint() {
        let font = create_bitmap_font(&guard_state(), &explanation_data());
        assert_eq!(
            explain_bitmap_font_glyph(&font, 0x1f600),
            BitmapFontGlyphExplanation {
                glyph_height: 0,
                glyph_width: 0,
                page: -1,
                page_count: 1,
                reason: BitmapFontGlyphExplanationReason::NoGlyph,
                renderable: false,
            }
        );
    }

    #[test]
    fn distinguishes_a_zero_sized_glyph_the_font_carries() {
        let font = create_bitmap_font(&guard_state(), &explanation_data());
        let explanation = explain_bitmap_font_glyph(&font, 32);
        assert_eq!(
            explanation.reason,
            BitmapFontGlyphExplanationReason::EmptyGlyph
        );
        assert!(!explanation.renderable);
    }

    #[test]
    fn reports_no_pages_before_glyph_size() {
        let mut data = explanation_data();
        data.pages.clear();
        let font = create_bitmap_font(&guard_state(), &data);
        let regular = explain_bitmap_font_glyph(&font, 65);
        let empty = explain_bitmap_font_glyph(&font, 32);
        assert_eq!(regular.reason, BitmapFontGlyphExplanationReason::NoPages);
        assert_eq!(regular.page_count, 0);
        assert_eq!(empty.reason, BitmapFontGlyphExplanationReason::NoPages);
    }

    #[test]
    fn reports_no_pages_instead_of_empty_glyph_when_both_apply() {
        let mut data = explanation_data();
        data.pages.clear();
        let font = create_bitmap_font(&guard_state(), &data);
        assert_eq!(
            explain_bitmap_font_glyph(&font, 32).reason,
            BitmapFontGlyphExplanationReason::NoPages
        );
    }
}

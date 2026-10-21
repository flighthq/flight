use super::*;

fn summary_data() -> BitmapFontData {
    let mut data = font_data();
    data.glyphs = vec![glyph(65, 7, 8, None), glyph(0x1f600, 7, 8, None)];
    data.kerning = Some(vec![BitmapFontKerningData {
        amount: -2.0,
        left: 65,
        right: 0x1f600,
    }]);
    data.pages = vec![page_of_bytes(64 * 32 * 4)];
    return data;
}

mod summarize_bitmap_font {
    use super::*;

    #[test]
    fn counts_glyphs_pairs_pages_bytes_and_codepoint_range() {
        let font = create_bitmap_font(&guard_state(), &summary_data());
        assert_eq!(
            summarize_bitmap_font(&font),
            BitmapFontSummary {
                byte_size: 64 * 32 * 4,
                glyph_count: 2,
                kerning_pair_count: 1,
                max_codepoint: 0x1f600,
                min_codepoint: 65,
                page_count: 1,
            }
        );
    }

    #[test]
    fn sums_every_resolved_page() {
        let mut data = summary_data();
        data.pages = vec![page_of_bytes(2048), page_of_bytes(512)];
        let summary = summarize_bitmap_font(&create_bitmap_font(&guard_state(), &data));
        assert_eq!(summary.page_count, 2);
        assert_eq!(summary.byte_size, 2560);
    }

    #[test]
    fn treats_an_unresolved_page_as_zero_bytes() {
        let mut data = summary_data();
        data.pages = vec![page_of_bytes(2048), page()];
        let summary = summarize_bitmap_font(&create_bitmap_font(&guard_state(), &data));
        assert_eq!(summary.page_count, 2);
        assert_eq!(summary.byte_size, 2048);
    }

    #[test]
    fn reports_negative_range_sentinels_for_an_empty_font() {
        let mut data = summary_data();
        data.glyphs.clear();
        data.kerning = Some(Vec::new());
        let summary = summarize_bitmap_font(&create_bitmap_font(&guard_state(), &data));
        assert_eq!(summary.min_codepoint, -1);
        assert_eq!(summary.max_codepoint, -1);
        assert_eq!(summary.glyph_count, 0);
    }
}

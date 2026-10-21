use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_glyphatlas::GlyphSource;

use super::*;

mod create_glyph_source_from_bitmap_font {
    use super::*;

    #[test]
    fn exposes_lookups_with_the_font_entry_and_metrics_identities() {
        let font = create_bitmap_font(&guard_state(), &font_data());
        let source = create_glyph_source_from_bitmap_font(&font);
        let source = source.read().unwrap();
        let entry = (source.get_glyph_entry)(65).unwrap();
        assert!(Arc::ptr_eq(
            &entry,
            &get_bitmap_font_glyph(&font, 65).unwrap()
        ));
        assert_eq!(entry.read().unwrap().page, 0);
        assert!((source.get_glyph_entry)(0x1f600).is_none());
        assert_eq!((source.get_glyph_kerning)(65, 86), -2.0);
        assert_eq!((source.get_glyph_kerning)(86, 65), 0.0);
        assert!(Arc::ptr_eq(
            &(source.get_glyph_metrics)(),
            &get_bitmap_font_metrics(&font)
        ));
    }

    #[test]
    fn keeps_layout_version_constant_across_lookups() {
        let font = create_bitmap_font(&guard_state(), &font_data());
        let source = create_glyph_source_from_bitmap_font(&font);
        let source = source.read().unwrap();
        let before = (source.get_glyph_layout_version)();
        (source.get_glyph_entry)(65);
        (source.get_glyph_entry)(0x1f600);
        assert_eq!((source.get_glyph_layout_version)(), before);
        assert_eq!(before, 0);
    }

    #[test]
    fn returns_the_exact_page_sources_and_none_out_of_range() {
        let (page0, source0) = page_and_source(16);
        let (page1, source1) = page_and_source(32);
        let mut data = font_data();
        data.pages = vec![page0, page1];
        let font = create_bitmap_font(&guard_state(), &data);
        let glyph_source = create_glyph_source_from_bitmap_font(&font);
        let glyph_source = glyph_source.read().unwrap();
        assert!(Arc::ptr_eq(
            &(glyph_source.get_glyph_atlas_image)(None).unwrap(),
            &source0
        ));
        assert!(Arc::ptr_eq(
            &(glyph_source.get_glyph_atlas_image)(Some(0)).unwrap(),
            &source0
        ));
        assert!(Arc::ptr_eq(
            &(glyph_source.get_glyph_atlas_image)(Some(1)).unwrap(),
            &source1
        ));
        assert!((glyph_source.get_glyph_atlas_image)(Some(2)).is_none());
    }

    #[test]
    fn retains_the_font_and_installs_stable_callback_identities() {
        let font = create_bitmap_font(&guard_state(), &font_data());
        let weak_font = Arc::downgrade(&font);
        let source = create_glyph_source_from_bitmap_font(&font);
        let first_entry_callback = source.read().unwrap().get_glyph_entry.clone();
        let first_metrics_callback = source.read().unwrap().get_glyph_metrics.clone();
        assert!(Arc::ptr_eq(
            &first_entry_callback,
            &source.read().unwrap().get_glyph_entry
        ));
        assert!(Arc::ptr_eq(
            &first_metrics_callback,
            &source.read().unwrap().get_glyph_metrics
        ));
        drop(font);
        assert!(weak_font.upgrade().is_some());
        assert!((first_entry_callback)(65).is_some());
        assert_eq!((first_metrics_callback)().ascent, 8.0);
    }
}

mod initialize_glyph_source_from_bitmap_font {
    use super::*;

    #[test]
    fn initializes_a_caller_allocated_glyph_source() {
        let font = create_bitmap_font(&guard_state(), &font_data());
        let mut source: GlyphSource = allocate_entity();
        initialize_glyph_source_from_bitmap_font(&mut source, &font);
        assert!(Arc::ptr_eq(
            &(source.get_glyph_entry)(65).unwrap(),
            &get_bitmap_font_glyph(&font, 65).unwrap()
        ));
        assert_eq!((source.get_glyph_layout_version)(), 0);
    }
}

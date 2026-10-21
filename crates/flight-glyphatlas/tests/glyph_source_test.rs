use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_glyphatlas::contract::*;

use crate::support::{atlas_options, backend_producing, null_backend};

mod create_glyph_source_from_glyph_atlas {
    use super::*;

    #[test]
    fn exposes_rasterize_on_miss_entries_kerning_and_metrics() {
        let atlas = create_glyph_atlas(&atlas_options(backend_producing(8, 8), 128, 128));
        let source = create_glyph_source_from_glyph_atlas(&atlas);
        let source = source.read().unwrap();
        let first = (source.get_glyph_entry)(65).unwrap();
        let second = (source.get_glyph_entry)(65).unwrap();
        assert!(Arc::ptr_eq(&first, &second));
        assert_eq!(first.read().unwrap().page, 0);
        assert_eq!((source.get_glyph_kerning)(65, 66), 0.0);
        assert_eq!((source.get_glyph_metrics)().ascent, 12.8);
    }

    #[test]
    fn forwards_layout_changes_through_the_seam() {
        let mut options = atlas_options(backend_producing(8, 8), 32, 32);
        options.padding = Some(1);
        let atlas = create_glyph_atlas(&options);
        let source = create_glyph_source_from_glyph_atlas(&atlas);
        {
            let source = source.read().unwrap();
            for codepoint in 65..74 {
                (source.get_glyph_entry)(codepoint);
            }
            assert_eq!(
                (source.get_glyph_layout_version)(),
                get_glyph_atlas_layout_version(&atlas)
            );
            let before = (source.get_glyph_layout_version)();
            (source.get_glyph_entry)(74);
            assert!((source.get_glyph_layout_version)() > before);
        }
        assert_eq!(
            (source.read().unwrap().get_glyph_layout_version)(),
            get_glyph_atlas_layout_version(&atlas)
        );
    }

    #[test]
    fn pairs_page_zero_with_the_exact_bitmap_and_has_no_other_page() {
        let atlas = create_glyph_atlas(&atlas_options(null_backend(), 128, 128));
        let bitmap = get_glyph_atlas_bitmap(&atlas);
        let source = create_glyph_source_from_glyph_atlas(&atlas);
        let source = source.read().unwrap();
        let default_image = (source.get_glyph_atlas_image)(None).unwrap();
        let page_zero = (source.get_glyph_atlas_image)(Some(0)).unwrap();
        assert_eq!(
            Arc::as_ptr(&bitmap) as *const (),
            Arc::as_ptr(&default_image) as *const ()
        );
        assert_eq!(
            Arc::as_ptr(&bitmap) as *const (),
            Arc::as_ptr(&page_zero) as *const ()
        );
        assert!((source.get_glyph_atlas_image)(Some(1)).is_none());
    }
}

mod initialize_glyph_source_from_glyph_atlas {
    use super::*;

    #[test]
    fn initializes_a_reusable_caller_allocated_source_shell() {
        let atlas = create_glyph_atlas(&atlas_options(backend_producing(4, 4), 32, 32));
        let mut source: GlyphSource = allocate_entity();
        initialize_glyph_source_from_glyph_atlas(&mut source, &atlas);
        assert!((source.get_glyph_entry)(65).is_some());
        assert_eq!((source.get_glyph_layout_version)(), 0);
    }
}

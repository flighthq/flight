use flight_glyphatlas::contract::*;

use crate::support::{atlas_options, mock_rasterizer, null_backend};

mod clear_glyph_atlas_dirty {
    use super::*;

    #[test]
    fn resets_the_dirty_region_to_null() {
        let mock = mock_rasterizer(|_| (8, 8));
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 128, 128));
        get_glyph_atlas_entry(&atlas, 65);
        assert!(get_glyph_atlas_dirty_region(&atlas).is_some());
        clear_glyph_atlas_dirty(&atlas);
        assert!(get_glyph_atlas_dirty_region(&atlas).is_none());
    }
}

mod get_glyph_atlas_dirty_region {
    use super::*;

    #[test]
    fn covers_the_union_of_every_new_glyph_rectangle() {
        let mock = mock_rasterizer(|codepoint| {
            return if codepoint == 65 { (8, 8) } else { (10, 10) };
        });
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 128, 128));
        let first = get_glyph_atlas_entry(&atlas, 65).unwrap();
        let second = get_glyph_atlas_entry(&atlas, 66).unwrap();
        let first = first.read().unwrap();
        let second = second.read().unwrap();
        let region = get_glyph_atlas_dirty_region(&atlas).unwrap();
        assert_eq!(region.x, first.x.min(second.x) as f32);
        assert_eq!(region.y, first.y.min(second.y) as f32);
        assert_eq!(
            region.width,
            (first.x + first.width).max(second.x + second.width) as f32 - region.x
        );
        assert_eq!(
            region.height,
            (first.y + first.height).max(second.y + second.height) as f32 - region.y
        );
    }

    #[test]
    fn is_null_on_a_fresh_atlas() {
        let atlas = create_glyph_atlas(&atlas_options(null_backend(), 128, 128));
        assert!(get_glyph_atlas_dirty_region(&atlas).is_none());
    }

    #[test]
    fn starts_again_from_only_the_new_rectangle_after_clear() {
        let mock = mock_rasterizer(|codepoint| (8 + codepoint % 4, 8 + codepoint % 4));
        let atlas = create_glyph_atlas(&atlas_options(mock.backend, 128, 128));
        get_glyph_atlas_entry(&atlas, 65);
        clear_glyph_atlas_dirty(&atlas);
        let entry = get_glyph_atlas_entry(&atlas, 66).unwrap();
        let entry = entry.read().unwrap();
        let region = get_glyph_atlas_dirty_region(&atlas).unwrap();
        assert_eq!(region.x, entry.x as f32);
        assert_eq!(region.y, entry.y as f32);
        assert_eq!(region.width, entry.width as f32);
        assert_eq!(region.height, entry.height as f32);
    }
}

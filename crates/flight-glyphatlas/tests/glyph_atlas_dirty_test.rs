//! flight-compiler: target-native

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
    fn reports_texel_coordinates_above_two_to_the_24_exactly() {
        // A one-texel-tall, unpadded atlas places glyph 66 at x = 2^24 + 1, which f32 rounds to 2^24.
        let wide = (1_u32 << 24) + 1;
        let mock = mock_rasterizer(move |codepoint| (if codepoint == 65 { wide } else { 3 }, 1));
        let mut options = atlas_options(mock.backend, wide + 3, 1);
        options.padding = Some(0);
        let atlas = create_glyph_atlas(&options);
        get_glyph_atlas_entry(&atlas, 65).unwrap();
        clear_glyph_atlas_dirty(&atlas);
        get_glyph_atlas_entry(&atlas, 66).unwrap();
        let region = get_glyph_atlas_dirty_region(&atlas).unwrap();
        assert_eq!(wide as f32 as f64, f64::from(1_u32 << 24));
        assert_eq!(region.x, f64::from(wide));
        assert_eq!(region.width, 3.0);
    }

    #[test]
    fn reports_a_dirty_extent_above_two_to_the_24_exactly() {
        let wide = (1_u32 << 24) + 1;
        let mock = mock_rasterizer(move |_codepoint| (wide, 1));
        let mut options = atlas_options(mock.backend, wide, 1);
        options.padding = Some(0);
        let atlas = create_glyph_atlas(&options);
        get_glyph_atlas_entry(&atlas, 65).unwrap();
        let region = get_glyph_atlas_dirty_region(&atlas).unwrap();
        assert_eq!(region.width, f64::from(wide));
    }

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
        assert_eq!(region.x, first.x.min(second.x) as f64);
        assert_eq!(region.y, first.y.min(second.y) as f64);
        assert_eq!(
            region.width,
            (first.x + first.width).max(second.x + second.width) as f64 - region.x
        );
        assert_eq!(
            region.height,
            (first.y + first.height).max(second.y + second.height) as f64 - region.y
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
        assert_eq!(region.x, entry.x as f64);
        assert_eq!(region.y, entry.y as f64);
        assert_eq!(region.width, entry.width as f64);
        assert_eq!(region.height, entry.height as f64);
    }
}

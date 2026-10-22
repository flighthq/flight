use std::sync::Arc;

use flight_font::{GlyphMetrics, GlyphRasterizedBitmap, HostGlyphRasterizerCapability};
use flight_glyphatlas::{
    GlyphAtlasOptions, create_glyph_atlas, get_glyph_atlas_bitmap, get_glyph_atlas_entry,
};
use flight_texture::TextureSourceRef;

use super::*;

fn atlas() -> flight_entity::Ref<flight_glyphatlas::GlyphAtlas> {
    let backend = HostGlyphRasterizerCapability {
        measure_metrics: Some(Arc::new(|_| {
            return Some(GlyphMetrics {
                ascent: 12.0,
                descent: 3.0,
                line_gap: 1.0,
            });
        })),
        provider: Arc::new(()),
        rasterize: Arc::new(|_codepoint, _options| {
            return Some(GlyphRasterizedBitmap {
                advance: 8.0,
                bearing_x: 1,
                bearing_y: 2,
                height: 8,
                pixels: vec![0; 8 * 8 * 4].into_boxed_slice(),
                width: 8,
            });
        }),
    };
    return create_glyph_atlas(&GlyphAtlasOptions {
        font_family: "mock".to_string(),
        font_size: 16.0,
        font_style: None,
        font_weight: None,
        height: 64,
        max_area: None,
        max_bytes: None,
        max_glyphs: None,
        padding: None,
        rasterizer_backend: backend,
        width: 64,
    });
}

fn baked_from_two_glyphs() -> (
    flight_entity::Ref<flight_glyphatlas::GlyphAtlas>,
    flight_entity::Ref<BitmapFont>,
) {
    let atlas = atlas();
    get_glyph_atlas_entry(&atlas, 65);
    get_glyph_atlas_entry(&atlas, 66);
    let font = create_bitmap_font_from_glyph_atlas(&guard_state(), &atlas);
    return (atlas, font);
}

mod create_bitmap_font_from_glyph_atlas {
    use super::*;

    #[test]
    fn snapshots_every_cached_glyph_with_rect_and_pen_data() {
        let (atlas, font) = baked_from_two_glyphs();
        let source = get_glyph_atlas_entry(&atlas, 65).unwrap();
        let baked = get_bitmap_font_glyph(&font, 65).unwrap();
        let source = source.read().unwrap();
        let baked = baked.read().unwrap();
        assert_eq!(baked.x, source.x);
        assert_eq!(baked.y, source.y);
        assert_eq!(baked.width, source.width);
        assert_eq!(baked.advance, source.advance);
        assert_eq!(baked.bearing_y, source.bearing_y);
        assert!(get_bitmap_font_glyph(&font, 66).is_some());
    }

    #[test]
    fn copies_the_atlas_metrics_without_rederiving_them() {
        let (_, font) = baked_from_two_glyphs();
        assert_eq!(
            *get_bitmap_font_metrics(&font),
            GlyphMetrics {
                ascent: 12.0,
                descent: 3.0,
                line_gap: 1.0,
            }
        );
    }

    #[test]
    fn builds_one_page_sourced_from_the_exact_atlas_bitmap() {
        let (atlas, font) = baked_from_two_glyphs();
        let bitmap = get_glyph_atlas_bitmap(&atlas);
        let expected: TextureSourceRef = bitmap;
        let page = get_bitmap_font_page(&font, None).unwrap();
        let texture = page.read().unwrap().texture.clone().unwrap();
        let source = texture.read().unwrap().source.clone().unwrap();
        let mut pages = Vec::new();
        get_bitmap_font_pages(&mut pages, &font);
        assert_eq!(pages.len(), 1);
        assert!(Arc::ptr_eq(&source, &expected));
    }

    #[test]
    fn remains_a_snapshot_when_the_source_atlas_grows() {
        let (atlas, font) = baked_from_two_glyphs();
        get_glyph_atlas_entry(&atlas, 67);
        assert!(get_bitmap_font_glyph(&font, 67).is_none());
        assert_eq!(font.read().unwrap().glyphs.len(), 2);
    }

    #[test]
    fn bakes_an_empty_atlas_without_failing() {
        let atlas = atlas();
        let font = create_bitmap_font_from_glyph_atlas(&guard_state(), &atlas);
        assert!(get_bitmap_font_glyph(&font, 65).is_none());
        let mut pages = Vec::new();
        get_bitmap_font_pages(&mut pages, &font);
        assert_eq!(pages.len(), 1);
    }
}

use std::sync::{Arc, RwLock};

use flight_bitmap::create_bitmap;
use flight_entity::Ref;
use flight_font::GlyphMetrics;
use flight_texture::{CreateTexture2DOptions, TextureSourceRef, create_texture_2d};
use flight_textureatlas::{TextureAtlas, TextureAtlasOptions, create_texture_atlas};

use super::*;

pub(crate) fn font_data() -> BitmapFontData {
    return BitmapFontData {
        encoding: None,
        glyphs: vec![
            glyph(65, 7, 8, None),
            glyph(66, 7, 8, None),
            glyph(86, 6, 8, None),
        ],
        kerning: Some(vec![BitmapFontKerningData {
            amount: -2.0,
            left: 65,
            right: 86,
        }]),
        metrics: Arc::new(GlyphMetrics {
            ascent: 8.0,
            descent: 2.0,
            line_gap: 1.0,
        }),
        pages: vec![page()],
    };
}

pub(crate) fn glyph(
    codepoint: u32,
    width: u32,
    height: u32,
    page: Option<i32>,
) -> BitmapFontGlyphData {
    return BitmapFontGlyphData {
        advance: width as f32 + 2.0,
        bearing_x: 1,
        bearing_y: height as i32,
        codepoint,
        height,
        page,
        width,
        x: codepoint.saturating_sub(65) * 8,
        y: 0,
    };
}

pub(crate) fn guard_state() -> BitmapFontGuardStateRef {
    return create_bitmap_font_guard_state();
}

pub(crate) fn page() -> Ref<TextureAtlas> {
    return Arc::new(RwLock::new(create_texture_atlas(None)));
}

pub(crate) fn page_of_bytes(bytes: usize) -> Ref<TextureAtlas> {
    return page_and_source(bytes).0;
}

pub(crate) fn page_and_source(bytes: usize) -> (Ref<TextureAtlas>, TextureSourceRef) {
    let bitmap = Arc::new(RwLock::new(create_bitmap((bytes / 4) as u32, 1, None)));
    let source: TextureSourceRef = bitmap;
    let texture = Arc::new(RwLock::new(create_texture_2d(Some(
        &CreateTexture2DOptions {
            source: Some(source.clone()),
            ..CreateTexture2DOptions::default()
        },
    ))));
    let page = Arc::new(RwLock::new(create_texture_atlas(Some(
        TextureAtlasOptions {
            texture: Some(texture),
            ..TextureAtlasOptions::default()
        },
    ))));
    return (page, source);
}

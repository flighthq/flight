use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_glyphatlas::{
    GlyphAtlas, get_glyph_atlas_bitmap, get_glyph_atlas_codepoints, get_glyph_atlas_entry,
    get_glyph_atlas_metrics,
};
use flight_texture::{TextureSourceRef, create_texture_2d};
use flight_textureatlas::create_texture_atlas;

use crate::bitmap_font::create_bitmap_font;
use crate::types::*;

// flight-lint: allow(conform-params) D5: explicit caller-owned guard state replaces the source module guard slot
pub fn create_bitmap_font_from_glyph_atlas(
    guard_state: &BitmapFontGuardStateRef,
    atlas: &Ref<GlyphAtlas>,
) -> Ref<BitmapFont> {
    let mut glyphs = Vec::new();
    let mut codepoints = Vec::new();
    get_glyph_atlas_codepoints(&mut codepoints, atlas);
    for codepoint in codepoints {
        if let Some(entry) = get_glyph_atlas_entry(atlas, codepoint) {
            let entry = entry.read().unwrap();
            glyphs.push(BitmapFontGlyphData {
                advance: entry.advance,
                bearing_x: entry.bearing_x,
                bearing_y: entry.bearing_y,
                codepoint,
                height: entry.height,
                page: Some(0),
                width: entry.width,
                x: entry.x,
                y: entry.y,
            });
        }
    }
    let bitmap = get_glyph_atlas_bitmap(atlas);
    let source: TextureSourceRef = bitmap;
    let mut texture = create_texture_2d();
    texture.source = Some(source);
    let texture = Arc::new(RwLock::new(texture));
    let page = create_texture_atlas();
    page.write().unwrap().texture = Some(texture);
    return create_bitmap_font(
        guard_state,
        &BitmapFontData {
            encoding: None,
            glyphs,
            kerning: None,
            metrics: *get_glyph_atlas_metrics(atlas),
            pages: vec![Some(page)],
        },
    );
}

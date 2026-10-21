use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_font::GlyphMetrics;
use flight_glyphatlas::GlyphEntry;
use flight_textureatlas::TextureAtlas;

use crate::types::*;

const UNICODE_CODEPOINT_SPACE: u64 = 0x110000;

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module guard slot
pub fn create_bitmap_font(
    guard_state: &BitmapFontGuardStateRef,
    data: &BitmapFontData,
) -> Ref<BitmapFont> {
    let mut out: BitmapFont = allocate_entity();
    initialize_bitmap_font(&mut out, guard_state, data);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-extra) D5: Rust callers need an explicit owner for the source module guard slot
pub fn create_bitmap_font_guard_state() -> BitmapFontGuardStateRef {
    return Arc::new(RwLock::new(BitmapFontGuardState::default()));
}

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module guard slot
// flight-lint: allow(hashmap-iteration) data.glyphs is the authored Vec and glyph_order preserves its observable order
pub fn initialize_bitmap_font(
    out: &mut BitmapFont,
    guard_state: &BitmapFontGuardStateRef,
    data: &BitmapFontData,
) {
    let page_count = data.pages.len();
    let mut glyph_map = HashMap::new();
    let mut glyph_order = Vec::new();
    for glyph in data.glyphs.iter() {
        if !glyph_map.contains_key(&glyph.codepoint) {
            glyph_order.push(glyph.codepoint);
        }
        let declared_page = glyph.page.unwrap_or(0);
        let page =
            resolve_bitmap_font_glyph_page(guard_state, glyph.codepoint, declared_page, page_count);
        glyph_map.insert(
            glyph.codepoint,
            Arc::new(RwLock::new(GlyphEntry {
                advance: glyph.advance,
                bearing_x: glyph.bearing_x,
                bearing_y: glyph.bearing_y,
                height: glyph.height,
                page,
                width: glyph.width,
                x: glyph.x,
                y: glyph.y,
            })),
        );
    }
    let mut kerning = HashMap::new();
    if let Some(pairs) = &data.kerning {
        for pair in pairs.iter() {
            kerning.insert(
                pack_bitmap_font_kerning_key(pair.left, pair.right),
                pair.amount,
            );
        }
    }
    out.encoding = data.encoding.unwrap_or(BitmapFontEncoding::Raster);
    out.glyphs = glyph_map;
    out.glyph_order = glyph_order;
    out.kerning = kerning;
    out.metrics = Arc::new(GlyphMetrics {
        ascent: data.metrics.ascent,
        descent: data.metrics.descent,
        line_gap: data.metrics.line_gap,
    });
    out.pages = data.pages.clone();
}

pub fn get_bitmap_font_glyph(font: &Ref<BitmapFont>, codepoint: u32) -> Option<Ref<GlyphEntry>> {
    return font.read().unwrap().glyphs.get(&codepoint).cloned();
}

pub fn get_bitmap_font_kerning(font: &Ref<BitmapFont>, left: u32, right: u32) -> f32 {
    return font
        .read()
        .unwrap()
        .kerning
        .get(&pack_bitmap_font_kerning_key(left, right))
        .copied()
        .unwrap_or(0.0);
}

pub fn get_bitmap_font_metrics(font: &Ref<BitmapFont>) -> Arc<GlyphMetrics> {
    return font.read().unwrap().metrics.clone();
}

pub fn get_bitmap_font_page(
    font: &Ref<BitmapFont>,
    page: Option<i32>,
) -> Option<Ref<TextureAtlas>> {
    let page = page.unwrap_or(0);
    if page < 0 {
        return None;
    }
    return font.read().unwrap().pages.get(page as usize).cloned();
}

pub fn get_bitmap_font_pages(font: &Ref<BitmapFont>) -> Vec<Ref<TextureAtlas>> {
    return font.read().unwrap().pages.clone();
}

pub fn has_bitmap_font_glyph(font: &Ref<BitmapFont>, codepoint: u32) -> bool {
    return font.read().unwrap().glyphs.contains_key(&codepoint);
}

// flight-lint: allow(contract-vocabulary) D9: full Unicode pair keys require exact 64-bit integer arithmetic
pub fn pack_bitmap_font_kerning_key(left: u32, right: u32) -> u64 {
    return u64::from(left) * UNICODE_CODEPOINT_SPACE + u64::from(right);
}

fn resolve_bitmap_font_glyph_page(
    guard_state: &BitmapFontGuardStateRef,
    codepoint: u32,
    page: i32,
    page_count: usize,
) -> u32 {
    if page >= 0 && (page as usize) < page_count {
        return page as u32;
    }
    let guard = guard_state.read().unwrap().guard.clone();
    if let Some(guard) = guard {
        guard(BitmapFontGuardReason::PageOutOfRange, codepoint, page);
    }
    return 0;
}

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module guard slot
pub fn set_bitmap_font_guard(
    guard_state: &BitmapFontGuardStateRef,
    guard: Option<BitmapFontGuard>,
) {
    guard_state.write().unwrap().guard = guard;
}

// flight-lint: allow(conform-params) D9: portable out parameters precede inputs and return unit
// flight-lint: allow(contract-vocabulary) D9: full Unicode pair keys require exact 64-bit integer arithmetic
pub fn unpack_bitmap_font_kerning_key(out: &mut BitmapFontKerningPair, key: u64) {
    out.left = (key / UNICODE_CODEPOINT_SPACE) as u32;
    out.right = (key % UNICODE_CODEPOINT_SPACE) as u32;
}

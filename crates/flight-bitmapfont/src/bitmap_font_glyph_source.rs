use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_glyphatlas::GlyphSource;

use crate::bitmap_font::{get_bitmap_font_glyph, get_bitmap_font_kerning, get_bitmap_font_metrics};
use crate::types::*;

pub fn create_glyph_source_from_bitmap_font(font: &Ref<BitmapFont>) -> Ref<GlyphSource> {
    let mut out: GlyphSource = allocate_entity();
    initialize_glyph_source_from_bitmap_font(&mut out, font);
    return Arc::new(RwLock::new(out));
}

pub fn initialize_glyph_source_from_bitmap_font(out: &mut GlyphSource, font: &Ref<BitmapFont>) {
    let image_font = font.clone();
    out.get_glyph_atlas_image = Arc::new(move |page| {
        let page = {
            let font = image_font.read().unwrap();
            if !font
                .page_presence
                .get(page.unwrap_or(0) as usize)
                .copied()
                .unwrap_or(false)
            {
                return None;
            }
            font.pages.get(page.unwrap_or(0) as usize).cloned()
        }?;
        let texture = page.read().unwrap().texture.clone()?;
        return texture.read().unwrap().source.clone();
    });
    let entry_font = font.clone();
    out.get_glyph_entry = Arc::new(move |codepoint| {
        return get_bitmap_font_glyph(&entry_font, codepoint);
    });
    let kerning_font = font.clone();
    out.get_glyph_kerning = Arc::new(move |left, right| {
        return get_bitmap_font_kerning(&kerning_font, left, right);
    });
    out.get_glyph_layout_version = Arc::new(|| 0);
    let metrics_font = font.clone();
    out.get_glyph_metrics = Arc::new(move || {
        return get_bitmap_font_metrics(&metrics_font);
    });
}

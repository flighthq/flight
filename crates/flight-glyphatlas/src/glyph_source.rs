use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_texture::TextureSourceRef;

use crate::glyph_atlas::{get_glyph_atlas_bitmap, get_glyph_atlas_layout_version};
use crate::glyph_atlas_entry::get_glyph_atlas_entry;
use crate::glyph_atlas_metrics::{get_glyph_atlas_kerning, get_glyph_atlas_metrics};
use crate::types::*;

pub fn create_glyph_source_from_glyph_atlas(atlas: &Ref<GlyphAtlas>) -> Ref<GlyphSource> {
    let mut out = allocate_glyph_source_entity();
    initialize_glyph_source_from_glyph_atlas(&mut out, atlas);
    return Arc::new(RwLock::new(out));
}

pub fn initialize_glyph_source_from_glyph_atlas(out: &mut GlyphSource, atlas: &Ref<GlyphAtlas>) {
    let image_atlas = atlas.clone();
    out.get_glyph_atlas_image = Arc::new(move |page| {
        if page.unwrap_or(0) != 0 {
            return None;
        }
        let bitmap = get_glyph_atlas_bitmap(&image_atlas);
        let source: TextureSourceRef = bitmap;
        return Some(source);
    });
    let entry_atlas = atlas.clone();
    out.get_glyph_entry = Arc::new(move |codepoint| {
        return get_glyph_atlas_entry(&entry_atlas, codepoint);
    });
    let kerning_atlas = atlas.clone();
    out.get_glyph_kerning = Arc::new(move |left, right| {
        return get_glyph_atlas_kerning(&kerning_atlas, left, right);
    });
    let version_atlas = atlas.clone();
    out.get_glyph_layout_version = Arc::new(move || {
        return get_glyph_atlas_layout_version(&version_atlas);
    });
    let metrics_atlas = atlas.clone();
    out.get_glyph_metrics = Arc::new(move || {
        return get_glyph_atlas_metrics(&metrics_atlas);
    });
}

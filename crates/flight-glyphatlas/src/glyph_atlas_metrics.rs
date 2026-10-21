use std::sync::Arc;

use flight_entity::Ref;
use flight_font::GlyphMetrics;

use crate::types::{GlyphAtlas, get_glyph_atlas_runtime};

pub fn get_glyph_atlas_kerning(atlas: &Ref<GlyphAtlas>, left: u32, right: u32) -> f32 {
    let _ = (atlas, left, right);
    return 0.0;
}

pub fn get_glyph_atlas_metrics(atlas: &Ref<GlyphAtlas>) -> Arc<GlyphMetrics> {
    let runtime = get_glyph_atlas_runtime(atlas);
    return runtime.read().unwrap().metrics.clone();
}

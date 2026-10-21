use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_bitmap::{Bitmap, create_bitmap};
use flight_entity::Ref;
use flight_font::GlyphMetrics;

use crate::types::*;

pub fn create_glyph_atlas(options: &GlyphAtlasOptions) -> Ref<GlyphAtlas> {
    let mut out = allocate_glyph_atlas_entity();
    initialize_glyph_atlas(&mut out, options);
    return Arc::new(RwLock::new(out));
}

pub fn initialize_glyph_atlas(out: &mut GlyphAtlas, options: &GlyphAtlasOptions) {
    let padding = options.padding.unwrap_or(1);
    let rasterize_options = create_glyph_rasterize_options(options);
    let metrics = resolve_glyph_atlas_metrics(&options.rasterizer_backend, &rasterize_options);
    out.atlas_runtime = Arc::new(RwLock::new(GlyphAtlasRuntime {
        bitmap: Arc::new(RwLock::new(create_bitmap(
            options.width,
            options.height,
            None,
        ))),
        bitmaps: HashMap::new(),
        dirty: false,
        dirty_max_x: 0,
        dirty_max_y: 0,
        dirty_min_x: 0,
        dirty_min_y: 0,
        entries: HashMap::new(),
        entry_order: Vec::new(),
        layout_version: 0,
        lru: Vec::new(),
        max_area: options.max_area.unwrap_or(0),
        max_bytes: options.max_bytes.unwrap_or(0),
        max_glyphs: options.max_glyphs.unwrap_or(0),
        metrics: Arc::new(metrics),
        occupied_area: 0,
        pack_bottom: padding,
        padding,
        rasterizer_backend: options.rasterizer_backend.clone(),
        rasterize_options,
        retained_bytes: 0,
        shelves: Vec::new(),
        entry_guard: None,
        guard_repack_count: 0,
    }));
}

pub fn derive_glyph_metrics_from_font_size(font_size: f32) -> GlyphMetrics {
    return GlyphMetrics {
        ascent: font_size * 0.8,
        descent: font_size * 0.2,
        line_gap: 0.0,
    };
}

pub fn dispose_glyph_atlas(atlas: &Ref<GlyphAtlas>) {
    let runtime = get_glyph_atlas_runtime(atlas);
    let mut runtime = runtime.write().unwrap();
    runtime.entries.clear();
    runtime.entry_order.clear();
    runtime.bitmaps.clear();
    runtime.occupied_area = 0;
    runtime.retained_bytes = 0;
    runtime.lru.clear();
    runtime.shelves.clear();
    runtime.pack_bottom = runtime.padding;
    runtime.dirty = false;
    runtime.layout_version += 1;
}

pub fn get_glyph_atlas_bitmap(atlas: &Ref<GlyphAtlas>) -> Ref<Bitmap> {
    let runtime = get_glyph_atlas_runtime(atlas);
    return runtime.read().unwrap().bitmap.clone();
}

/// Returns cached codepoints in insertion order without rasterizing misses or exposing the private
/// atlas runtime.
// flight-lint: allow(conform-extra) D5: Rust keeps the source runtime private, so product packages need this ordered snapshot seam
pub fn get_glyph_atlas_codepoints(atlas: &Ref<GlyphAtlas>) -> Vec<u32> {
    let runtime = get_glyph_atlas_runtime(atlas);
    return runtime.read().unwrap().entry_order.clone();
}

pub fn get_glyph_atlas_layout_version(atlas: &Ref<GlyphAtlas>) -> u32 {
    let runtime = get_glyph_atlas_runtime(atlas);
    return runtime.read().unwrap().layout_version;
}

fn resolve_glyph_atlas_metrics(
    backend: &flight_font::HostGlyphRasterizerCapability,
    rasterize_options: &flight_font::GlyphRasterizeOptions,
) -> GlyphMetrics {
    return backend
        .measure_metrics(rasterize_options)
        .unwrap_or_else(|| derive_glyph_metrics_from_font_size(rasterize_options.font_size));
}

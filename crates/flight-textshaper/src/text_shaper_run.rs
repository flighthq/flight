use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_textformat::TextFormat;

use crate::types::*;

pub fn create_shaped_run() -> Ref<ShapedRun> {
    let mut out: ShapedRun = allocate_entity();
    initialize_shaped_run(&mut out);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_shaped_run`: an empty left-to-right run with a fresh
/// glyph buffer.
pub fn initialize_shaped_run(out: &mut ShapedRun) {
    out.advance_width = 0.0;
    out.direction = TextDirection::LeftToRight;
    out.font = None;
    out.glyph_count = 0;
    out.glyphs = Vec::new();
    out.script = String::new();
}

/// Resets every field, emptying (but keeping) the glyph buffer.
pub fn clear_shaped_run(run: &mut ShapedRun) {
    run.advance_width = 0.0;
    run.direction = TextDirection::LeftToRight;
    run.font = None;
    run.glyph_count = 0;
    run.glyphs.clear();
    run.script = String::new();
}

/// The code point that produced `glyph_id`, or -1 when unknown or the host cannot reverse-map.
pub fn get_code_point_for_glyph(
    host_text_shaper: &HostTextShaperCapability,
    glyph_id: i32,
    _format: &TextFormat,
) -> i32 {
    return match &host_text_shaper.get_code_point_for_glyph {
        Some(get) => get(glyph_id),
        None => -1,
    };
}

/// The host's font metrics for `format`, or `None` when it cannot provide them.
pub fn get_font_metrics(
    host_text_shaper: &HostTextShaperCapability,
    format: &TextFormat,
) -> Option<FontMetrics> {
    return host_text_shaper
        .get_font_metrics
        .as_ref()
        .and_then(|get| get(format));
}

/// Writes the host's font metrics into `out`; `false` (leaving `out` untouched) when it has none.
// flight-lint: allow(conform-params) D9b: out-first; the source passes (hostTextShaper, format, out)
pub fn get_font_metrics_into(
    out: &mut FontMetrics,
    host_text_shaper: &HostTextShaperCapability,
    format: &TextFormat,
) -> bool {
    let Some(metrics) = get_font_metrics(host_text_shaper, format) else {
        return false;
    };
    *out = metrics;
    return true;
}

/// The design-unit to pixel scale, `format.size` (default 12) over `units_per_em`, or -1 without
/// metrics.
pub fn get_font_unit_scale(
    host_text_shaper: &HostTextShaperCapability,
    format: &TextFormat,
) -> f32 {
    let Some(metrics) = get_font_metrics(host_text_shaper, format) else {
        return -1.0;
    };
    return format.size.unwrap_or(12.0) / metrics.units_per_em;
}

/// The glyph's ink box, or `None` for an unknown glyph or a host without per-glyph extents.
pub fn get_glyph_extents(
    host_text_shaper: &HostTextShaperCapability,
    glyph_id: i32,
    _format: &TextFormat,
) -> Option<GlyphExtents> {
    return host_text_shaper
        .get_glyph_extents
        .as_ref()
        .and_then(|get| get(glyph_id));
}

/// Writes each glyph's extents into `out[i]` (zeros for an unknown glyph, growing `out` as needed)
/// and returns how many resolved; 0 without touching `out` when the host has no per-glyph extents.
// flight-lint: allow(conform-params) D9b: out-first; the source passes (hostTextShaper, glyphIds, format, out)
pub fn get_glyph_extents_batch(
    out: &mut Vec<GlyphExtents>,
    host_text_shaper: &HostTextShaperCapability,
    glyph_ids: &[i32],
    _format: &TextFormat,
) -> usize {
    let Some(get) = &host_text_shaper.get_glyph_extents else {
        return 0;
    };
    let mut resolved = 0;
    for (i, glyph_id) in glyph_ids.iter().enumerate() {
        let extents = match get(*glyph_id) {
            Some(extents) => {
                resolved += 1;
                extents
            }
            None => GlyphExtents {
                height: 0.0,
                width: 0.0,
                x_bearing: 0.0,
                y_bearing: 0.0,
            },
        };
        if i < out.len() {
            out[i] = extents;
        } else {
            out.push(extents);
        }
    }
    return resolved;
}

/// Writes the glyph's extents into `out`; `false` (leaving `out` untouched) when unavailable.
// flight-lint: allow(conform-params) D9b: out-first; the source passes (hostTextShaper, glyphId, format, out)
pub fn get_glyph_extents_into(
    out: &mut GlyphExtents,
    host_text_shaper: &HostTextShaperCapability,
    glyph_id: i32,
    format: &TextFormat,
) -> bool {
    let Some(extents) = get_glyph_extents(host_text_shaper, glyph_id, format) else {
        return false;
    };
    *out = extents;
    return true;
}

/// The glyph id for `code_point`, or -1 when the font has none or the host cannot map.
pub fn get_glyph_index_for_code_point(
    host_text_shaper: &HostTextShaperCapability,
    code_point: i32,
    _format: &TextFormat,
) -> i32 {
    return match &host_text_shaper.get_glyph_index_for_code_point {
        Some(get) => get(code_point),
        None => -1,
    };
}

/// The glyph's PostScript name, or `""` when the host cannot name it.
pub fn get_glyph_name(
    host_text_shaper: &HostTextShaperCapability,
    glyph_id: i32,
    _format: &TextFormat,
) -> String {
    return match &host_text_shaper.get_glyph_name {
        Some(get) => get(glyph_id),
        None => String::new(),
    };
}

/// The host's shaped run (its own object, unchanged), or `None` from an advances-only host.
pub fn shape_text_run(
    host_text_shaper: &HostTextShaperCapability,
    text: &str,
    format: &TextFormat,
    options: Option<&ShapeRunOptions>,
) -> Option<Ref<ShapedRun>> {
    return host_text_shaper
        .shape_run
        .as_ref()
        .map(|shape| shape(text, format, options));
}

/// Shapes into `out`, copying the run fields and refilling `out`'s own glyph buffer; `false` (leaving
/// `out` untouched) from an advances-only host.
// flight-lint: allow(conform-params) D9b: out-first; the source passes (hostTextShaper, text, format, out, options)
pub fn shape_text_run_into(
    out: &mut ShapedRun,
    host_text_shaper: &HostTextShaperCapability,
    text: &str,
    format: &TextFormat,
    options: Option<&ShapeRunOptions>,
) -> bool {
    let Some(shape) = &host_text_shaper.shape_run else {
        return false;
    };
    let result = shape(text, format, options);
    let result = result.read().unwrap();
    out.advance_width = result.advance_width;
    out.direction = result.direction;
    out.font = result.font.clone();
    out.glyph_count = result.glyph_count;
    out.script = result.script.clone();
    out.glyphs.clear();
    out.glyphs.extend_from_slice(&result.glyphs);
    return true;
}

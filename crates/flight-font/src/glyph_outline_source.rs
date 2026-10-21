use std::sync::Arc;

use flight_geometry::create_rectangle;
use flight_path::{PathWinding, create_path, flatten_path, get_path_bounds};

use crate::types::*;

/// Replaces an existing capability with callbacks bound to one exact, shared outline source.
pub fn initialize_glyph_rasterizer_backend_from_glyph_outline_source(
    out: &mut HostGlyphRasterizerCapability,
    source: Arc<GlyphOutlineSource>,
) {
    *out = build_glyph_rasterizer_backend_from_glyph_outline_source(source);
}

/// Adapts one exact, shared outline source into the codepoint-keyed rasterizer consumed by an atlas.
pub fn allocate_glyph_rasterizer_backend_from_glyph_outline_source(
    source: Arc<GlyphOutlineSource>,
) -> HostGlyphRasterizerCapability {
    return build_glyph_rasterizer_backend_from_glyph_outline_source(source);
}

fn build_glyph_rasterizer_backend_from_glyph_outline_source(
    source: Arc<GlyphOutlineSource>,
) -> HostGlyphRasterizerCapability {
    let metrics_source = source.clone();
    let raster_source = source.clone();
    return HostGlyphRasterizerCapability {
        measure_metrics: Some(Arc::new(move |options| {
            let metrics = (metrics_source.get_glyph_outline_metrics)();
            let scale = resolve_glyph_outline_scale(metrics.units_per_em, options.font_size)?;
            return Some(GlyphMetrics {
                ascent: metrics.ascent * scale,
                descent: metrics.descent * scale,
                line_gap: metrics.line_gap * scale,
            });
        })),
        provider: source,
        rasterize: Arc::new(move |code_point, options| {
            return rasterize_glyph_outline_source(&raster_source, code_point, options);
        }),
    };
}

fn checked_ceil_i32(value: f32) -> Option<i32> {
    let value = value.ceil();
    if !value.is_finite() || value < i32::MIN as f32 || value > i32::MAX as f32 {
        return None;
    }
    return Some(value as i32);
}

fn checked_floor_i32(value: f32) -> Option<i32> {
    let value = value.floor();
    if !value.is_finite() || value < i32::MIN as f32 || value > i32::MAX as f32 {
        return None;
    }
    return Some(value as i32);
}

// flight-lint: allow(f64) flattened contours inherit the canonical f64 Path coordinate precision
fn contains_flattened_glyph_outline_point(
    contours: &[Vec<f64>],
    winding: PathWinding,
    x: f64,
    y: f64,
) -> bool {
    let mut crossings = 0_i32;
    for contour in contours {
        let point_count = contour.len() / 2;
        if point_count < 2 {
            continue;
        }
        let mut from_x = contour[(point_count - 1) * 2];
        let mut from_y = contour[(point_count - 1) * 2 + 1];
        for point_index in 0..point_count {
            let to_x = contour[point_index * 2];
            let to_y = contour[point_index * 2 + 1];
            if (from_y <= y && to_y > y) || (to_y <= y && from_y > y) {
                let crossing_x = from_x + ((y - from_y) * (to_x - from_x)) / (to_y - from_y);
                if x < crossing_x {
                    crossings += if to_y > from_y { 1 } else { -1 };
                }
            }
            from_x = to_x;
            from_y = to_y;
        }
    }
    return match winding {
        PathWinding::EvenOdd => (crossings.abs() & 1) != 0,
        PathWinding::NonZero => crossings != 0,
    };
}

// flight-lint: allow(f64) the pinned coverage scan samples canonical f64 flattened Path contours without narrowing
fn rasterize_glyph_outline_source(
    source: &GlyphOutlineSource,
    code_point: u32,
    options: &GlyphRasterizeOptions,
) -> Option<GlyphRasterizedBitmap> {
    let glyph_index = (source.get_glyph_outline_index_for_code_point)(code_point);
    if glyph_index < 0 {
        return None;
    }

    let metrics = (source.get_glyph_outline_metrics)();
    let scale = resolve_glyph_outline_scale(metrics.units_per_em, options.font_size)?;
    let mut path = create_path(None);
    if !(source.get_glyph_outline)(&mut path, glyph_index) {
        return None;
    }
    let advance = (source.get_glyph_outline_advance)(glyph_index) * scale;
    if !advance.is_finite() {
        return None;
    }

    let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
    if !get_path_bounds(&path, &mut bounds) || bounds.width == 0.0 || bounds.height == 0.0 {
        return Some(GlyphRasterizedBitmap {
            advance,
            bearing_x: 0,
            bearing_y: 0,
            height: 0,
            pixels: Vec::new().into_boxed_slice(),
            width: 0,
        });
    }

    let left = checked_floor_i32(bounds.x * scale)?.checked_sub(RASTER_GUARD)?;
    let top = checked_floor_i32(bounds.y * scale)?.checked_sub(RASTER_GUARD)?;
    let right = checked_ceil_i32((bounds.x + bounds.width) * scale)?.checked_add(RASTER_GUARD)?;
    let bottom = checked_ceil_i32((bounds.y + bounds.height) * scale)?.checked_add(RASTER_GUARD)?;
    let width = right.checked_sub(left)?;
    let height = bottom.checked_sub(top)?;
    if width <= 0 || height <= 0 {
        return None;
    }
    let width = u32::try_from(width).ok()?;
    let height = u32::try_from(height).ok()?;
    let pixel_count = usize::try_from(width)
        .ok()?
        .checked_mul(usize::try_from(height).ok()?)?;
    let byte_count = pixel_count.checked_mul(4)?;

    let contours = flatten_path(&path, Some(f64::from(0.25 / scale)));
    let mut pixels = vec![0_u8; byte_count];
    for pixel_y in 0..height {
        for pixel_x in 0..width {
            let mut covered = 0_u32;
            for sample_y in 0..RASTER_SAMPLE_AXIS {
                let y = (f64::from(top)
                    + f64::from(pixel_y)
                    + (f64::from(sample_y) + 0.5) / f64::from(RASTER_SAMPLE_AXIS))
                    / f64::from(scale);
                for sample_x in 0..RASTER_SAMPLE_AXIS {
                    let x = (f64::from(left)
                        + f64::from(pixel_x)
                        + (f64::from(sample_x) + 0.5) / f64::from(RASTER_SAMPLE_AXIS))
                        / f64::from(scale);
                    if contains_flattened_glyph_outline_point(&contours, path.winding, x, y) {
                        covered += 1;
                    }
                }
            }
            if covered == 0 {
                continue;
            }
            let offset = (usize::try_from(pixel_y).ok()? * usize::try_from(width).ok()?
                + usize::try_from(pixel_x).ok()?)
                * 4;
            pixels[offset] = 0xff;
            pixels[offset + 1] = 0xff;
            pixels[offset + 2] = 0xff;
            pixels[offset + 3] =
                ((covered * 0xff) as f32 / RASTER_SAMPLE_COUNT as f32).round() as u8;
        }
    }
    return Some(GlyphRasterizedBitmap {
        advance,
        bearing_x: left,
        bearing_y: top.checked_neg()?,
        height,
        pixels: pixels.into_boxed_slice(),
        width,
    });
}

fn resolve_glyph_outline_scale(units_per_em: f32, font_size: f32) -> Option<f32> {
    if !(units_per_em > 0.0)
        || !(font_size > 0.0)
        || !units_per_em.is_finite()
        || !font_size.is_finite()
    {
        return None;
    }
    return Some(font_size / units_per_em);
}

const RASTER_GUARD: i32 = 1;
const RASTER_SAMPLE_AXIS: u32 = 4;
const RASTER_SAMPLE_COUNT: u32 = RASTER_SAMPLE_AXIS * RASTER_SAMPLE_AXIS;

use crate::bitmap_blur::{blur_bitmap_pixels_horizontal, blur_bitmap_pixels_vertical};
use crate::types::*;

fn apply_blur_passes(
    out: &mut [u8],
    scratch: &mut [u8],
    width: usize,
    height: usize,
    radius_x: Option<f32>,
    radius_y: Option<f32>,
    passes: Option<i32>,
) {
    let rx = (radius_x.unwrap_or(2.0).round() as i32).max(0);
    let ry = (radius_y.unwrap_or(2.0).round() as i32).max(0);
    let p = passes.unwrap_or(1).max(1) as usize;
    let len = width * height * 4;
    let mut result_in_out = true;

    for _pass in 0..p {
        if rx > 0 {
            if result_in_out {
                blur_bitmap_pixels_horizontal(scratch, out, width as i32, height as i32, rx);
                result_in_out = false;
            } else {
                blur_bitmap_pixels_horizontal(out, scratch, width as i32, height as i32, rx);
                result_in_out = true;
            }
        }
        if ry > 0 {
            if result_in_out {
                blur_bitmap_pixels_vertical(scratch, out, width as i32, height as i32, ry);
                result_in_out = false;
            } else {
                blur_bitmap_pixels_vertical(out, scratch, width as i32, height as i32, ry);
                result_in_out = true;
            }
        }
    }
    if !result_in_out {
        out[..len].copy_from_slice(&scratch[..len]);
    }
}

fn apply_inner_effect(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &BitmapRegion,
    color: u32,
    intensity: f32,
    radius_x: Option<f32>,
    radius_y: Option<f32>,
    passes: Option<i32>,
    offset_x: i32,
    offset_y: i32,
) {
    let w = source.width as usize;
    let h = source.height as usize;

    // Step 1: inverted alpha shifted by offset
    for py in 0..h {
        for px in 0..w {
            let di = (py * w + px) * 4;
            out[di] = 0;
            out[di + 1] = 0;
            out[di + 2] = 0;
            out[di + 3] =
                255 - read_source_alpha(source, px as i32 - offset_x, py as i32 - offset_y);
        }
    }

    // Step 2: blur
    apply_blur_passes(out, scratch, w, h, radius_x, radius_y, passes);

    // Step 3: tint and clip
    let cr = ((color >> 24) & 0xff) as u8;
    let cg = ((color >> 16) & 0xff) as u8;
    let cb = ((color >> 8) & 0xff) as u8;
    let ca = (color & 0xff) as f32 / 255.0;
    let scale = intensity.max(0.0) * ca;
    for py in 0..h {
        for px in 0..w {
            let di = (py * w + px) * 4;
            let blurred = out[di + 3];
            let source_alpha = read_source_alpha(source, px as i32, py as i32);
            out[di] = cr;
            out[di + 1] = cg;
            out[di + 2] = cb;
            out[di + 3] = ((blurred as f32 * source_alpha as f32 * scale) / 255.0)
                .round()
                .min(255.0) as u8;
        }
    }
}

/// Produces the blurred shadow mask for a drop shadow effect.
// flight-lint: allow(conform-array) pixel ruling (agents/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn drop_shadow_bitmap(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &BitmapRegion,
    options: &BitmapDropShadowOptions,
) {
    tint_bitmap_alpha_mask(
        out,
        source,
        options.color.unwrap_or(0x000000ff),
        options.intensity.unwrap_or(1.0),
    );
    apply_blur_passes(
        out,
        scratch,
        source.width as usize,
        source.height as usize,
        options.radius_x,
        options.radius_y,
        options.passes,
    );
}

/// Produces the blurred glow mask.
// flight-lint: allow(conform-array) pixel ruling (agents/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn glow_bitmap(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &BitmapRegion,
    options: &BitmapGlowOptions,
) {
    tint_bitmap_alpha_mask(
        out,
        source,
        options.color.unwrap_or(0xff0000ff),
        options.intensity.unwrap_or(1.0),
    );
    apply_blur_passes(
        out,
        scratch,
        source.width as usize,
        source.height as usize,
        options.radius_x,
        options.radius_y,
        options.passes,
    );
}

/// Produces the inner glow mask.
// flight-lint: allow(conform-array) pixel ruling (agents/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn inner_glow_bitmap(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &BitmapRegion,
    options: &BitmapInnerGlowOptions,
) {
    apply_inner_effect(
        out,
        scratch,
        source,
        options.color.unwrap_or(0xff0000ff),
        options.intensity.unwrap_or(1.0),
        options.radius_x,
        options.radius_y,
        options.passes,
        0,
        0,
    );
}

/// Produces the inner shadow mask.
// flight-lint: allow(conform-array) pixel ruling (agents/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn inner_shadow_bitmap(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &BitmapRegion,
    options: &BitmapInnerShadowOptions,
) {
    apply_inner_effect(
        out,
        scratch,
        source,
        options.color.unwrap_or(0x000000ff),
        options.intensity.unwrap_or(1.0),
        options.radius_x,
        options.radius_y,
        options.passes,
        options.offset_x.unwrap_or(0),
        options.offset_y.unwrap_or(0),
    );
}

fn read_source_alpha(source: &BitmapRegion, px: i32, py: i32) -> u8 {
    let sx = source.x + px;
    let sy = source.y + py;
    if sx < 0 || sx >= source.bitmap.width as i32 || sy < 0 || sy >= source.bitmap.height as i32 {
        return 0;
    }
    source.bitmap.data[(sy as usize * source.bitmap.width as usize + sx as usize) * 4 + 3]
}

fn tint_bitmap_alpha_mask(out: &mut [u8], source: &BitmapRegion, color: u32, intensity: f32) {
    let cr = ((color >> 24) & 0xff) as u8;
    let cg = ((color >> 16) & 0xff) as u8;
    let cb = ((color >> 8) & 0xff) as u8;
    let ca = (color & 0xff) as f32 / 255.0;
    let alpha_scale = intensity.max(0.0) * ca;
    for py in 0..source.height as usize {
        let source_y = source.y + py as i32;
        if source_y < 0 || source_y >= source.bitmap.height as i32 {
            continue;
        }
        for px in 0..source.width as usize {
            let source_x = source.x + px as i32;
            if source_x < 0 || source_x >= source.bitmap.width as i32 {
                continue;
            }
            let si = (source_y as usize * source.bitmap.width as usize + source_x as usize) * 4;
            let di = (py * source.width as usize + px) * 4;
            out[di] = cr;
            out[di + 1] = cg;
            out[di + 2] = cb;
            out[di + 3] = (source.bitmap.data[si + 3] as f32 * alpha_scale)
                .round()
                .min(255.0) as u8;
        }
    }
}

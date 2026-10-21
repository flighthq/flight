use flight_entity::Uint8Array;
use crate::bitmap_blur::{blur_bitmap_pixels_horizontal, blur_bitmap_pixels_vertical};
use crate::types::*;

/// Fills `out` (256 RGBA entries, 1024 bytes) with a gradient lookup table built
/// from parallel `colors` (packed 0xRRGGBB), `alphas` (0..1), and `ratios`
/// (0..255, ascending) arrays.
pub fn build_bitmap_gradient_ramp(
    out: &mut [u8],
    colors: &[u32],
    alphas: &[f32],
    ratios: &[f32],
) {
    let n = ratios.len();
    if n == 0 {
        for b in out.iter_mut().take(1024) {
            *b = 0;
        }
        return;
    }
    for i in 0..256 {
        let fi = i as f32;
        let (r, g, b, a);
        if fi <= ratios[0] {
            r = ((colors[0] >> 16) & 0xff) as f32;
            g = ((colors[0] >> 8) & 0xff) as f32;
            b = (colors[0] & 0xff) as f32;
            a = alphas[0];
        } else if fi >= ratios[n - 1] {
            r = ((colors[n - 1] >> 16) & 0xff) as f32;
            g = ((colors[n - 1] >> 8) & 0xff) as f32;
            b = (colors[n - 1] & 0xff) as f32;
            a = alphas[n - 1];
        } else {
            let mut j = 0usize;
            while j < n - 1 && ratios[j + 1] < fi {
                j += 1;
            }
            let span = ratios[j + 1] - ratios[j];
            let t = if span > 0.0 { (fi - ratios[j]) / span } else { 0.0 };
            r = lerp(((colors[j] >> 16) & 0xff) as f32, ((colors[j + 1] >> 16) & 0xff) as f32, t);
            g = lerp(((colors[j] >> 8) & 0xff) as f32, ((colors[j + 1] >> 8) & 0xff) as f32, t);
            b = lerp((colors[j] & 0xff) as f32, (colors[j + 1] & 0xff) as f32, t);
            a = lerp(alphas[j], alphas[j + 1], t);
        }
        let oi = i * 4;
        out[oi] = r.round() as u8;
        out[oi + 1] = g.round() as u8;
        out[oi + 2] = b.round() as u8;
        out[oi + 3] = (a * 255.0).round().max(0.0).min(255.0) as u8;
    }
}

/// Produces a gradient bevel mask in `out`.
// flight-lint: allow(conform-array) pixel ruling (agents/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn gradient_bevel_bitmap(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &BitmapRegion,
    ramp: &Uint8Array,
    options: &BitmapGradientBevelOptions,
) {
    let w = source.width as usize;
    let h = source.height as usize;
    let angle = options.angle.unwrap_or(std::f32::consts::FRAC_PI_4);
    let distance = options.distance.unwrap_or(4.0);
    let offset_x = (angle.cos() * distance).round() as i32;
    let offset_y = (angle.sin() * distance).round() as i32;
    let bevel_type = options.type_.unwrap_or(BevelType::Inner);
    let intensity = options.intensity.unwrap_or(1.0);

    // Write alpha field into scratch
    for py in 0..h {
        for px in 0..w {
            let di = (py * w + px) * 4;
            scratch[di] = 0;
            scratch[di + 1] = 0;
            scratch[di + 2] = 0;
            scratch[di + 3] = read_source_alpha(source, px as i32, py as i32);
        }
    }

    blur_alpha_field(scratch, out, w, h, options.radius_x, options.radius_y, options.passes);

    for py in 0..h {
        for px in 0..w {
            let di = (py * w + px) * 4;
            let lit = sample_field(scratch, w, h, px as i32 - offset_x, py as i32 - offset_y);
            let shade = sample_field(scratch, w, h, px as i32 + offset_x, py as i32 + offset_y);
            let gradient = lit - shade;
            let idx = ((gradient * 0.5 + 0.5) * 255.0).round().max(0.0).min(255.0) as usize;
            let ri = idx * 4;
            let clip = match bevel_type {
                BevelType::Inner => read_source_alpha(source, px as i32, py as i32) as f32 / 255.0,
                BevelType::Outer => 1.0 - read_source_alpha(source, px as i32, py as i32) as f32 / 255.0,
                BevelType::Both => 1.0,
            };
            out[di] = ramp[ri];
            out[di + 1] = ramp[ri + 1];
            out[di + 2] = ramp[ri + 2];
            out[di + 3] = (ramp[ri + 3] as f32 * intensity * clip).round().min(255.0) as u8;
        }
    }
}

/// Produces a gradient glow mask in `out`.
// flight-lint: allow(conform-array) pixel ruling (agents/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn gradient_glow_bitmap(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &BitmapRegion,
    ramp: &Uint8Array,
    options: &BitmapGradientGlowOptions,
) {
    let w = source.width as usize;
    let h = source.height as usize;
    let intensity = options.intensity.unwrap_or(1.0);

    for py in 0..h {
        for px in 0..w {
            let di = (py * w + px) * 4;
            out[di] = 0;
            out[di + 1] = 0;
            out[di + 2] = 0;
            out[di + 3] = read_source_alpha(source, px as i32, py as i32);
        }
    }

    blur_alpha_field(out, scratch, w, h, options.radius_x, options.radius_y, options.passes);

    for py in 0..h {
        for px in 0..w {
            let di = (py * w + px) * 4;
            let ri = out[di + 3] as usize * 4;
            out[di] = ramp[ri];
            out[di + 1] = ramp[ri + 1];
            out[di + 2] = ramp[ri + 2];
            out[di + 3] = (ramp[ri + 3] as f32 * intensity).round().min(255.0) as u8;
        }
    }
}

fn blur_alpha_field(
    field: &mut [u8],
    scratch: &mut [u8],
    w: usize,
    h: usize,
    radius_x: Option<f32>,
    radius_y: Option<f32>,
    passes: Option<i32>,
) {
    let rx = (radius_x.unwrap_or(2.0).round() as i32).max(0);
    let ry = (radius_y.unwrap_or(2.0).round() as i32).max(0);
    let p = (passes.unwrap_or(1).max(1)) as usize;
    let len = w * h * 4;
    // We need to ping-pong between field and scratch.
    // Track whether the current result is in field or scratch.
    let mut result_in_field = true;
    for _pass in 0..p {
        if rx > 0 {
            if result_in_field {
                blur_bitmap_pixels_horizontal(scratch, field, w as i32, h as i32, rx);
                result_in_field = false;
            } else {
                blur_bitmap_pixels_horizontal(field, scratch, w as i32, h as i32, rx);
                result_in_field = true;
            }
        }
        if ry > 0 {
            if result_in_field {
                blur_bitmap_pixels_vertical(scratch, field, w as i32, h as i32, ry);
                result_in_field = false;
            } else {
                blur_bitmap_pixels_vertical(field, scratch, w as i32, h as i32, ry);
                result_in_field = true;
            }
        }
    }
    if !result_in_field {
        field[..len].copy_from_slice(&scratch[..len]);
    }
}

fn lerp(from: f32, to: f32, t: f32) -> f32 {
    from + (to - from) * t
}

fn read_source_alpha(source: &BitmapRegion, px: i32, py: i32) -> u8 {
    let sx = source.x + px;
    let sy = source.y + py;
    if sx < 0 || sx >= source.bitmap.width as i32 || sy < 0 || sy >= source.bitmap.height as i32 {
        return 0;
    }
    source.bitmap.data[(sy as usize * source.bitmap.width as usize + sx as usize) * 4 + 3]
}

fn sample_field(field: &[u8], w: usize, h: usize, x: i32, y: i32) -> f32 {
    if x < 0 || x >= w as i32 || y < 0 || y >= h as i32 {
        return 0.0;
    }
    field[(y as usize * w + x as usize) * 4 + 3] as f32 / 255.0
}

use flight_entity::Uint8Array;
use crate::bitmap_blur::{blur_bitmap_pixels_horizontal, blur_bitmap_pixels_vertical};
use crate::types::*;

/// Produces a bevel mask in out from the source alpha.
pub fn bevel_bitmap(
    out: &mut Uint8Array,
    scratch: &mut Uint8Array,
    source: &BitmapRegion,
    options: &BitmapBevelOptions,
) {
    let w = source.width as usize;
    let h = source.height as usize;
    let angle = options.angle.unwrap_or(std::f32::consts::FRAC_PI_4);
    let distance = options.distance.unwrap_or(4.0);
    let offset_x = (angle.cos() * distance).round() as i32;
    let offset_y = (angle.sin() * distance).round() as i32;
    let type_ = options.type_.unwrap_or(BevelType::Inner);
    let intensity = options.intensity.unwrap_or(1.0);
    let highlight_color = options.highlight_color.unwrap_or(0xffffffff);
    let shadow_color = options.shadow_color.unwrap_or(0x000000ff);

    // Build blurred alpha field in scratch, using out as ping-pong.
    for py in 0..h {
        for px in 0..w {
            let di = (py * w + px) * 4;
            scratch[di] = 0;
            scratch[di + 1] = 0;
            scratch[di + 2] = 0;
            scratch[di + 3] = read_source_alpha(source, px as i32, py as i32);
        }
    }
    blur_field(scratch, out, w as i32, h as i32, options.radius_x, options.radius_y, options.passes);

    for py in 0..h {
        for px in 0..w {
            let di = (py * w + px) * 4;
            let lit = sample_field(scratch, w, h, px as i32 - offset_x, py as i32 - offset_y);
            let shade = sample_field(scratch, w, h, px as i32 + offset_x, py as i32 + offset_y);
            let gradient = lit - shade;

            let color = if gradient >= 0.0 { highlight_color } else { shadow_color };
            let color_alpha = (color & 0xff) as f32 / 255.0;
            let clip = match type_ {
                BevelType::Inner => read_source_alpha(source, px as i32, py as i32) as f32 / 255.0,
                BevelType::Outer => 1.0 - read_source_alpha(source, px as i32, py as i32) as f32 / 255.0,
                BevelType::Both => 1.0,
            };
            let edge_intensity = (gradient.abs() * intensity).min(1.0);

            out[di] = ((color >> 24) & 0xff) as u8;
            out[di + 1] = ((color >> 16) & 0xff) as u8;
            out[di + 2] = ((color >> 8) & 0xff) as u8;
            out[di + 3] = (edge_intensity * color_alpha * clip * 255.0).round() as u8;
        }
    }
}

fn blur_field(
    field: &mut Uint8Array,
    scratch: &mut Uint8Array,
    w: i32,
    h: i32,
    radius_x: Option<f32>,
    radius_y: Option<f32>,
    passes: Option<i32>,
) {
    let rx = (radius_x.unwrap_or(2.0).round() as i32).max(0);
    let ry = (radius_y.unwrap_or(2.0).round() as i32).max(0);
    let p = (passes.unwrap_or(1).max(1)) as usize;
    let mut swapped = false;
    for _ in 0..p {
        if rx > 0 {
            if swapped {
                blur_bitmap_pixels_horizontal(field, scratch, w, h, rx);
            } else {
                blur_bitmap_pixels_horizontal(scratch, field, w, h, rx);
            }
            swapped = !swapped;
        }
        if ry > 0 {
            if swapped {
                blur_bitmap_pixels_vertical(field, scratch, w, h, ry);
            } else {
                blur_bitmap_pixels_vertical(scratch, field, w, h, ry);
            }
            swapped = !swapped;
        }
    }
    if swapped {
        let len = (w as usize) * (h as usize) * 4;
        field[..len].copy_from_slice(&scratch[..len]);
    }
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

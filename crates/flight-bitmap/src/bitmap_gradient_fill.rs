use crate::bitmap::invalidate_bitmap;
use crate::types::*;

/// Fills the `dest` region with a linear gradient defined by two points.
pub fn fill_bitmap_linear_gradient(
    dest: &mut BitmapRegion,
    ramp: &[u8],
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    spread: GradientSpread,
) {
    let dw = dest.width;
    let dh = dest.height;
    let bitmap_width = dest.bitmap.width as i32;
    let bitmap_height = dest.bitmap.height as i32;
    let axis_x = x1 - x0;
    let axis_y = y1 - y0;
    let len_sq = axis_x * axis_x + axis_y * axis_y;
    let inv_len = if len_sq > 0.0 { 1.0 / len_sq } else { 0.0 };
    for py in 0..dh {
        let y = dest.y + py;
        if y < 0 || y >= bitmap_height { continue; }
        for px in 0..dw {
            let x = dest.x + px;
            if x < 0 || x >= bitmap_width { continue; }
            let t = ((px as f32 - x0) * axis_x + (py as f32 - y0) * axis_y) * inv_len;
            let idx = spread_index(t, spread);
            let ri = idx * 4;
            let i = (y as usize * bitmap_width as usize + x as usize) * 4;
            dest.bitmap.data[i] = ramp[ri];
            dest.bitmap.data[i + 1] = ramp[ri + 1];
            dest.bitmap.data[i + 2] = ramp[ri + 2];
            dest.bitmap.data[i + 3] = ramp[ri + 3];
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

/// Fills the `dest` region with a radial gradient.
pub fn fill_bitmap_radial_gradient(
    dest: &mut BitmapRegion,
    ramp: &[u8],
    cx: f32,
    cy: f32,
    radius: f32,
    focal_x: f32,
    focal_y: f32,
    spread: GradientSpread,
) {
    let dw = dest.width;
    let dh = dest.height;
    let bitmap_width = dest.bitmap.width as i32;
    let bitmap_height = dest.bitmap.height as i32;
    let inv_radius = if radius > 0.0 { 1.0 / radius } else { 0.0 };
    let fdx = focal_x - cx;
    let fdy = focal_y - cy;
    for py in 0..dh {
        let y = dest.y + py;
        if y < 0 || y >= bitmap_height { continue; }
        for px in 0..dw {
            let x = dest.x + px;
            if x < 0 || x >= bitmap_width { continue; }
            let dx = px as f32 - focal_x;
            let dy = py as f32 - focal_y;
            let t = (dx * dx + dy * dy).sqrt() * inv_radius
                - (dx * fdx + dy * fdy) * inv_radius * inv_radius;
            let idx = spread_index(t, spread);
            let ri = idx * 4;
            let i = (y as usize * bitmap_width as usize + x as usize) * 4;
            dest.bitmap.data[i] = ramp[ri];
            dest.bitmap.data[i + 1] = ramp[ri + 1];
            dest.bitmap.data[i + 2] = ramp[ri + 2];
            dest.bitmap.data[i + 3] = ramp[ri + 3];
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

fn spread_index(t: f32, spread: GradientSpread) -> usize {
    let s = match spread {
        GradientSpread::Repeat => {
            t - t.floor()
        }
        GradientSpread::Reflect => {
            let wrapped = t - (t / 2.0).floor() * 2.0;
            if wrapped <= 1.0 { wrapped } else { 2.0 - wrapped }
        }
        GradientSpread::Pad => {
            t.max(0.0).min(1.0)
        }
    };
    (s * 255.0).round().min(255.0) as usize
}

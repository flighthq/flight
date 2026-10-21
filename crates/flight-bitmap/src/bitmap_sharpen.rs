use flight_entity::Uint8Array;
use crate::bitmap_blur::box_blur_bitmap;
use crate::bitmap_pixel::to_clamped_u8;
use crate::types::*;

/// Sharpens `source` into `out` using an unsharp mask.
// flight-lint: allow(conform-array) pixel ruling (agents/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn sharpen_bitmap(
    out: &mut Uint8Array,
    scratch: &mut Uint8Array,
    source: &BitmapRegion,
    options: &BitmapSharpenOptions,
) {
    let amount = options.amount.unwrap_or(1.0);
    let blur_opts = BitmapBoxBlurOptions {
        radius_x: Some(options.radius_x.unwrap_or(2)),
        radius_y: Some(options.radius_y.unwrap_or(2)),
        passes: Some(options.passes.unwrap_or(1)),
    };
    box_blur_bitmap(out, scratch, source, &blur_opts);

    let w = source.width as usize;
    let h = source.height as usize;
    let bitmap_width = source.bitmap.width as usize;
    let bitmap_height = source.bitmap.height as usize;
    let data = &source.bitmap.data;
    for py in 0..h {
        let sy = (source.y + py as i32) as usize;
        if sy >= bitmap_height { continue; }
        for px in 0..w {
            let sx = (source.x + px as i32) as usize;
            if sx >= bitmap_width { continue; }
            let si = (sy * bitmap_width + sx) * 4;
            let di = (py * w + px) * 4;
            let r = data[si] as f32;
            let g = data[si + 1] as f32;
            let b = data[si + 2] as f32;
            out[di] = to_clamped_u8(r + amount * (r - out[di] as f32));
            out[di + 1] = to_clamped_u8(g + amount * (g - out[di + 1] as f32));
            out[di + 2] = to_clamped_u8(b + amount * (b - out[di + 2] as f32));
            out[di + 3] = data[si + 3];
        }
    }
}

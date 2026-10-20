use crate::bitmap::invalidate_bitmap;
use crate::types::*;

/// Copies only the alpha channel from source into dest. RGB channels of dest unchanged.
pub fn copy_bitmap_alpha(dest: &mut BitmapRegion, source: &BitmapRegion) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    let sd = source.bitmap.data.clone();
    for py in 0..h {
        let sy = source.y + py;
        let dy = dest.y + py;
        if sy < 0 || sy >= source.bitmap.height as i32 || dy < 0 || dy >= dest.bitmap.height as i32 {
            continue;
        }
        for px in 0..w {
            let sx = source.x + px;
            let dx = dest.x + px;
            if sx < 0 || sx >= source.bitmap.width as i32 || dx < 0 || dx >= dest.bitmap.width as i32 {
                continue;
            }
            let si = (sy as usize * source.bitmap.width as usize + sx as usize) * 4;
            let di = (dy as usize * dest.bitmap.width as usize + dx as usize) * 4;
            let alpha = sd[si + 3];
            dest.bitmap.data[di + 3] = alpha;
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

/// Scales every alpha value in the out region by factor (0..1).
pub fn multiply_bitmap_alpha(out: &mut BitmapRegion, factor: f32) {
    let f = factor.max(0.0).min(1.0);
    let bw = out.bitmap.width as i32;
    for py in 0..out.height {
        let y = out.y + py;
        if y < 0 || y >= out.bitmap.height as i32 {
            continue;
        }
        for px in 0..out.width {
            let x = out.x + px;
            if x < 0 || x >= bw {
                continue;
            }
            let i = (y as usize * bw as usize + x as usize) * 4 + 3;
            out.bitmap.data[i] = (out.bitmap.data[i] as f32 * f).round() as u8;
        }
    }
    invalidate_bitmap(&mut out.bitmap);
}

/// Sets a constant alpha value (0..255) for every pixel in the out region.
pub fn set_bitmap_alpha(out: &mut BitmapRegion, alpha: f32) {
    let a = alpha.round().max(0.0).min(255.0) as u8;
    let bw = out.bitmap.width as i32;
    for py in 0..out.height {
        let y = out.y + py;
        if y < 0 || y >= out.bitmap.height as i32 {
            continue;
        }
        for px in 0..out.width {
            let x = out.x + px;
            if x < 0 || x >= bw {
                continue;
            }
            let i = (y as usize * bw as usize + x as usize) * 4 + 3;
            out.bitmap.data[i] = a;
        }
    }
    invalidate_bitmap(&mut out.bitmap);
}

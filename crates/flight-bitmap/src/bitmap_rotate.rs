use crate::bitmap::invalidate_bitmap;
use crate::bitmap_affine::transform_bitmap;
use crate::types::*;

/// Rotates the `source` region by `angle` radians into the `dest` region.
pub fn rotate_bitmap(
    dest: &mut BitmapRegion,
    source: &BitmapRegion,
    angle: f64,
    pivot_x: f64,
    pivot_y: f64,
    edge_mode: BitmapEdgeMode,
    sample_mode: BitmapResizeMode,
) {
    let cos_a = (-angle).cos();
    let sin_a = (-angle).sin();
    let dest_pivot_x = (dest.width - 1) as f64 / 2.0;
    let dest_pivot_y = (dest.height - 1) as f64 / 2.0;
    let e = pivot_x - cos_a * dest_pivot_x + sin_a * dest_pivot_y;
    let f = pivot_y - sin_a * dest_pivot_x - cos_a * dest_pivot_y;
    transform_bitmap(dest, source, &[cos_a, sin_a, -sin_a, cos_a, e, f], edge_mode, sample_mode);
}

/// Rotates 180 degrees.
pub fn rotate_bitmap_180(dest: &mut BitmapRegion, source: &BitmapRegion) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    if is_same_region(dest, source) {
        let stride = dest.bitmap.width as usize;
        let total = (w * h) as usize;
        let half = total >> 1;
        for k in 0..half {
            let ax = dest.x + (k as i32 % w);
            let ay = dest.y + (k as i32 / w);
            let bx = dest.x + (w - 1 - k as i32 % w);
            let by = dest.y + (h - 1 - k as i32 / w);
            if !in_bounds(ax, ay, stride as i32, dest.bitmap.height as i32)
                || !in_bounds(bx, by, stride as i32, dest.bitmap.height as i32)
            { continue; }
            swap_pixels(&mut dest.bitmap.data, (ay as usize * stride + ax as usize) * 4, (by as usize * stride + bx as usize) * 4);
        }
        return;
    }
    let sd = source.bitmap.data.clone();
    let s_stride = source.bitmap.width as usize;
    let d_stride = dest.bitmap.width as usize;
    for py in 0..h {
        let sy = source.y + (h - 1 - py);
        let dy = dest.y + py;
        if !in_bounds(0, sy, s_stride as i32, source.bitmap.height as i32)
            || !in_bounds(0, dy, d_stride as i32, dest.bitmap.height as i32)
        { continue; }
        for px in 0..w {
            let sx = source.x + (w - 1 - px);
            let dx = dest.x + px;
            if sx < 0 || sx >= s_stride as i32 || dx < 0 || dx >= d_stride as i32 { continue; }
            let si = (sy as usize * s_stride + sx as usize) * 4;
            let di = (dy as usize * d_stride + dx as usize) * 4;
            copy_pixel(&mut dest.bitmap.data, di, &sd, si);
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

/// Rotates 90 degrees clockwise.
pub fn rotate_bitmap_clockwise(dest: &mut BitmapRegion, source: &BitmapRegion) {
    let sw = source.width;
    let sh = source.height;
    let sd = source.bitmap.data.clone();
    let s_stride = source.bitmap.width as usize;
    let d_stride = dest.bitmap.width as usize;
    for py in 0..sh {
        let sy = source.y + py;
        if sy < 0 || sy >= source.bitmap.height as i32 { continue; }
        for px in 0..sw {
            let sx = source.x + px;
            if sx < 0 || sx >= s_stride as i32 { continue; }
            let dx = dest.x + (sh - 1 - py);
            let dy = dest.y + px;
            if dx < 0 || dx >= d_stride as i32 || dy < 0 || dy >= dest.bitmap.height as i32 { continue; }
            let si = (sy as usize * s_stride + sx as usize) * 4;
            let di = (dy as usize * d_stride + dx as usize) * 4;
            copy_pixel(&mut dest.bitmap.data, di, &sd, si);
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

/// Rotates 90 degrees counter-clockwise.
pub fn rotate_bitmap_counter_clockwise(dest: &mut BitmapRegion, source: &BitmapRegion) {
    let sw = source.width;
    let sh = source.height;
    let sd = source.bitmap.data.clone();
    let s_stride = source.bitmap.width as usize;
    let d_stride = dest.bitmap.width as usize;
    for py in 0..sh {
        let sy = source.y + py;
        if sy < 0 || sy >= source.bitmap.height as i32 { continue; }
        for px in 0..sw {
            let sx = source.x + px;
            if sx < 0 || sx >= s_stride as i32 { continue; }
            let dx = dest.x + py;
            let dy = dest.y + (sw - 1 - px);
            if dx < 0 || dx >= d_stride as i32 || dy < 0 || dy >= dest.bitmap.height as i32 { continue; }
            let si = (sy as usize * s_stride + sx as usize) * 4;
            let di = (dy as usize * d_stride + dx as usize) * 4;
            copy_pixel(&mut dest.bitmap.data, di, &sd, si);
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

fn copy_pixel(dest: &mut [u8], di: usize, source: &[u8], si: usize) {
    dest[di] = source[si];
    dest[di + 1] = source[si + 1];
    dest[di + 2] = source[si + 2];
    dest[di + 3] = source[si + 3];
}

fn in_bounds(x: i32, y: i32, width: i32, height: i32) -> bool {
    x >= 0 && x < width && y >= 0 && y < height
}

fn is_same_region(a: &BitmapRegion, b: &BitmapRegion) -> bool {
    std::ptr::eq(&a.bitmap as *const _, &b.bitmap as *const _)
        && a.x == b.x && a.y == b.y && a.width == b.width && a.height == b.height
}

fn swap_pixels(data: &mut [u8], a: usize, b: usize) {
    for c in 0..4 {
        let tmp = data[a + c];
        data[a + c] = data[b + c];
        data[b + c] = tmp;
    }
}

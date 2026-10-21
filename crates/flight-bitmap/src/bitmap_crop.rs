use flight_entity::allocate_entity;

use crate::bitmap_channel::initialize_bitmap;
use crate::types::*;

/// Crops source to rect, returning a new Bitmap.
pub fn crop_bitmap(source: &Bitmap, rect: &RectangleLike) -> Bitmap {
    let sw = source.width as i32;
    let sh = source.height as i32;
    let rx = rect.x.round() as i32;
    let ry = rect.y.round() as i32;
    let rw = rect.width.round().max(0.0) as usize;
    let rh = rect.height.round().max(0.0) as usize;
    let mut data = vec![0u8; rw * rh * 4];
    let sd = &source.data;
    for py in 0..rh {
        let sy = ry + py as i32;
        if sy < 0 || sy >= sh { continue; }
        for px in 0..rw {
            let sx = rx + px as i32;
            if sx < 0 || sx >= sw { continue; }
            let si = (sy as usize * sw as usize + sx as usize) * 4;
            let di = (py * rw + px) * 4;
            data[di] = sd[si];
            data[di + 1] = sd[si + 1];
            data[di + 2] = sd[si + 2];
            data[di + 3] = sd[si + 3];
        }
    }
    let mut out: Bitmap = allocate_entity();
    initialize_bitmap(&mut out, source.alpha_type, data.into_boxed_slice(), &source.format, &source.gamut, rh as u32, rw as u32);
    out.kind = source.kind;
    return out;
}

/// Extends source by padding on each side.
pub fn extend_bitmap(
    source: &Bitmap,
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
    edge_mode: BitmapEdgeMode,
    fill_color: u32,
) -> Bitmap {
    let sw = source.width as i32;
    let sh = source.height as i32;
    let dw = (sw + left + right) as usize;
    let dh = (sh + top + bottom) as usize;
    let mut data = vec![0u8; dw * dh * 4];
    let sd = &source.data;
    let fr = ((fill_color >> 24) & 0xff) as u8;
    let fg = ((fill_color >> 16) & 0xff) as u8;
    let fb = ((fill_color >> 8) & 0xff) as u8;
    let fa = (fill_color & 0xff) as u8;
    for py in 0..dh {
        for px in 0..dw {
            let sx = px as i32 - left;
            let sy = py as i32 - top;
            let di = (py * dw + px) * 4;
            if sx >= 0 && sx < sw && sy >= 0 && sy < sh {
                let si = (sy as usize * sw as usize + sx as usize) * 4;
                data[di] = sd[si];
                data[di + 1] = sd[si + 1];
                data[di + 2] = sd[si + 2];
                data[di + 3] = sd[si + 3];
            } else {
                let cx = resolve_edge_crop(sx, sw, edge_mode);
                let cy = resolve_edge_crop(sy, sh, edge_mode);
                if let (Some(cx), Some(cy)) = (cx, cy) {
                    let si = (cy as usize * sw as usize + cx as usize) * 4;
                    data[di] = sd[si];
                    data[di + 1] = sd[si + 1];
                    data[di + 2] = sd[si + 2];
                    data[di + 3] = sd[si + 3];
                } else {
                    data[di] = fr;
                    data[di + 1] = fg;
                    data[di + 2] = fb;
                    data[di + 3] = fa;
                }
            }
        }
    }
    let mut out: Bitmap = allocate_entity();
    initialize_bitmap(&mut out, source.alpha_type, data.into_boxed_slice(), &source.format, &source.gamut, dh as u32, dw as u32);
    out.kind = source.kind;
    return out;
}

fn resolve_edge_crop(v: i32, size: i32, mode: BitmapEdgeMode) -> Option<i32> {
    if v >= 0 && v < size { return Some(v); }
    match mode {
        BitmapEdgeMode::Clamp => Some(v.max(0).min(size - 1)),
        BitmapEdgeMode::Wrap => Some(((v % size) + size) % size),
        BitmapEdgeMode::Mirror => {
            let period = 2 * size;
            let wrapped = ((v % period) + period) % period;
            if wrapped < size { Some(wrapped) } else { Some(period - 1 - wrapped) }
        }
        BitmapEdgeMode::Transparent => None,
    }
}

/// Trims transparent border from source.
// flight-lint: allow(f64) mirrors TS RectangleLike (number) pixel bounds; D8 candidate for flight-geometry Rectangle
pub fn trim_bitmap(source: &Bitmap) -> Bitmap {
    let sw = source.width as i32;
    let sh = source.height as i32;
    let sd = &source.data;
    let mut min_x = sw;
    let mut min_y = sh;
    let mut max_x: i32 = -1;
    let mut max_y: i32 = -1;
    for py in 0..sh {
        for px in 0..sw {
            let a = sd[(py as usize * sw as usize + px as usize) * 4 + 3];
            if a > 0 {
                if px < min_x { min_x = px; }
                if px > max_x { max_x = px; }
                if py < min_y { min_y = py; }
                if py > max_y { max_y = py; }
            }
        }
    }
    if max_x < 0 {
        let mut out: Bitmap = allocate_entity();
        initialize_bitmap(&mut out, source.alpha_type, vec![0u8; 4].into_boxed_slice(), &source.format, &source.gamut, 1, 1);
        out.kind = source.kind;
        return out;
    }
    crop_bitmap(source, &RectangleLike {
        x: min_x as f64,
        y: min_y as f64,
        width: (max_x - min_x + 1) as f64,
        height: (max_y - min_y + 1) as f64,
    })
}

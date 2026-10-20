use crate::bitmap::invalidate_bitmap;
use crate::types::*;

/// Remaps each color channel of `source` independently through a 256-entry
/// lookup table, writing into `dest`.
pub fn apply_bitmap_palette_map(
    dest: &mut BitmapRegion,
    source: &BitmapRegion,
    red_map: Option<&[u8]>,
    green_map: Option<&[u8]>,
    blue_map: Option<&[u8]>,
    alpha_map: Option<&[u8]>,
) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    let sd = source.bitmap.data.clone();
    let s_bw = source.bitmap.width as i32;
    let d_bw = dest.bitmap.width as i32;
    for py in 0..h {
        let sy = source.y + py;
        let dy = dest.y + py;
        if sy < 0 || sy >= source.bitmap.height as i32 || dy < 0 || dy >= dest.bitmap.height as i32 { continue; }
        for px in 0..w {
            let sx = source.x + px;
            let dx = dest.x + px;
            if sx < 0 || sx >= s_bw || dx < 0 || dx >= d_bw { continue; }
            let si = (sy as usize * s_bw as usize + sx as usize) * 4;
            let di = (dy as usize * d_bw as usize + dx as usize) * 4;
            let r = sd[si];
            let g = sd[si + 1];
            let b = sd[si + 2];
            let a = sd[si + 3];
            dest.bitmap.data[di] = red_map.map_or(r, |m| m[r as usize]);
            dest.bitmap.data[di + 1] = green_map.map_or(g, |m| m[g as usize]);
            dest.bitmap.data[di + 2] = blue_map.map_or(b, |m| m[b as usize]);
            dest.bitmap.data[di + 3] = alpha_map.map_or(a, |m| m[a as usize]);
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

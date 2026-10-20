use crate::bitmap::invalidate_bitmap;
use crate::types::*;

/// Applies a 256-entry per-channel lookup table (LUT) to `out`.
pub fn apply_bitmap_curve(
    out: &mut BitmapRegion,
    source: &BitmapRegion,
    red_lut: Option<&[u8]>,
    green_lut: Option<&[u8]>,
    blue_lut: Option<&[u8]>,
    alpha_lut: Option<&[u8]>,
) {
    let w = out.width.min(source.width);
    let h = out.height.min(source.height);
    let sd = source.bitmap.data.clone();
    let s_bw = source.bitmap.width as i32;
    let o_bw = out.bitmap.width as i32;
    for py in 0..h {
        let sy = source.y + py;
        let oy = out.y + py;
        if sy < 0 || sy >= source.bitmap.height as i32 || oy < 0 || oy >= out.bitmap.height as i32 { continue; }
        for px in 0..w {
            let sx = source.x + px;
            let ox = out.x + px;
            if sx < 0 || sx >= s_bw || ox < 0 || ox >= o_bw { continue; }
            let si = (sy as usize * s_bw as usize + sx as usize) * 4;
            let oi = (oy as usize * o_bw as usize + ox as usize) * 4;
            let r = sd[si];
            let g = sd[si + 1];
            let b = sd[si + 2];
            let a = sd[si + 3];
            out.bitmap.data[oi] = red_lut.map_or(r, |lut| lut[r as usize]);
            out.bitmap.data[oi + 1] = green_lut.map_or(g, |lut| lut[g as usize]);
            out.bitmap.data[oi + 2] = blue_lut.map_or(b, |lut| lut[b as usize]);
            out.bitmap.data[oi + 3] = alpha_lut.map_or(a, |lut| lut[a as usize]);
        }
    }
    invalidate_bitmap(&mut out.bitmap);
}

/// Applies a levels adjustment to `out`.
pub fn apply_bitmap_levels(
    out: &mut BitmapRegion,
    source: &BitmapRegion,
    black_point: f32,
    white_point: f32,
    gamma: f32,
) {
    let bp = black_point.max(0.0).min(254.0);
    let wp = white_point.max(bp + 1.0).min(255.0);
    let span = wp - bp;
    let inv_gamma = if gamma > 0.0 { 1.0 / gamma } else { 1.0 };
    let mut lut = vec![0u8; 256];
    for i in 0..256 {
        let normalized = ((i as f32 - bp) / span).max(0.0).min(1.0);
        lut[i] = (normalized.powf(inv_gamma) * 255.0).round() as u8;
    }
    apply_bitmap_curve(out, source, Some(&lut), Some(&lut), Some(&lut), None);
}

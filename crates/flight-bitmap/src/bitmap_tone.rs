use crate::bitmap::invalidate_bitmap;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_bitmap() -> Bitmap {
        let mut out = create_bitmap(4, 4, Some(0x336699ff));
        set_bitmap_pixel(&mut out, 1, 1, 0x00000000);
        set_bitmap_pixel(&mut out, 2, 1, 0xff8000c0);
        return out;
    }

    fn test_region() -> BitmapRegion {
        return create_bitmap_region(test_bitmap(), 0, 0, 4, 4);
    }

    fn test_lut() -> Vec<u8> {
        return (0..=255u8).rev().collect();
    }

    #[test]
    fn bitmapregion_apply_curve_matches_apply_bitmap_curve() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.apply_curve(
            &test_region(),
            Some(&test_lut()[..]),
            Some(&test_lut()[..]),
            Some(&test_lut()[..]),
            Some(&test_lut()[..]),
        );
        let rb = apply_bitmap_curve(
            &mut b,
            &test_region(),
            Some(&test_lut()[..]),
            Some(&test_lut()[..]),
            Some(&test_lut()[..]),
            Some(&test_lut()[..]),
        );
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmapregion_apply_levels_matches_apply_bitmap_levels() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.apply_levels(&test_region(), 0.1, 0.9, 1.0);
        let rb = apply_bitmap_levels(&mut b, &test_region(), 0.1, 0.9, 1.0);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

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
        if sy < 0 || sy >= source.bitmap.height as i32 || oy < 0 || oy >= out.bitmap.height as i32 {
            continue;
        }
        for px in 0..w {
            let sx = source.x + px;
            let ox = out.x + px;
            if sx < 0 || sx >= s_bw || ox < 0 || ox >= o_bw {
                continue;
            }
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

impl BitmapRegion {
    pub fn apply_curve(
        &mut self,
        source: &BitmapRegion,
        red_lut: Option<&[u8]>,
        green_lut: Option<&[u8]>,
        blue_lut: Option<&[u8]>,
        alpha_lut: Option<&[u8]>,
    ) {
        return apply_bitmap_curve(self, source, red_lut, green_lut, blue_lut, alpha_lut);
    }

    pub fn apply_levels(
        &mut self,
        source: &BitmapRegion,
        black_point: f32,
        white_point: f32,
        gamma: f32,
    ) {
        return apply_bitmap_levels(self, source, black_point, white_point, gamma);
    }
}

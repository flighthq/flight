//! Color curve and levels adjustment operations on surfaces.

use flighthq_types::SurfaceRegion;

/// Applies a 256-entry per-channel lookup table (LUT) to `out`. Each non-`None`
/// LUT maps an input value (0--255) to an output value. Pass `None` to leave a
/// channel unchanged.
///
/// `out` and `source` may alias -- each pixel is read before it is written.
pub fn apply_surface_curve(
    out: &mut SurfaceRegion,
    source: &SurfaceRegion,
    red_lut: Option<&[u8; 256]>,
    green_lut: Option<&[u8; 256]>,
    blue_lut: Option<&[u8; 256]>,
    alpha_lut: Option<&[u8; 256]>,
) {
    let w = out.width.min(source.width);
    let h = out.height.min(source.height);
    let s_width = source.surface.width;
    let s_height = source.surface.height;
    let o_width = out.surface.width;
    let o_height = out.surface.height;
    let sd = source.surface.data.clone();
    let od = &mut out.surface.data;
    for py in 0..h {
        let sy = source.y + py;
        let oy = out.y + py;
        if sy >= s_height || oy >= o_height {
            continue;
        }
        for px in 0..w {
            let sx = source.x + px;
            let ox = out.x + px;
            if sx >= s_width || ox >= o_width {
                continue;
            }
            let si = ((sy * s_width + sx) * 4) as usize;
            let oi = ((oy * o_width + ox) * 4) as usize;
            let r = sd[si] as usize;
            let g = sd[si + 1] as usize;
            let b = sd[si + 2] as usize;
            let a = sd[si + 3] as usize;
            od[oi] = match red_lut {
                Some(lut) => lut[r],
                None => r as u8,
            };
            od[oi + 1] = match green_lut {
                Some(lut) => lut[g],
                None => g as u8,
            };
            od[oi + 2] = match blue_lut {
                Some(lut) => lut[b],
                None => b as u8,
            };
            od[oi + 3] = match alpha_lut {
                Some(lut) => lut[a],
                None => a as u8,
            };
        }
    }
    out.surface.version = out.surface.version.wrapping_add(1);
}

/// Applies a levels adjustment, stretching pixel values from the input range
/// `[black_point, white_point]` to full 0--255 with mid-tone `gamma` correction.
///
/// Alpha channel is passed through unchanged. `out` and `source` may alias.
pub fn apply_surface_levels(
    out: &mut SurfaceRegion,
    source: &SurfaceRegion,
    black_point: u8,
    white_point: u8,
    gamma: f32,
) {
    let bp = (black_point as u32).min(254) as f32;
    let wp = ((white_point as u32).max(black_point as u32 + 1)).min(255) as f32;
    let span = wp - bp;
    let inv_gamma = if gamma > 0.0 { 1.0 / gamma } else { 1.0 };
    let mut lut = [0u8; 256];
    for i in 0..256 {
        let normalized = ((i as f32 - bp) / span).clamp(0.0, 1.0);
        lut[i] = (normalized.powf(inv_gamma) * 255.0).round() as u8;
    }
    apply_surface_curve(out, source, Some(&lut), Some(&lut), Some(&lut), None);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::{get_surface_pixel, set_surface_pixel};
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn apply_surface_curve_identity() {
        let src = create_surface(1, 1, 0x80c040ff);
        let dst = create_surface(1, 1, 0);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut out = create_surface_region(dst, 0, 0, 1, 1);
        // No LUTs -> identity copy.
        apply_surface_curve(&mut out, &source, None, None, None, None);
        assert_eq!(get_surface_pixel(&out.surface, 0, 0), 0x80c040ff);
    }

    #[test]
    fn apply_surface_curve_invert_red() {
        let src = create_surface(1, 1, 0x40c080ff);
        let dst = create_surface(1, 1, 0);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut out = create_surface_region(dst, 0, 0, 1, 1);
        let mut invert = [0u8; 256];
        for i in 0..256 {
            invert[i] = (255 - i) as u8;
        }
        apply_surface_curve(&mut out, &source, Some(&invert), None, None, None);
        // Red channel inverted: 0x40 -> 0xbf
        assert_eq!(out.surface.data[0], 0xbf);
        // Green unchanged
        assert_eq!(out.surface.data[1], 0xc0);
    }

    #[test]
    fn apply_surface_curve_alias_safe() {
        let src = create_surface(1, 1, 0x80c040ff);
        let snap = src.clone();
        let source = create_surface_region(snap, 0, 0, 1, 1);
        let mut out = create_surface_region(src, 0, 0, 1, 1);
        let mut double_lut = [0u8; 256];
        for i in 0..256 {
            double_lut[i] = ((i * 2).min(255)) as u8;
        }
        apply_surface_curve(&mut out, &source, Some(&double_lut), None, None, None);
        // Red 0x80 (128) -> 256 clamped to 255
        assert_eq!(out.surface.data[0], 255);
    }

    #[test]
    fn apply_surface_levels_identity() {
        let src = create_surface(1, 1, 0x80c040ff);
        let dst = create_surface(1, 1, 0);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut out = create_surface_region(dst, 0, 0, 1, 1);
        apply_surface_levels(&mut out, &source, 0, 255, 1.0);
        assert_eq!(get_surface_pixel(&out.surface, 0, 0), 0x80c040ff);
    }

    #[test]
    fn apply_surface_levels_stretch() {
        let mut src = create_surface(1, 1, 0);
        // Value 128 with black_point=100, white_point=200 -> normalized=(128-100)/100=0.28
        // gamma=1 -> output = round(0.28*255) = 71 = 0x47
        set_surface_pixel(&mut src, 0, 0, 0x808080ff);
        let dst = create_surface(1, 1, 0);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut out = create_surface_region(dst, 0, 0, 1, 1);
        apply_surface_levels(&mut out, &source, 100, 200, 1.0);
        // 128 with bp=100, wp=200: normalized = (128-100)/100 = 0.28
        // output = round(0.28 * 255) = 71
        assert_eq!(out.surface.data[0], 71);
    }

    #[test]
    fn apply_surface_levels_gamma() {
        let mut src = create_surface(1, 1, 0);
        set_surface_pixel(&mut src, 0, 0, 0x808080ff);
        let dst = create_surface(1, 1, 0);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut out = create_surface_region(dst, 0, 0, 1, 1);
        // gamma < 1 lightens midtones
        apply_surface_levels(&mut out, &source, 0, 255, 0.5);
        // 128/255 = 0.502, gamma=0.5 -> inv_gamma=2 -> 0.502^2 = 0.252 -> round(0.252*255) = 64
        assert_eq!(out.surface.data[0], 64);
    }
}

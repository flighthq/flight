//! Alpha channel operations on surface regions.

use flighthq_types::SurfaceRegion;

/// Copies only the alpha channel from `source` into `dest`. RGB channels
/// of `dest` are left unchanged. The copied size is the overlap of the two
/// regions.
///
/// Safe to pass the same surface and region in `dest` and `source`.
pub fn copy_surface_alpha(dest: &mut SurfaceRegion, source: &SurfaceRegion) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    let s_width = source.surface.width;
    let s_height = source.surface.height;
    let d_width = dest.surface.width;
    let d_height = dest.surface.height;
    let sd = source.surface.data.clone();
    let dd = &mut dest.surface.data;
    for py in 0..h {
        let sy = source.y + py;
        let dy = dest.y + py;
        if sy >= s_height || dy >= d_height {
            continue;
        }
        for px in 0..w {
            let sx = source.x + px;
            let dx = dest.x + px;
            if sx >= s_width || dx >= d_width {
                continue;
            }
            let si = ((sy * s_width + sx) * 4 + 3) as usize;
            let di = ((dy * d_width + dx) * 4 + 3) as usize;
            dd[di] = sd[si];
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Scales every alpha value in `out` by `factor` (0.0--1.0). RGB channels
/// are unchanged. `factor` is clamped to [0, 1].
pub fn multiply_surface_alpha(out: &mut SurfaceRegion, factor: f32) {
    let f = factor.clamp(0.0, 1.0);
    let s_width = out.surface.width;
    let s_height = out.surface.height;
    let data = &mut out.surface.data;
    for py in 0..out.height {
        let y = out.y + py;
        if y >= s_height {
            continue;
        }
        for px in 0..out.width {
            let x = out.x + px;
            if x >= s_width {
                continue;
            }
            let i = ((y * s_width + x) * 4 + 3) as usize;
            data[i] = (data[i] as f32 * f).round() as u8;
        }
    }
    out.surface.version = out.surface.version.wrapping_add(1);
}

/// Writes a constant `alpha` value (0--255) to every pixel in `out`.
/// RGB channels are unchanged. `alpha` is clamped to [0, 255].
pub fn set_surface_alpha(out: &mut SurfaceRegion, alpha: u8) {
    let s_width = out.surface.width;
    let s_height = out.surface.height;
    let data = &mut out.surface.data;
    for py in 0..out.height {
        let y = out.y + py;
        if y >= s_height {
            continue;
        }
        for px in 0..out.width {
            let x = out.x + px;
            if x >= s_width {
                continue;
            }
            data[((y * s_width + x) * 4 + 3) as usize] = alpha;
        }
    }
    out.surface.version = out.surface.version.wrapping_add(1);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::{get_surface_pixel, set_surface_pixel};
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn copy_surface_alpha_copies_only_alpha() {
        let mut src = create_surface(1, 1, 0);
        set_surface_pixel(&mut src, 0, 0, 0x112233aa);
        let dst = create_surface(1, 1, 0xaabbcc00);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        copy_surface_alpha(&mut dest, &source);
        // Alpha copied, RGB unchanged.
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0xaabbccaa);
    }

    #[test]
    fn copy_surface_alpha_alias_safe() {
        let s = create_surface(1, 1, 0x112233aa);
        let snap = s.clone();
        let source = create_surface_region(snap, 0, 0, 1, 1);
        let mut dest = create_surface_region(s, 0, 0, 1, 1);
        copy_surface_alpha(&mut dest, &source);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x112233aa);
    }

    #[test]
    fn multiply_surface_alpha_scales_alpha() {
        let s = create_surface(1, 1, 0x112233ff);
        let mut r = create_surface_region(s, 0, 0, 1, 1);
        multiply_surface_alpha(&mut r, 0.5);
        // Alpha ~128, RGB unchanged.
        assert_eq!(r.surface.data[0], 0x11);
        assert_eq!(r.surface.data[1], 0x22);
        assert_eq!(r.surface.data[2], 0x33);
        assert!(r.surface.data[3] >= 127 && r.surface.data[3] <= 128);
    }

    #[test]
    fn multiply_surface_alpha_zero_clears() {
        let s = create_surface(1, 1, 0x112233ff);
        let mut r = create_surface_region(s, 0, 0, 1, 1);
        multiply_surface_alpha(&mut r, 0.0);
        assert_eq!(r.surface.data[3], 0);
    }

    #[test]
    fn set_surface_alpha_writes_constant() {
        let s = create_surface(2, 1, 0x11223300);
        let mut r = create_surface_region(s, 0, 0, 2, 1);
        set_surface_alpha(&mut r, 0x80);
        assert_eq!(r.surface.data[3], 0x80);
        assert_eq!(r.surface.data[7], 0x80);
        // RGB unchanged.
        assert_eq!(r.surface.data[0], 0x11);
    }
}

//! Surface resampling with nearest, bilinear, and bicubic modes.

use flighthq_types::{SurfaceRegion, SurfaceResizeMode};

/// Options for `resize_surface`.
#[derive(Clone, Debug, Default)]
pub struct SurfaceResizeOptions {
    pub mode: SurfaceResizeMode,
    /// When true, premultiplies alpha before interpolation and unpremultiplies
    /// after to prevent dark-halo bleed at transparent edges.
    pub premultiplied: bool,
}

/// Resamples the `source` region into the `dest` region; `dest`'s dimensions
/// define the target size. Modes: `Nearest` preserves hard edges, `Bilinear`
/// interpolates four neighbours, `Bicubic` uses Catmull-Rom over a 4×4
/// neighbourhood. `premultiplied` avoids dark-halo bleed at transparent edges.
///
/// `dest` must not alias `source` — output pixels read arbitrary source
/// positions.
pub fn resize_surface(
    dest: &mut SurfaceRegion,
    source: &SurfaceRegion,
    options: &SurfaceResizeOptions,
) {
    let mode = options.mode;
    let premultiplied = options.premultiplied;

    let sw = source.width;
    let sh = source.height;
    let dw = dest.width;
    let dh = dest.height;
    if sw == 0 || sh == 0 || dw == 0 || dh == 0 {
        return;
    }
    let s_stride = source.surface.width;
    let s_surface_height = source.surface.height;
    let d_stride = dest.surface.width;
    let d_surface_height = dest.surface.height;
    let source_x = source.x;
    let source_y = source.y;
    let dest_x = dest.x;
    let dest_y = dest.y;
    let sd = source.surface.data.clone();
    let dd = &mut dest.surface.data;

    match mode {
        SurfaceResizeMode::Nearest => {
            for dy in 0..dh {
                let oy = dest_y + dy;
                if oy >= d_surface_height {
                    continue;
                }
                let sy = source_y + (sh - 1).min((dy * sh) / dh);
                if sy >= s_surface_height {
                    continue;
                }
                for dx in 0..dw {
                    let ox = dest_x + dx;
                    if ox >= d_stride {
                        continue;
                    }
                    let sx = source_x + (sw - 1).min((dx * sw) / dw);
                    if sx >= s_stride {
                        continue;
                    }
                    let si = ((sy * s_stride + sx) * 4) as usize;
                    let di = ((oy * d_stride + ox) * 4) as usize;
                    dd[di] = sd[si];
                    dd[di + 1] = sd[si + 1];
                    dd[di + 2] = sd[si + 2];
                    dd[di + 3] = sd[si + 3];
                }
            }
            return;
        }
        SurfaceResizeMode::Bicubic => {
            let scale_x = sw as f64 / dw as f64;
            let scale_y = sh as f64 / dh as f64;
            for dy in 0..dh {
                let oy = dest_y + dy;
                if oy >= d_surface_height {
                    continue;
                }
                let fy = (dy as f64 + 0.5) * scale_y - 0.5;
                let y1 = fy.floor() as i64;
                let ty = fy - y1 as f64;
                for dx in 0..dw {
                    let ox = dest_x + dx;
                    if ox >= d_stride {
                        continue;
                    }
                    let fx = (dx as f64 + 0.5) * scale_x - 0.5;
                    let x1 = fx.floor() as i64;
                    let tx = fx - x1 as f64;
                    let di = ((oy * d_stride + ox) * 4) as usize;
                    for c in 0..4 {
                        let mut sum = 0.0;
                        for m in -1..=2i64 {
                            let wy = catmull_rom_weight(ty - m as f64);
                            let syc = source_y as i64 + (y1 + m).clamp(0, sh as i64 - 1);
                            for n in -1..=2i64 {
                                let wx = catmull_rom_weight(tx - n as f64);
                                let sxc = source_x as i64 + (x1 + n).clamp(0, sw as i64 - 1);
                                let si = ((syc * s_stride as i64 + sxc) * 4) as usize;
                                let v = if premultiplied && c < 3 {
                                    sd[si + c] as f64 * sd[si + 3] as f64 / 255.0
                                } else {
                                    sd[si + c] as f64
                                };
                                sum += v * wy * wx;
                            }
                        }
                        dd[di + c] = sum.round().clamp(0.0, 255.0) as u8;
                    }
                    if premultiplied {
                        unpremultiply_dest_pixel(dd, di);
                    }
                }
            }
            return;
        }
        SurfaceResizeMode::Bilinear => {}
    }

    // Bilinear
    let scale_x = sw as f64 / dw as f64;
    let scale_y = sh as f64 / dh as f64;
    for dy in 0..dh {
        let oy = dest_y + dy;
        if oy >= d_surface_height {
            continue;
        }
        let fy = (dy as f64 + 0.5) * scale_y - 0.5;
        let y0 = fy.floor() as i64;
        let ty = fy - y0 as f64;
        let y0c = source_y as i64 + y0.clamp(0, sh as i64 - 1);
        let y1c = source_y as i64 + (y0 + 1).clamp(0, sh as i64 - 1);
        for dx in 0..dw {
            let ox = dest_x + dx;
            if ox >= d_stride {
                continue;
            }
            let fx = (dx as f64 + 0.5) * scale_x - 0.5;
            let x0 = fx.floor() as i64;
            let tx = fx - x0 as f64;
            let x0c = source_x as i64 + x0.clamp(0, sw as i64 - 1);
            let x1c = source_x as i64 + (x0 + 1).clamp(0, sw as i64 - 1);
            let i00 = ((y0c * s_stride as i64 + x0c) * 4) as usize;
            let i10 = ((y0c * s_stride as i64 + x1c) * 4) as usize;
            let i01 = ((y1c * s_stride as i64 + x0c) * 4) as usize;
            let i11 = ((y1c * s_stride as i64 + x1c) * 4) as usize;
            let di = ((oy * d_stride + ox) * 4) as usize;
            for c in 0..4 {
                let (mut v00, mut v10, mut v01, mut v11) = (
                    sd[i00 + c] as f64,
                    sd[i10 + c] as f64,
                    sd[i01 + c] as f64,
                    sd[i11 + c] as f64,
                );
                if premultiplied && c < 3 {
                    v00 = v00 * sd[i00 + 3] as f64 / 255.0;
                    v10 = v10 * sd[i10 + 3] as f64 / 255.0;
                    v01 = v01 * sd[i01 + 3] as f64 / 255.0;
                    v11 = v11 * sd[i11 + 3] as f64 / 255.0;
                }
                let top = v00 * (1.0 - tx) + v10 * tx;
                let bottom = v01 * (1.0 - tx) + v11 * tx;
                dd[di + c] = (top * (1.0 - ty) + bottom * ty).round() as u8;
            }
            if premultiplied {
                unpremultiply_dest_pixel(dd, di);
            }
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

fn unpremultiply_dest_pixel(dd: &mut [u8], di: usize) {
    let a = dd[di + 3];
    if a > 0 {
        dd[di] = 255.0_f64.min((dd[di] as f64 * 255.0 / a as f64).round()) as u8;
        dd[di + 1] = 255.0_f64.min((dd[di + 1] as f64 * 255.0 / a as f64).round()) as u8;
        dd[di + 2] = 255.0_f64.min((dd[di + 2] as f64 * 255.0 / a as f64).round()) as u8;
    } else {
        dd[di] = 0;
        dd[di + 1] = 0;
        dd[di + 2] = 0;
    }
}

// Catmull-Rom weight for distance t (|t| in [0, 2]).
fn catmull_rom_weight(t: f64) -> f64 {
    let a = t.abs();
    if a >= 2.0 {
        return 0.0;
    }
    if a >= 1.0 {
        return -0.5 * a * a * a + 2.5 * a * a - 4.0 * a + 2.0;
    }
    1.5 * a * a * a - 2.5 * a * a + 1.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::get_surface_pixel;
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    fn opts(mode: SurfaceResizeMode) -> SurfaceResizeOptions {
        SurfaceResizeOptions {
            mode,
            premultiplied: false,
        }
    }

    #[test]
    fn resize_surface_nearest_2x() {
        let mut src = create_surface(2, 1, 0);
        src.data[0..4].copy_from_slice(&[10, 20, 30, 255]);
        src.data[4..8].copy_from_slice(&[40, 50, 60, 255]);
        let dst = create_surface(4, 1, 0);
        let source = create_surface_region(src.clone(), 0, 0, 2, 1);
        let mut dest = create_surface_region(dst, 0, 0, 4, 1);
        resize_surface(&mut dest, &source, &opts(SurfaceResizeMode::Nearest));
        assert_eq!(
            get_surface_pixel(&dest.surface, 0, 0),
            get_surface_pixel(&src, 0, 0)
        );
        assert_eq!(
            get_surface_pixel(&dest.surface, 1, 0),
            get_surface_pixel(&src, 0, 0)
        );
        assert_eq!(
            get_surface_pixel(&dest.surface, 2, 0),
            get_surface_pixel(&src, 1, 0)
        );
        assert_eq!(
            get_surface_pixel(&dest.surface, 3, 0),
            get_surface_pixel(&src, 1, 0)
        );
    }

    #[test]
    fn resize_surface_bilinear_half() {
        let src = create_surface(4, 1, 0x40608000);
        let dst = create_surface(2, 1, 0);
        let source = create_surface_region(src, 0, 0, 4, 1);
        let mut dest = create_surface_region(dst, 0, 0, 2, 1);
        resize_surface(&mut dest, &source, &opts(SurfaceResizeMode::Bilinear));
        assert_eq!(dest.surface.data[0], 0x40);
        assert_eq!(dest.surface.data[1], 0x60);
        assert_eq!(dest.surface.data[2], 0x80);
    }

    #[test]
    fn resize_surface_bilinear_interpolates() {
        let mut src = create_surface(2, 1, 0);
        src.data[0..4].copy_from_slice(&[0, 0, 0, 255]);
        src.data[4..8].copy_from_slice(&[100, 100, 100, 255]);
        let dst = create_surface(4, 1, 0);
        let source = create_surface_region(src, 0, 0, 2, 1);
        let mut dest = create_surface_region(dst, 0, 0, 4, 1);
        resize_surface(&mut dest, &source, &opts(SurfaceResizeMode::Bilinear));
        assert_eq!(dest.surface.data[0], 0);
        assert!(dest.surface.data[8] > dest.surface.data[4]);
        assert_eq!(dest.surface.data[12], 100);
    }

    #[test]
    fn resize_surface_bicubic_monotonic() {
        let mut src = create_surface(2, 1, 0);
        src.data[0..4].copy_from_slice(&[0, 0, 0, 255]);
        src.data[4..8].copy_from_slice(&[200, 200, 200, 255]);
        let dst = create_surface(4, 1, 0);
        let source = create_surface_region(src, 0, 0, 2, 1);
        let mut dest = create_surface_region(dst, 0, 0, 4, 1);
        resize_surface(&mut dest, &source, &opts(SurfaceResizeMode::Bicubic));
        assert!(dest.surface.data[4] >= dest.surface.data[0]);
        assert!(dest.surface.data[8] >= dest.surface.data[4]);
        assert!(dest.surface.data[12] >= dest.surface.data[8]);
    }

    #[test]
    fn resize_surface_premultiplied_reduces_halo() {
        let mut src = create_surface(2, 1, 0);
        src.data[0..4].copy_from_slice(&[255, 0, 0, 255]);
        src.data[4..8].copy_from_slice(&[0, 0, 0, 0]);
        let source = create_surface_region(src, 0, 0, 2, 1);
        let straight_surface = create_surface(4, 1, 0);
        let mut straight = create_surface_region(straight_surface, 0, 0, 4, 1);
        resize_surface(&mut straight, &source, &opts(SurfaceResizeMode::Bilinear));
        let premul_surface = create_surface(4, 1, 0);
        let mut premul = create_surface_region(premul_surface, 0, 0, 4, 1);
        resize_surface(
            &mut premul,
            &source,
            &SurfaceResizeOptions {
                mode: SurfaceResizeMode::Bilinear,
                premultiplied: true,
            },
        );
        assert!(premul.surface.data[4] >= straight.surface.data[4]);
    }

    #[test]
    fn resize_surface_sub_region() {
        let mut src = create_surface(4, 1, 0);
        src.data[8..12].copy_from_slice(&[10, 0, 0, 255]);
        let dst = create_surface(4, 1, 0);
        let source = create_surface_region(src, 2, 0, 1, 1);
        let mut dest = create_surface_region(dst, 0, 0, 2, 1);
        resize_surface(&mut dest, &source, &opts(SurfaceResizeMode::Nearest));
        assert_eq!(dest.surface.data[0], 10);
        assert_eq!(dest.surface.data[4], 10);
        assert_eq!(dest.surface.data[8], 0);
    }

    #[test]
    fn resize_surface_zero_dimension_noop() {
        let src = create_surface(2, 2, 0xffffffff);
        let dst = create_surface(0, 0, 0);
        let source = create_surface_region(src, 0, 0, 2, 2);
        let mut dest = create_surface_region(dst, 0, 0, 0, 0);
        resize_surface(&mut dest, &source, &opts(SurfaceResizeMode::Bilinear));
    }
}

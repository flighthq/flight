//! Channel and pixel copy operations between surface regions.

use flighthq_types::{ImageChannel, SurfaceRegion};

/// Copies one channel of `source` into a channel of `dest`. The copied size is
/// the overlap of the two regions; pixels outside either surface are skipped.
pub fn copy_surface_channel(
    dest: &mut SurfaceRegion,
    dest_channel: ImageChannel,
    source: &SurfaceRegion,
    source_channel: ImageChannel,
) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    let dc = dest_channel as usize;
    let sc = source_channel as usize;
    let s_width = source.surface.width;
    let s_height = source.surface.height;
    let d_width = dest.surface.width;
    let d_height = dest.surface.height;
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
            let si = ((sy * s_width + sx) * 4) as usize;
            let di = ((dy * d_width + dx) * 4) as usize;
            dest.surface.data[di + dc] = source.surface.data[si + sc];
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Copies `source` into `dest`. The copied size is the overlap of the two
/// regions; pixels outside either surface are skipped. When `composite` is
/// true, `source` is alpha-composited (Porter-Duff source-over) over `dest`
/// instead of overwriting it.
pub fn copy_surface_pixels(dest: &mut SurfaceRegion, source: &SurfaceRegion, composite: bool) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    let s_width = source.surface.width;
    let s_height = source.surface.height;
    let d_width = dest.surface.width;
    let d_height = dest.surface.height;
    let sd = &source.surface.data;
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
            let si = ((sy * s_width + sx) * 4) as usize;
            let di = ((dy * d_width + dx) * 4) as usize;
            let dd = &mut dest.surface.data;
            if composite {
                let src_a = sd[si + 3] as f32 / 255.0;
                let dst_a = dd[di + 3] as f32 / 255.0;
                let out_a = src_a + dst_a * (1.0 - src_a);
                if out_a > 0.0 {
                    dd[di] = ((sd[si] as f32 * src_a + dd[di] as f32 * dst_a * (1.0 - src_a))
                        / out_a)
                        .round() as u8;
                    dd[di + 1] = ((sd[si + 1] as f32 * src_a
                        + dd[di + 1] as f32 * dst_a * (1.0 - src_a))
                        / out_a)
                        .round() as u8;
                    dd[di + 2] = ((sd[si + 2] as f32 * src_a
                        + dd[di + 2] as f32 * dst_a * (1.0 - src_a))
                        / out_a)
                        .round() as u8;
                    dd[di + 3] = (out_a * 255.0).round() as u8;
                }
            } else {
                dd[di] = sd[si];
                dd[di + 1] = sd[si + 1];
                dd[di + 2] = sd[si + 2];
                dd[di + 3] = sd[si + 3];
            }
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::{get_surface_pixel, set_surface_pixel};
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn copy_surface_channel_copies_red_to_blue() {
        let mut src = create_surface(1, 1, 0);
        set_surface_pixel(&mut src, 0, 0, 0xaa000000);
        let dst = create_surface(1, 1, 0);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        copy_surface_channel(&mut dest, ImageChannel::Blue, &source, ImageChannel::Red);
        assert_eq!(dest.surface.data[2], 0xaa);
        assert_eq!(dest.surface.data[0], 0x00);
    }

    #[test]
    fn copy_surface_pixels_overwrites() {
        let mut src = create_surface(1, 1, 0);
        set_surface_pixel(&mut src, 0, 0, 0x11223344);
        let dst = create_surface(1, 1, 0xffffffff);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        copy_surface_pixels(&mut dest, &source, false);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x11223344);
    }

    #[test]
    fn copy_surface_pixels_composite_source_over() {
        // Opaque white over opaque black, half alpha source.
        let mut src = create_surface(1, 1, 0);
        set_surface_pixel(&mut src, 0, 0, 0xffffff80);
        let dst = create_surface(1, 1, 0x000000ff);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        copy_surface_pixels(&mut dest, &source, true);
        // src alpha = 128/255, out alpha = full; blended value ~ 128
        assert_eq!(dest.surface.data[3], 255);
        assert!(dest.surface.data[0] > 120 && dest.surface.data[0] < 135);
    }
}

//! Horizontal and vertical surface flips.

use flighthq_types::SurfaceRegion;

/// Mirrors the `source` region left-to-right into the `dest` region. The
/// mirror size is the overlap of the two regions. When `dest` and `source`
/// describe the same surface and bounds, columns are swapped in pairs in place;
/// otherwise `dest` and `source` must not overlap.
pub fn flip_surface_horizontal(dest: &mut SurfaceRegion, source: &SurfaceRegion) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    if is_same_region(dest, source) {
        let stride = dest.surface.width;
        let surface_height = dest.surface.height;
        let dest_x = dest.x;
        let dest_y = dest.y;
        let data = &mut dest.surface.data;
        let half = w >> 1;
        for py in 0..h {
            let y = dest_y + py;
            if y >= surface_height {
                continue;
            }
            for px in 0..half {
                let xa = dest_x + px;
                let xb = dest_x + (w - 1 - px);
                if xa >= stride || xb >= stride {
                    continue;
                }
                swap_pixels(
                    data,
                    ((y * stride + xa) * 4) as usize,
                    ((y * stride + xb) * 4) as usize,
                );
            }
        }
        dest.surface.version = dest.surface.version.wrapping_add(1);
        return;
    }
    copy_mirrored(dest, source, w, h, true, false);
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Mirrors the `source` region top-to-bottom into the `dest` region. The
/// mirror size is the overlap of the two regions. When `dest` and `source`
/// describe the same surface and bounds, rows are swapped in pairs in place;
/// otherwise `dest` and `source` must not overlap.
pub fn flip_surface_vertical(dest: &mut SurfaceRegion, source: &SurfaceRegion) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    if is_same_region(dest, source) {
        let stride = dest.surface.width;
        let surface_height = dest.surface.height;
        let dest_x = dest.x;
        let dest_y = dest.y;
        let data = &mut dest.surface.data;
        let half = h >> 1;
        for py in 0..half {
            let y_top = dest_y + py;
            let y_bottom = dest_y + (h - 1 - py);
            if y_top >= surface_height || y_bottom >= surface_height {
                continue;
            }
            for px in 0..w {
                let x = dest_x + px;
                if x >= stride {
                    continue;
                }
                swap_pixels(
                    data,
                    ((y_top * stride + x) * 4) as usize,
                    ((y_bottom * stride + x) * 4) as usize,
                );
            }
        }
        dest.surface.version = dest.surface.version.wrapping_add(1);
        return;
    }
    copy_mirrored(dest, source, w, h, false, true);
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

// Copies source -> dest with optional per-axis mirroring (non-aliased path).
fn copy_mirrored(
    dest: &mut SurfaceRegion,
    source: &SurfaceRegion,
    w: u32,
    h: u32,
    mirror_x: bool,
    mirror_y: bool,
) {
    let s_stride = source.surface.width;
    let s_height = source.surface.height;
    let d_stride = dest.surface.width;
    let d_height = dest.surface.height;
    let source_x = source.x;
    let source_y = source.y;
    let dest_x = dest.x;
    let dest_y = dest.y;
    let sd = source.surface.data.clone();
    let dd = &mut dest.surface.data;
    for py in 0..h {
        let sy = source_y + if mirror_y { h - 1 - py } else { py };
        let dy = dest_y + py;
        if sy >= s_height || dy >= d_height {
            continue;
        }
        for px in 0..w {
            let sx = source_x + if mirror_x { w - 1 - px } else { px };
            let dx = dest_x + px;
            if sx >= s_stride || dx >= d_stride {
                continue;
            }
            let si = ((sy * s_stride + sx) * 4) as usize;
            let di = ((dy * d_stride + dx) * 4) as usize;
            dd[di] = sd[si];
            dd[di + 1] = sd[si + 1];
            dd[di + 2] = sd[si + 2];
            dd[di + 3] = sd[si + 3];
        }
    }
}

fn is_same_region(a: &SurfaceRegion, b: &SurfaceRegion) -> bool {
    a.x == b.x
        && a.y == b.y
        && a.width == b.width
        && a.height == b.height
        && a.surface.width == b.surface.width
        && a.surface.height == b.surface.height
        && a.surface.data == b.surface.data
}

fn swap_pixels(data: &mut [u8], a: usize, b: usize) {
    for c in 0..4 {
        data.swap(a + c, b + c);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::{get_surface_pixel, set_surface_pixel};
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn flip_surface_horizontal_into_distinct_dest() {
        let mut src = create_surface(2, 1, 0);
        set_surface_pixel(&mut src, 0, 0, 0x11111111);
        set_surface_pixel(&mut src, 1, 0, 0x22222222);
        let dst = create_surface(2, 1, 0);
        let source = create_surface_region(src, 0, 0, 2, 1);
        let mut dest = create_surface_region(dst, 0, 0, 2, 1);
        flip_surface_horizontal(&mut dest, &source);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x22222222);
        assert_eq!(get_surface_pixel(&dest.surface, 1, 0), 0x11111111);
    }

    #[test]
    fn flip_surface_horizontal_in_place() {
        let mut surface = create_surface(2, 1, 0);
        set_surface_pixel(&mut surface, 0, 0, 0x11111111);
        set_surface_pixel(&mut surface, 1, 0, 0x22222222);
        let snapshot = surface.clone();
        let mut dest = create_surface_region(surface, 0, 0, 2, 1);
        let source = create_surface_region(snapshot, 0, 0, 2, 1);
        flip_surface_horizontal(&mut dest, &source);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x22222222);
        assert_eq!(get_surface_pixel(&dest.surface, 1, 0), 0x11111111);
    }

    #[test]
    fn flip_surface_vertical_in_place() {
        let mut surface = create_surface(1, 2, 0);
        set_surface_pixel(&mut surface, 0, 0, 0x11111111);
        set_surface_pixel(&mut surface, 0, 1, 0x22222222);
        let snapshot = surface.clone();
        let mut dest = create_surface_region(surface, 0, 0, 1, 2);
        let source = create_surface_region(snapshot, 0, 0, 1, 2);
        flip_surface_vertical(&mut dest, &source);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x22222222);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 1), 0x11111111);
    }
}

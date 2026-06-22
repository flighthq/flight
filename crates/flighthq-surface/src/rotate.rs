//! Surface rotation: arbitrary angle, 90°, 180°, and counter-clockwise.

use flighthq_types::SurfaceRegion;

/// Rotates the `source` region by `angle` radians into the `dest` region,
/// around a pivot point in source coordinates. Uses bilinear sampling;
/// out-of-bounds source positions are written as transparent black.
///
/// `dest` must not alias `source`.
pub fn rotate_surface(
    dest: &mut SurfaceRegion,
    source: &SurfaceRegion,
    angle: f32,
    pivot_x: f32,
    pivot_y: f32,
) {
    let cos_a = (-angle).cos() as f64;
    let sin_a = (-angle).sin() as f64;
    let pivot_x = pivot_x as f64;
    let pivot_y = pivot_y as f64;
    let sw = source.width;
    let sh = source.height;
    let dw = dest.width;
    let dh = dest.height;
    let s_stride = source.surface.width;
    let s_surface_height = source.surface.height;
    let d_stride = dest.surface.width;
    let d_surface_height = dest.surface.height;
    let source_x = source.x as i64;
    let source_y = source.y as i64;
    let dest_x = dest.x;
    let dest_y = dest.y;
    let sd = source.surface.data.clone();
    let dd = &mut dest.surface.data;
    let dest_pivot_x = (dw as f64 - 1.0) / 2.0;
    let dest_pivot_y = (dh as f64 - 1.0) / 2.0;

    for dy in 0..dh {
        let oy = dest_y + dy;
        if oy >= d_surface_height {
            continue;
        }
        let ry = dy as f64 - dest_pivot_y;
        for dx in 0..dw {
            let ox = dest_x + dx;
            if ox >= d_stride {
                continue;
            }
            let rx = dx as f64 - dest_pivot_x;
            let sx = cos_a * rx - sin_a * ry + pivot_x;
            let sy = sin_a * rx + cos_a * ry + pivot_y;
            let di = ((oy * d_stride + ox) * 4) as usize;

            if sx < -0.5 || sx > sw as f64 - 0.5 || sy < -0.5 || sy > sh as f64 - 0.5 {
                dd[di] = 0;
                dd[di + 1] = 0;
                dd[di + 2] = 0;
                dd[di + 3] = 0;
                continue;
            }

            let x0 = sx.floor() as i64;
            let y0 = sy.floor() as i64;
            let tx = sx - x0 as f64;
            let ty = sy - y0 as f64;
            let x0c = source_x + x0.clamp(0, sw as i64 - 1);
            let x1c = source_x + (x0 + 1).clamp(0, sw as i64 - 1);
            let y0c = source_y + y0.clamp(0, sh as i64 - 1);
            let y1c = source_y + (y0 + 1).clamp(0, sh as i64 - 1);
            if y0c >= s_surface_height as i64 || y1c >= s_surface_height as i64 {
                continue;
            }
            let i00 = ((y0c * s_stride as i64 + x0c) * 4) as usize;
            let i10 = ((y0c * s_stride as i64 + x1c) * 4) as usize;
            let i01 = ((y1c * s_stride as i64 + x0c) * 4) as usize;
            let i11 = ((y1c * s_stride as i64 + x1c) * 4) as usize;
            for c in 0..4 {
                let top = sd[i00 + c] as f64 * (1.0 - tx) + sd[i10 + c] as f64 * tx;
                let bottom = sd[i01 + c] as f64 * (1.0 - tx) + sd[i11 + c] as f64 * tx;
                dd[di + c] = (top * (1.0 - ty) + bottom * ty).round() as u8;
            }
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Rotates the `source` region 180° into the `dest` region. `dest` and
/// `source` must have the same dimensions. When `dest` and `source` describe
/// the same surface and bounds, opposite pixels are swapped in pairs in place;
/// otherwise the regions must not overlap.
pub fn rotate_surface_180(dest: &mut SurfaceRegion, source: &SurfaceRegion) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    if is_same_region(dest, source) {
        let stride = dest.surface.width;
        let surface_height = dest.surface.height;
        let dest_x = dest.x;
        let dest_y = dest.y;
        let data = &mut dest.surface.data;
        let total = w * h;
        let half = total >> 1;
        for k in 0..half {
            let ax = dest_x + (k % w);
            let ay = dest_y + (k / w);
            let bx = dest_x + (w - 1 - (k % w));
            let by = dest_y + (h - 1 - (k / w));
            if !in_bounds(ax, ay, stride, surface_height)
                || !in_bounds(bx, by, stride, surface_height)
            {
                continue;
            }
            swap_pixels(
                data,
                ((ay * stride + ax) * 4) as usize,
                ((by * stride + bx) * 4) as usize,
            );
        }
        dest.surface.version = dest.surface.version.wrapping_add(1);
        return;
    }
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
        let sy = source_y + (h - 1 - py);
        let dy = dest_y + py;
        if sy >= s_height || dy >= d_height {
            continue;
        }
        for px in 0..w {
            let sx = source_x + (w - 1 - px);
            let dx = dest_x + px;
            if sx >= s_stride || dx >= d_stride {
                continue;
            }
            copy_pixel(
                dd,
                ((dy * d_stride + dx) * 4) as usize,
                &sd,
                ((sy * s_stride + sx) * 4) as usize,
            );
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Rotates the `source` region 90° clockwise into the `dest` region. `dest`'s
/// dimensions must be swapped relative to `source`. `dest` must not alias
/// `source`.
pub fn rotate_surface_clockwise(dest: &mut SurfaceRegion, source: &SurfaceRegion) {
    let sw = source.width;
    let sh = source.height;
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
    for py in 0..sh {
        let sy = source_y + py;
        if sy >= s_height {
            continue;
        }
        for px in 0..sw {
            let sx = source_x + px;
            if sx >= s_stride {
                continue;
            }
            let dx = dest_x + (sh - 1 - py);
            let dy = dest_y + px;
            if dx >= d_stride || dy >= d_height {
                continue;
            }
            copy_pixel(
                dd,
                ((dy * d_stride + dx) * 4) as usize,
                &sd,
                ((sy * s_stride + sx) * 4) as usize,
            );
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Rotates the `source` region 90° counter-clockwise into the `dest` region.
/// `dest`'s dimensions must be swapped relative to `source`. `dest` must not
/// alias `source`.
pub fn rotate_surface_counter_clockwise(dest: &mut SurfaceRegion, source: &SurfaceRegion) {
    let sw = source.width;
    let sh = source.height;
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
    for py in 0..sh {
        let sy = source_y + py;
        if sy >= s_height {
            continue;
        }
        for px in 0..sw {
            let sx = source_x + px;
            if sx >= s_stride {
                continue;
            }
            let dx = dest_x + py;
            let dy = dest_y + (sw - 1 - px);
            if dx >= d_stride || dy >= d_height {
                continue;
            }
            copy_pixel(
                dd,
                ((dy * d_stride + dx) * 4) as usize,
                &sd,
                ((sy * s_stride + sx) * 4) as usize,
            );
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

fn copy_pixel(dest: &mut [u8], di: usize, source: &[u8], si: usize) {
    dest[di] = source[si];
    dest[di + 1] = source[si + 1];
    dest[di + 2] = source[si + 2];
    dest[di + 3] = source[si + 3];
}

fn in_bounds(x: u32, y: u32, width: u32, height: u32) -> bool {
    x < width && y < height
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
    fn rotate_surface180_in_place() {
        let mut surface = create_surface(2, 2, 0);
        set_surface_pixel(&mut surface, 0, 0, 0x11111111);
        set_surface_pixel(&mut surface, 1, 0, 0x22222222);
        set_surface_pixel(&mut surface, 0, 1, 0x33333333);
        set_surface_pixel(&mut surface, 1, 1, 0x44444444);
        let snapshot = surface.clone();
        let mut dest = create_surface_region(surface, 0, 0, 2, 2);
        let source = create_surface_region(snapshot, 0, 0, 2, 2);
        rotate_surface_180(&mut dest, &source);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x44444444);
        assert_eq!(get_surface_pixel(&dest.surface, 1, 1), 0x11111111);
        assert_eq!(get_surface_pixel(&dest.surface, 1, 0), 0x33333333);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 1), 0x22222222);
    }

    #[test]
    fn rotate_surface_clockwise_swaps_dimensions() {
        // 2x1 source -> 1x2 dest. source (0,0)=A,(1,0)=B
        let mut src = create_surface(2, 1, 0);
        set_surface_pixel(&mut src, 0, 0, 0x11111111);
        set_surface_pixel(&mut src, 1, 0, 0x22222222);
        let dst = create_surface(1, 2, 0);
        let source = create_surface_region(src, 0, 0, 2, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 2);
        rotate_surface_clockwise(&mut dest, &source);
        // CW: top row becomes right column. A at (0,0)->dest(0,0); B at (1,0)->dest(0,1)
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x11111111);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 1), 0x22222222);
    }

    #[test]
    fn rotate_surface_counter_clockwise_swaps_dimensions() {
        let mut src = create_surface(2, 1, 0);
        set_surface_pixel(&mut src, 0, 0, 0x11111111);
        set_surface_pixel(&mut src, 1, 0, 0x22222222);
        let dst = create_surface(1, 2, 0);
        let source = create_surface_region(src, 0, 0, 2, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 2);
        rotate_surface_counter_clockwise(&mut dest, &source);
        // CCW: A(0,0)->dest(0, sw-1-0=1); B(1,0)->dest(0,0)
        assert_eq!(get_surface_pixel(&dest.surface, 0, 1), 0x11111111);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x22222222);
    }

    #[test]
    fn rotate_surface_zero_angle_is_copy() {
        let mut src = create_surface(2, 2, 0);
        set_surface_pixel(&mut src, 0, 0, 0xff0000ff);
        set_surface_pixel(&mut src, 1, 1, 0x00ff00ff);
        let dst = create_surface(2, 2, 0);
        let source = create_surface_region(src, 0, 0, 2, 2);
        let mut dest = create_surface_region(dst, 0, 0, 2, 2);
        rotate_surface(&mut dest, &source, 0.0, 0.5, 0.5);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0xff0000ff);
        assert_eq!(get_surface_pixel(&dest.surface, 1, 1), 0x00ff00ff);
    }
}

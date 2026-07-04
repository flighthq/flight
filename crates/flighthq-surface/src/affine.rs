//! Affine transform of a surface region with configurable sampling and edge modes.

use flighthq_types::{SurfaceEdgeMode, SurfaceRegion, SurfaceResizeMode};

/// Applies a 2x3 affine transform to `source`, writing into `dest`.
/// The `matrix` is `[a, b, c, d, e, f]` representing:
///
/// ```text
///   [ a  c  e ]
///   [ b  d  f ]
/// ```
///
/// Maps each `dest` pixel `(x, y)` back to source coordinates:
///
/// ```text
///   srcX = a * x + c * y + e
///   srcY = b * x + d * y + f
/// ```
///
/// `dest` must not alias `source` when their regions overlap.
pub fn transform_surface(
    dest: &mut SurfaceRegion,
    source: &SurfaceRegion,
    matrix: &[f32; 6],
    edge_mode: SurfaceEdgeMode,
    sample_mode: SurfaceResizeMode,
) {
    let dw = dest.width;
    let dh = dest.height;
    let sw = source.width;
    let sh = source.height;
    if dw == 0 || dh == 0 || sw == 0 || sh == 0 {
        return;
    }
    let [a, b, c, d, e, f] = *matrix;
    let sd = source.surface.data.clone();
    let dd = &mut dest.surface.data;
    let s_stride = source.surface.width;
    let d_stride = dest.surface.width;
    let d_surface_height = dest.surface.height;
    for dy in 0..dh {
        let oy = dest.y + dy;
        if oy >= d_surface_height {
            continue;
        }
        for dx in 0..dw {
            let ox = dest.x + dx;
            if ox >= d_stride {
                continue;
            }
            let sx = a * dx as f32 + c * dy as f32 + e;
            let sy = b * dx as f32 + d * dy as f32 + f;
            let di = ((oy * d_stride + ox) * 4) as usize;
            sample_surface(
                dd,
                di,
                &sd,
                sw,
                sh,
                source.x,
                source.y,
                s_stride,
                sx,
                sy,
                sample_mode,
                edge_mode,
            );
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

fn sample_surface(
    dd: &mut [u8],
    di: usize,
    sd: &[u8],
    sw: u32,
    sh: u32,
    origin_x: u32,
    origin_y: u32,
    s_stride: u32,
    sx: f32,
    sy: f32,
    sample_mode: SurfaceResizeMode,
    edge_mode: SurfaceEdgeMode,
) {
    match sample_mode {
        SurfaceResizeMode::Nearest => {
            let ix = sx.round() as i32;
            let iy = sy.round() as i32;
            let cx = resolve_edge(ix, sw as i32, edge_mode);
            let cy = resolve_edge(iy, sh as i32, edge_mode);
            match (cx, cy) {
                (Some(rx), Some(ry)) => {
                    let si = (((origin_y as i32 + ry) as u32 * s_stride + origin_x + rx as u32) * 4)
                        as usize;
                    dd[di] = sd[si];
                    dd[di + 1] = sd[si + 1];
                    dd[di + 2] = sd[si + 2];
                    dd[di + 3] = sd[si + 3];
                }
                _ => write_transparent(dd, di),
            }
        }
        SurfaceResizeMode::Bicubic => {
            sample_bicubic(
                dd, di, sd, sw, sh, origin_x, origin_y, s_stride, sx, sy, edge_mode,
            );
        }
        _ => {
            // Bilinear (default).
            sample_bilinear(
                dd, di, sd, sw, sh, origin_x, origin_y, s_stride, sx, sy, edge_mode,
            );
        }
    }
}

fn sample_bilinear(
    dd: &mut [u8],
    di: usize,
    sd: &[u8],
    sw: u32,
    sh: u32,
    origin_x: u32,
    origin_y: u32,
    s_stride: u32,
    sx: f32,
    sy: f32,
    edge_mode: SurfaceEdgeMode,
) {
    let x0 = sx.floor() as i32;
    let y0 = sy.floor() as i32;
    let tx = sx - x0 as f32;
    let ty = sy - y0 as f32;
    let cx00 = resolve_edge(x0, sw as i32, edge_mode);
    let cx10 = resolve_edge(x0 + 1, sw as i32, edge_mode);
    let cy00 = resolve_edge(y0, sh as i32, edge_mode);
    let cy10 = resolve_edge(y0 + 1, sh as i32, edge_mode);
    for c in 0..4 {
        let v00 = fetch_channel(sd, cx00, cy00, origin_x, origin_y, s_stride, c);
        let v10 = fetch_channel(sd, cx10, cy00, origin_x, origin_y, s_stride, c);
        let v01 = fetch_channel(sd, cx00, cy10, origin_x, origin_y, s_stride, c);
        let v11 = fetch_channel(sd, cx10, cy10, origin_x, origin_y, s_stride, c);
        let top = v00 * (1.0 - tx) + v10 * tx;
        let bottom = v01 * (1.0 - tx) + v11 * tx;
        dd[di + c] = (top * (1.0 - ty) + bottom * ty).round() as u8;
    }
}

fn sample_bicubic(
    dd: &mut [u8],
    di: usize,
    sd: &[u8],
    sw: u32,
    sh: u32,
    origin_x: u32,
    origin_y: u32,
    s_stride: u32,
    sx: f32,
    sy: f32,
    edge_mode: SurfaceEdgeMode,
) {
    let x1 = sx.floor() as i32;
    let y1 = sy.floor() as i32;
    let tx = sx - x1 as f32;
    let ty = sy - y1 as f32;
    for c in 0..4 {
        let mut sum = 0.0f32;
        for m in -1..=2 {
            let wy = catmull_rom_weight(ty - m as f32);
            let ry = resolve_edge(y1 + m, sh as i32, edge_mode);
            for n in -1..=2 {
                let wx = catmull_rom_weight(tx - n as f32);
                let rx = resolve_edge(x1 + n, sw as i32, edge_mode);
                let v = fetch_channel(sd, rx, ry, origin_x, origin_y, s_stride, c);
                sum += v * wy * wx;
            }
        }
        dd[di + c] = sum.round().clamp(0.0, 255.0) as u8;
    }
}

fn fetch_channel(
    sd: &[u8],
    cx: Option<i32>,
    cy: Option<i32>,
    origin_x: u32,
    origin_y: u32,
    s_stride: u32,
    c: usize,
) -> f32 {
    match (cx, cy) {
        (Some(rx), Some(ry)) => {
            let si =
                (((origin_y as i32 + ry) as u32 * s_stride + origin_x + rx as u32) * 4) as usize;
            sd[si + c] as f32
        }
        _ => 0.0,
    }
}

fn resolve_edge(v: i32, size: i32, mode: SurfaceEdgeMode) -> Option<i32> {
    if v >= 0 && v < size {
        return Some(v);
    }
    match mode {
        SurfaceEdgeMode::Clamp => Some(v.clamp(0, size - 1)),
        SurfaceEdgeMode::Wrap => Some(((v % size) + size) % size),
        SurfaceEdgeMode::Mirror => {
            let period = 2 * size;
            let wrapped = ((v % period) + period) % period;
            if wrapped < size {
                Some(wrapped)
            } else {
                Some(period - 1 - wrapped)
            }
        }
        SurfaceEdgeMode::Transparent => None,
    }
}

fn catmull_rom_weight(t: f32) -> f32 {
    let a = t.abs();
    if a >= 2.0 {
        return 0.0;
    }
    if a >= 1.0 {
        return -0.5 * a * a * a + 2.5 * a * a - 4.0 * a + 2.0;
    }
    1.5 * a * a * a - 2.5 * a * a + 1.0
}

fn write_transparent(dd: &mut [u8], di: usize) {
    dd[di] = 0;
    dd[di + 1] = 0;
    dd[di + 2] = 0;
    dd[di + 3] = 0;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::{get_surface_pixel, set_surface_pixel};
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn transform_surface_identity() {
        let src = create_surface(2, 2, 0x11223344);
        let dst = create_surface(2, 2, 0);
        let source = create_surface_region(src, 0, 0, 2, 2);
        let mut dest = create_surface_region(dst, 0, 0, 2, 2);
        // Identity matrix: [1, 0, 0, 1, 0, 0]
        transform_surface(
            &mut dest,
            &source,
            &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            SurfaceEdgeMode::Transparent,
            SurfaceResizeMode::Nearest,
        );
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x11223344);
        assert_eq!(get_surface_pixel(&dest.surface, 1, 1), 0x11223344);
    }

    #[test]
    fn transform_surface_translation() {
        let mut src = create_surface(3, 3, 0);
        set_surface_pixel(&mut src, 0, 0, 0xff0000ff);
        let dst = create_surface(3, 3, 0);
        let source = create_surface_region(src, 0, 0, 3, 3);
        let mut dest = create_surface_region(dst, 0, 0, 3, 3);
        // Translate by (-1, -1): dest(0,0) maps to source(1,1), so dest(1,1) maps to source(0,0).
        // Actually: srcX = 1*x + 0*y + (-1) = x-1, srcY = 0*x + 1*y + (-1) = y-1
        // At dest(1,1): srcX=0, srcY=0 -> source(0,0) = red
        transform_surface(
            &mut dest,
            &source,
            &[1.0, 0.0, 0.0, 1.0, -1.0, -1.0],
            SurfaceEdgeMode::Transparent,
            SurfaceResizeMode::Nearest,
        );
        assert_eq!(get_surface_pixel(&dest.surface, 1, 1), 0xff0000ff);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x00000000);
    }

    #[test]
    fn transform_surface_bilinear_interpolates() {
        let mut src = create_surface(2, 1, 0);
        set_surface_pixel(&mut src, 0, 0, 0x000000ff);
        set_surface_pixel(&mut src, 1, 0, 0xffffff00);
        let dst = create_surface(2, 1, 0);
        let source = create_surface_region(src, 0, 0, 2, 1);
        let mut dest = create_surface_region(dst, 0, 0, 2, 1);
        // Shift by 0.5 in X: dest(0,0) maps to source(0.5, 0) - halfway between pixels.
        transform_surface(
            &mut dest,
            &source,
            &[1.0, 0.0, 0.0, 1.0, 0.5, 0.0],
            SurfaceEdgeMode::Transparent,
            SurfaceResizeMode::Bilinear,
        );
        // At dest(0,0) -> src(0.5,0): blend of (0,0,0,255) and (255,255,255,0) -> ~(128,128,128,128)
        let r = dest.surface.data[0];
        assert!(r > 120 && r < 135);
    }

    #[test]
    fn transform_surface_empty_is_noop() {
        let src = create_surface(0, 0, 0);
        let dst = create_surface(2, 2, 0xaabbccdd);
        let source = create_surface_region(src, 0, 0, 0, 0);
        let mut dest = create_surface_region(dst, 0, 0, 2, 2);
        transform_surface(
            &mut dest,
            &source,
            &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            SurfaceEdgeMode::Transparent,
            SurfaceResizeMode::Nearest,
        );
        // Dest unchanged because source is empty.
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0xaabbccdd);
    }
}

//! Projective homography warp and quad-to-quad warp operations.

use flighthq_types::{SurfaceEdgeMode, SurfaceRegion, SurfaceResizeMode};

/// Applies a 3x3 projective (homography) warp to `source`, writing into
/// `dest`. The `matrix` is a 9-element row-major array:
///
/// ```text
///   [ m0  m1  m2 ]
///   [ m3  m4  m5 ]
///   [ m6  m7  m8 ]
/// ```
///
/// For each `dest` pixel `(x, y)` the inverse matrix is applied:
///
/// ```text
///   w    = m6*x + m7*y + m8
///   srcX = (m0*x + m1*y + m2) / w
///   srcY = (m3*x + m4*y + m5) / w
/// ```
///
/// `dest` must not alias `source` when their regions overlap.
pub fn warp_surface(
    dest: &mut SurfaceRegion,
    source: &SurfaceRegion,
    matrix: &[f32; 9],
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
    let [m0, m1, m2, m3, m4, m5, m6, m7, m8] = *matrix;
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
            let w = m6 * dx as f32 + m7 * dy as f32 + m8;
            let di = ((oy * d_stride + ox) * 4) as usize;
            if w.abs() < 1e-10 {
                write_transparent(dd, di);
                continue;
            }
            let inv_w = 1.0 / w;
            let sx = (m0 * dx as f32 + m1 * dy as f32 + m2) * inv_w;
            let sy = (m3 * dx as f32 + m4 * dy as f32 + m5) * inv_w;
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

/// Warps `source` into `dest` by mapping its four corners to `dst_quad`.
/// `dst_quad` is `[x0, y0, x1, y1, x2, y2, x3, y3]` in dest-region-local
/// coordinates (top-left, top-right, bottom-right, bottom-left).
///
/// Internally computes the homography, inverts it, and delegates to
/// `warp_surface`.
pub fn warp_surface_quad(
    dest: &mut SurfaceRegion,
    source: &SurfaceRegion,
    dst_quad: &[f32; 8],
    edge_mode: SurfaceEdgeMode,
    sample_mode: SurfaceResizeMode,
) {
    let sw = source.width;
    let sh = source.height;
    if sw == 0 || sh == 0 || dest.width == 0 || dest.height == 0 {
        return;
    }
    let src_pts: [f32; 8] = [
        0.0, 0.0, sw as f32, 0.0, sw as f32, sh as f32, 0.0, sh as f32,
    ];
    let h = match compute_homography(&src_pts, dst_quad) {
        Some(h) => h,
        None => return,
    };
    let h_inv = match invert_matrix_3x3(&h) {
        Some(inv) => inv,
        None => return,
    };
    warp_surface(dest, source, &h_inv, edge_mode, sample_mode);
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

/// Computes a homography H such that H * src[i] = dst[i] for 4 point pairs.
/// Points are `[x0, y0, x1, y1, x2, y2, x3, y3]`. Returns `None` if degenerate.
fn compute_homography(src: &[f32; 8], dst: &[f32; 8]) -> Option<[f32; 9]> {
    // Direct Linear Transform (DLT) for 4 point correspondences.
    let mut rows = [[0.0f64; 9]; 8];
    for i in 0..4 {
        let sx = src[i * 2] as f64;
        let sy = src[i * 2 + 1] as f64;
        let dx = dst[i * 2] as f64;
        let dy = dst[i * 2 + 1] as f64;
        rows[i * 2] = [sx, sy, 1.0, 0.0, 0.0, 0.0, -dx * sx, -dx * sy, -dx];
        rows[i * 2 + 1] = [0.0, 0.0, 0.0, sx, sy, 1.0, -dy * sx, -dy * sy, -dy];
    }
    // Extract 8x8 sub-system (h8 = 1 normalization).
    let mut m = [[0.0f64; 8]; 8];
    let mut b = [0.0f64; 8];
    for r in 0..8 {
        for c in 0..8 {
            m[r][c] = rows[r][c];
        }
        b[r] = rows[r][8];
    }
    let h = solve_linear_8(&mut m, &b)?;
    Some([
        h[0] as f32,
        h[1] as f32,
        h[2] as f32,
        h[3] as f32,
        h[4] as f32,
        h[5] as f32,
        h[6] as f32,
        h[7] as f32,
        1.0,
    ])
}

/// Gaussian elimination to solve M*x = b for 8 unknowns.
fn solve_linear_8(m: &mut [[f64; 8]; 8], b: &[f64; 8]) -> Option<[f64; 8]> {
    let n = 8;
    // Augmented matrix [M | -b].
    let mut aug = [[0.0f64; 9]; 8];
    for r in 0..n {
        for c in 0..n {
            aug[r][c] = m[r][c];
        }
        aug[r][n] = -b[r];
    }
    for col in 0..n {
        // Partial pivot.
        let mut max_row = col;
        let mut max_val = aug[col][col].abs();
        for row in (col + 1)..n {
            let v = aug[row][col].abs();
            if v > max_val {
                max_val = v;
                max_row = row;
            }
        }
        if max_val < 1e-12 {
            return None;
        }
        aug.swap(col, max_row);
        let pivot = aug[col][col];
        for row in (col + 1)..n {
            let factor = aug[row][col] / pivot;
            for k in col..=n {
                aug[row][k] -= factor * aug[col][k];
            }
        }
    }
    // Back-substitution.
    let mut x = [0.0f64; 8];
    for row in (0..n).rev() {
        let mut sum = aug[row][n];
        for col in (row + 1)..n {
            sum -= aug[row][col] * x[col];
        }
        x[row] = sum / aug[row][row];
    }
    Some(x)
}

/// Inverts a 3x3 matrix stored as a flat 9-element row-major array.
fn invert_matrix_3x3(m: &[f32; 9]) -> Option<[f32; 9]> {
    let [a, b, c, d, e, f, g, h, k] = *m;
    let det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
    if det.abs() < 1e-12 {
        return None;
    }
    let inv_det = 1.0 / det;
    Some([
        (e * k - f * h) * inv_det,
        (c * h - b * k) * inv_det,
        (b * f - c * e) * inv_det,
        (f * g - d * k) * inv_det,
        (a * k - c * g) * inv_det,
        (c * d - a * f) * inv_det,
        (d * h - e * g) * inv_det,
        (b * g - a * h) * inv_det,
        (a * e - b * d) * inv_det,
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::get_surface_pixel;
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn warp_surface_identity() {
        let src = create_surface(2, 2, 0x11223344);
        let dst = create_surface(2, 2, 0);
        let source = create_surface_region(src, 0, 0, 2, 2);
        let mut dest = create_surface_region(dst, 0, 0, 2, 2);
        // Identity homography.
        warp_surface(
            &mut dest,
            &source,
            &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            SurfaceEdgeMode::Transparent,
            SurfaceResizeMode::Nearest,
        );
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x11223344);
        assert_eq!(get_surface_pixel(&dest.surface, 1, 1), 0x11223344);
    }

    #[test]
    fn warp_surface_degenerate_w() {
        let src = create_surface(2, 2, 0xff0000ff);
        let dst = create_surface(2, 2, 0);
        let source = create_surface_region(src, 0, 0, 2, 2);
        let mut dest = create_surface_region(dst, 0, 0, 2, 2);
        // w = 0 for all pixels -> transparent.
        warp_surface(
            &mut dest,
            &source,
            &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0],
            SurfaceEdgeMode::Transparent,
            SurfaceResizeMode::Nearest,
        );
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0);
    }

    #[test]
    fn warp_surface_empty_noop() {
        let src = create_surface(0, 0, 0);
        let dst = create_surface(2, 2, 0xaabbccdd);
        let source = create_surface_region(src, 0, 0, 0, 0);
        let mut dest = create_surface_region(dst, 0, 0, 2, 2);
        warp_surface(
            &mut dest,
            &source,
            &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            SurfaceEdgeMode::Transparent,
            SurfaceResizeMode::Nearest,
        );
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0xaabbccdd);
    }

    #[test]
    fn warp_surface_quad_identity() {
        let src = create_surface(4, 4, 0xff0000ff);
        let dst = create_surface(4, 4, 0);
        let source = create_surface_region(src, 0, 0, 4, 4);
        let mut dest = create_surface_region(dst, 0, 0, 4, 4);
        // Map source corners to same positions in dest.
        warp_surface_quad(
            &mut dest,
            &source,
            &[0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0],
            SurfaceEdgeMode::Transparent,
            SurfaceResizeMode::Nearest,
        );
        // Interior pixel should be filled.
        assert_eq!(get_surface_pixel(&dest.surface, 1, 1), 0xff0000ff);
    }

    #[test]
    fn invert_matrix_3x3_identity() {
        let id = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
        let inv = invert_matrix_3x3(&id).unwrap();
        for i in 0..9 {
            assert!((inv[i] - id[i]).abs() < 1e-6);
        }
    }

    #[test]
    fn invert_matrix_3x3_singular_returns_none() {
        let singular = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        assert!(invert_matrix_3x3(&singular).is_none());
    }
}

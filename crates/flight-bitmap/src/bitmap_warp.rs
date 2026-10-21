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

    #[test]
    fn bitmapregion_warp_matches_warp_bitmap() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.warp(&test_region(), [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0], BitmapEdgeMode::Clamp, BitmapResizeMode::Bilinear);
        let rb = warp_bitmap(&mut b, &test_region(), [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0], BitmapEdgeMode::Clamp, BitmapResizeMode::Bilinear);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmapregion_warp_quad_matches_warp_bitmap_quad() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.warp_quad(&test_region(), [0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0], BitmapEdgeMode::Clamp, BitmapResizeMode::Bilinear);
        let rb = warp_bitmap_quad(&mut b, &test_region(), [0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0], BitmapEdgeMode::Clamp, BitmapResizeMode::Bilinear);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

// flight-lint: allow(f64) resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1)
fn catmull_rom_weight(t: f64) -> f64 {
    let a = t.abs();
    if a >= 2.0 { return 0.0; }
    if a >= 1.0 { return -0.5 * a * a * a + 2.5 * a * a - 4.0 * a + 2.0; }
    1.5 * a * a * a - 2.5 * a * a + 1.0
}

// flight-lint: allow(f64) perspective homography solve (8x8 linear system / 3x3 inverse) needs double precision
fn compute_homography(src: &[f64; 8], dst: &[f64; 8]) -> Option<[f64; 9]> {
    let mut rows: Vec<[f64; 9]> = Vec::with_capacity(8);
    for i in 0..4 {
        let sx = src[i * 2];
        let sy = src[i * 2 + 1];
        let dx = dst[i * 2];
        let dy = dst[i * 2 + 1];
        rows.push([sx, sy, 1.0, 0.0, 0.0, 0.0, -dx * sx, -dx * sy, -dx]);
        rows.push([0.0, 0.0, 0.0, sx, sy, 1.0, -dy * sx, -dy * sy, -dy]);
    }
    // Extract 8x8 system (h8 = 1 normalization)
    let mut m = [[0.0f64; 9]; 8];
    for r in 0..8 {
        for c in 0..8 { m[r][c] = rows[r][c]; }
        m[r][8] = rows[r][8];
    }
    let h = solve_linear_8(&mut m)?;
    Some([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1.0])
}

// flight-lint: allow(f64) perspective homography solve (8x8 linear system / 3x3 inverse) needs double precision
fn invert_matrix_3x3(m: &[f64; 9]) -> Option<[f64; 9]> {
    let [a, b, c, d, e, f, g, h, k] = *m;
    let det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
    if det.abs() < 1e-12 { return None; }
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

// flight-lint: allow(f64) perspective homography solve (8x8 linear system / 3x3 inverse) needs double precision
fn solve_linear_8(aug: &mut [[f64; 9]; 8]) -> Option<[f64; 8]> {
    let n = 8;
    // Negate the b column
    for r in 0..n { aug[r][8] = -aug[r][8]; }
    for col in 0..n {
        let mut max_row = col;
        let mut max_val = aug[col][col].abs();
        for row in (col + 1)..n {
            let v = aug[row][col].abs();
            if v > max_val { max_val = v; max_row = row; }
        }
        if max_val < 1e-12 { return None; }
        aug.swap(col, max_row);
        let pivot = aug[col][col];
        for row in (col + 1)..n {
            let factor = aug[row][col] / pivot;
            for k in col..=n { aug[row][k] -= factor * aug[col][k]; }
        }
    }
    let mut x = [0.0f64; 8];
    for row in (0..n).rev() {
        let mut sum = aug[row][n];
        for col in (row + 1)..n { sum -= aug[row][col] * x[col]; }
        x[row] = sum / aug[row][row];
    }
    Some(x)
}

/// Applies a full 3x3 projective (homography) warp to `source`, writing into `dest`.
// flight-lint: allow(f64) resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1)
pub fn warp_bitmap(
    dest: &mut BitmapRegion,
    source: &BitmapRegion,
    matrix: [f64; 9],
    edge_mode: BitmapEdgeMode,
    sample_mode: BitmapResizeMode,
) {
    let dw = dest.width as usize;
    let dh = dest.height as usize;
    let sw = source.width as usize;
    let sh = source.height as usize;
    if dw == 0 || dh == 0 || sw == 0 || sh == 0 { return; }
    let [m0, m1, m2, m3, m4, m5, m6, m7, m8] = matrix;
    let sd = source.bitmap.data.clone();
    let d_stride = dest.bitmap.width as usize;
    let s_stride = source.bitmap.width as usize;
    let s_origin_x = source.x as usize;
    let s_origin_y = source.y as usize;
    for dy in 0..dh {
        let oy = (dest.y + dy as i32) as usize;
        if oy >= dest.bitmap.height as usize { continue; }
        for dx in 0..dw {
            let ox = (dest.x + dx as i32) as usize;
            if ox >= d_stride { continue; }
            let w = m6 * dx as f64 + m7 * dy as f64 + m8;
            let di = (oy * d_stride + ox) * 4;
            if w.abs() < 1e-10 {
                dest.bitmap.data[di] = 0;
                dest.bitmap.data[di + 1] = 0;
                dest.bitmap.data[di + 2] = 0;
                dest.bitmap.data[di + 3] = 0;
                continue;
            }
            let inv_w = 1.0 / w;
            let sx = (m0 * dx as f64 + m1 * dy as f64 + m2) * inv_w;
            let sy = (m3 * dx as f64 + m4 * dy as f64 + m5) * inv_w;
            warp_sample_bitmap(
                &mut dest.bitmap.data, di, &sd,
                sw, sh, s_origin_x, s_origin_y, s_stride,
                sx, sy, sample_mode, edge_mode,
            );
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

/// Warps `source` into `dest` by mapping its four corners to the four corners of `dst_quad`.
// flight-lint: allow(f64) perspective homography solve (8x8 linear system / 3x3 inverse) needs double precision
pub fn warp_bitmap_quad(
    dest: &mut BitmapRegion,
    source: &BitmapRegion,
    dst_quad: [f64; 8],
    edge_mode: BitmapEdgeMode,
    sample_mode: BitmapResizeMode,
) {
    let sw = source.width as usize;
    let sh = source.height as usize;
    if sw == 0 || sh == 0 || dest.width == 0 || dest.height == 0 { return; }
    let src_pts: [f64; 8] = [0.0, 0.0, sw as f64, 0.0, sw as f64, sh as f64, 0.0, sh as f64];
    let h_opt = compute_homography(&src_pts, &dst_quad);
    if h_opt.is_none() { return; }
    let h = h_opt.unwrap();
    let h_inv = invert_matrix_3x3(&h);
    if h_inv.is_none() { return; }
    warp_bitmap(dest, source, h_inv.unwrap(), edge_mode, sample_mode);
}

fn warp_resolve_edge(v: i32, size: i32, mode: BitmapEdgeMode) -> Option<i32> {
    if v >= 0 && v < size { return Some(v); }
    match mode {
        BitmapEdgeMode::Clamp => Some(v.max(0).min(size - 1)),
        BitmapEdgeMode::Wrap => Some(((v % size) + size) % size),
        BitmapEdgeMode::Mirror => {
            let period = 2 * size;
            let wrapped = ((v % period) + period) % period;
            if wrapped < size { Some(wrapped) } else { Some(period - 1 - wrapped) }
        }
        _ => None,
    }
}

// flight-lint: allow(f64) resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1)
fn warp_sample_bicubic(
    dd: &mut [u8], di: usize, sd: &[u8],
    sw: usize, sh: usize,
    origin_x: usize, origin_y: usize, s_stride: usize,
    sx: f64, sy: f64,
    edge_mode: BitmapEdgeMode,
) {
    let x1 = sx.floor() as i32;
    let y1 = sy.floor() as i32;
    let tx = sx - sx.floor();
    let ty = sy - sy.floor();
    for c in 0..4 {
        let mut sum = 0.0f64;
        for m in -1i32..=2 {
            let wy = catmull_rom_weight(ty - m as f64);
            let ry = warp_resolve_edge(y1 + m, sh as i32, edge_mode);
            for n in -1i32..=2 {
                let wx = catmull_rom_weight(tx - n as f64);
                let rx = warp_resolve_edge(x1 + n, sw as i32, edge_mode);
                let v = match (rx, ry) {
                    (Some(rx), Some(ry)) => sd[((origin_y + ry as usize) * s_stride + origin_x + rx as usize) * 4 + c] as f64,
                    _ => 0.0,
                };
                sum += v * wy * wx;
            }
        }
        dd[di + c] = sum.round().max(0.0).min(255.0) as u8;
    }
}

// flight-lint: allow(f64) resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1)
fn warp_sample_bilinear(
    dd: &mut [u8], di: usize, sd: &[u8],
    sw: usize, sh: usize,
    origin_x: usize, origin_y: usize, s_stride: usize,
    sx: f64, sy: f64,
    edge_mode: BitmapEdgeMode,
) {
    let x0 = sx.floor() as i32;
    let y0 = sy.floor() as i32;
    let tx = sx - sx.floor();
    let ty = sy - sy.floor();
    let cx00 = warp_resolve_edge(x0, sw as i32, edge_mode);
    let cx10 = warp_resolve_edge(x0 + 1, sw as i32, edge_mode);
    let cy00 = warp_resolve_edge(y0, sh as i32, edge_mode);
    let cy10 = warp_resolve_edge(y0 + 1, sh as i32, edge_mode);
    for c in 0..4 {
        let v00 = match (cx00, cy00) { (Some(x), Some(y)) => sd[((origin_y + y as usize) * s_stride + origin_x + x as usize) * 4 + c] as f64, _ => 0.0 };
        let v10 = match (cx10, cy00) { (Some(x), Some(y)) => sd[((origin_y + y as usize) * s_stride + origin_x + x as usize) * 4 + c] as f64, _ => 0.0 };
        let v01 = match (cx00, cy10) { (Some(x), Some(y)) => sd[((origin_y + y as usize) * s_stride + origin_x + x as usize) * 4 + c] as f64, _ => 0.0 };
        let v11 = match (cx10, cy10) { (Some(x), Some(y)) => sd[((origin_y + y as usize) * s_stride + origin_x + x as usize) * 4 + c] as f64, _ => 0.0 };
        let top = v00 * (1.0 - tx) + v10 * tx;
        let bottom = v01 * (1.0 - tx) + v11 * tx;
        dd[di + c] = (top * (1.0 - ty) + bottom * ty).round() as u8;
    }
}

// flight-lint: allow(f64) resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1)
fn warp_sample_bitmap(
    dd: &mut [u8],
    di: usize,
    sd: &[u8],
    sw: usize,
    sh: usize,
    origin_x: usize,
    origin_y: usize,
    s_stride: usize,
    sx: f64,
    sy: f64,
    sample_mode: BitmapResizeMode,
    edge_mode: BitmapEdgeMode,
) {
    match sample_mode {
        BitmapResizeMode::Nearest => {
            let ix = sx.round() as i32;
            let iy = sy.round() as i32;
            let cx = warp_resolve_edge(ix, sw as i32, edge_mode);
            let cy = warp_resolve_edge(iy, sh as i32, edge_mode);
            match (cx, cy) {
                (Some(cx), Some(cy)) => {
                    let si = ((origin_y + cy as usize) * s_stride + (origin_x + cx as usize)) * 4;
                    dd[di] = sd[si];
                    dd[di + 1] = sd[si + 1];
                    dd[di + 2] = sd[si + 2];
                    dd[di + 3] = sd[si + 3];
                }
                _ => {
                    dd[di] = 0; dd[di + 1] = 0; dd[di + 2] = 0; dd[di + 3] = 0;
                }
            }
        }
        BitmapResizeMode::Bicubic => {
            warp_sample_bicubic(dd, di, sd, sw, sh, origin_x, origin_y, s_stride, sx, sy, edge_mode);
        }
        BitmapResizeMode::Bilinear => {
            warp_sample_bilinear(dd, di, sd, sw, sh, origin_x, origin_y, s_stride, sx, sy, edge_mode);
        }
    }
}

impl BitmapRegion {
    // flight-lint: allow(f64) resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1)
    pub fn warp(&mut self, source: &BitmapRegion, matrix: [f64; 9], edge_mode: BitmapEdgeMode, sample_mode: BitmapResizeMode) {
        return warp_bitmap(self, source, matrix, edge_mode, sample_mode);
    }

    // flight-lint: allow(f64) perspective homography solve (8x8 linear system / 3x3 inverse) needs double precision
    pub fn warp_quad(&mut self, source: &BitmapRegion, dst_quad: [f64; 8], edge_mode: BitmapEdgeMode, sample_mode: BitmapResizeMode) {
        return warp_bitmap_quad(self, source, dst_quad, edge_mode, sample_mode);
    }
}

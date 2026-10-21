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
    fn bitmapregion_transform_matches_transform_bitmap() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.transform(&test_region(), &[1.0, 0.0, 0.0, 1.0, 0.5, 0.5], BitmapEdgeMode::Clamp, BitmapResizeMode::Bilinear);
        let rb = transform_bitmap(&mut b, &test_region(), &[1.0, 0.0, 0.0, 1.0, 0.5, 0.5], BitmapEdgeMode::Clamp, BitmapResizeMode::Bilinear);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

// flight-lint: allow(f64) resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1)
fn catmull_rom_weight(t: f64) -> f64 {
    let a = t.abs();
    if a >= 2.0 {
        0.0
    } else if a >= 1.0 {
        -0.5 * a * a * a + 2.5 * a * a - 4.0 * a + 2.0
    } else {
        1.5 * a * a * a - 2.5 * a * a + 1.0
    }
}

// flight-lint: allow(f64) resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1)
fn sample_bicubic(
    dd: &mut [u8],
    di: usize,
    sd: &[u8],
    sw: i32,
    sh: i32,
    origin_x: i32,
    origin_y: i32,
    s_stride: i32,
    sx: f64,
    sy: f64,
    edge_mode: BitmapEdgeMode,
) {
    let x1 = sx.floor() as i32;
    let y1 = sy.floor() as i32;
    let tx = sx - x1 as f64;
    let ty = sy - y1 as f64;
    for c in 0..4 {
        let mut sum = 0.0f64;
        for m in -1..=2 {
            let wy = catmull_rom_weight(ty - m as f64);
            let ry = resolve_edge(y1 + m, sh, edge_mode);
            for n in -1..=2 {
                let wx = catmull_rom_weight(tx - n as f64);
                let rx = resolve_edge(x1 + n, sw, edge_mode);
                let v = if let (Some(rx), Some(ry)) = (rx, ry) {
                    sd[((origin_y + ry) as usize * s_stride as usize + (origin_x + rx) as usize) * 4 + c] as f64
                } else {
                    0.0
                };
                sum += v * wy * wx;
            }
        }
        dd[di + c] = sum.round().max(0.0).min(255.0) as u8;
    }
}

// flight-lint: allow(f64) resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1)
fn sample_bilinear(
    dd: &mut [u8],
    di: usize,
    sd: &[u8],
    sw: i32,
    sh: i32,
    origin_x: i32,
    origin_y: i32,
    s_stride: i32,
    sx: f64,
    sy: f64,
    edge_mode: BitmapEdgeMode,
) {
    let x0 = sx.floor() as i32;
    let y0 = sy.floor() as i32;
    let tx = sx - x0 as f64;
    let ty = sy - y0 as f64;
    let cx00 = resolve_edge(x0, sw, edge_mode);
    let cx10 = resolve_edge(x0 + 1, sw, edge_mode);
    let cy00 = resolve_edge(y0, sh, edge_mode);
    let cy10 = resolve_edge(y0 + 1, sh, edge_mode);
    for c in 0..4 {
        let v00 = if let (Some(cx), Some(cy)) = (cx00, cy00) {
            sd[((origin_y + cy) as usize * s_stride as usize + (origin_x + cx) as usize) * 4 + c] as f64
        } else {
            0.0
        };
        let v10 = if let (Some(cx), Some(cy)) = (cx10, cy00) {
            sd[((origin_y + cy) as usize * s_stride as usize + (origin_x + cx) as usize) * 4 + c] as f64
        } else {
            0.0
        };
        let v01 = if let (Some(cx), Some(cy)) = (cx00, cy10) {
            sd[((origin_y + cy) as usize * s_stride as usize + (origin_x + cx) as usize) * 4 + c] as f64
        } else {
            0.0
        };
        let v11 = if let (Some(cx), Some(cy)) = (cx10, cy10) {
            sd[((origin_y + cy) as usize * s_stride as usize + (origin_x + cx) as usize) * 4 + c] as f64
        } else {
            0.0
        };
        let top = v00 * (1.0 - tx) + v10 * tx;
        let bottom = v01 * (1.0 - tx) + v11 * tx;
        dd[di + c] = (top * (1.0 - ty) + bottom * ty).round() as u8;
    }
}

// flight-lint: allow(f64) resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1)
fn sample_bitmap(
    dd: &mut [u8],
    di: usize,
    sd: &[u8],
    sw: i32,
    sh: i32,
    origin_x: i32,
    origin_y: i32,
    s_stride: i32,
    _s_height: i32,
    sx: f64,
    sy: f64,
    sample_mode: BitmapResizeMode,
    edge_mode: BitmapEdgeMode,
) {
    match sample_mode {
        BitmapResizeMode::Nearest => {
            let ix = sx.round() as i32;
            let iy = sy.round() as i32;
            let cx = resolve_edge(ix, sw, edge_mode);
            let cy = resolve_edge(iy, sh, edge_mode);
            if let (Some(cx), Some(cy)) = (cx, cy) {
                let si = ((origin_y + cy) as usize * s_stride as usize + (origin_x + cx) as usize) * 4;
                dd[di] = sd[si];
                dd[di + 1] = sd[si + 1];
                dd[di + 2] = sd[si + 2];
                dd[di + 3] = sd[si + 3];
            } else {
                write_transparent(dd, di);
            }
        }
        BitmapResizeMode::Bicubic => {
            sample_bicubic(dd, di, sd, sw, sh, origin_x, origin_y, s_stride, sx, sy, edge_mode);
        }
        BitmapResizeMode::Bilinear => {
            sample_bilinear(dd, di, sd, sw, sh, origin_x, origin_y, s_stride, sx, sy, edge_mode);
        }
    }
}

/// Applies a 2x3 affine transform to source, writing into dest.
/// matrix is [a, b, c, d, e, f] mapping dest pixel (x,y) to source (a*x+c*y+e, b*x+d*y+f).
// flight-lint: allow(f64) resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1)
pub fn transform_bitmap(
    dest: &mut BitmapRegion,
    source: &BitmapRegion,
    matrix: &[f64; 6],
    edge_mode: BitmapEdgeMode,
    sample_mode: BitmapResizeMode,
) {
    let dw = dest.width;
    let dh = dest.height;
    let sw = source.width;
    let sh = source.height;
    if dw == 0 || dh == 0 || sw == 0 || sh == 0 {
        return;
    }
    let [a, b, c, d, e, f] = *matrix;
    let s_stride = source.bitmap.width as i32;
    let d_stride = dest.bitmap.width as i32;
    let s_data = source.bitmap.data.clone();

    for dy in 0..dh {
        let oy = dest.y + dy;
        if oy < 0 || oy >= dest.bitmap.height as i32 {
            continue;
        }
        for dx in 0..dw {
            let ox = dest.x + dx;
            if ox < 0 || ox >= d_stride {
                continue;
            }
            let sx = a * dx as f64 + c * dy as f64 + e;
            let sy = b * dx as f64 + d * dy as f64 + f;
            let di = ((oy as usize) * (d_stride as usize) + (ox as usize)) * 4;
            sample_bitmap(
                &mut dest.bitmap.data,
                di,
                &s_data,
                sw,
                sh,
                source.x,
                source.y,
                s_stride,
                source.bitmap.height as i32,
                sx,
                sy,
                sample_mode,
                edge_mode,
            );
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

fn write_transparent(dd: &mut [u8], di: usize) {
    dd[di] = 0;
    dd[di + 1] = 0;
    dd[di + 2] = 0;
    dd[di + 3] = 0;
}

impl BitmapRegion {
    // flight-lint: allow(f64) resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1)
    pub fn transform(&mut self, source: &BitmapRegion, matrix: &[f64; 6], edge_mode: BitmapEdgeMode, sample_mode: BitmapResizeMode) {
        return transform_bitmap(self, source, matrix, edge_mode, sample_mode);
    }
}

use crate::bitmap::invalidate_bitmap;
use crate::types::*;

/// Resamples the `source` region into the `dest` region.
pub fn resize_bitmap(
    dest: &mut BitmapRegion,
    source: &BitmapRegion,
    mode: BitmapResizeMode,
    edge_mode: BitmapEdgeMode,
    premultiplied: bool,
) {
    let sw = source.width as usize;
    let sh = source.height as usize;
    let dw = dest.width as usize;
    let dh = dest.height as usize;
    if sw == 0 || sh == 0 || dw == 0 || dh == 0 { return; }

    let sd = source.bitmap.data.clone();
    let s_stride = source.bitmap.width as usize;
    let d_stride = dest.bitmap.width as usize;

    match mode {
        BitmapResizeMode::Nearest => {
            for dy in 0..dh {
                let oy = (dest.y + dy as i32) as usize;
                if oy >= dest.bitmap.height as usize { continue; }
                let sy_local = ((dy * sh) / dh).min(sh - 1);
                let sy = (source.y as usize).wrapping_add(sy_local);
                if sy >= source.bitmap.height as usize { continue; }
                for dx in 0..dw {
                    let ox = (dest.x + dx as i32) as usize;
                    if ox >= d_stride { continue; }
                    let sx_local = ((dx * sw) / dw).min(sw - 1);
                    let sx = (source.x as usize).wrapping_add(sx_local);
                    if sx >= s_stride { continue; }
                    let si = (sy * s_stride + sx) * 4;
                    let di = (oy * d_stride + ox) * 4;
                    dest.bitmap.data[di] = sd[si];
                    dest.bitmap.data[di + 1] = sd[si + 1];
                    dest.bitmap.data[di + 2] = sd[si + 2];
                    dest.bitmap.data[di + 3] = sd[si + 3];
                }
            }
        }
        BitmapResizeMode::Bicubic => {
            let scale_x = sw as f64 / dw as f64;
            let scale_y = sh as f64 / dh as f64;
            for dy in 0..dh {
                let oy = (dest.y + dy as i32) as usize;
                if oy >= dest.bitmap.height as usize { continue; }
                let fy = (dy as f64 + 0.5) * scale_y - 0.5;
                let y1 = fy.floor() as i32;
                let ty = fy - fy.floor();
                for dx in 0..dw {
                    let ox = (dest.x + dx as i32) as usize;
                    if ox >= d_stride { continue; }
                    let fx = (dx as f64 + 0.5) * scale_x - 0.5;
                    let x1 = fx.floor() as i32;
                    let tx = fx - fx.floor();
                    let di = (oy * d_stride + ox) * 4;
                    for c in 0..4usize {
                        let mut sum = 0.0f64;
                        for m in -1i32..=2 {
                            let wy = catmull_rom_weight(ty - m as f64);
                            let ry = resolve_resize_edge(y1 + m, sh as i32, edge_mode);
                            for n in -1i32..=2 {
                                let wx = catmull_rom_weight(tx - n as f64);
                                let rx = resolve_resize_edge(x1 + n, sw as i32, edge_mode);
                                if let (Some(rx), Some(ry)) = (rx, ry) {
                                    let sy = source.y as usize + ry as usize;
                                    let sx = source.x as usize + rx as usize;
                                    let si = (sy * s_stride + sx) * 4;
                                    let v = if premultiplied && c < 3 {
                                        (sd[si + c] as f64 * sd[si + 3] as f64) / 255.0
                                    } else {
                                        sd[si + c] as f64
                                    };
                                    sum += v * wy * wx;
                                }
                            }
                        }
                        dest.bitmap.data[di + c] = sum.round().max(0.0).min(255.0) as u8;
                    }
                    if premultiplied {
                        let a = dest.bitmap.data[di + 3];
                        if a > 0 {
                            dest.bitmap.data[di] = ((dest.bitmap.data[di] as f64 * 255.0) / a as f64).round().min(255.0) as u8;
                            dest.bitmap.data[di + 1] = ((dest.bitmap.data[di + 1] as f64 * 255.0) / a as f64).round().min(255.0) as u8;
                            dest.bitmap.data[di + 2] = ((dest.bitmap.data[di + 2] as f64 * 255.0) / a as f64).round().min(255.0) as u8;
                        } else {
                            dest.bitmap.data[di] = 0;
                            dest.bitmap.data[di + 1] = 0;
                            dest.bitmap.data[di + 2] = 0;
                        }
                    }
                }
            }
        }
        BitmapResizeMode::Bilinear => {
            let scale_x = sw as f64 / dw as f64;
            let scale_y = sh as f64 / dh as f64;
            for dy in 0..dh {
                let oy = (dest.y + dy as i32) as usize;
                if oy >= dest.bitmap.height as usize { continue; }
                let fy = (dy as f64 + 0.5) * scale_y - 0.5;
                let y0 = fy.floor() as i32;
                let ty = fy - fy.floor();
                let ry0 = resolve_resize_edge(y0, sh as i32, edge_mode);
                let ry1 = resolve_resize_edge(y0 + 1, sh as i32, edge_mode);
                for dx in 0..dw {
                    let ox = (dest.x + dx as i32) as usize;
                    if ox >= d_stride { continue; }
                    let fx = (dx as f64 + 0.5) * scale_x - 0.5;
                    let x0 = fx.floor() as i32;
                    let tx = fx - fx.floor();
                    let rx0 = resolve_resize_edge(x0, sw as i32, edge_mode);
                    let rx1 = resolve_resize_edge(x0 + 1, sw as i32, edge_mode);
                    let di = (oy * d_stride + ox) * 4;
                    let i00 = idx(&sd, rx0, ry0, source, s_stride);
                    let i10 = idx(&sd, rx1, ry0, source, s_stride);
                    let i01 = idx(&sd, rx0, ry1, source, s_stride);
                    let i11 = idx(&sd, rx1, ry1, source, s_stride);
                    for c in 0..4usize {
                        let mut v00 = i00.map_or(0.0, |i| sd[i + c] as f64);
                        let mut v10 = i10.map_or(0.0, |i| sd[i + c] as f64);
                        let mut v01 = i01.map_or(0.0, |i| sd[i + c] as f64);
                        let mut v11 = i11.map_or(0.0, |i| sd[i + c] as f64);
                        if premultiplied && c < 3 {
                            v00 = i00.map_or(0.0, |i| v00 * sd[i + 3] as f64 / 255.0);
                            v10 = i10.map_or(0.0, |i| v10 * sd[i + 3] as f64 / 255.0);
                            v01 = i01.map_or(0.0, |i| v01 * sd[i + 3] as f64 / 255.0);
                            v11 = i11.map_or(0.0, |i| v11 * sd[i + 3] as f64 / 255.0);
                        }
                        let top = v00 * (1.0 - tx) + v10 * tx;
                        let bottom = v01 * (1.0 - tx) + v11 * tx;
                        dest.bitmap.data[di + c] = (top * (1.0 - ty) + bottom * ty).round() as u8;
                    }
                    if premultiplied {
                        let a = dest.bitmap.data[di + 3];
                        if a > 0 {
                            dest.bitmap.data[di] = ((dest.bitmap.data[di] as f64 * 255.0) / a as f64).round().min(255.0) as u8;
                            dest.bitmap.data[di + 1] = ((dest.bitmap.data[di + 1] as f64 * 255.0) / a as f64).round().min(255.0) as u8;
                            dest.bitmap.data[di + 2] = ((dest.bitmap.data[di + 2] as f64 * 255.0) / a as f64).round().min(255.0) as u8;
                        } else {
                            dest.bitmap.data[di] = 0;
                            dest.bitmap.data[di + 1] = 0;
                            dest.bitmap.data[di + 2] = 0;
                        }
                    }
                }
            }
            invalidate_bitmap(&mut dest.bitmap);
        }
    }
}

fn idx(_sd: &[u8], rx: Option<i32>, ry: Option<i32>, source: &BitmapRegion, s_stride: usize) -> Option<usize> {
    match (rx, ry) {
        (Some(rx), Some(ry)) => {
            let sy = source.y as usize + ry as usize;
            let sx = source.x as usize + rx as usize;
            Some((sy * s_stride + sx) * 4)
        }
        _ => None,
    }
}

fn catmull_rom_weight(t: f64) -> f64 {
    let a = t.abs();
    if a >= 2.0 { return 0.0; }
    if a >= 1.0 { return -0.5 * a * a * a + 2.5 * a * a - 4.0 * a + 2.0; }
    1.5 * a * a * a - 2.5 * a * a + 1.0
}

fn resolve_resize_edge(v: i32, size: i32, mode: BitmapEdgeMode) -> Option<i32> {
    if v >= 0 && v < size { return Some(v); }
    match mode {
        BitmapEdgeMode::Clamp => Some(v.max(0).min(size - 1)),
        BitmapEdgeMode::Wrap => {
            Some(((v % size) + size) % size)
        }
        BitmapEdgeMode::Mirror => {
            let period = 2 * size;
            let wrapped = ((v % period) + period) % period;
            if wrapped < size { Some(wrapped) } else { Some(period - 1 - wrapped) }
        }
        _ => None,
    }
}

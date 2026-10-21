use crate::types::*;

fn apply_morphological(out: &mut [u8], source: &BitmapRegion, radius: i32, dilate: bool) {
    let r = radius.max(0);
    let w = source.width as usize;
    let h = source.height as usize;
    let bitmap_width = source.bitmap.width as usize;
    let bitmap_height = source.bitmap.height as usize;
    let data = &source.bitmap.data;
    let identity: u8 = if dilate { 0 } else { 255 };

    for py in 0..h {
        for px in 0..w {
            let mut v_r = identity;
            let mut v_g = identity;
            let mut v_b = identity;
            let mut v_a = identity;
            for ky in -r..=r {
                let sy = ((source.y as i64 + py as i64 + ky as i64).max(0) as usize)
                    .min(bitmap_height - 1);
                for kx in -r..=r {
                    let sx = ((source.x as i64 + px as i64 + kx as i64).max(0) as usize)
                        .min(bitmap_width - 1);
                    let si = (sy * bitmap_width + sx) * 4;
                    if dilate {
                        if data[si] > v_r {
                            v_r = data[si];
                        }
                        if data[si + 1] > v_g {
                            v_g = data[si + 1];
                        }
                        if data[si + 2] > v_b {
                            v_b = data[si + 2];
                        }
                        if data[si + 3] > v_a {
                            v_a = data[si + 3];
                        }
                    } else {
                        if data[si] < v_r {
                            v_r = data[si];
                        }
                        if data[si + 1] < v_g {
                            v_g = data[si + 1];
                        }
                        if data[si + 2] < v_b {
                            v_b = data[si + 2];
                        }
                        if data[si + 3] < v_a {
                            v_a = data[si + 3];
                        }
                    }
                }
            }
            let di = (py * w + px) * 4;
            out[di] = v_r;
            out[di + 1] = v_g;
            out[di + 2] = v_b;
            out[di + 3] = v_a;
        }
    }
}

/// Applies morphological dilation to `source`, writing into `out`.
// flight-lint: allow(conform-array) pixel ruling (agents/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn dilate_bitmap(out: &mut [u8], source: &BitmapRegion, radius: i32) {
    apply_morphological(out, source, radius, true);
}

/// Applies morphological erosion to `source`, writing into `out`.
// flight-lint: allow(conform-array) pixel ruling (agents/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn erode_bitmap(out: &mut [u8], source: &BitmapRegion, radius: i32) {
    apply_morphological(out, source, radius, false);
}

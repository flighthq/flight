use crate::types::*;

/// Pixelates (mosaics) `source` into `out`.
// flight-lint: allow(conform-array) pixel ruling (agents/rust/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
// flight-lint: allow(f64) integer channel sums over a region exceed f32 exact range (2^24) on large bitmaps; averaged in double before rounding, as TS number does
pub fn pixelate_bitmap(out: &mut [u8], source: &BitmapRegion, block_size: i32) {
    let block = block_size.max(1) as usize;
    let w = source.width as usize;
    let h = source.height as usize;
    let bitmap_width = source.bitmap.width as usize;
    let bitmap_height = source.bitmap.height as usize;
    let data = &source.bitmap.data;

    let mut by = 0;
    while by < h {
        let y_end = (by + block).min(h);
        let mut bx = 0;
        while bx < w {
            let x_end = (bx + block).min(w);
            let mut r = 0u32;
            let mut g = 0u32;
            let mut b = 0u32;
            let mut a = 0u32;
            let mut count = 0u32;
            for py in by..y_end {
                let sy = (source.y + py as i32) as usize;
                if sy >= bitmap_height { continue; }
                for px in bx..x_end {
                    let sx = (source.x + px as i32) as usize;
                    if sx >= bitmap_width { continue; }
                    let si = (sy * bitmap_width + sx) * 4;
                    r += data[si] as u32;
                    g += data[si + 1] as u32;
                    b += data[si + 2] as u32;
                    a += data[si + 3] as u32;
                    count += 1;
                }
            }
            if count == 0 { bx += block; continue; }
            let ar = ((r as f64 / count as f64).round()) as u8;
            let ag = ((g as f64 / count as f64).round()) as u8;
            let ab = ((b as f64 / count as f64).round()) as u8;
            let aa = ((a as f64 / count as f64).round()) as u8;
            for py in by..y_end {
                for px in bx..x_end {
                    let di = (py * w + px) * 4;
                    out[di] = ar;
                    out[di + 1] = ag;
                    out[di + 2] = ab;
                    out[di + 3] = aa;
                }
            }
            bx += block;
        }
        by += block;
    }
}

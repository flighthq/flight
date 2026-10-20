use crate::types::*;

/// Applies a median filter to `source`, writing into `out`.
pub fn median_bitmap(out: &mut [u8], source: &BitmapRegion, radius: i32) {
    let r = radius.max(0) as usize;
    let w = source.width as usize;
    let h = source.height as usize;
    let bitmap_width = source.bitmap.width as usize;
    let bitmap_height = source.bitmap.height as usize;
    let data = &source.bitmap.data;
    let area = (2 * r + 1) * (2 * r + 1);

    let mut rs = vec![0u8; area];
    let mut gs = vec![0u8; area];
    let mut bs = vec![0u8; area];
    let mut a_s = vec![0u8; area];

    for py in 0..h {
        for px in 0..w {
            let mut n = 0usize;
            let ri = r as i32;
            for ky in -ri..=ri {
                let sy = ((source.y as i64 + py as i64 + ky as i64).max(0) as usize).min(bitmap_height - 1);
                for kx in -ri..=ri {
                    let sx = ((source.x as i64 + px as i64 + kx as i64).max(0) as usize).min(bitmap_width - 1);
                    let si = (sy * bitmap_width + sx) * 4;
                    rs[n] = data[si];
                    gs[n] = data[si + 1];
                    bs[n] = data[si + 2];
                    a_s[n] = data[si + 3];
                    n += 1;
                }
            }
            let mid = n >> 1;
            let di = (py * w + px) * 4;
            out[di] = median_of(&mut rs, n, mid);
            out[di + 1] = median_of(&mut gs, n, mid);
            out[di + 2] = median_of(&mut bs, n, mid);
            out[di + 3] = median_of(&mut a_s, n, mid);
        }
    }
}

fn median_of(values: &mut [u8], n: usize, mid: usize) -> u8 {
    // Insertion sort of the first n entries, then return the element at mid.
    for i in 1..n {
        let v = values[i];
        let mut j = i;
        while j > 0 && values[j - 1] > v {
            values[j] = values[j - 1];
            j -= 1;
        }
        values[j] = v;
    }
    values[mid]
}

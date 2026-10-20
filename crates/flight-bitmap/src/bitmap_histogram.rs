use crate::bitmap::invalidate_bitmap;
use crate::bitmap_palette_map::apply_bitmap_palette_map;
use crate::types::*;

/// Applies histogram equalization to `source`, writing into `dest`.
pub fn equalize_bitmap_histogram(dest: &mut BitmapRegion, source: &BitmapRegion) {
    let histogram = get_bitmap_histogram(source);
    let total = (source.width * source.height) as u32;

    apply_bitmap_palette_map(
        dest,
        source,
        Some(&build_equalize_map(&histogram.red, total)),
        Some(&build_equalize_map(&histogram.green, total)),
        Some(&build_equalize_map(&histogram.blue, total)),
        None,
    );
    invalidate_bitmap(&mut dest.bitmap);
}

/// Counts how many pixels in the `source` region fall into each 0..255 value.
pub fn get_bitmap_histogram(source: &BitmapRegion) -> BitmapHistogram {
    let mut red = vec![0u32; 256];
    let mut green = vec![0u32; 256];
    let mut blue = vec![0u32; 256];
    let mut alpha = vec![0u32; 256];
    let data = &source.bitmap.data;
    let bitmap_width = source.bitmap.width as i32;
    for py in 0..source.height {
        let y = source.y + py;
        if y < 0 || y >= source.bitmap.height as i32 { continue; }
        for px in 0..source.width {
            let x = source.x + px;
            if x < 0 || x >= bitmap_width { continue; }
            let i = (y as usize * bitmap_width as usize + x as usize) * 4;
            red[data[i] as usize] += 1;
            green[data[i + 1] as usize] += 1;
            blue[data[i + 2] as usize] += 1;
            alpha[data[i + 3] as usize] += 1;
        }
    }
    BitmapHistogram { red, green, blue, alpha }
}

fn build_equalize_map(bins: &[u32], total: u32) -> Vec<u8> {
    let mut map = vec![0u8; 256];
    let mut cdf = 0u32;
    let mut cdf_min: i64 = -1;
    for i in 0..256 {
        cdf += bins[i];
        if bins[i] > 0 && cdf_min == -1 {
            cdf_min = cdf as i64;
        }
        if total as i64 == cdf_min {
            map[i] = i as u8;
        } else {
            map[i] = (((cdf as f64 - cdf_min as f64) / (total as f64 - cdf_min as f64)) * 255.0).round() as u8;
        }
    }
    map
}

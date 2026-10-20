use crate::types::*;

/// Scans the `source` region for pixels matching `color` under `mask`
/// (`find_color` true) or not matching it (false), and returns the tightest
/// bounding rectangle, or None if none match.
pub fn get_bitmap_color_bounds_rectangle(
    source: &BitmapRegion,
    mask: u32,
    color: u32,
    find_color: bool,
) -> Option<RectangleLike> {
    let data = &source.bitmap.data;
    let bitmap_width = source.bitmap.width as i32;
    let masked_color = color & mask;
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = -1i32;
    let mut max_y = -1i32;

    for py in 0..source.height {
        let y = source.y + py;
        if y < 0 || y >= source.bitmap.height as i32 { continue; }
        for px in 0..source.width {
            let x = source.x + px;
            if x < 0 || x >= bitmap_width { continue; }
            let i = (y as usize * bitmap_width as usize + x as usize) * 4;
            let pixel = (((data[i] as u32) << 24)
                | ((data[i + 1] as u32) << 16)
                | ((data[i + 2] as u32) << 8)
                | (data[i + 3] as u32))
                & mask;
            let matches = pixel == masked_color;
            if matches == find_color {
                if x < min_x { min_x = x; }
                if x > max_x { max_x = x; }
                if y < min_y { min_y = y; }
                if y > max_y { max_y = y; }
            }
        }
    }

    if max_x == -1 {
        None
    } else {
        Some(RectangleLike {
            x: min_x as f64,
            y: min_y as f64,
            width: (max_x - min_x + 1) as f64,
            height: (max_y - min_y + 1) as f64,
        })
    }
}

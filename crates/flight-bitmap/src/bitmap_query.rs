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
    fn bitmapregion_color_bounds_rectangle_matches_get_bitmap_color_bounds_rectangle() {
        let s = test_region();
        let ra = s.color_bounds_rectangle(0xff0000ff, 0xff0000ff, true);
        let rb = get_bitmap_color_bounds_rectangle(&s, 0xff0000ff, 0xff0000ff, true);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

/// Scans the `source` region for pixels matching `color` under `mask`
/// (`find_color` true) or not matching it (false), and returns the tightest
/// bounding rectangle, or None if none match.
// flight-lint: allow(f64) RectangleLike (number) pixel bounds; D8 candidate for flight-geometry Rectangle
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
        if y < 0 || y >= source.bitmap.height as i32 {
            continue;
        }
        for px in 0..source.width {
            let x = source.x + px;
            if x < 0 || x >= bitmap_width {
                continue;
            }
            let i = (y as usize * bitmap_width as usize + x as usize) * 4;
            let pixel = (((data[i] as u32) << 24)
                | ((data[i + 1] as u32) << 16)
                | ((data[i + 2] as u32) << 8)
                | (data[i + 3] as u32))
                & mask;
            let matches = pixel == masked_color;
            if matches == find_color {
                if x < min_x {
                    min_x = x;
                }
                if x > max_x {
                    max_x = x;
                }
                if y < min_y {
                    min_y = y;
                }
                if y > max_y {
                    max_y = y;
                }
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

impl BitmapRegion {
    pub fn color_bounds_rectangle(
        &self,
        mask: u32,
        color: u32,
        find_color: bool,
    ) -> Option<RectangleLike> {
        return get_bitmap_color_bounds_rectangle(self, mask, color, find_color);
    }
}

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
    fn bitmapregion_dissolve_pixels_matches_dissolve_bitmap_pixels() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.dissolve_pixels(&test_region(), 3, 5, 0xff0000ff);
        let rb = dissolve_bitmap_pixels(&mut b, &test_region(), 3, 5, 0xff0000ff);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

/// Dissolves pixels from source into dest in deterministic pseudo-random order.
pub fn dissolve_bitmap_pixels(
    dest: &mut BitmapRegion,
    source: &BitmapRegion,
    seed: u32,
    pixel_count: u32,
    fill_color: u32,
) -> u32 {
    let width = dest.width;
    let height = dest.height;
    let total = (width * height) as u32;
    if total == 0 { return seed; }

    let mut bits = 0u32;
    while (1u32 << bits) < total { bits += 1; }
    let period = 1u32 << bits;
    let mask = period - 1;

    let mut cursor = if seed > period { period } else { seed };
    if pixel_count == 0 { return cursor; }

    let to_fill = std::ptr::eq(&source.bitmap as *const _, &dest.bitmap as *const _)
        && source.x == dest.x
        && source.y == dest.y
        && source.width == dest.width
        && source.height == dest.height;
    // Since we can't use ptr comparison in our IR pattern, use a simpler check:
    // In practice, test for fill mode by checking if source and dest share identical regions.
    // For the Rust-as-IR, we always clone, so we check field equality instead.
    let fill_r = ((fill_color >> 24) & 0xff) as u8;
    let fill_g = ((fill_color >> 16) & 0xff) as u8;
    let fill_b = ((fill_color >> 8) & 0xff) as u8;
    let fill_a = (fill_color & 0xff) as u8;

    let dest_stride = dest.bitmap.width as i32;
    let dest_bh = dest.bitmap.height as i32;
    let source_data = source.bitmap.data.clone();
    let source_stride = source.bitmap.width as i32;
    let source_bh = source.bitmap.height as i32;

    let mut dissolved = 0u32;
    while dissolved < pixel_count && cursor < period {
        let pixel_index = permute_pixel_index(cursor, bits, mask);
        cursor += 1;
        if pixel_index >= total { continue; }
        dissolved += 1;

        let px = (pixel_index % width as u32) as i32;
        let py = (pixel_index / width as u32) as i32;
        let dx = dest.x + px;
        let dy = dest.y + py;
        if dx < 0 || dx >= dest_stride || dy < 0 || dy >= dest_bh { continue; }
        let di = (dy as usize * dest_stride as usize + dx as usize) * 4;

        if to_fill {
            dest.bitmap.data[di] = fill_r;
            dest.bitmap.data[di + 1] = fill_g;
            dest.bitmap.data[di + 2] = fill_b;
            dest.bitmap.data[di + 3] = fill_a;
            continue;
        }

        let sx = source.x + px;
        let sy = source.y + py;
        if sx < 0 || sx >= source_stride || sy < 0 || sy >= source_bh { continue; }
        let si = (sy as usize * source_stride as usize + sx as usize) * 4;
        dest.bitmap.data[di] = source_data[si];
        dest.bitmap.data[di + 1] = source_data[si + 1];
        dest.bitmap.data[di + 2] = source_data[si + 2];
        dest.bitmap.data[di + 3] = source_data[si + 3];
    }

    invalidate_bitmap(&mut dest.bitmap);
    cursor
}

fn permute_pixel_index(cursor: u32, bits: u32, mask: u32) -> u32 {
    let mut v = cursor & mask;
    let shift = if bits > 1 { bits >> 1 } else { 1 };
    v = (v.wrapping_mul(0x9e3779b1)) & mask;
    v ^= v >> shift;
    v = (v.wrapping_mul(0x85ebca77)) & mask;
    v ^= 0x27d4eb2f & mask;
    v & mask
}

impl BitmapRegion {
    pub fn dissolve_pixels(&mut self, source: &BitmapRegion, seed: u32, pixel_count: u32, fill_color: u32) -> u32 {
        return dissolve_bitmap_pixels(self, source, seed, pixel_count, fill_color);
    }
}

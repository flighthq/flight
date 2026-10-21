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
    fn bitmapregion_flip_horizontal_matches_flip_bitmap_horizontal() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.flip_horizontal(&test_region());
        let rb = flip_bitmap_horizontal(&mut b, &test_region());
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmapregion_flip_vertical_matches_flip_bitmap_vertical() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.flip_vertical(&test_region());
        let rb = flip_bitmap_vertical(&mut b, &test_region());
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

fn copy_mirrored(dest: &mut BitmapRegion, source: &BitmapRegion, w: i32, h: i32, mirror_x: bool, mirror_y: bool) {
    let sd = source.bitmap.data.clone();
    let s_stride = source.bitmap.width as usize;
    let d_stride = dest.bitmap.width as usize;
    for py in 0..h {
        let sy = source.y + (if mirror_y { h - 1 - py } else { py });
        let dy = dest.y + py;
        if sy < 0 || sy >= source.bitmap.height as i32 || dy < 0 || dy >= dest.bitmap.height as i32 { continue; }
        for px in 0..w {
            let sx = source.x + (if mirror_x { w - 1 - px } else { px });
            let dx = dest.x + px;
            if sx < 0 || sx >= s_stride as i32 || dx < 0 || dx >= d_stride as i32 { continue; }
            let si = (sy as usize * s_stride + sx as usize) * 4;
            let di = (dy as usize * d_stride + dx as usize) * 4;
            dest.bitmap.data[di] = sd[si];
            dest.bitmap.data[di + 1] = sd[si + 1];
            dest.bitmap.data[di + 2] = sd[si + 2];
            dest.bitmap.data[di + 3] = sd[si + 3];
        }
    }
}

/// Mirrors source left-to-right into dest.
pub fn flip_bitmap_horizontal(dest: &mut BitmapRegion, source: &BitmapRegion) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    if is_same_region(dest, source) {
        let half = w / 2;
        let stride = dest.bitmap.width as usize;
        for py in 0..h {
            let y = dest.y + py;
            if y < 0 || y >= dest.bitmap.height as i32 { continue; }
            for px in 0..half {
                let xa = (dest.x + px) as usize;
                let xb = (dest.x + w - 1 - px) as usize;
                if xa >= stride || xb >= stride { continue; }
                swap_pixels(&mut dest.bitmap.data, (y as usize * stride + xa) * 4, (y as usize * stride + xb) * 4);
            }
        }
        return;
    }
    copy_mirrored(dest, source, w, h, true, false);
    invalidate_bitmap(&mut dest.bitmap);
}

/// Mirrors source top-to-bottom into dest.
pub fn flip_bitmap_vertical(dest: &mut BitmapRegion, source: &BitmapRegion) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    if is_same_region(dest, source) {
        let half = h / 2;
        let stride = dest.bitmap.width as usize;
        for py in 0..half {
            let y_top = (dest.y + py) as usize;
            let y_bottom = (dest.y + h - 1 - py) as usize;
            if y_top >= dest.bitmap.height as usize || y_bottom >= dest.bitmap.height as usize { continue; }
            for px in 0..w {
                let x = (dest.x + px) as usize;
                if x >= stride { continue; }
                swap_pixels(&mut dest.bitmap.data, (y_top * stride + x) * 4, (y_bottom * stride + x) * 4);
            }
        }
        return;
    }
    copy_mirrored(dest, source, w, h, false, true);
    invalidate_bitmap(&mut dest.bitmap);
}

fn is_same_region(a: &BitmapRegion, b: &BitmapRegion) -> bool {
    std::ptr::eq(&a.bitmap as *const _, &b.bitmap as *const _)
        && a.x == b.x && a.y == b.y && a.width == b.width && a.height == b.height
}

fn swap_pixels(data: &mut [u8], a: usize, b: usize) {
    for c in 0..4 {
        let tmp = data[a + c];
        data[a + c] = data[b + c];
        data[b + c] = tmp;
    }
}

impl BitmapRegion {
    pub fn flip_horizontal(&mut self, source: &BitmapRegion) {
        return flip_bitmap_horizontal(self, source);
    }

    pub fn flip_vertical(&mut self, source: &BitmapRegion) {
        return flip_bitmap_vertical(self, source);
    }
}

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
    fn bitmapregion_new_matches_create_bitmap_region() {
        let a = BitmapRegion::new(test_bitmap(), 1, 1, 4, 4);
        let b = create_bitmap_region(test_bitmap(), 1, 1, 4, 4);
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmapregion_set_matches_set_bitmap_region() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.set(test_bitmap(), 1, 1, 4, 4);
        let rb = set_bitmap_region(&mut b, test_bitmap(), 1, 1, 4, 4);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

/// Creates a BitmapRegion covering the whole bitmap (or a specified sub-region).
pub fn create_bitmap_region(
    bitmap: Bitmap,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> BitmapRegion {
    BitmapRegion { bitmap, x, y, width, height }
}

/// Writes region fields into an existing `out` region without allocating.
pub fn set_bitmap_region(
    out: &mut BitmapRegion,
    bitmap: Bitmap,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) {
    out.bitmap = bitmap;
    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;
}

impl BitmapRegion {
    pub fn new(bitmap: Bitmap, x: i32, y: i32, width: i32, height: i32) -> Self {
        return create_bitmap_region(bitmap, x, y, width, height);
    }

    pub fn set(&mut self, bitmap: Bitmap, x: i32, y: i32, width: i32, height: i32) {
        return set_bitmap_region(self, bitmap, x, y, width, height);
    }
}

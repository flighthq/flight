use crate::types::*;

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

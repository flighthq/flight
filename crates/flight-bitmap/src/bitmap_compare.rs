use crate::bitmap::create_bitmap;
use crate::types::*;

/// Compares two bitmaps pixel by pixel. Returns None if identical, or a diff Bitmap.
pub fn compare_bitmap(source: &Bitmap, other: &Bitmap) -> Option<Bitmap> {
    assert!(
        source.width == other.width && source.height == other.height,
        "compareBitmap: bitmap dimensions do not match ({}x{} vs {}x{})",
        source.width, source.height, other.width, other.height
    );

    let mut result = create_bitmap(source.width, source.height, None);
    let mut has_diff = false;

    let mut i = 0;
    while i < source.data.len() {
        let dr = (source.data[i] as i32 - other.data[i] as i32).unsigned_abs() as u8;
        let dg = (source.data[i + 1] as i32 - other.data[i + 1] as i32).unsigned_abs() as u8;
        let db = (source.data[i + 2] as i32 - other.data[i + 2] as i32).unsigned_abs() as u8;
        let da = (source.data[i + 3] as i32 - other.data[i + 3] as i32).unsigned_abs() as u8;
        if dr != 0 || dg != 0 || db != 0 || da != 0 {
            result.data[i] = dr;
            result.data[i + 1] = dg;
            result.data[i + 2] = db;
            result.data[i + 3] = 255;
            has_diff = true;
        }
        i += 4;
    }

    if has_diff { Some(result) } else { None }
}

/// Compares two bitmaps with per-channel tolerance and returns summary metrics.
pub fn get_bitmap_mismatch(
    source: &Bitmap,
    other: &Bitmap,
    channel_tolerance: u32,
) -> BitmapMismatch {
    assert!(
        source.width == other.width && source.height == other.height,
        "getBitmapMismatch: bitmap dimensions do not match ({}x{} vs {}x{})",
        source.width, source.height, other.width, other.height
    );

    let a = &source.data;
    let b = &other.data;
    let total_pixels = (source.width * source.height) as u32;
    let mut mismatched_pixels = 0u32;
    let mut max_channel_delta = 0u32;

    let mut i = 0;
    while i < a.len() {
        let dr = (a[i] as i32 - b[i] as i32).unsigned_abs();
        let dg = (a[i + 1] as i32 - b[i + 1] as i32).unsigned_abs();
        let db = (a[i + 2] as i32 - b[i + 2] as i32).unsigned_abs();
        let da = (a[i + 3] as i32 - b[i + 3] as i32).unsigned_abs();
        let pixel_delta = dr.max(dg).max(db).max(da);
        if pixel_delta > max_channel_delta {
            max_channel_delta = pixel_delta;
        }
        if pixel_delta > channel_tolerance {
            mismatched_pixels += 1;
        }
        i += 4;
    }

    BitmapMismatch {
        mismatched_pixels,
        total_pixels,
        fraction: if total_pixels == 0 { 0.0 } else { mismatched_pixels as f64 / total_pixels as f64 },
        max_channel_delta,
    }
}

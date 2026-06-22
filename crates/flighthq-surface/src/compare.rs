//! Pixel comparison and mismatch metrics between surfaces.

use flighthq_types::{Surface, SurfaceMismatch};

use crate::surface::create_surface;

/// Compares two surfaces pixel by pixel. Returns `None` if they are identical,
/// or a new `Surface` showing per-channel absolute differences (with alpha set
/// to 255 wherever any channel differs). Panics if the surfaces have different
/// dimensions — comparing incompatible surfaces is a programmer error.
pub fn compare_surface(source: &Surface, other: &Surface) -> Option<Surface> {
    if source.width != other.width || source.height != other.height {
        panic!(
            "compare_surface: surface dimensions do not match ({}x{} vs {}x{})",
            source.width, source.height, other.width, other.height
        );
    }

    let mut result = create_surface(source.width, source.height, 0);
    let mut has_diff = false;
    let a = &source.data;
    let b = &other.data;
    let r = &mut result.data;
    let mut i = 0;
    while i < a.len() {
        let dr = (a[i] as i32 - b[i] as i32).unsigned_abs() as u8;
        let dg = (a[i + 1] as i32 - b[i + 1] as i32).unsigned_abs() as u8;
        let db = (a[i + 2] as i32 - b[i + 2] as i32).unsigned_abs() as u8;
        let da = (a[i + 3] as i32 - b[i + 3] as i32).unsigned_abs() as u8;
        if dr != 0 || dg != 0 || db != 0 || da != 0 {
            r[i] = dr;
            r[i + 1] = dg;
            r[i + 2] = db;
            r[i + 3] = 255;
            has_diff = true;
        }
        i += 4;
    }

    if has_diff { Some(result) } else { None }
}

/// Compares two equally-sized surfaces with a per-channel tolerance and returns
/// summary metrics. A pixel is "mismatched" when its largest RGBA channel
/// difference exceeds `channel_tolerance` (0..255). Panics if the surfaces
/// differ in size.
pub fn get_surface_mismatch(
    source: &Surface,
    other: &Surface,
    channel_tolerance: u8,
) -> SurfaceMismatch {
    if source.width != other.width || source.height != other.height {
        panic!(
            "get_surface_mismatch: surface dimensions do not match ({}x{} vs {}x{})",
            source.width, source.height, other.width, other.height
        );
    }

    let a = &source.data;
    let b = &other.data;
    let total_pixels = source.width * source.height;
    let mut mismatched_pixels: u32 = 0;
    let mut max_channel_delta: u8 = 0;

    let mut i = 0;
    while i < a.len() {
        let dr = (a[i] as i32 - b[i] as i32).unsigned_abs() as u8;
        let dg = (a[i + 1] as i32 - b[i + 1] as i32).unsigned_abs() as u8;
        let db = (a[i + 2] as i32 - b[i + 2] as i32).unsigned_abs() as u8;
        let da = (a[i + 3] as i32 - b[i + 3] as i32).unsigned_abs() as u8;
        let pixel_delta = dr.max(dg).max(db).max(da);
        if pixel_delta > max_channel_delta {
            max_channel_delta = pixel_delta;
        }
        if pixel_delta > channel_tolerance {
            mismatched_pixels += 1;
        }
        i += 4;
    }

    let fraction = if total_pixels == 0 {
        0.0
    } else {
        mismatched_pixels as f32 / total_pixels as f32
    };
    SurfaceMismatch {
        mismatched_pixels,
        total_pixels,
        fraction,
        max_channel_delta,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::set_surface_pixel;

    #[test]
    fn compare_surface_identical_returns_none() {
        let a = create_surface(2, 2, 0x11223344);
        let b = create_surface(2, 2, 0x11223344);
        assert!(compare_surface(&a, &b).is_none());
    }

    #[test]
    fn compare_surface_diff_marks_alpha() {
        let a = create_surface(1, 1, 0);
        let mut b = create_surface(1, 1, 0);
        set_surface_pixel(&mut b, 0, 0, 0x0a000000);
        let diff = compare_surface(&a, &b).unwrap();
        assert_eq!(diff.data[0], 0x0a);
        assert_eq!(diff.data[3], 255);
    }

    #[test]
    fn get_surface_mismatch_identical_surfaces() {
        let a = create_surface(2, 2, 0x11223344);
        let b = create_surface(2, 2, 0x11223344);
        let m = get_surface_mismatch(&a, &b, 0);
        assert_eq!(m.mismatched_pixels, 0);
        assert_eq!(m.total_pixels, 4);
        assert_eq!(m.fraction, 0.0);
        assert_eq!(m.max_channel_delta, 0);
    }

    #[test]
    fn get_surface_mismatch_tolerance() {
        let a = create_surface(1, 1, 0);
        let mut b = create_surface(1, 1, 0);
        set_surface_pixel(&mut b, 0, 0, 0x05000000);
        let within = get_surface_mismatch(&a, &b, 10);
        assert_eq!(within.mismatched_pixels, 0);
        assert_eq!(within.max_channel_delta, 5);
        let over = get_surface_mismatch(&a, &b, 2);
        assert_eq!(over.mismatched_pixels, 1);
    }
}

//! Surface coverage measurement — fraction of non-background pixels.

use flighthq_types::Surface;

/// Returns the fraction of pixels (0.0..=1.0) that differ from
/// `background_color` by more than `channel_tolerance` on at least one RGBA
/// channel. `background_color` is a packed `0xRRGGBBAA` value.
/// `channel_tolerance` (0..255) absorbs antialiasing fringe.
pub fn get_surface_coverage(source: &Surface, background_color: u32, channel_tolerance: u8) -> f32 {
    let br = ((background_color >> 24) & 0xff) as i32;
    let bg = ((background_color >> 16) & 0xff) as i32;
    let bb = ((background_color >> 8) & 0xff) as i32;
    let ba = (background_color & 0xff) as i32;
    let data = &source.data;
    let total_pixels = source.width * source.height;
    if total_pixels == 0 {
        return 0.0;
    }
    let tol = channel_tolerance as i32;

    let mut covered: u32 = 0;
    let mut i = 0;
    while i < data.len() {
        if (data[i] as i32 - br).abs() > tol
            || (data[i + 1] as i32 - bg).abs() > tol
            || (data[i + 2] as i32 - bb).abs() > tol
            || (data[i + 3] as i32 - ba).abs() > tol
        {
            covered += 1;
        }
        i += 4;
    }
    covered as f32 / total_pixels as f32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::set_surface_pixel;
    use crate::surface::create_surface;

    #[test]
    fn get_surface_coverage_blank_surface() {
        let s = create_surface(4, 4, 0x000000ff);
        assert_eq!(get_surface_coverage(&s, 0x000000ff, 0), 0.0);
    }

    #[test]
    fn get_surface_coverage_fully_covered() {
        let s = create_surface(4, 4, 0xffffffff);
        assert_eq!(get_surface_coverage(&s, 0x000000ff, 0), 1.0);
    }

    #[test]
    fn get_surface_coverage_partial() {
        let mut s = create_surface(2, 1, 0x000000ff);
        set_surface_pixel(&mut s, 0, 0, 0xffffffff);
        assert_eq!(get_surface_coverage(&s, 0x000000ff, 0), 0.5);
    }
}

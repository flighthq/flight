//! Pixel histogram computation and histogram equalization.

use flighthq_types::{SurfaceHistogram, SurfaceRegion};

use crate::palette_map::apply_surface_palette_map;

/// Applies histogram equalization to `source`, writing into `dest`. Each RGB
/// channel is equalized independently using its CDF, spreading the tonal range
/// across the full 0..255 output. The alpha channel is copied unchanged.
///
/// Safe to pass the same surface and region in `dest` and `source` for
/// in-place equalization.
pub fn equalize_surface_histogram(dest: &mut SurfaceRegion, source: &SurfaceRegion) {
    let histogram = get_surface_histogram(source);
    let total = source.width * source.height;
    let red = build_equalize_map(&histogram.red, total);
    let green = build_equalize_map(&histogram.green, total);
    let blue = build_equalize_map(&histogram.blue, total);
    apply_surface_palette_map(dest, source, Some(&red), Some(&green), Some(&blue), None);
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Counts how many pixels in the `source` region fall into each 0..255 value,
/// per channel, and returns four 256-entry arrays. Region pixels outside the
/// surface are skipped; an empty region yields all-zero bins.
pub fn get_surface_histogram(source: &SurfaceRegion) -> SurfaceHistogram {
    let mut red = vec![0u32; 256];
    let mut green = vec![0u32; 256];
    let mut blue = vec![0u32; 256];
    let mut alpha = vec![0u32; 256];
    let data = &source.surface.data;
    let surface_width = source.surface.width;
    let surface_height = source.surface.height;
    for py in 0..source.height {
        let y = source.y + py;
        if y >= surface_height {
            continue;
        }
        for px in 0..source.width {
            let x = source.x + px;
            if x >= surface_width {
                continue;
            }
            let i = ((y * surface_width + x) * 4) as usize;
            red[data[i] as usize] += 1;
            green[data[i + 1] as usize] += 1;
            blue[data[i + 2] as usize] += 1;
            alpha[data[i + 3] as usize] += 1;
        }
    }
    SurfaceHistogram {
        alpha,
        blue,
        green,
        red,
    }
}

fn build_equalize_map(bins: &[u32], total: u32) -> [u8; 256] {
    let mut map = [0u8; 256];
    let mut cdf: u32 = 0;
    let mut cdf_min: i64 = -1;
    for i in 0..256 {
        cdf += bins[i];
        if bins[i] > 0 && cdf_min == -1 {
            cdf_min = cdf as i64;
        }
        map[i] = if total as i64 == cdf_min {
            i as u8
        } else {
            (((cdf as f64 - cdf_min as f64) / (total as f64 - cdf_min as f64)) * 255.0).round()
                as u8
        };
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::set_surface_pixel;
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn get_surface_histogram_counts_values() {
        let mut surface = create_surface(2, 1, 0);
        set_surface_pixel(&mut surface, 0, 0, 0x00000000);
        set_surface_pixel(&mut surface, 1, 0, 0xff0000ff);
        let region = create_surface_region(surface, 0, 0, 2, 1);
        let h = get_surface_histogram(&region);
        assert_eq!(h.red[0], 1);
        assert_eq!(h.red[255], 1);
        assert_eq!(h.alpha[0], 1);
        assert_eq!(h.alpha[255], 1);
    }

    #[test]
    fn get_surface_histogram_empty_region() {
        let surface = create_surface(4, 4, 0x112233ff);
        let region = create_surface_region(surface, 0, 0, 0, 0);
        let h = get_surface_histogram(&region);
        assert!(h.red.iter().all(|&v| v == 0));
        assert!(h.alpha.iter().all(|&v| v == 0));
    }

    #[test]
    fn equalize_surface_histogram_spreads_range() {
        // A surface whose values cluster low should spread toward full range.
        let mut surface = create_surface(4, 1, 0);
        set_surface_pixel(&mut surface, 0, 0, 0x000000ff);
        set_surface_pixel(&mut surface, 1, 0, 0x101010ff);
        set_surface_pixel(&mut surface, 2, 0, 0x202020ff);
        set_surface_pixel(&mut surface, 3, 0, 0x303030ff);
        let snapshot = surface.clone();
        let mut dest = create_surface_region(surface, 0, 0, 4, 1);
        let source = create_surface_region(snapshot, 0, 0, 4, 1);
        equalize_surface_histogram(&mut dest, &source);
        // The brightest input maps to the top of the range.
        assert_eq!(dest.surface.data[3 * 4], 255);
        // Alpha is preserved.
        assert_eq!(dest.surface.data[3], 255);
    }
}

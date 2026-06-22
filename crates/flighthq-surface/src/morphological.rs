//! Morphological image operations: dilation and erosion.

use flighthq_types::SurfaceRegion;

/// Applies morphological dilation to `source`, writing into `out`. Each output
/// channel is the maximum of that channel over the `(2 * radius + 1)²`
/// neighbourhood; all four channels (RGBA) are dilated independently.
///
/// `out` must be at least `source.width * source.height * 4` bytes and must
/// NOT alias `source.surface.data` — each output pixel reads a neighbourhood
/// of source pixels.
pub fn dilate_surface(out: &mut [u8], source: &SurfaceRegion, radius: u32) {
    apply_morphological(out, source, radius, true);
}

/// Applies morphological erosion to `source`, writing into `out`. Each output
/// channel is the minimum of that channel over the `(2 * radius + 1)²`
/// neighbourhood; all four channels (RGBA) are eroded independently.
///
/// `out` must be at least `source.width * source.height * 4` bytes and must
/// NOT alias `source.surface.data`.
pub fn erode_surface(out: &mut [u8], source: &SurfaceRegion, radius: u32) {
    apply_morphological(out, source, radius, false);
}

fn apply_morphological(out: &mut [u8], source: &SurfaceRegion, radius: u32, dilate: bool) {
    let r = radius as i64;
    let w = source.width;
    let h = source.height;
    let surface_width = source.surface.width as i64;
    let surface_height = source.surface.height as i64;
    let data = &source.surface.data;
    let identity: u8 = if dilate { 0 } else { 255 };

    for py in 0..h {
        for px in 0..w {
            let mut v_r = identity;
            let mut v_g = identity;
            let mut v_b = identity;
            let mut v_a = identity;
            for ky in -r..=r {
                let sy = (source.y as i64 + py as i64 + ky).clamp(0, surface_height - 1);
                for kx in -r..=r {
                    let sx = (source.x as i64 + px as i64 + kx).clamp(0, surface_width - 1);
                    let si = ((sy * surface_width + sx) * 4) as usize;
                    if dilate {
                        if data[si] > v_r {
                            v_r = data[si];
                        }
                        if data[si + 1] > v_g {
                            v_g = data[si + 1];
                        }
                        if data[si + 2] > v_b {
                            v_b = data[si + 2];
                        }
                        if data[si + 3] > v_a {
                            v_a = data[si + 3];
                        }
                    } else {
                        if data[si] < v_r {
                            v_r = data[si];
                        }
                        if data[si + 1] < v_g {
                            v_g = data[si + 1];
                        }
                        if data[si + 2] < v_b {
                            v_b = data[si + 2];
                        }
                        if data[si + 3] < v_a {
                            v_a = data[si + 3];
                        }
                    }
                }
            }
            let di = ((py * w + px) * 4) as usize;
            out[di] = v_r;
            out[di + 1] = v_g;
            out[di + 2] = v_b;
            out[di + 3] = v_a;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::set_surface_pixel;
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn dilate_surface_radius_zero_is_copy() {
        let mut surface = create_surface(2, 1, 0);
        set_surface_pixel(&mut surface, 0, 0, 0x11223344);
        set_surface_pixel(&mut surface, 1, 0, 0x55667788);
        let expected = surface.data.clone();
        let region = create_surface_region(surface, 0, 0, 2, 1);
        let mut out = vec![0u8; 8];
        dilate_surface(&mut out, &region, 0);
        assert_eq!(out, expected);
    }

    #[test]
    fn erode_surface_radius_zero_is_copy() {
        let mut surface = create_surface(2, 1, 0);
        set_surface_pixel(&mut surface, 0, 0, 0x11223344);
        set_surface_pixel(&mut surface, 1, 0, 0x55667788);
        let expected = surface.data.clone();
        let region = create_surface_region(surface, 0, 0, 2, 1);
        let mut out = vec![0u8; 8];
        erode_surface(&mut out, &region, 0);
        assert_eq!(out, expected);
    }

    #[test]
    fn dilate_surface_expands_bright_pixel() {
        // A single bright pixel in a black field spreads to neighbours.
        let mut surface = create_surface(3, 1, 0x000000ff);
        set_surface_pixel(&mut surface, 1, 0, 0xffffffff);
        let region = create_surface_region(surface, 0, 0, 3, 1);
        let mut out = vec![0u8; 12];
        dilate_surface(&mut out, &region, 1);
        // every pixel's RGB becomes 255 (max over neighbourhood including bright)
        assert_eq!(out[0], 255);
        assert_eq!(out[4], 255);
        assert_eq!(out[8], 255);
    }

    #[test]
    fn erode_surface_shrinks_bright_pixel() {
        let mut surface = create_surface(3, 1, 0xffffffff);
        set_surface_pixel(&mut surface, 1, 0, 0x000000ff);
        let region = create_surface_region(surface, 0, 0, 3, 1);
        let mut out = vec![0u8; 12];
        erode_surface(&mut out, &region, 1);
        // every pixel's RGB becomes 0 (min over neighbourhood including dark)
        assert_eq!(out[0], 0);
        assert_eq!(out[4], 0);
        assert_eq!(out[8], 0);
    }
}

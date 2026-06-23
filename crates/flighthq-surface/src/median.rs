//! Median filter — edge-preserving noise reduction.

use flighthq_types::SurfaceRegion;

/// Applies a median filter to `source`, writing into `out`. Each output
/// channel is the median of that channel over the `(2 * radius + 1)²`
/// neighborhood, clamped at the surface edges. Median filtering removes
/// salt-and-pepper noise while preserving edges.
///
/// `out` must be at least `source.width * source.height * 4` bytes and must
/// NOT alias `source.surface.data`.
pub fn median_surface(out: &mut [u8], source: &SurfaceRegion, radius: u32) {
    let r = radius as i64;
    let w = source.width as i64;
    let h = source.height as i64;
    let surface_width = source.surface.width as i64;
    let surface_height = source.surface.height as i64;
    let data = &source.surface.data;
    let area = ((2 * r + 1) * (2 * r + 1)) as usize;

    let mut rs = vec![0_u8; area];
    let mut gs = vec![0_u8; area];
    let mut bs = vec![0_u8; area];
    let mut a_s = vec![0_u8; area];

    for py in 0..h {
        for px in 0..w {
            let mut n = 0_usize;
            for ky in -r..=r {
                let sy = (source.y as i64 + py + ky).clamp(0, surface_height - 1);
                for kx in -r..=r {
                    let sx = (source.x as i64 + px + kx).clamp(0, surface_width - 1);
                    let si = ((sy * surface_width + sx) * 4) as usize;
                    rs[n] = data[si];
                    gs[n] = data[si + 1];
                    bs[n] = data[si + 2];
                    a_s[n] = data[si + 3];
                    n += 1;
                }
            }
            let mid = n >> 1;
            let di = ((py * w + px) * 4) as usize;
            out[di] = median_of(&mut rs, n, mid);
            out[di + 1] = median_of(&mut gs, n, mid);
            out[di + 2] = median_of(&mut bs, n, mid);
            out[di + 3] = median_of(&mut a_s, n, mid);
        }
    }
}

// Insertion sort of the first `n` entries, then return the element at `mid`.
fn median_of(values: &mut [u8], n: usize, mid: usize) -> u8 {
    for i in 1..n {
        let v = values[i];
        let mut j = i;
        while j > 0 && values[j - 1] > v {
            values[j] = values[j - 1];
            j -= 1;
        }
        values[j] = v;
    }
    values[mid]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::create_surface;
    use flighthq_types::SurfaceRegion;

    fn region(surface: flighthq_types::Surface) -> SurfaceRegion {
        let width = surface.width;
        let height = surface.height;
        SurfaceRegion {
            surface,
            x: 0,
            y: 0,
            width,
            height,
        }
    }

    #[test]
    fn median_surface_radius_zero_is_copy() {
        let source = create_surface(1, 1, 0x123456ff);
        let mut out = vec![0_u8; 4];
        median_surface(&mut out, &region(source), 0);
        assert_eq!(out[0], 0x12);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn median_surface_removes_impulse_noise() {
        // 3x3 of black (opaque) with a single white (R=255) center; median black.
        let mut source = create_surface(3, 3, 0);
        for i in 0..9 {
            source.data[i * 4 + 3] = 255;
        }
        source.data[4 * 4] = 255;
        let mut out = vec![0_u8; 36];
        median_surface(&mut out, &region(source), 1);
        assert_eq!(out[4 * 4], 0);
    }

    #[test]
    fn median_surface_preserves_hard_edge() {
        let mut source = create_surface(4, 1, 0);
        source.data[0] = 0;
        source.data[4] = 0;
        source.data[8] = 255;
        source.data[12] = 255;
        let mut out = vec![0_u8; 16];
        median_surface(&mut out, &region(source), 1);
        assert_eq!(out[4], 0);
        assert_eq!(out[8], 255);
    }
}

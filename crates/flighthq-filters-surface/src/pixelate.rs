//! Pixelate (mosaic) filter — block-averaging to produce a pixelated effect.

use flighthq_types::SurfaceRegion;

/// Pixelates (mosaics) `source` into `out`: the region is divided into
/// `block_size × block_size` cells, each cell is averaged, and every output
/// pixel in the cell takes that average color. `block_size` is clamped to at
/// least 1 (a no-op copy at 1). Edge cells are clipped to the region.
///
/// `out` must be at least `source.width * source.height * 4` bytes. Safe to
/// pass `source.surface.data` as `out` for a full-surface region — each cell
/// is fully read before it is written.
pub fn apply_surface_pixelate_filter(out: &mut [u8], source: &SurfaceRegion, block_size: u32) {
    let block = block_size.max(1);
    let w = source.width;
    let h = source.height;
    let surface_width = source.surface.width;
    let surface_height = source.surface.height;
    let data = &source.surface.data;

    let mut by = 0;
    while by < h {
        let y_end = (by + block).min(h);
        let mut bx = 0;
        while bx < w {
            let x_end = (bx + block).min(w);
            let mut r = 0_u64;
            let mut g = 0_u64;
            let mut b = 0_u64;
            let mut a = 0_u64;
            let mut count = 0_u64;
            for py in by..y_end {
                let sy = source.y + py;
                if sy >= surface_height {
                    continue;
                }
                for px in bx..x_end {
                    let sx = source.x + px;
                    if sx >= surface_width {
                        continue;
                    }
                    let si = ((sy * surface_width + sx) * 4) as usize;
                    r += data[si] as u64;
                    g += data[si + 1] as u64;
                    b += data[si + 2] as u64;
                    a += data[si + 3] as u64;
                    count += 1;
                }
            }
            if count != 0 {
                let ar = div_round(r, count);
                let ag = div_round(g, count);
                let ab = div_round(b, count);
                let aa = div_round(a, count);
                for py in by..y_end {
                    for px in bx..x_end {
                        let di = ((py * w + px) * 4) as usize;
                        out[di] = ar;
                        out[di + 1] = ag;
                        out[di + 2] = ab;
                        out[di + 3] = aa;
                    }
                }
            }
            bx += block;
        }
        by += block;
    }
}

fn div_round(numerator: u64, denominator: u64) -> u8 {
    (numerator as f64 / denominator as f64).round() as u8
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_surface::create_surface;
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
    fn apply_surface_pixelate_filter_block_one_is_copy() {
        let mut source = create_surface(2, 1, 0);
        source.data[0] = 10;
        source.data[4] = 200;
        let mut out = vec![0_u8; 8];
        apply_surface_pixelate_filter(&mut out, &region(source), 1);
        assert_eq!(out[0], 10);
        assert_eq!(out[4], 200);
    }

    #[test]
    fn apply_surface_pixelate_filter_averages_block() {
        let mut source = create_surface(2, 1, 0);
        source.data[0] = 0;
        source.data[4] = 100;
        source.data[3] = 255;
        source.data[7] = 255;
        let mut out = vec![0_u8; 8];
        apply_surface_pixelate_filter(&mut out, &region(source), 2);
        assert_eq!(out[0], 50);
        assert_eq!(out[4], 50);
    }
}

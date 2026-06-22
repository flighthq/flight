//! Spatial queries on surface pixel data.

use flighthq_types::{RectangleLike, SurfaceRegion};

/// Scans the `source` region for pixels matching `color` under `mask`
/// (`find_color` true) or not matching it (false), and returns the tightest
/// bounding rectangle of those pixels in surface-absolute coordinates, or
/// `None` if none match.
///
/// The comparison is performed on the full packed `0xRRGGBBAA` pixel value. To
/// match by a subset of channels, supply a `mask` that isolates the relevant
/// bytes — e.g. `0xffffff00` to ignore alpha.
pub fn get_surface_color_bounds_rectangle(
    source: &SurfaceRegion,
    mask: u32,
    color: u32,
    find_color: bool,
) -> Option<RectangleLike> {
    let data = &source.surface.data;
    let surface_width = source.surface.width;
    let surface_height = source.surface.height;
    let masked_color = color & mask;
    let mut min_x = u32::MAX;
    let mut min_y = u32::MAX;
    let mut max_x: i64 = -1;
    let mut max_y: i64 = -1;

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
            let pixel = (((data[i] as u32) << 24)
                | ((data[i + 1] as u32) << 16)
                | ((data[i + 2] as u32) << 8)
                | (data[i + 3] as u32))
                & mask;
            let matches = pixel == masked_color;
            if matches == find_color {
                if x < min_x {
                    min_x = x;
                }
                if x as i64 > max_x {
                    max_x = x as i64;
                }
                if y < min_y {
                    min_y = y;
                }
                if y as i64 > max_y {
                    max_y = y as i64;
                }
            }
        }
    }

    if max_x == -1 {
        return None;
    }
    Some(RectangleLike {
        x: min_x as f32,
        y: min_y as f32,
        width: (max_x - min_x as i64 + 1) as f32,
        height: (max_y - min_y as i64 + 1) as f32,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::set_surface_pixel;
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn get_surface_color_bounds_rectangle_no_match_returns_none() {
        let surface = create_surface(4, 4, 0);
        let region = create_surface_region(surface, 0, 0, 4, 4);
        let r = get_surface_color_bounds_rectangle(&region, 0xffffffff, 0xff0000ff, true);
        assert!(r.is_none());
    }

    #[test]
    fn get_surface_color_bounds_rectangle_finds_bounds() {
        let mut surface = create_surface(4, 4, 0);
        set_surface_pixel(&mut surface, 1, 1, 0xff0000ff);
        set_surface_pixel(&mut surface, 2, 2, 0xff0000ff);
        let region = create_surface_region(surface, 0, 0, 4, 4);
        let r = get_surface_color_bounds_rectangle(&region, 0xffffffff, 0xff0000ff, true).unwrap();
        assert_eq!(r.x, 1.0);
        assert_eq!(r.y, 1.0);
        assert_eq!(r.width, 2.0);
        assert_eq!(r.height, 2.0);
    }
}

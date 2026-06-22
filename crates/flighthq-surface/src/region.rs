//! Surface region allocation and mutation helpers.

use flighthq_types::{Surface, SurfaceRegion};

/// Allocates a `SurfaceRegion`. With no bounds it covers the whole surface.
///
/// Region functions read these fields synchronously and never retain the
/// object, so in a hot loop you can allocate one region up front and reuse it
/// with `set_surface_region` instead of creating a new one per call.
pub fn create_surface_region(
    surface: Surface,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> SurfaceRegion {
    SurfaceRegion {
        surface,
        x,
        y,
        width,
        height,
    }
}

/// Writes region fields into an existing `out` region without allocating.
/// Use this to thread a single reusable region through a hot loop.
pub fn set_surface_region(
    out: &mut SurfaceRegion,
    surface: Surface,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) {
    out.surface = surface;
    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::surface::create_surface;

    #[test]
    fn create_surface_region_full_surface() {
        let surface = create_surface(4, 3, 0);
        let r = create_surface_region(surface, 0, 0, 4, 3);
        assert_eq!(r.x, 0);
        assert_eq!(r.y, 0);
        assert_eq!(r.width, 4);
        assert_eq!(r.height, 3);
    }

    #[test]
    fn set_surface_region_updates_in_place() {
        let surface = create_surface(8, 8, 0);
        let mut r = create_surface_region(surface.clone(), 0, 0, 8, 8);
        set_surface_region(&mut r, surface, 2, 3, 4, 5);
        assert_eq!(r.x, 2);
        assert_eq!(r.y, 3);
        assert_eq!(r.width, 4);
        assert_eq!(r.height, 5);
    }
}

//! Per-channel lookup table (palette map) remapping for surfaces.

use flighthq_types::SurfaceRegion;

/// Remaps each color channel of `source` independently through a 256-entry
/// lookup table, writing into `dest`. Each table is indexed by the 0..255
/// input channel value and supplies the 0..255 output value; a `None` table
/// leaves that channel unchanged. The remapped size is the overlap of the two
/// regions.
///
/// Safe to pass the same surface and region in `dest` and `source` — each
/// pixel's channels are read before any channel of that pixel is written.
pub fn apply_surface_palette_map(
    dest: &mut SurfaceRegion,
    source: &SurfaceRegion,
    red_map: Option<&[u8; 256]>,
    green_map: Option<&[u8; 256]>,
    blue_map: Option<&[u8; 256]>,
    alpha_map: Option<&[u8; 256]>,
) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    let s_width = source.surface.width;
    let s_height = source.surface.height;
    let d_width = dest.surface.width;
    let d_height = dest.surface.height;
    let source_x = source.x;
    let source_y = source.y;
    let dest_x = dest.x;
    let dest_y = dest.y;
    let sd = source.surface.data.clone();
    let dd = &mut dest.surface.data;
    for py in 0..h {
        let sy = source_y + py;
        let dy = dest_y + py;
        if sy >= s_height || dy >= d_height {
            continue;
        }
        for px in 0..w {
            let sx = source_x + px;
            let dx = dest_x + px;
            if sx >= s_width || dx >= d_width {
                continue;
            }
            let si = ((sy * s_width + sx) * 4) as usize;
            let di = ((dy * d_width + dx) * 4) as usize;
            let r = sd[si];
            let g = sd[si + 1];
            let b = sd[si + 2];
            let a = sd[si + 3];
            dd[di] = red_map.map_or(r, |m| m[r as usize]);
            dd[di + 1] = green_map.map_or(g, |m| m[g as usize]);
            dd[di + 2] = blue_map.map_or(b, |m| m[b as usize]);
            dd[di + 3] = alpha_map.map_or(a, |m| m[a as usize]);
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::{get_surface_pixel, set_surface_pixel};
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn apply_surface_palette_map_identity_maps() {
        let mut identity = [0u8; 256];
        for (i, v) in identity.iter_mut().enumerate() {
            *v = i as u8;
        }
        let mut src = create_surface(1, 1, 0);
        set_surface_pixel(&mut src, 0, 0, 0x11223344);
        let dst = create_surface(1, 1, 0);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        apply_surface_palette_map(
            &mut dest,
            &source,
            Some(&identity),
            Some(&identity),
            Some(&identity),
            Some(&identity),
        );
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x11223344);
    }

    #[test]
    fn apply_surface_palette_map_invert_red() {
        let mut invert = [0u8; 256];
        for (i, v) in invert.iter_mut().enumerate() {
            *v = (255 - i) as u8;
        }
        let mut src = create_surface(1, 1, 0);
        set_surface_pixel(&mut src, 0, 0, 0x00ffffff);
        let dst = create_surface(1, 1, 0);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        apply_surface_palette_map(&mut dest, &source, Some(&invert), None, None, None);
        // red 0x00 -> 0xff, other channels unchanged
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0xffffffff);
    }

    #[test]
    fn apply_surface_palette_map_in_place() {
        let mut invert = [0u8; 256];
        for (i, v) in invert.iter_mut().enumerate() {
            *v = (255 - i) as u8;
        }
        let mut surface = create_surface(1, 1, 0);
        set_surface_pixel(&mut surface, 0, 0, 0x10203040);
        let snapshot = surface.clone();
        let mut dest = create_surface_region(surface, 0, 0, 1, 1);
        let source = create_surface_region(snapshot, 0, 0, 1, 1);
        apply_surface_palette_map(&mut dest, &source, Some(&invert), None, None, None);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0xef203040);
    }
}

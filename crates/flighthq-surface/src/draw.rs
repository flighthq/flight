//! `draw_surface` — blit a surface region onto a destination surface.

use flighthq_types::{Surface, SurfaceRegion};

use crate::composite::extract_surface_pixels;

/// Blits the `source` region onto `dest` at `(x, y)`, overwriting destination
/// pixels (no alpha blending).
///
/// The web `drawSurface` extracts the region into an `ImageData` and writes it
/// onto a 2D canvas via `putImageData`, which replaces — rather than composites
/// — the destination pixels. This native port has the same overwrite semantics,
/// writing directly into the destination `Surface` buffer. Use
/// `composite_surface_region` when you want alpha compositing instead.
///
/// `x`/`y` may be negative; any part of the region falling outside `dest` is
/// clipped. A region with a zero dimension is a no-op (matching the web path,
/// where `ImageData` requires positive dimensions). `dest.version` is bumped
/// only when at least one pixel is written.
pub fn draw_surface(dest: &mut Surface, source: &SurfaceRegion, x: i32, y: i32) {
    if source.width == 0 || source.height == 0 {
        return;
    }
    let mut pixels = vec![0u8; (source.width as usize) * (source.height as usize) * 4];
    extract_surface_pixels(&mut pixels, source);

    let dest_width = dest.width as i32;
    let dest_height = dest.height as i32;
    let mut wrote = false;
    for py in 0..source.height as i32 {
        let dy = y + py;
        if dy < 0 || dy >= dest_height {
            continue;
        }
        for px in 0..source.width as i32 {
            let dx = x + px;
            if dx < 0 || dx >= dest_width {
                continue;
            }
            let si = ((py * source.width as i32 + px) * 4) as usize;
            let di = ((dy * dest_width + dx) * 4) as usize;
            dest.data[di] = pixels[si];
            dest.data[di + 1] = pixels[si + 1];
            dest.data[di + 2] = pixels[si + 2];
            dest.data[di + 3] = pixels[si + 3];
            wrote = true;
        }
    }
    if wrote {
        dest.version = dest.version.wrapping_add(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    fn region(surface: Surface) -> SurfaceRegion {
        let (w, h) = (surface.width, surface.height);
        create_surface_region(surface, 0, 0, w, h)
    }

    #[test]
    fn draw_surface_writes_the_source_onto_the_destination() {
        let mut dest = create_surface(4, 4, 0);
        let src = region(create_surface(2, 2, 0x112233ff));
        draw_surface(&mut dest, &src, 0, 0);
        assert_eq!(&dest.data[0..4], &[0x11, 0x22, 0x33, 0xff]);
        // Outside the blit stays transparent.
        let last = dest.data.len() - 4;
        assert_eq!(&dest.data[last..], &[0, 0, 0, 0]);
    }

    #[test]
    fn draw_surface_writes_at_an_offset() {
        let mut dest = create_surface(8, 8, 0);
        let src = region(create_surface(2, 2, 0x44556677));
        draw_surface(&mut dest, &src, 2, 2);
        // (0,0) untouched; (2,2) holds the source pixel.
        assert_eq!(&dest.data[0..4], &[0, 0, 0, 0]);
        let di = ((2 * 8 + 2) * 4) as usize;
        assert_eq!(&dest.data[di..di + 4], &[0x44, 0x55, 0x66, 0x77]);
    }

    #[test]
    fn draw_surface_overwrites_rather_than_blends() {
        let mut dest = create_surface(2, 2, 0xff0000ff);
        // Half-transparent green source; overwrite means the green wins outright.
        let src = region(create_surface(2, 2, 0x00ff0080));
        draw_surface(&mut dest, &src, 0, 0);
        assert_eq!(&dest.data[0..4], &[0x00, 0xff, 0x00, 0x80]);
    }

    #[test]
    fn draw_surface_clips_a_negative_offset() {
        let mut dest = create_surface(4, 4, 0);
        let src = region(create_surface(2, 2, 0xaabbccff));
        // (-1, -1): only the source's bottom-right pixel lands at dest (0,0).
        draw_surface(&mut dest, &src, -1, -1);
        assert_eq!(&dest.data[0..4], &[0xaa, 0xbb, 0xcc, 0xff]);
        // (1,1) is outside the blit footprint.
        let di = ((4 + 1) * 4) as usize;
        assert_eq!(&dest.data[di..di + 4], &[0, 0, 0, 0]);
    }

    #[test]
    fn draw_surface_bumps_version_when_pixels_are_written() {
        let mut dest = create_surface(4, 4, 0);
        let before = dest.version;
        let src = region(create_surface(2, 2, 0x112233ff));
        draw_surface(&mut dest, &src, 0, 0);
        assert_eq!(dest.version, before.wrapping_add(1));
    }

    #[test]
    fn draw_surface_is_a_no_op_for_a_zero_dimension_region() {
        let mut dest = create_surface(4, 4, 0);
        let before = dest.version;
        let src = create_surface_region(create_surface(2, 2, 0x112233ff), 0, 0, 0, 0);
        draw_surface(&mut dest, &src, 0, 0);
        assert!(dest.data.iter().all(|&b| b == 0));
        assert_eq!(dest.version, before);
    }

    #[test]
    fn draw_surface_is_a_no_op_when_fully_offscreen() {
        let mut dest = create_surface(4, 4, 0);
        let before = dest.version;
        let src = region(create_surface(2, 2, 0x112233ff));
        draw_surface(&mut dest, &src, 10, 10);
        assert!(dest.data.iter().all(|&b| b == 0));
        assert_eq!(dest.version, before);
    }
}

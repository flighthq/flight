//! Deterministic pseudo-random dissolve wipe between surface regions.

use flighthq_types::SurfaceRegion;

/// Transitions `dest` toward `source` one batch of pixels at a time, in a
/// deterministic pseudo-random order — the classic dissolve wipe. Each call
/// dissolves up to `pixel_count` not-yet-dissolved pixels and returns the next
/// seed cursor; pass it back on the following call to continue the wipe without
/// revisiting any pixel. Start a fresh dissolve with `seed = 0`. Once every
/// pixel has dissolved the returned seed is terminal: further calls with it are
/// no-ops.
///
/// When `source` is the same region as `dest` (same surface bytes and identical
/// bounds), dissolved pixels are set to `fill_color` (packed `0xRRGGBBAA`);
/// otherwise each is copied from the matching pixel in `source` and `fill_color`
/// is ignored. Pixels that fall outside the surface are clipped but still
/// consume a step of the sequence.
pub fn dissolve_surface_pixels(
    dest: &mut SurfaceRegion,
    source: &SurfaceRegion,
    seed: u32,
    pixel_count: u32,
    fill_color: u32,
) -> u32 {
    let width = dest.width;
    let height = dest.height;
    let total = width * height;
    if total == 0 {
        return seed;
    }

    let mut bits: u32 = 0;
    while 1u32 << bits < total {
        bits += 1;
    }
    let period = 1u32 << bits;
    let mask = period - 1;

    let mut cursor = if seed > period { period } else { seed };
    if pixel_count == 0 {
        return cursor;
    }

    let to_fill = is_same_region(dest, source);
    let fill_r = ((fill_color >> 24) & 0xff) as u8;
    let fill_g = ((fill_color >> 16) & 0xff) as u8;
    let fill_b = ((fill_color >> 8) & 0xff) as u8;
    let fill_a = (fill_color & 0xff) as u8;

    let dest_stride = dest.surface.width;
    let dest_surface_height = dest.surface.height;
    let source_stride = source.surface.width;
    let source_surface_height = source.surface.height;
    let source_data = source.surface.data.clone();

    let dest_x = dest.x;
    let dest_y = dest.y;
    let source_x = source.x;
    let source_y = source.y;
    let dest_data = &mut dest.surface.data;

    let mut dissolved = 0;
    while dissolved < pixel_count && cursor < period {
        let pixel_index = permute_pixel_index(cursor, bits, mask);
        cursor += 1;
        if pixel_index >= total {
            continue;
        }
        dissolved += 1;

        let px = pixel_index % width;
        let py = pixel_index / width;
        let dx = dest_x + px;
        let dy = dest_y + py;
        if dx >= dest_stride || dy >= dest_surface_height {
            continue;
        }
        let di = ((dy * dest_stride + dx) * 4) as usize;

        if to_fill {
            dest_data[di] = fill_r;
            dest_data[di + 1] = fill_g;
            dest_data[di + 2] = fill_b;
            dest_data[di + 3] = fill_a;
            continue;
        }

        let sx = source_x + px;
        let sy = source_y + py;
        if sx >= source_stride || sy >= source_surface_height {
            continue;
        }
        let si = ((sy * source_stride + sx) * 4) as usize;
        dest_data[di] = source_data[si];
        dest_data[di + 1] = source_data[si + 1];
        dest_data[di + 2] = source_data[si + 2];
        dest_data[di + 3] = source_data[si + 3];
    }

    dest.surface.version = dest.surface.version.wrapping_add(1);
    cursor
}

fn is_same_region(a: &SurfaceRegion, b: &SurfaceRegion) -> bool {
    a.x == b.x
        && a.y == b.y
        && a.width == b.width
        && a.height == b.height
        && a.surface.width == b.surface.width
        && a.surface.height == b.surface.height
        && a.surface.data == b.surface.data
}

// Bijection on [0, 2^bits): a composition of multiply-by-odd (invertible mod
// 2^bits), xor-shift, and xor-constant, each individually reversible. Walking
// `cursor` across the full period visits every index in [0, total) exactly once
// (cycle-walking skips indices >= total), guaranteeing a dissolve covers the
// whole region without repeats.
fn permute_pixel_index(cursor: u32, bits: u32, mask: u32) -> u32 {
    let mut v = cursor & mask;
    let shift = if bits > 1 { bits >> 1 } else { 1 };
    v = v.wrapping_mul(0x9e37_79b1) & mask;
    v ^= v >> shift;
    v = v.wrapping_mul(0x85eb_ca77) & mask;
    v ^= 0x27d4_eb2f & mask;
    v & mask
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::{get_surface_pixel, set_surface_pixel};
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    fn count_changed(data: &[u8], original: &[u8]) -> usize {
        let mut changed = 0;
        let mut i = 0;
        while i < data.len() {
            if data[i] != original[i]
                || data[i + 1] != original[i + 1]
                || data[i + 2] != original[i + 2]
                || data[i + 3] != original[i + 3]
            {
                changed += 1;
            }
            i += 4;
        }
        changed
    }

    #[test]
    fn dissolve_surface_pixels_advances_seed() {
        let source = create_surface(4, 4, 0x112233ff);
        let dest = create_surface(4, 4, 0);
        let original = dest.data.clone();
        let mut dest_region = create_surface_region(dest, 0, 0, 4, 4);
        let source_region = create_surface_region(source, 0, 0, 4, 4);
        dissolve_surface_pixels(&mut dest_region, &source_region, 0, 5, 0);
        assert_eq!(count_changed(&dest_region.surface.data, &original), 5);
    }

    #[test]
    fn dissolve_surface_pixels_covers_every_pixel() {
        let mut source = create_surface(5, 3, 0);
        for i in 0..(5 * 3) {
            set_surface_pixel(
                &mut source,
                (i % 5) as u32,
                (i / 5) as u32,
                0x0101_0100u32.wrapping_mul((i + 1) as u32),
            );
        }
        let dest = create_surface(5, 3, 0);
        let source_region = create_surface_region(source.clone(), 0, 0, 5, 3);
        let mut dest_region = create_surface_region(dest, 0, 0, 5, 3);
        let mut seed = 0;
        for _ in 0..8 {
            seed = dissolve_surface_pixels(&mut dest_region, &source_region, seed, 2, 0);
        }
        assert_eq!(dest_region.surface.data, source.data);
    }

    #[test]
    fn dissolve_surface_pixels_deterministic() {
        let source = create_surface(6, 6, 0xaabbccff);
        let a = create_surface(6, 6, 0);
        let b = create_surface(6, 6, 0);
        let source_region = create_surface_region(source, 0, 0, 6, 6);
        let mut ra = create_surface_region(a, 0, 0, 6, 6);
        let mut rb = create_surface_region(b, 0, 0, 6, 6);
        dissolve_surface_pixels(&mut ra, &source_region, 3, 7, 0);
        dissolve_surface_pixels(&mut rb, &source_region, 3, 7, 0);
        assert_eq!(ra.surface.data, rb.surface.data);
    }

    #[test]
    fn dissolve_surface_pixels_terminal_seed_noops() {
        let source = create_surface(4, 4, 0x445566ff);
        let dest = create_surface(4, 4, 0);
        let source_region = create_surface_region(source.clone(), 0, 0, 4, 4);
        let mut dest_region = create_surface_region(dest, 0, 0, 4, 4);
        let mut seed = 0;
        for _ in 0..16 {
            seed = dissolve_surface_pixels(&mut dest_region, &source_region, seed, 1, 0);
        }
        assert_eq!(dest_region.surface.data, source.data);
        let after = dissolve_surface_pixels(&mut dest_region, &source_region, seed, 4, 0);
        assert_eq!(after, seed);
    }

    #[test]
    fn dissolve_surface_pixels_fill_mode() {
        // Same surface bytes + identical bounds → fill mode (mirrors the TS
        // same-object semantics by re-deriving an identical source each step).
        let mut surface = create_surface(3, 3, 0x112233ff);
        let mut seed = 0;
        for _ in 0..9 {
            let snapshot = surface.clone();
            let mut dest_region = create_surface_region(surface, 0, 0, 3, 3);
            let source_region = create_surface_region(snapshot, 0, 0, 3, 3);
            seed = dissolve_surface_pixels(&mut dest_region, &source_region, seed, 1, 0x99887766);
            surface = dest_region.surface;
        }
        for i in 0..9u32 {
            assert_eq!(get_surface_pixel(&surface, i % 3, i / 3), 0x99887766);
        }
    }

    #[test]
    fn dissolve_surface_pixels_copies_when_regions_differ() {
        let source = create_surface(2, 2, 0x0a0b0c0d);
        let mut dest = create_surface(2, 2, 0);
        let source_region = create_surface_region(source.clone(), 0, 0, 2, 2);
        let mut seed = 0;
        for _ in 0..4 {
            let mut dest_region = create_surface_region(dest, 0, 0, 2, 2);
            seed = dissolve_surface_pixels(&mut dest_region, &source_region, seed, 1, 0xffffffff);
            dest = dest_region.surface;
        }
        assert_eq!(dest.data, source.data);
    }

    #[test]
    fn dissolve_surface_pixels_zero_count_returns_seed() {
        let source = create_surface(4, 4, 0x112233ff);
        let dest = create_surface(4, 4, 0);
        let original = dest.data.clone();
        let source_region = create_surface_region(source, 0, 0, 4, 4);
        let mut dest_region = create_surface_region(dest, 0, 0, 4, 4);
        assert_eq!(
            dissolve_surface_pixels(&mut dest_region, &source_region, 2, 0, 0),
            2
        );
        assert_eq!(count_changed(&dest_region.surface.data, &original), 0);
    }

    #[test]
    fn dissolve_surface_pixels_zero_area_returns_seed() {
        let source = create_surface(4, 4, 0x112233ff);
        let dest = create_surface(4, 4, 0);
        let source_region = create_surface_region(source, 0, 0, 4, 4);
        let mut region = create_surface_region(dest, 0, 0, 0, 0);
        assert_eq!(
            dissolve_surface_pixels(&mut region, &source_region, 5, 10, 0),
            5
        );
    }
}

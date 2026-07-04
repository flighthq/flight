//! Channel merge and split operations on surfaces.

use flighthq_types::{Surface, SurfaceRegion};

/// Merges four single-channel surfaces into `out` by taking one channel from
/// each input:
/// - `out.R` <- `r.R`
/// - `out.G` <- `g.G`
/// - `out.B` <- `b.B`
/// - `out.A` <- `a.A`
///
/// The copied size is the minimum overlap of all five regions.
pub fn merge_surface_channels(
    out: &mut SurfaceRegion,
    r: &SurfaceRegion,
    g: &SurfaceRegion,
    b: &SurfaceRegion,
    a: &SurfaceRegion,
) {
    let w = out
        .width
        .min(r.width)
        .min(g.width)
        .min(b.width)
        .min(a.width);
    let h = out
        .height
        .min(r.height)
        .min(g.height)
        .min(b.height)
        .min(a.height);
    for py in 0..h {
        let oy = out.y + py;
        let ry = r.y + py;
        let gy = g.y + py;
        let by = b.y + py;
        let ay = a.y + py;
        if oy >= out.surface.height
            || ry >= r.surface.height
            || gy >= g.surface.height
            || by >= b.surface.height
            || ay >= a.surface.height
        {
            continue;
        }
        for px in 0..w {
            let ox = out.x + px;
            let rx = r.x + px;
            let gx = g.x + px;
            let bx = b.x + px;
            let ax = a.x + px;
            if ox >= out.surface.width
                || rx >= r.surface.width
                || gx >= g.surface.width
                || bx >= b.surface.width
                || ax >= a.surface.width
            {
                continue;
            }
            let di = ((oy * out.surface.width + ox) * 4) as usize;
            out.surface.data[di] = r.surface.data[((ry * r.surface.width + rx) * 4) as usize];
            out.surface.data[di + 1] =
                g.surface.data[((gy * g.surface.width + gx) * 4 + 1) as usize];
            out.surface.data[di + 2] =
                b.surface.data[((by * b.surface.width + bx) * 4 + 2) as usize];
            out.surface.data[di + 3] =
                a.surface.data[((ay * a.surface.width + ax) * 4 + 3) as usize];
        }
    }
    out.surface.version = out.surface.version.wrapping_add(1);
}

/// Splits `source` into four single-channel grayscale surfaces (R, G, B, A).
/// Each output pixel's value is taken from the corresponding channel and
/// written to all four channels (with alpha = 0xff for R/G/B surfaces, and
/// the original alpha value for the A surface).
///
/// Returns `[r, g, b, a]`.
pub fn split_surface_channels(source: &Surface) -> [Surface; 4] {
    let w = source.width;
    let h = source.height;
    let sd = &source.data;
    let pixel_count = (w * h) as usize;
    let len = pixel_count * 4;
    let mut r_data = vec![0u8; len];
    let mut g_data = vec![0u8; len];
    let mut b_data = vec![0u8; len];
    let mut a_data = vec![0u8; len];
    for i in 0..pixel_count {
        let si = i * 4;
        let rv = sd[si];
        let gv = sd[si + 1];
        let bv = sd[si + 2];
        let av = sd[si + 3];
        r_data[si] = rv;
        r_data[si + 1] = rv;
        r_data[si + 2] = rv;
        r_data[si + 3] = 0xff;
        g_data[si] = gv;
        g_data[si + 1] = gv;
        g_data[si + 2] = gv;
        g_data[si + 3] = 0xff;
        b_data[si] = bv;
        b_data[si + 1] = bv;
        b_data[si + 2] = bv;
        b_data[si + 3] = 0xff;
        a_data[si] = av;
        a_data[si + 1] = av;
        a_data[si + 2] = av;
        a_data[si + 3] = av;
    }
    [
        make_surface(r_data, w, h, source),
        make_surface(g_data, w, h, source),
        make_surface(b_data, w, h, source),
        make_surface(a_data, w, h, source),
    ]
}

fn make_surface(data: Vec<u8>, width: u32, height: u32, source: &Surface) -> Surface {
    Surface {
        alpha_type: source.alpha_type,
        color_space: source.color_space,
        data,
        format: source.format,
        height,
        version: 0,
        width,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::{get_surface_pixel, set_surface_pixel};
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn merge_surface_channels_combines_channels() {
        let mut r_surf = create_surface(1, 1, 0);
        set_surface_pixel(&mut r_surf, 0, 0, 0xaa000000);
        let mut g_surf = create_surface(1, 1, 0);
        set_surface_pixel(&mut g_surf, 0, 0, 0x00bb0000);
        let mut b_surf = create_surface(1, 1, 0);
        set_surface_pixel(&mut b_surf, 0, 0, 0x0000cc00);
        let mut a_surf = create_surface(1, 1, 0);
        set_surface_pixel(&mut a_surf, 0, 0, 0x000000dd);
        let dst = create_surface(1, 1, 0);
        let r = create_surface_region(r_surf, 0, 0, 1, 1);
        let g = create_surface_region(g_surf, 0, 0, 1, 1);
        let b = create_surface_region(b_surf, 0, 0, 1, 1);
        let a = create_surface_region(a_surf, 0, 0, 1, 1);
        let mut out = create_surface_region(dst, 0, 0, 1, 1);
        merge_surface_channels(&mut out, &r, &g, &b, &a);
        assert_eq!(get_surface_pixel(&out.surface, 0, 0), 0xaabbccdd);
    }

    #[test]
    fn split_surface_channels_produces_grayscale() {
        let mut src = create_surface(1, 1, 0);
        set_surface_pixel(&mut src, 0, 0, 0xaabbccdd);
        let [r, g, b, a] = split_surface_channels(&src);
        // R surface: all channels = 0xaa, alpha = 0xff
        assert_eq!(get_surface_pixel(&r, 0, 0), 0xaaaaaaff);
        // G surface: all channels = 0xbb, alpha = 0xff
        assert_eq!(get_surface_pixel(&g, 0, 0), 0xbbbbbbff);
        // B surface: all channels = 0xcc, alpha = 0xff
        assert_eq!(get_surface_pixel(&b, 0, 0), 0xccccccff);
        // A surface: all channels = 0xdd
        assert_eq!(get_surface_pixel(&a, 0, 0), 0xdddddddd);
    }

    #[test]
    fn split_then_merge_roundtrips() {
        let mut src = create_surface(2, 2, 0);
        set_surface_pixel(&mut src, 0, 0, 0x11223344);
        set_surface_pixel(&mut src, 1, 0, 0x55667788);
        set_surface_pixel(&mut src, 0, 1, 0x99aabbcc);
        set_surface_pixel(&mut src, 1, 1, 0xddeeff00);
        let [rs, gs, bs, als] = split_surface_channels(&src);
        let dst = create_surface(2, 2, 0);
        let rr = create_surface_region(rs, 0, 0, 2, 2);
        let gr = create_surface_region(gs, 0, 0, 2, 2);
        let br = create_surface_region(bs, 0, 0, 2, 2);
        let ar = create_surface_region(als, 0, 0, 2, 2);
        let mut out = create_surface_region(dst, 0, 0, 2, 2);
        merge_surface_channels(&mut out, &rr, &gr, &br, &ar);
        assert_eq!(get_surface_pixel(&out.surface, 0, 0), 0x11223344);
        assert_eq!(get_surface_pixel(&out.surface, 1, 0), 0x55667788);
        assert_eq!(get_surface_pixel(&out.surface, 0, 1), 0x99aabbcc);
        assert_eq!(get_surface_pixel(&out.surface, 1, 1), 0xddeeff00);
    }
}

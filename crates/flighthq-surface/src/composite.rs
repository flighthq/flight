//! Alpha compositing and pixel extraction for surface regions.

use flighthq_types::{BlendMode, SurfaceRegion};

/// Alpha-composites `pixels` over `dest`. `pixels` must be at least
/// `dest.width * dest.height * 4` bytes in row-major RGBA order.
///
/// `blend_mode` selects how the source combines with the backdrop.
/// `BlendMode::Alpha` and `BlendMode::Shader` are not supported and will panic.
pub fn composite_surface_pixels(dest: &mut SurfaceRegion, pixels: &[u8], blend_mode: BlendMode) {
    assert_composite_blend_mode(blend_mode);
    let s_width = dest.surface.width;
    let s_height = dest.surface.height;
    let region_width = dest.width;
    let data = &mut dest.surface.data;
    for py in 0..dest.height {
        let y = dest.y + py;
        if y >= s_height {
            continue;
        }
        for px in 0..dest.width {
            let x = dest.x + px;
            if x >= s_width {
                continue;
            }
            let si = ((py * region_width + px) * 4) as usize;
            composite_pixel_into(
                data,
                ((y * s_width + x) * 4) as usize,
                pixels[si],
                pixels[si + 1],
                pixels[si + 2],
                pixels[si + 3],
                blend_mode,
            );
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Alpha-composites `source` over `dest`. See `composite_surface_pixels` for
/// `blend_mode` semantics.
pub fn composite_surface_region(
    dest: &mut SurfaceRegion,
    source: &SurfaceRegion,
    blend_mode: BlendMode,
) {
    assert_composite_blend_mode(blend_mode);
    let sw = dest.width.min(source.width);
    let sh = dest.height.min(source.height);
    let s_width = source.surface.width;
    let s_height = source.surface.height;
    let d_width = dest.surface.width;
    let d_height = dest.surface.height;
    let sd = &source.surface.data;
    for py in 0..sh {
        let source_y = source.y + py;
        let y = dest.y + py;
        if source_y >= s_height || y >= d_height {
            continue;
        }
        for px in 0..sw {
            let source_x = source.x + px;
            let x = dest.x + px;
            if source_x >= s_width || x >= d_width {
                continue;
            }
            let si = ((source_y * s_width + source_x) * 4) as usize;
            composite_pixel_into(
                &mut dest.surface.data,
                ((y * d_width + x) * 4) as usize,
                sd[si],
                sd[si + 1],
                sd[si + 2],
                sd[si + 3],
                blend_mode,
            );
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Copies `source` into `out` in row-major, tightly-packed RGBA order
/// (stride = source.width). `out` must be at least
/// `source.width * source.height * 4` bytes.
pub fn extract_surface_pixels(out: &mut [u8], source: &SurfaceRegion) {
    let s_width = source.surface.width;
    let s_height = source.surface.height;
    let region_width = source.width;
    let data = &source.surface.data;
    for py in 0..source.height {
        let source_y = source.y + py;
        if source_y >= s_height {
            continue;
        }
        for px in 0..source.width {
            let source_x = source.x + px;
            if source_x >= s_width {
                continue;
            }
            let si = ((source_y * s_width + source_x) * 4) as usize;
            let di = ((py * region_width + px) * 4) as usize;
            out[di] = data[si];
            out[di + 1] = data[si + 1];
            out[di + 2] = data[si + 2];
            out[di + 3] = data[si + 3];
        }
    }
}

/// Copies `source` into `out` as one packed `0xRRGGBBAA` color per pixel in
/// row-major order. `out` must hold at least `source.width * source.height`
/// entries.
pub fn extract_surface_pixels_32(out: &mut [u32], source: &SurfaceRegion) {
    let s_width = source.surface.width;
    let s_height = source.surface.height;
    let region_width = source.width;
    let data = &source.surface.data;
    for py in 0..source.height {
        let source_y = source.y + py;
        if source_y >= s_height {
            continue;
        }
        for px in 0..source.width {
            let source_x = source.x + px;
            if source_x >= s_width {
                continue;
            }
            let si = ((source_y * s_width + source_x) * 4) as usize;
            out[(py * region_width + px) as usize] = ((data[si] as u32) << 24)
                | ((data[si + 1] as u32) << 16)
                | ((data[si + 2] as u32) << 8)
                | (data[si + 3] as u32);
        }
    }
}

/// Writes `pixels` into `dest`, overwriting existing content.
/// `pixels` must be at least `dest.width * dest.height * 4` bytes in
/// row-major RGBA order.
pub fn write_surface_pixels(dest: &mut SurfaceRegion, pixels: &[u8]) {
    let s_width = dest.surface.width;
    let s_height = dest.surface.height;
    let region_width = dest.width;
    let data = &mut dest.surface.data;
    for py in 0..dest.height {
        let y = dest.y + py;
        if y >= s_height {
            continue;
        }
        for px in 0..dest.width {
            let x = dest.x + px;
            if x >= s_width {
                continue;
            }
            let si = ((py * region_width + px) * 4) as usize;
            let di = ((y * s_width + x) * 4) as usize;
            data[di] = pixels[si];
            data[di + 1] = pixels[si + 1];
            data[di + 2] = pixels[si + 2];
            data[di + 3] = pixels[si + 3];
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Writes `pixels` into `dest`, overwriting existing content. Each entry is a
/// packed `0xRRGGBBAA` color, read in row-major order. `pixels` must hold at
/// least `dest.width * dest.height` entries.
pub fn write_surface_pixels_32(dest: &mut SurfaceRegion, pixels: &[u32]) {
    let s_width = dest.surface.width;
    let s_height = dest.surface.height;
    let region_width = dest.width;
    let data = &mut dest.surface.data;
    for py in 0..dest.height {
        let y = dest.y + py;
        if y >= s_height {
            continue;
        }
        for px in 0..dest.width {
            let x = dest.x + px;
            if x >= s_width {
                continue;
            }
            let color = pixels[(py * region_width + px) as usize];
            let di = ((y * s_width + x) * 4) as usize;
            data[di] = ((color >> 24) & 0xff) as u8;
            data[di + 1] = ((color >> 16) & 0xff) as u8;
            data[di + 2] = ((color >> 8) & 0xff) as u8;
            data[di + 3] = (color & 0xff) as u8;
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

// Panics, up front, for blend modes that have no surface-compositing meaning,
// rather than silently degrading to Normal mid-loop.
fn assert_composite_blend_mode(blend_mode: BlendMode) {
    if blend_mode == BlendMode::Alpha || blend_mode == BlendMode::Shader {
        panic!("BlendMode::{blend_mode:?} is not supported by surface compositing");
    }
}

// Separable per-channel blend on 0..255 values. Normal/Layer (and any mode not
// listed) return the source channel unchanged, reducing the composite to
// source-over.
fn blend_channel(mode: BlendMode, cb: f32, cs: f32) -> f32 {
    match mode {
        BlendMode::Multiply => (cb * cs) / 255.0,
        BlendMode::Screen => cb + cs - (cb * cs) / 255.0,
        BlendMode::Add => (cb + cs).min(255.0),
        BlendMode::Subtract => (cb - cs).max(0.0),
        BlendMode::Darken => cb.min(cs),
        BlendMode::Lighten => cb.max(cs),
        BlendMode::Difference => (cb - cs).abs(),
        BlendMode::Overlay => {
            if cb < 128.0 {
                (2.0 * cb * cs) / 255.0
            } else {
                255.0 - (2.0 * (255.0 - cb) * (255.0 - cs)) / 255.0
            }
        }
        BlendMode::Hardlight => {
            if cs < 128.0 {
                (2.0 * cb * cs) / 255.0
            } else {
                255.0 - (2.0 * (255.0 - cb) * (255.0 - cs)) / 255.0
            }
        }
        BlendMode::Invert => 255.0 - cb,
        _ => cs,
    }
}

#[allow(clippy::too_many_arguments)]
fn composite_pixel_into(
    dest: &mut [u8],
    di: usize,
    r: u8,
    g: u8,
    b: u8,
    a: u8,
    blend_mode: BlendMode,
) {
    let src_a = a as f32 / 255.0;
    let dst_a = dest[di + 3] as f32 / 255.0;
    // Erase is a destination-out knockout: the source alpha carves into the
    // backdrop's alpha, leaving its color untouched.
    if blend_mode == BlendMode::Erase {
        let erase_a = dst_a * (1.0 - src_a);
        if erase_a <= 0.0 {
            dest[di] = 0;
            dest[di + 1] = 0;
            dest[di + 2] = 0;
        }
        dest[di + 3] = (erase_a * 255.0).round() as u8;
        return;
    }
    let out_a = src_a + dst_a * (1.0 - src_a);
    if out_a <= 0.0 {
        dest[di] = 0;
        dest[di + 1] = 0;
        dest[di + 2] = 0;
        dest[di + 3] = 0;
        return;
    }
    // W3C compositing: mix the blended color into the source by the backdrop
    // alpha, then source-over. Read backdrop channels before writing any of them.
    let cb_r = dest[di] as f32;
    let cb_g = dest[di + 1] as f32;
    let cb_b = dest[di + 2] as f32;
    let rf = r as f32;
    let gf = g as f32;
    let bf = b as f32;
    let cs_r = (1.0 - dst_a) * rf + dst_a * blend_channel(blend_mode, cb_r, rf);
    let cs_g = (1.0 - dst_a) * gf + dst_a * blend_channel(blend_mode, cb_g, gf);
    let cs_b = (1.0 - dst_a) * bf + dst_a * blend_channel(blend_mode, cb_b, bf);
    dest[di] = ((cs_r * src_a + cb_r * dst_a * (1.0 - src_a)) / out_a).round() as u8;
    dest[di + 1] = ((cs_g * src_a + cb_g * dst_a * (1.0 - src_a)) / out_a).round() as u8;
    dest[di + 2] = ((cs_b * src_a + cb_b * dst_a * (1.0 - src_a)) / out_a).round() as u8;
    dest[di + 3] = (out_a * 255.0).round() as u8;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::{get_surface_pixel, set_surface_pixel};
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn composite_surface_pixels_normal_blend() {
        let dst = create_surface(1, 1, 0x000000ff);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        // opaque red source
        let pixels = [0xff, 0x00, 0x00, 0xff];
        composite_surface_pixels(&mut dest, &pixels, BlendMode::Normal);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0xff0000ff);
    }

    #[test]
    fn composite_surface_region_normal_blend() {
        let mut src = create_surface(1, 1, 0);
        set_surface_pixel(&mut src, 0, 0, 0x00ff00ff);
        let dst = create_surface(1, 1, 0x000000ff);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        composite_surface_region(&mut dest, &source, BlendMode::Normal);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x00ff00ff);
    }

    #[test]
    #[should_panic]
    fn composite_surface_region_alpha_mode_panics() {
        let src = create_surface(1, 1, 0);
        let dst = create_surface(1, 1, 0);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        composite_surface_region(&mut dest, &source, BlendMode::Alpha);
    }

    #[test]
    fn extract_surface_pixels_full_surface() {
        let mut s = create_surface(2, 1, 0);
        set_surface_pixel(&mut s, 0, 0, 0x11223344);
        set_surface_pixel(&mut s, 1, 0, 0x55667788);
        let region = create_surface_region(s, 0, 0, 2, 1);
        let mut out = [0u8; 8];
        extract_surface_pixels(&mut out, &region);
        assert_eq!(out, [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
    }

    #[test]
    fn extract_surface_pixels32_packs_colors() {
        let mut s = create_surface(2, 1, 0);
        set_surface_pixel(&mut s, 0, 0, 0x11223344);
        set_surface_pixel(&mut s, 1, 0, 0x55667788);
        let region = create_surface_region(s, 0, 0, 2, 1);
        let mut out = [0u32; 2];
        extract_surface_pixels_32(&mut out, &region);
        assert_eq!(out, [0x11223344, 0x55667788]);
    }

    #[test]
    fn write_surface_pixels_overwrites() {
        let dst = create_surface(1, 1, 0xffffffff);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        let pixels = [0x11, 0x22, 0x33, 0x44];
        write_surface_pixels(&mut dest, &pixels);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x11223344);
    }

    #[test]
    fn write_surface_pixels32_overwrites() {
        let dst = create_surface(1, 1, 0xffffffff);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        write_surface_pixels_32(&mut dest, &[0x11223344]);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x11223344);
    }
}

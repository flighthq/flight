//! Pixel-level color transforms, threshold, merge, and scroll operations.

use flighthq_types::{ColorTransformLike, Surface, SurfaceRegion, ThresholdOperation};

/// Applies a color transform to `source`, writing into `dest`. The transformed
/// size is the overlap of the two regions; pixels outside either surface are
/// skipped. Safe to pass the same surface and region in `dest` and `source`
/// (each pixel is read before it is written).
pub fn apply_surface_color_transform(
    dest: &mut SurfaceRegion,
    source: &SurfaceRegion,
    ct: &ColorTransformLike,
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
            let r = sd[si] as f32;
            let g = sd[si + 1] as f32;
            let b = sd[si + 2] as f32;
            let a = sd[si + 3] as f32;
            dd[di] = clamp_channel(r * ct.red_multiplier + ct.red_offset);
            dd[di + 1] = clamp_channel(g * ct.green_multiplier + ct.green_offset);
            dd[di + 2] = clamp_channel(b * ct.blue_multiplier + ct.blue_offset);
            dd[di + 3] = clamp_channel(a * ct.alpha_multiplier + ct.alpha_offset);
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Tests each pixel of `source` and writes `color` into `dest` where the test
/// passes, or copies the source pixel when `copy_source` is true and the test
/// fails. Returns the number of pixels that passed.
///
/// The comparison is performed on the full packed `0xRRGGBBAA` pixel value
/// under `mask`. Safe to pass the same surface and region in `dest` and
/// `source`.
pub fn apply_surface_threshold(
    dest: &mut SurfaceRegion,
    source: &SurfaceRegion,
    operation: ThresholdOperation,
    threshold_value: u32,
    color: u32,
    mask: u32,
    copy_source: bool,
) -> u32 {
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
    let mut changed = 0;
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
            let pixel = (((sd[si] as u32) << 24)
                | ((sd[si + 1] as u32) << 16)
                | ((sd[si + 2] as u32) << 8)
                | sd[si + 3] as u32)
                & mask;
            if compare(pixel, operation, threshold_value) {
                dd[di] = ((color >> 24) & 0xff) as u8;
                dd[di + 1] = ((color >> 16) & 0xff) as u8;
                dd[di + 2] = ((color >> 8) & 0xff) as u8;
                dd[di + 3] = (color & 0xff) as u8;
                changed += 1;
            } else if copy_source {
                dd[di] = sd[si];
                dd[di + 1] = sd[si + 1];
                dd[di + 2] = sd[si + 2];
                dd[di + 3] = sd[si + 3];
            }
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
    changed
}

/// Blends each channel of `source` into `dest` using per-channel multipliers
/// in [0.0, 1.0]: 0.0 keeps `dest`, 1.0 replaces with `source`. The blended
/// size is the overlap of the two regions; pixels outside either surface are
/// skipped.
///
/// `dest` and `source` must not reference the same surface when their regions
/// overlap at different offsets.
pub fn merge_surface(
    dest: &mut SurfaceRegion,
    source: &SurfaceRegion,
    red_multiplier: f32,
    green_multiplier: f32,
    blue_multiplier: f32,
    alpha_multiplier: f32,
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
            dd[di] = blend(sd[si], dd[di], red_multiplier);
            dd[di + 1] = blend(sd[si + 1], dd[di + 1], green_multiplier);
            dd[di + 2] = blend(sd[si + 2], dd[di + 2], blue_multiplier);
            dd[di + 3] = blend(sd[si + 3], dd[di + 3], alpha_multiplier);
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Scrolls the content of `out` by `(dx, dy)`, wrapping at the edges.
pub fn scroll_surface(out: &mut Surface, dx: i32, dy: i32) {
    let width = out.width as i32;
    let height = out.height as i32;
    if width == 0 || height == 0 {
        return;
    }
    let scratch = out.data.clone();
    for b in out.data.iter_mut() {
        *b = 0;
    }
    for py in 0..height {
        let src_y = (((py - dy) % height) + height) % height;
        for px in 0..width {
            let src_x = (((px - dx) % width) + width) % width;
            let si = ((src_y * width + src_x) * 4) as usize;
            let di = ((py * width + px) * 4) as usize;
            out.data[di] = scratch[si];
            out.data[di + 1] = scratch[si + 1];
            out.data[di + 2] = scratch[si + 2];
            out.data[di + 3] = scratch[si + 3];
        }
    }
    out.version = out.version.wrapping_add(1);
}

fn blend(source: u8, dest: u8, multiplier: f32) -> u8 {
    (source as f32 * multiplier + dest as f32 * (1.0 - multiplier)).round() as u8
}

fn clamp_channel(v: f32) -> u8 {
    v.round().clamp(0.0, 255.0) as u8
}

fn compare(a: u32, op: ThresholdOperation, b: u32) -> bool {
    match op {
        ThresholdOperation::LessThan => a < b,
        ThresholdOperation::LessEqual => a <= b,
        ThresholdOperation::GreaterThan => a > b,
        ThresholdOperation::GreaterEqual => a >= b,
        ThresholdOperation::Equal => a == b,
        ThresholdOperation::NotEqual => a != b,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::get_surface_pixel;
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn apply_surface_color_transform_identity() {
        let src = create_surface(1, 1, 0x11223344);
        let dst = create_surface(1, 1, 0);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        apply_surface_color_transform(&mut dest, &source, &ColorTransformLike::default());
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x11223344);
    }

    #[test]
    fn apply_surface_color_transform_in_place_offset() {
        let surface = create_surface(1, 1, 0x00000000);
        let snapshot = surface.clone();
        let mut dest = create_surface_region(surface, 0, 0, 1, 1);
        let source = create_surface_region(snapshot, 0, 0, 1, 1);
        let ct = ColorTransformLike {
            red_offset: 50.0,
            ..ColorTransformLike::default()
        };
        apply_surface_color_transform(&mut dest, &source, &ct);
        assert_eq!(dest.surface.data[0], 50);
    }

    #[test]
    fn apply_surface_threshold_counts_matches() {
        let mut src = create_surface(2, 1, 0);
        crate::pixel::set_surface_pixel(&mut src, 0, 0, 0x000000ff);
        crate::pixel::set_surface_pixel(&mut src, 1, 0, 0xffffffff);
        let dst = create_surface(2, 1, 0);
        let source = create_surface_region(src, 0, 0, 2, 1);
        let mut dest = create_surface_region(dst, 0, 0, 2, 1);
        // pass where pixel >= 0x80000000 (only the white pixel)
        let changed = apply_surface_threshold(
            &mut dest,
            &source,
            ThresholdOperation::GreaterEqual,
            0x80000000,
            0x12345678,
            0xffffffff,
            false,
        );
        assert_eq!(changed, 1);
        assert_eq!(get_surface_pixel(&dest.surface, 1, 0), 0x12345678);
    }

    #[test]
    fn apply_surface_threshold_alpha_mask() {
        // Only test the alpha byte via mask 0x000000ff.
        let mut src = create_surface(1, 1, 0);
        crate::pixel::set_surface_pixel(&mut src, 0, 0, 0xffffff80);
        let dst = create_surface(1, 1, 0);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        let changed = apply_surface_threshold(
            &mut dest,
            &source,
            ThresholdOperation::GreaterThan,
            0x40,
            0xaabbccdd,
            0x000000ff,
            false,
        );
        assert_eq!(changed, 1);
    }

    #[test]
    fn merge_surface_blend_zero_keeps_dest() {
        let src = create_surface(1, 1, 0xffffffff);
        let dst = create_surface(1, 1, 0x11223344);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        merge_surface(&mut dest, &source, 0.0, 0.0, 0.0, 0.0);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0x11223344);
    }

    #[test]
    fn merge_surface_blend_one_replaces_dest() {
        let src = create_surface(1, 1, 0xaabbccdd);
        let dst = create_surface(1, 1, 0x11223344);
        let source = create_surface_region(src, 0, 0, 1, 1);
        let mut dest = create_surface_region(dst, 0, 0, 1, 1);
        merge_surface(&mut dest, &source, 1.0, 1.0, 1.0, 1.0);
        assert_eq!(get_surface_pixel(&dest.surface, 0, 0), 0xaabbccdd);
    }

    #[test]
    fn scroll_surface_wraps_pixels() {
        let mut surface = create_surface(2, 1, 0);
        crate::pixel::set_surface_pixel(&mut surface, 0, 0, 0x11111111);
        crate::pixel::set_surface_pixel(&mut surface, 1, 0, 0x22222222);
        scroll_surface(&mut surface, 1, 0);
        // pixel shifts right by 1, wrapping: (1,0)<-(0,0), (0,0)<-(1,0)
        assert_eq!(get_surface_pixel(&surface, 1, 0), 0x11111111);
        assert_eq!(get_surface_pixel(&surface, 0, 0), 0x22222222);
    }
}

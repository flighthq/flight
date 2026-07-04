//! Crop, extend, and trim operations that allocate new surfaces.

use flighthq_types::{RectangleLike, Surface, SurfaceEdgeMode};

use crate::surface::create_surface;

/// Allocates a new `Surface` containing the pixels of `source` cropped to
/// `rect`. `rect` coordinates are relative to the surface origin. Pixels
/// that fall outside the source are filled with transparent black.
pub fn crop_surface(source: &Surface, rect: &RectangleLike) -> Surface {
    let sw = source.width;
    let sh = source.height;
    let rx = rect.x.round() as i32;
    let ry = rect.y.round() as i32;
    let rw = rect.width.round().max(0.0) as u32;
    let rh = rect.height.round().max(0.0) as u32;
    let mut out = create_surface(rw, rh, 0);
    let sd = &source.data;
    let dd = &mut out.data;
    for py in 0..rh {
        let sy = ry + py as i32;
        if sy < 0 || sy >= sh as i32 {
            continue;
        }
        for px in 0..rw {
            let sx = rx + px as i32;
            if sx < 0 || sx >= sw as i32 {
                continue;
            }
            let si = (sy as u32 * sw + sx as u32) as usize * 4;
            let di = (py * rw + px) as usize * 4;
            dd[di] = sd[si];
            dd[di + 1] = sd[si + 1];
            dd[di + 2] = sd[si + 2];
            dd[di + 3] = sd[si + 3];
        }
    }
    out.alpha_type = source.alpha_type;
    out.color_space = source.color_space;
    out.format = source.format;
    out
}

/// Allocates a new `Surface` with `source` padded by the given pixel counts.
/// Added pixels are filled according to `edge_mode`:
/// - `Transparent`: filled with `fill_color` (default transparent black).
/// - `Clamp`: border pixels of `source` are repeated.
/// - `Wrap`: `source` is tiled.
/// - `Mirror`: `source` is mirrored at the edges.
pub fn extend_surface(
    source: &Surface,
    left: u32,
    top: u32,
    right: u32,
    bottom: u32,
    edge_mode: SurfaceEdgeMode,
    fill_color: u32,
) -> Surface {
    let sw = source.width;
    let sh = source.height;
    let dw = sw + left + right;
    let dh = sh + top + bottom;
    let mut out = create_surface(dw, dh, 0);
    let sd = &source.data;
    let dd = &mut out.data;
    let fr = ((fill_color >> 24) & 0xff) as u8;
    let fg = ((fill_color >> 16) & 0xff) as u8;
    let fb = ((fill_color >> 8) & 0xff) as u8;
    let fa = (fill_color & 0xff) as u8;
    for py in 0..dh {
        for px in 0..dw {
            let sx = px as i32 - left as i32;
            let sy = py as i32 - top as i32;
            let di = (py * dw + px) as usize * 4;
            if sx >= 0 && (sx as u32) < sw && sy >= 0 && (sy as u32) < sh {
                let si = (sy as u32 * sw + sx as u32) as usize * 4;
                dd[di] = sd[si];
                dd[di + 1] = sd[si + 1];
                dd[di + 2] = sd[si + 2];
                dd[di + 3] = sd[si + 3];
            } else {
                let cx = resolve_edge(sx, sw as i32, edge_mode);
                let cy = resolve_edge(sy, sh as i32, edge_mode);
                match (cx, cy) {
                    (Some(rx), Some(ry)) => {
                        let si = (ry as u32 * sw + rx as u32) as usize * 4;
                        dd[di] = sd[si];
                        dd[di + 1] = sd[si + 1];
                        dd[di + 2] = sd[si + 2];
                        dd[di + 3] = sd[si + 3];
                    }
                    _ => {
                        dd[di] = fr;
                        dd[di + 1] = fg;
                        dd[di + 2] = fb;
                        dd[di + 3] = fa;
                    }
                }
            }
        }
    }
    out.alpha_type = source.alpha_type;
    out.color_space = source.color_space;
    out.format = source.format;
    out
}

/// Allocates a new `Surface` with the transparent border of `source` removed.
/// Finds the tightest bounding box of all pixels with alpha > 0. If the
/// entire surface is transparent, returns a 1x1 transparent surface.
pub fn trim_surface(source: &Surface) -> Surface {
    let sw = source.width;
    let sh = source.height;
    let sd = &source.data;
    let mut min_x = sw as i32;
    let mut min_y = sh as i32;
    let mut max_x: i32 = -1;
    let mut max_y: i32 = -1;
    for py in 0..sh {
        for px in 0..sw {
            let a = sd[(py * sw + px) as usize * 4 + 3];
            if a > 0 {
                if (px as i32) < min_x {
                    min_x = px as i32;
                }
                if (px as i32) > max_x {
                    max_x = px as i32;
                }
                if (py as i32) < min_y {
                    min_y = py as i32;
                }
                if (py as i32) > max_y {
                    max_y = py as i32;
                }
            }
        }
    }
    if max_x < 0 {
        let mut out = create_surface(1, 1, 0);
        out.alpha_type = source.alpha_type;
        out.color_space = source.color_space;
        out.format = source.format;
        return out;
    }
    crop_surface(
        source,
        &RectangleLike {
            x: min_x as f32,
            y: min_y as f32,
            width: (max_x - min_x + 1) as f32,
            height: (max_y - min_y + 1) as f32,
        },
    )
}

fn resolve_edge(v: i32, size: i32, mode: SurfaceEdgeMode) -> Option<i32> {
    if v >= 0 && v < size {
        return Some(v);
    }
    match mode {
        SurfaceEdgeMode::Clamp => Some(v.clamp(0, size - 1)),
        SurfaceEdgeMode::Wrap => Some(((v % size) + size) % size),
        SurfaceEdgeMode::Mirror => {
            let period = 2 * size;
            let wrapped = ((v % period) + period) % period;
            if wrapped < size {
                Some(wrapped)
            } else {
                Some(period - 1 - wrapped)
            }
        }
        SurfaceEdgeMode::Transparent => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::{get_surface_pixel, set_surface_pixel};

    #[test]
    fn crop_surface_extracts_subregion() {
        let mut s = create_surface(4, 4, 0);
        set_surface_pixel(&mut s, 1, 1, 0xff0000ff);
        set_surface_pixel(&mut s, 2, 2, 0x00ff00ff);
        let cropped = crop_surface(
            &s,
            &RectangleLike {
                x: 1.0,
                y: 1.0,
                width: 2.0,
                height: 2.0,
            },
        );
        assert_eq!(cropped.width, 2);
        assert_eq!(cropped.height, 2);
        assert_eq!(get_surface_pixel(&cropped, 0, 0), 0xff0000ff);
        assert_eq!(get_surface_pixel(&cropped, 1, 1), 0x00ff00ff);
    }

    #[test]
    fn crop_surface_out_of_bounds_transparent() {
        let s = create_surface(2, 2, 0xff0000ff);
        let cropped = crop_surface(
            &s,
            &RectangleLike {
                x: -1.0,
                y: -1.0,
                width: 4.0,
                height: 4.0,
            },
        );
        assert_eq!(cropped.width, 4);
        assert_eq!(cropped.height, 4);
        // top-left is out of bounds -> transparent
        assert_eq!(get_surface_pixel(&cropped, 0, 0), 0);
        // (1,1) maps to source (0,0) -> red
        assert_eq!(get_surface_pixel(&cropped, 1, 1), 0xff0000ff);
    }

    #[test]
    fn extend_surface_pads_transparent() {
        let s = create_surface(2, 2, 0xff0000ff);
        let extended = extend_surface(&s, 1, 1, 1, 1, SurfaceEdgeMode::Transparent, 0);
        assert_eq!(extended.width, 4);
        assert_eq!(extended.height, 4);
        // corner is transparent
        assert_eq!(get_surface_pixel(&extended, 0, 0), 0);
        // original pixel preserved
        assert_eq!(get_surface_pixel(&extended, 1, 1), 0xff0000ff);
    }

    #[test]
    fn extend_surface_clamps_border() {
        let mut s = create_surface(2, 2, 0);
        set_surface_pixel(&mut s, 0, 0, 0xaabbccdd);
        let extended = extend_surface(&s, 1, 0, 0, 0, SurfaceEdgeMode::Clamp, 0);
        assert_eq!(extended.width, 3);
        // Left border clamped from (0,0).
        assert_eq!(get_surface_pixel(&extended, 0, 0), 0xaabbccdd);
    }

    #[test]
    fn trim_surface_removes_transparent_border() {
        let mut s = create_surface(4, 4, 0);
        set_surface_pixel(&mut s, 1, 1, 0xff0000ff);
        set_surface_pixel(&mut s, 2, 2, 0x00ff00ff);
        let trimmed = trim_surface(&s);
        assert_eq!(trimmed.width, 2);
        assert_eq!(trimmed.height, 2);
        assert_eq!(get_surface_pixel(&trimmed, 0, 0), 0xff0000ff);
        assert_eq!(get_surface_pixel(&trimmed, 1, 1), 0x00ff00ff);
    }

    #[test]
    fn trim_surface_fully_transparent_returns_1x1() {
        let s = create_surface(4, 4, 0);
        let trimmed = trim_surface(&s);
        assert_eq!(trimmed.width, 1);
        assert_eq!(trimmed.height, 1);
        assert_eq!(get_surface_pixel(&trimmed, 0, 0), 0);
    }
}

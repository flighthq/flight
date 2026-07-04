//! Linear and radial gradient fill operations on surface regions.

use flighthq_types::SurfaceRegion;

/// How a gradient extends beyond the 0..1 span.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum GradientSpread {
    /// Extends the first or last stop color.
    #[default]
    Pad,
    /// Tiles the gradient.
    Reflect,
    /// Mirrors the gradient alternately.
    Repeat,
}

/// Fills `dest` with a linear gradient defined by two points `(x0, y0)` and
/// `(x1, y1)` in region-local coordinates. Each pixel's position along the
/// gradient axis maps to a ramp index (0--255), looked up in the 256-entry
/// RGBA `ramp` (1024 bytes). Build the ramp with `build_surface_gradient_ramp`.
pub fn fill_surface_linear_gradient(
    dest: &mut SurfaceRegion,
    ramp: &[u8],
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    spread: GradientSpread,
) {
    let dw = dest.width;
    let dh = dest.height;
    let surface_width = dest.surface.width;
    let surface_height = dest.surface.height;
    let data = &mut dest.surface.data;
    let axis_x = x1 - x0;
    let axis_y = y1 - y0;
    let len_sq = axis_x * axis_x + axis_y * axis_y;
    let inv_len = if len_sq > 0.0 { 1.0 / len_sq } else { 0.0 };
    for py in 0..dh {
        let y = dest.y + py;
        if y >= surface_height {
            continue;
        }
        for px in 0..dw {
            let x = dest.x + px;
            if x >= surface_width {
                continue;
            }
            let t = ((px as f32 - x0) * axis_x + (py as f32 - y0) * axis_y) * inv_len;
            let idx = spread_index(t, spread);
            let ri = idx * 4;
            let i = (y * surface_width + x) as usize * 4;
            data[i] = ramp[ri];
            data[i + 1] = ramp[ri + 1];
            data[i + 2] = ramp[ri + 2];
            data[i + 3] = ramp[ri + 3];
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Fills `dest` with a radial gradient centered at `(cx, cy)` with the given
/// `radius`. An optional focal point `(focal_x, focal_y)` shifts the gradient
/// origin. Each pixel's normalized distance maps to a ramp index (0--255),
/// looked up in the 256-entry RGBA `ramp`.
pub fn fill_surface_radial_gradient(
    dest: &mut SurfaceRegion,
    ramp: &[u8],
    cx: f32,
    cy: f32,
    radius: f32,
    focal_x: f32,
    focal_y: f32,
    spread: GradientSpread,
) {
    let dw = dest.width;
    let dh = dest.height;
    let surface_width = dest.surface.width;
    let surface_height = dest.surface.height;
    let data = &mut dest.surface.data;
    let inv_radius = if radius > 0.0 { 1.0 / radius } else { 0.0 };
    let fdx = focal_x - cx;
    let fdy = focal_y - cy;
    for py in 0..dh {
        let y = dest.y + py;
        if y >= surface_height {
            continue;
        }
        for px in 0..dw {
            let x = dest.x + px;
            if x >= surface_width {
                continue;
            }
            let dx = px as f32 - focal_x;
            let dy = py as f32 - focal_y;
            let t = (dx * dx + dy * dy).sqrt() * inv_radius
                - (dx * fdx + dy * fdy) * inv_radius * inv_radius;
            let idx = spread_index(t, spread);
            let ri = idx * 4;
            let i = (y * surface_width + x) as usize * 4;
            data[i] = ramp[ri];
            data[i + 1] = ramp[ri + 1];
            data[i + 2] = ramp[ri + 2];
            data[i + 3] = ramp[ri + 3];
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

fn spread_index(t: f32, spread: GradientSpread) -> usize {
    let s = match spread {
        GradientSpread::Repeat => t - t.floor(),
        GradientSpread::Reflect => {
            let wrapped = t - (t / 2.0).floor() * 2.0;
            if wrapped <= 1.0 {
                wrapped
            } else {
                2.0 - wrapped
            }
        }
        GradientSpread::Pad => t.clamp(0.0, 1.0),
    };
    (s * 255.0).round().min(255.0) as usize
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    fn white_ramp() -> Vec<u8> {
        let mut ramp = vec![0u8; 1024];
        for i in 0..256 {
            let v = i as u8;
            ramp[i * 4] = v;
            ramp[i * 4 + 1] = v;
            ramp[i * 4 + 2] = v;
            ramp[i * 4 + 3] = 0xff;
        }
        ramp
    }

    #[test]
    fn fill_surface_linear_gradient_horizontal() {
        let s = create_surface(256, 1, 0);
        let mut dest = create_surface_region(s, 0, 0, 256, 1);
        let ramp = white_ramp();
        fill_surface_linear_gradient(&mut dest, &ramp, 0.0, 0.0, 255.0, 0.0, GradientSpread::Pad);
        // First pixel should be near 0, last near 255.
        assert_eq!(dest.surface.data[0], 0);
        let last = (255 * 4) as usize;
        assert_eq!(dest.surface.data[last], 255);
    }

    #[test]
    fn fill_surface_radial_gradient_center() {
        let s = create_surface(3, 3, 0);
        let mut dest = create_surface_region(s, 0, 0, 3, 3);
        let ramp = white_ramp();
        fill_surface_radial_gradient(
            &mut dest,
            &ramp,
            1.0,
            1.0,
            2.0,
            1.0,
            1.0,
            GradientSpread::Pad,
        );
        // Center pixel (1,1) at distance 0 -> ramp[0] = 0
        let center = (1 * 3 + 1) * 4;
        assert_eq!(dest.surface.data[center], 0);
        // Alpha should be from ramp
        assert_eq!(dest.surface.data[center + 3], 0xff);
    }

    #[test]
    fn spread_index_pad_clamps() {
        assert_eq!(spread_index(-0.5, GradientSpread::Pad), 0);
        assert_eq!(spread_index(1.5, GradientSpread::Pad), 255);
        assert_eq!(spread_index(0.5, GradientSpread::Pad), 128);
    }

    #[test]
    fn spread_index_repeat_wraps() {
        let a = spread_index(0.25, GradientSpread::Repeat);
        let b = spread_index(1.25, GradientSpread::Repeat);
        assert_eq!(a, b);
    }

    #[test]
    fn spread_index_reflect_mirrors() {
        let a = spread_index(0.25, GradientSpread::Reflect);
        let b = spread_index(1.75, GradientSpread::Reflect);
        assert_eq!(a, b);
    }
}

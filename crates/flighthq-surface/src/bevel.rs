//! Bevel filter: directional edge highlight and shadow from alpha gradient.

use flighthq_types::SurfaceRegion;

use crate::blur::{blur_surface_pixels_horizontal, blur_surface_pixels_vertical};

/// Where the bevel is drawn relative to the shape.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SurfaceBevelType {
    Both,
    #[default]
    Inner,
    Outer,
}

/// Options for `bevel_surface`.
#[derive(Clone, Debug)]
pub struct SurfaceBevelOptions {
    /// Light direction in radians, pointing toward the light source. Default π/4.
    pub angle: f32,
    /// Sampling offset along the light axis, in pixels. Default 4.
    pub distance: f32,
    pub radius_x: u32,
    pub radius_y: u32,
    pub passes: u32,
    /// Packed `0xRRGGBBAA` color of the lit edge. Default `0xffffffff`.
    pub highlight_color: u32,
    /// Packed `0xRRGGBBAA` color of the shaded edge. Default `0x000000ff`.
    pub shadow_color: u32,
    /// Overall intensity multiplier. Default 1.0.
    pub intensity: f32,
    /// Where the bevel is drawn relative to the shape. Default `Inner`.
    pub bevel_type: SurfaceBevelType,
}

impl Default for SurfaceBevelOptions {
    fn default() -> Self {
        Self {
            angle: std::f32::consts::FRAC_PI_4,
            distance: 4.0,
            radius_x: 2,
            radius_y: 2,
            passes: 1,
            highlight_color: 0xffffffff,
            shadow_color: 0x000000ff,
            intensity: 1.0,
            bevel_type: SurfaceBevelType::Inner,
        }
    }
}

/// Produces a bevel mask in `out`: a tinted highlight on the edge facing the
/// light and a shadow on the opposite edge, derived from the directional
/// gradient of the source's blurred alpha.
///
/// `out` and `scratch` must each be at least `source.width * source.height * 4`
/// bytes, and `out` must NOT alias `source.surface.data`.
/// `scratch` must be distinct from `out`.
/// To complete the effect, composite `out` over the original source.
pub fn bevel_surface(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &SurfaceRegion,
    options: &SurfaceBevelOptions,
) {
    let w = source.width;
    let h = source.height;
    let angle = options.angle;
    let distance = options.distance;
    let offset_x = (angle.cos() * distance).round() as i64;
    let offset_y = (angle.sin() * distance).round() as i64;
    let bevel_type = options.bevel_type;
    let intensity = options.intensity;
    let highlight_color = options.highlight_color;
    let shadow_color = options.shadow_color;

    // Build the blurred alpha field in `scratch`, using `out` as the ping-pong
    // buffer. The blurred result ends up back in `scratch`.
    for py in 0..h {
        for px in 0..w {
            let di = ((py * w + px) * 4) as usize;
            scratch[di] = 0;
            scratch[di + 1] = 0;
            scratch[di + 2] = 0;
            scratch[di + 3] = read_source_alpha(source, px, py);
        }
    }
    blur_field(
        scratch,
        out,
        w,
        h,
        options.radius_x,
        options.radius_y,
        options.passes,
    );

    for py in 0..h {
        for px in 0..w {
            let di = ((py * w + px) * 4) as usize;
            let lit = sample_field(scratch, w, h, px as i64 - offset_x, py as i64 - offset_y);
            let shade = sample_field(scratch, w, h, px as i64 + offset_x, py as i64 + offset_y);
            let gradient = lit - shade;

            let color = if gradient >= 0.0 {
                highlight_color
            } else {
                shadow_color
            };
            let color_alpha = (color & 0xff) as f32 / 255.0;
            let clip = match bevel_type {
                SurfaceBevelType::Inner => read_source_alpha(source, px, py) as f32 / 255.0,
                SurfaceBevelType::Outer => 1.0 - read_source_alpha(source, px, py) as f32 / 255.0,
                SurfaceBevelType::Both => 1.0,
            };
            let edge_intensity = (gradient.abs() * intensity).min(1.0);

            out[di] = ((color >> 24) & 0xff) as u8;
            out[di + 1] = ((color >> 16) & 0xff) as u8;
            out[di + 2] = ((color >> 8) & 0xff) as u8;
            out[di + 3] = (edge_intensity * color_alpha * clip * 255.0).round() as u8;
        }
    }
}

// Ping-pongs `field` and `scratch` through the box blur, leaving the result
// back in `field`.
fn blur_field(
    field: &mut [u8],
    scratch: &mut [u8],
    w: u32,
    h: u32,
    radius_x: u32,
    radius_y: u32,
    passes: u32,
) {
    let rx = radius_x;
    let ry = radius_y;
    let p = passes.max(1);
    let len = (w * h * 4) as usize;
    let mut result_in_field = true;
    for _ in 0..p {
        if rx > 0 {
            if result_in_field {
                blur_surface_pixels_horizontal(scratch, field, w, h, rx);
            } else {
                blur_surface_pixels_horizontal(field, scratch, w, h, rx);
            }
            result_in_field = !result_in_field;
        }
        if ry > 0 {
            if result_in_field {
                blur_surface_pixels_vertical(scratch, field, w, h, ry);
            } else {
                blur_surface_pixels_vertical(field, scratch, w, h, ry);
            }
            result_in_field = !result_in_field;
        }
    }
    if !result_in_field {
        field[..len].copy_from_slice(&scratch[..len]);
    }
}

fn read_source_alpha(source: &SurfaceRegion, px: u32, py: u32) -> u8 {
    let sx = source.x + px;
    let sy = source.y + py;
    if sx >= source.surface.width || sy >= source.surface.height {
        return 0;
    }
    source.surface.data[((sy * source.surface.width + sx) * 4 + 3) as usize]
}

// Returns the blurred alpha at (x, y) normalized to 0..1; 0 outside the field.
fn sample_field(field: &[u8], w: u32, h: u32, x: i64, y: i64) -> f32 {
    if x < 0 || x >= w as i64 || y < 0 || y >= h as i64 {
        return 0.0;
    }
    field[((y * w as i64 + x) * 4 + 3) as usize] as f32 / 255.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::create_surface;
    use flighthq_types::SurfaceRegion;

    fn region(surface: flighthq_types::Surface) -> SurfaceRegion {
        let width = surface.width;
        let height = surface.height;
        SurfaceRegion {
            surface,
            x: 0,
            y: 0,
            width,
            height,
        }
    }

    // 5x1 strip with a single alpha edge: transparent x2 | opaque x3.
    fn edge_strip() -> flighthq_types::Surface {
        let mut s = create_surface(5, 1, 0);
        for x in 2..5 {
            s.data[x * 4 + 3] = 255;
        }
        s
    }

    #[test]
    fn bevel_surface_both_type() {
        let source = edge_strip();
        let mut out = vec![0_u8; 20];
        let mut scratch = vec![0_u8; 20];
        bevel_surface(
            &mut out,
            &mut scratch,
            &region(source),
            &SurfaceBevelOptions {
                angle: std::f32::consts::PI,
                distance: 1.0,
                radius_x: 1,
                radius_y: 0,
                passes: 1,
                highlight_color: 0xffffffff,
                shadow_color: 0x000000ff,
                intensity: 1.0,
                bevel_type: SurfaceBevelType::Both,
            },
        );
        // Left edge: white highlight.
        assert_eq!(out[2 * 4], 255);
        assert_eq!(out[2 * 4 + 1], 255);
        assert_eq!(out[2 * 4 + 2], 255);
        assert_eq!(out[2 * 4 + 3], 170);
        // Right edge faces away from the light: black shadow.
        assert_eq!(out[4 * 4], 0);
        assert_eq!(out[4 * 4 + 1], 0);
        assert_eq!(out[4 * 4 + 2], 0);
        assert_eq!(out[4 * 4 + 3], 255);
    }

    #[test]
    fn bevel_surface_inner_type() {
        let source = edge_strip();
        let mut out = vec![0_u8; 20];
        let mut scratch = vec![0_u8; 20];
        bevel_surface(
            &mut out,
            &mut scratch,
            &region(source),
            &SurfaceBevelOptions {
                angle: std::f32::consts::PI,
                distance: 1.0,
                radius_x: 1,
                radius_y: 0,
                passes: 1,
                highlight_color: 0xffffffff,
                shadow_color: 0x000000ff,
                intensity: 1.0,
                bevel_type: SurfaceBevelType::Inner,
            },
        );
        // x0/x1 are outside the shape (source alpha 0) → clipped to 0.
        assert_eq!(out[0 * 4 + 3], 0);
        assert_eq!(out[1 * 4 + 3], 0);
        // x2 is inside the shape → highlight survives.
        assert_eq!(out[2 * 4 + 3], 170);
    }
}

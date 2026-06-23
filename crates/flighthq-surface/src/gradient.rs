//! Gradient bevel and gradient glow filters, and gradient ramp builder.

use flighthq_types::SurfaceRegion;

use crate::bevel::SurfaceBevelType;
use crate::blur::{blur_surface_pixels_horizontal, blur_surface_pixels_vertical};

/// Options for `gradient_bevel_surface`.
#[derive(Clone, Debug)]
pub struct SurfaceGradientBevelOptions {
    /// Light direction in radians. Default π/4.
    pub angle: f32,
    /// Sampling offset along the light axis, in pixels. Default 4.
    pub distance: f32,
    pub radius_x: u32,
    pub radius_y: u32,
    pub passes: u32,
    /// Overall opacity multiplier. Default 1.0.
    pub intensity: f32,
    /// Where the bevel is drawn relative to the shape. Default `Inner`.
    pub bevel_type: SurfaceBevelType,
}

impl Default for SurfaceGradientBevelOptions {
    fn default() -> Self {
        Self {
            angle: std::f32::consts::FRAC_PI_4,
            distance: 4.0,
            radius_x: 2,
            radius_y: 2,
            passes: 1,
            intensity: 1.0,
            bevel_type: SurfaceBevelType::Inner,
        }
    }
}

/// Options for `gradient_glow_surface`.
#[derive(Clone, Debug)]
pub struct SurfaceGradientGlowOptions {
    pub radius_x: u32,
    pub radius_y: u32,
    pub passes: u32,
    /// Overall opacity multiplier. Default 1.0.
    pub intensity: f32,
}

impl Default for SurfaceGradientGlowOptions {
    fn default() -> Self {
        Self {
            radius_x: 2,
            radius_y: 2,
            passes: 1,
            intensity: 1.0,
        }
    }
}

/// Produces a gradient bevel mask in `out`. Like `bevel_surface`,
/// but the signed edge gradient (−1..1) indexes the 256-entry `ramp` instead
/// of selecting one of two flat colors: −1 maps to ramp index 0 (shadow side),
/// 0 to 128 (flat), +1 to 255 (highlight side).
///
/// `ramp` must be 256 RGBA entries (1024 bytes); build it with
/// `build_surface_gradient_ramp`. `scratch` must be distinct from `out`, at
/// least `source.width * source.height * 4` bytes.
///
/// `out` must NOT alias `source.surface.data`.
pub fn gradient_bevel_surface(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &SurfaceRegion,
    ramp: &[u8; 1024],
    options: &SurfaceGradientBevelOptions,
) {
    let w = source.width;
    let h = source.height;
    let angle = options.angle;
    let distance = options.distance;
    let offset_x = (angle.cos() * distance).round() as i64;
    let offset_y = (angle.sin() * distance).round() as i64;
    let bevel_type = options.bevel_type;
    let intensity = options.intensity;

    for py in 0..h {
        for px in 0..w {
            let di = ((py * w + px) * 4) as usize;
            scratch[di] = 0;
            scratch[di + 1] = 0;
            scratch[di + 2] = 0;
            scratch[di + 3] = read_source_alpha(source, px, py);
        }
    }
    blur_alpha_field(
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
            let idx = ((gradient * 0.5 + 0.5) * 255.0).round().clamp(0.0, 255.0) as usize;
            let ri = idx * 4;
            let clip = match bevel_type {
                SurfaceBevelType::Inner => read_source_alpha(source, px, py) as f32 / 255.0,
                SurfaceBevelType::Outer => 1.0 - read_source_alpha(source, px, py) as f32 / 255.0,
                SurfaceBevelType::Both => 1.0,
            };
            out[di] = ramp[ri];
            out[di + 1] = ramp[ri + 1];
            out[di + 2] = ramp[ri + 2];
            out[di + 3] = (ramp[ri + 3] as f32 * intensity * clip).round().min(255.0) as u8;
        }
    }
}

/// Produces a gradient glow mask in `out`. The blurred source alpha (0..255)
/// indexes the 256-entry `ramp` for both color and opacity.
///
/// `ramp` must be 256 RGBA entries (1024 bytes); build it with
/// `build_surface_gradient_ramp`. `scratch` must be at least
/// `source.width * source.height * 4` bytes.
pub fn gradient_glow_surface(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &SurfaceRegion,
    ramp: &[u8; 1024],
    options: &SurfaceGradientGlowOptions,
) {
    let w = source.width;
    let h = source.height;
    let intensity = options.intensity;

    for py in 0..h {
        for px in 0..w {
            let di = ((py * w + px) * 4) as usize;
            out[di] = 0;
            out[di + 1] = 0;
            out[di + 2] = 0;
            out[di + 3] = read_source_alpha(source, px, py);
        }
    }
    blur_alpha_field(
        out,
        scratch,
        w,
        h,
        options.radius_x,
        options.radius_y,
        options.passes,
    );

    for py in 0..h {
        for px in 0..w {
            let di = ((py * w + px) * 4) as usize;
            let ri = out[di + 3] as usize * 4;
            out[di] = ramp[ri];
            out[di + 1] = ramp[ri + 1];
            out[di + 2] = ramp[ri + 2];
            out[di + 3] = (ramp[ri + 3] as f32 * intensity).round().min(255.0) as u8;
        }
    }
}

/// Fills `out` (256 RGBA entries, 1024 bytes) with a gradient lookup table
/// built from parallel `colors` (packed `0xRRGGBB`), `alphas` (0.0..1.0),
/// and `ratios` (0..255, ascending) slices.
pub fn build_surface_gradient_ramp(
    out: &mut [u8; 1024],
    colors: &[u32],
    alphas: &[f32],
    ratios: &[u8],
) {
    let n = ratios.len();
    if n == 0 {
        out.fill(0);
        return;
    }
    for i in 0..256 {
        let r;
        let g;
        let b;
        let a;
        if i <= ratios[0] as usize {
            r = ((colors[0] >> 16) & 0xff) as f32;
            g = ((colors[0] >> 8) & 0xff) as f32;
            b = (colors[0] & 0xff) as f32;
            a = alphas[0];
        } else if i >= ratios[n - 1] as usize {
            r = ((colors[n - 1] >> 16) & 0xff) as f32;
            g = ((colors[n - 1] >> 8) & 0xff) as f32;
            b = (colors[n - 1] & 0xff) as f32;
            a = alphas[n - 1];
        } else {
            let mut j = 0;
            while j < n - 1 && (ratios[j + 1] as usize) < i {
                j += 1;
            }
            let span = ratios[j + 1] as f32 - ratios[j] as f32;
            let t = if span > 0.0 {
                (i as f32 - ratios[j] as f32) / span
            } else {
                0.0
            };
            r = lerp(
                ((colors[j] >> 16) & 0xff) as f32,
                ((colors[j + 1] >> 16) & 0xff) as f32,
                t,
            );
            g = lerp(
                ((colors[j] >> 8) & 0xff) as f32,
                ((colors[j + 1] >> 8) & 0xff) as f32,
                t,
            );
            b = lerp((colors[j] & 0xff) as f32, (colors[j + 1] & 0xff) as f32, t);
            a = lerp(alphas[j], alphas[j + 1], t);
        }
        let oi = i * 4;
        out[oi] = r.round() as u8;
        out[oi + 1] = g.round() as u8;
        out[oi + 2] = b.round() as u8;
        out[oi + 3] = (a * 255.0).round() as u8;
    }
}

// Ping-pongs `field` and `scratch` through the box blur, leaving the result
// back in `field`.
fn blur_alpha_field(
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

fn lerp(from: f32, to: f32, t: f32) -> f32 {
    from + (to - from) * t
}

fn read_source_alpha(source: &SurfaceRegion, px: u32, py: u32) -> u8 {
    let sx = source.x + px;
    let sy = source.y + py;
    if sx >= source.surface.width || sy >= source.surface.height {
        return 0;
    }
    source.surface.data[((sy * source.surface.width + sx) * 4 + 3) as usize]
}

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

    #[test]
    fn gradient_bevel_surface_maps_through_ramp() {
        let mut source = create_surface(5, 1, 0);
        for x in 2..5 {
            source.data[x * 4 + 3] = 255;
        }
        let mut ramp = [0_u8; 1024];
        build_surface_gradient_ramp(
            &mut ramp,
            &[0x000000, 0x808080, 0xffffff],
            &[1.0, 0.0, 1.0],
            &[0, 128, 255],
        );
        let mut out = vec![0_u8; 20];
        let mut scratch = vec![0_u8; 20];
        gradient_bevel_surface(
            &mut out,
            &mut scratch,
            &region(source),
            &ramp,
            &SurfaceGradientBevelOptions {
                angle: std::f32::consts::PI,
                distance: 1.0,
                radius_x: 1,
                radius_y: 0,
                passes: 1,
                intensity: 1.0,
                bevel_type: SurfaceBevelType::Both,
            },
        );
        // Light-facing edge (x2) is on the highlight half of the ramp → bright.
        assert!(out[2 * 4] > 150);
        assert!(out[2 * 4 + 3] > 0);
        // Far edge (x4) maps to ramp index 0 → opaque black shadow.
        assert_eq!(out[4 * 4], 0);
        assert_eq!(out[4 * 4 + 3], 255);
    }

    #[test]
    fn gradient_glow_surface_runs() {
        let mut ramp = [0_u8; 1024];
        build_surface_gradient_ramp(&mut ramp, &[0x00ff00, 0x00ff00], &[0.0, 1.0], &[0, 255]);
        let source = create_surface(1, 1, 0xffffffff);
        let mut out = vec![0_u8; 4];
        let mut scratch = vec![0_u8; 4];
        gradient_glow_surface(
            &mut out,
            &mut scratch,
            &region(source),
            &ramp,
            &SurfaceGradientGlowOptions {
                radius_x: 0,
                radius_y: 0,
                passes: 1,
                intensity: 1.0,
            },
        );
        // Full alpha (255) → ramp[255] = opaque green.
        assert_eq!(out[0], 0);
        assert_eq!(out[1], 0xff);
        assert_eq!(out[2], 0);
        assert_eq!(out[3], 255);
    }

    #[test]
    fn gradient_glow_surface_scales_intensity() {
        let mut ramp = [0_u8; 1024];
        build_surface_gradient_ramp(&mut ramp, &[0x00ff00, 0x00ff00], &[1.0, 1.0], &[0, 255]);
        let source = create_surface(1, 1, 0xffffffff);
        let mut out = vec![0_u8; 4];
        let mut scratch = vec![0_u8; 4];
        gradient_glow_surface(
            &mut out,
            &mut scratch,
            &region(source),
            &ramp,
            &SurfaceGradientGlowOptions {
                radius_x: 0,
                radius_y: 0,
                passes: 1,
                intensity: 0.5,
            },
        );
        assert_eq!(out[3], 128);
    }

    #[test]
    fn build_surface_gradient_ramp_empty_fills_zero() {
        let mut ramp = [99_u8; 1024];
        build_surface_gradient_ramp(&mut ramp, &[], &[], &[]);
        assert!(ramp.iter().all(|&v| v == 0));
    }

    #[test]
    fn build_surface_gradient_ramp_single_stop() {
        let mut ramp = [0_u8; 1024];
        build_surface_gradient_ramp(&mut ramp, &[0xff0000], &[1.0], &[128]);
        // Every entry takes the single stop's color and alpha.
        assert_eq!(&ramp[0..4], &[255, 0, 0, 255]);
        assert_eq!(&ramp[255 * 4..256 * 4], &[255, 0, 0, 255]);
    }

    #[test]
    fn build_surface_gradient_ramp_endpoints_and_midpoint() {
        let mut ramp = [0_u8; 1024];
        build_surface_gradient_ramp(&mut ramp, &[0xff0000, 0x0000ff], &[0.0, 1.0], &[0, 255]);
        assert_eq!(&ramp[0..4], &[255, 0, 0, 0]);
        assert_eq!(&ramp[255 * 4..256 * 4], &[0, 0, 255, 255]);
        assert_eq!(&ramp[128 * 4..129 * 4], &[127, 0, 128, 128]);
    }
}

//! Drop shadow, glow, inner glow, and inner shadow filter masks.

use flighthq_types::SurfaceRegion;

use crate::blur::{blur_surface_pixels_horizontal, blur_surface_pixels_vertical};

/// Shared blur radius options used by shadow and glow filters.
#[derive(Clone, Debug)]
pub struct SurfaceBlurOptions {
    pub radius_x: u32,
    pub radius_y: u32,
    pub passes: u32,
}

impl Default for SurfaceBlurOptions {
    fn default() -> Self {
        Self {
            radius_x: 2,
            radius_y: 2,
            passes: 1,
        }
    }
}

/// Options for `drop_shadow_surface`.
#[derive(Clone, Debug)]
pub struct SurfaceDropShadowOptions {
    pub radius_x: u32,
    pub radius_y: u32,
    pub passes: u32,
    /// Packed `0xRRGGBBAA` shadow color. Default `0x000000ff` (opaque black).
    pub color: u32,
    /// Overall intensity multiplier applied to the shadow alpha. Default 1.0.
    pub intensity: f32,
}

impl Default for SurfaceDropShadowOptions {
    fn default() -> Self {
        Self {
            radius_x: 2,
            radius_y: 2,
            passes: 1,
            color: 0x000000ff,
            intensity: 1.0,
        }
    }
}

/// Options for `glow_surface`.
#[derive(Clone, Debug)]
pub struct SurfaceGlowOptions {
    pub radius_x: u32,
    pub radius_y: u32,
    pub passes: u32,
    /// Packed `0xRRGGBBAA` glow color. Default `0xff0000ff` (opaque red).
    pub color: u32,
    /// Overall intensity multiplier applied to the glow alpha. Default 1.0.
    pub intensity: f32,
}

impl Default for SurfaceGlowOptions {
    fn default() -> Self {
        Self {
            radius_x: 2,
            radius_y: 2,
            passes: 1,
            color: 0xff0000ff,
            intensity: 1.0,
        }
    }
}

/// Options for `inner_glow_surface`.
#[derive(Clone, Debug)]
pub struct SurfaceInnerGlowOptions {
    pub radius_x: u32,
    pub radius_y: u32,
    pub passes: u32,
    /// Packed `0xRRGGBBAA` inner glow color. Default `0xff0000ff` (opaque red).
    pub color: u32,
    /// Overall intensity multiplier. Default 1.0.
    pub intensity: f32,
}

impl Default for SurfaceInnerGlowOptions {
    fn default() -> Self {
        Self {
            radius_x: 2,
            radius_y: 2,
            passes: 1,
            color: 0xff0000ff,
            intensity: 1.0,
        }
    }
}

/// Options for `inner_shadow_surface`.
#[derive(Clone, Debug)]
pub struct SurfaceInnerShadowOptions {
    pub radius_x: u32,
    pub radius_y: u32,
    pub passes: u32,
    /// Packed `0xRRGGBBAA` inner shadow color. Default `0x000000ff` (opaque black).
    pub color: u32,
    /// Overall intensity multiplier. Default 1.0.
    pub intensity: f32,
}

impl Default for SurfaceInnerShadowOptions {
    fn default() -> Self {
        Self {
            radius_x: 2,
            radius_y: 2,
            passes: 1,
            color: 0x000000ff,
            intensity: 1.0,
        }
    }
}

/// Produces the blurred shadow mask for a drop shadow effect, writing into `out`.
/// The result is a tinted, blurred alpha mask derived from `source`.
///
/// `scratch` must be at least `source.width * source.height * 4` bytes.
/// Safe to pass `source.surface.data` as `out` when the region covers the full
/// surface.
pub fn drop_shadow_surface(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &SurfaceRegion,
    options: &SurfaceDropShadowOptions,
) {
    tint_surface_alpha_mask(out, source, options.color, options.intensity);
    apply_blur_passes(
        out,
        scratch,
        source.width,
        source.height,
        options.radius_x,
        options.radius_y,
        options.passes,
    );
}

/// Produces the blurred glow mask for a glow effect, writing into `out`.
/// The result is a tinted, blurred alpha mask derived from `source`.
///
/// `scratch` must be at least `source.width * source.height * 4` bytes.
/// Safe to pass `source.surface.data` as `out` when the region covers the full
/// surface.
pub fn glow_surface(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &SurfaceRegion,
    options: &SurfaceGlowOptions,
) {
    tint_surface_alpha_mask(out, source, options.color, options.intensity);
    apply_blur_passes(
        out,
        scratch,
        source.width,
        source.height,
        options.radius_x,
        options.radius_y,
        options.passes,
    );
}

/// Produces the inner glow mask — a glow that hugs the inside of the source's
/// alpha boundary — writing into `out`.
///
/// `scratch` must be at least `source.width * source.height * 4` bytes.
/// `out` must NOT alias `source.surface.data`.
pub fn inner_glow_surface(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &SurfaceRegion,
    options: &SurfaceInnerGlowOptions,
) {
    apply_inner_effect(
        out,
        scratch,
        source,
        options.color,
        options.intensity,
        options.radius_x,
        options.radius_y,
        options.passes,
    );
}

/// Produces the inner shadow mask — identical to `inner_glow_surface`
/// except for the default color (opaque black).
///
/// `scratch` must be at least `source.width * source.height * 4` bytes.
/// `out` must NOT alias `source.surface.data`.
pub fn inner_shadow_surface(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &SurfaceRegion,
    options: &SurfaceInnerShadowOptions,
) {
    apply_inner_effect(
        out,
        scratch,
        source,
        options.color,
        options.intensity,
        options.radius_x,
        options.radius_y,
        options.passes,
    );
}

// Ping-pongs `out` and `scratch` through the box blur passes and leaves the
// final result in `out`.
fn apply_blur_passes(
    out: &mut [u8],
    scratch: &mut [u8],
    width: u32,
    height: u32,
    radius_x: u32,
    radius_y: u32,
    passes: u32,
) {
    let passes = passes.max(1);
    let len = (width * height * 4) as usize;
    let mut result_in_out = true;
    for _ in 0..passes {
        if radius_x > 0 {
            if result_in_out {
                blur_surface_pixels_horizontal(scratch, out, width, height, radius_x);
            } else {
                blur_surface_pixels_horizontal(out, scratch, width, height, radius_x);
            }
            result_in_out = !result_in_out;
        }
        if radius_y > 0 {
            if result_in_out {
                blur_surface_pixels_vertical(scratch, out, width, height, radius_y);
            } else {
                blur_surface_pixels_vertical(out, scratch, width, height, radius_y);
            }
            result_in_out = !result_in_out;
        }
    }
    if !result_in_out {
        out[..len].copy_from_slice(&scratch[..len]);
    }
}

fn apply_inner_effect(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &SurfaceRegion,
    color: u32,
    intensity: f32,
    radius_x: u32,
    radius_y: u32,
    passes: u32,
) {
    let w = source.width;
    let h = source.height;

    // Step 1: write the inverted source alpha into out (rgb 0). High outside the
    // shape, low inside — so the blur bleeds the exterior inward across the edge.
    for py in 0..h {
        for px in 0..w {
            let di = ((py * w + px) * 4) as usize;
            out[di] = 0;
            out[di + 1] = 0;
            out[di + 2] = 0;
            out[di + 3] = 255 - read_source_alpha(source, px, py);
        }
    }

    // Step 2: blur the inverted-alpha field in place (ping-ponging through scratch).
    apply_blur_passes(out, scratch, w, h, radius_x, radius_y, passes);

    // Step 3: tint, and clip by the original source alpha so the glow stays inside.
    let cr = ((color >> 24) & 0xff) as u8;
    let cg = ((color >> 16) & 0xff) as u8;
    let cb = ((color >> 8) & 0xff) as u8;
    let ca = (color & 0xff) as f32 / 255.0;
    let scale = intensity.max(0.0) * ca;
    for py in 0..h {
        for px in 0..w {
            let di = ((py * w + px) * 4) as usize;
            let blurred = out[di + 3] as f32;
            let source_alpha = read_source_alpha(source, px, py) as f32;
            out[di] = cr;
            out[di + 1] = cg;
            out[di + 2] = cb;
            out[di + 3] = ((blurred * source_alpha * scale) / 255.0)
                .round()
                .min(255.0) as u8;
        }
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

// Used internally by drop-shadow and glow filters.
fn tint_surface_alpha_mask(out: &mut [u8], source: &SurfaceRegion, color: u32, intensity: f32) {
    let cr = ((color >> 24) & 0xff) as u8;
    let cg = ((color >> 16) & 0xff) as u8;
    let cb = ((color >> 8) & 0xff) as u8;
    let ca = (color & 0xff) as f32 / 255.0;
    let alpha_scale = intensity.max(0.0) * ca;
    for py in 0..source.height {
        let source_y = source.y + py;
        if source_y >= source.surface.height {
            continue;
        }
        for px in 0..source.width {
            let source_x = source.x + px;
            if source_x >= source.surface.width {
                continue;
            }
            let si = ((source_y * source.surface.width + source_x) * 4) as usize;
            let di = ((py * source.width + px) * 4) as usize;
            out[di] = cr;
            out[di + 1] = cg;
            out[di + 2] = cb;
            out[di + 3] = (source.surface.data[si + 3] as f32 * alpha_scale)
                .round()
                .min(255.0) as u8;
        }
    }
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
    fn drop_shadow_surface_runs() {
        let source = create_surface(1, 1, 0xffffffff);
        let mut out = vec![0_u8; 4];
        let mut scratch = vec![0_u8; 4];
        drop_shadow_surface(
            &mut out,
            &mut scratch,
            &region(source),
            &SurfaceDropShadowOptions {
                radius_x: 0,
                radius_y: 0,
                passes: 1,
                color: 0x0000ffff,
                intensity: 1.0,
            },
        );
        assert_eq!(out[0], 0);
        assert_eq!(out[2], 0xff);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn glow_surface_runs() {
        let source = create_surface(1, 1, 0xffffffff);
        let mut out = vec![0_u8; 4];
        let mut scratch = vec![0_u8; 4];
        glow_surface(
            &mut out,
            &mut scratch,
            &region(source),
            &SurfaceGlowOptions {
                radius_x: 0,
                radius_y: 0,
                passes: 1,
                color: 0x00ff00ff,
                intensity: 1.0,
            },
        );
        assert_eq!(out[1], 0xff);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn inner_glow_surface_runs() {
        // 3x1: transparent | opaque | transparent. Inner glow appears only on
        // the opaque pixel.
        let mut source = create_surface(3, 1, 0);
        source.data[4 + 3] = 255;
        let mut out = vec![0_u8; 12];
        let mut scratch = vec![0_u8; 12];
        inner_glow_surface(
            &mut out,
            &mut scratch,
            &region(source),
            &SurfaceInnerGlowOptions {
                radius_x: 2,
                radius_y: 0,
                passes: 1,
                color: 0x00ff00ff,
                intensity: 1.0,
            },
        );
        assert_eq!(out[3], 0);
        assert_eq!(out[2 * 4 + 3], 0);
        assert_eq!(out[4 + 3], 170);
        assert_eq!(out[4], 0);
        assert_eq!(out[4 + 1], 0xff);
        assert_eq!(out[4 + 2], 0);
    }

    #[test]
    fn inner_glow_surface_zero_blur_is_empty() {
        let source = create_surface(1, 1, 0x0000ffff);
        let mut out = vec![0_u8; 4];
        let mut scratch = vec![0_u8; 4];
        inner_glow_surface(
            &mut out,
            &mut scratch,
            &region(source),
            &SurfaceInnerGlowOptions {
                radius_x: 0,
                radius_y: 0,
                passes: 1,
                color: 0xff0000ff,
                intensity: 1.0,
            },
        );
        assert_eq!(out[3], 0);
    }

    #[test]
    fn inner_shadow_surface_runs() {
        let mut source = create_surface(3, 1, 0);
        source.data[4 + 3] = 255;
        let mut out = vec![0_u8; 12];
        let mut scratch = vec![0_u8; 12];
        inner_shadow_surface(
            &mut out,
            &mut scratch,
            &region(source),
            &SurfaceInnerShadowOptions {
                radius_x: 2,
                radius_y: 0,
                passes: 1,
                color: 0x000000ff,
                intensity: 1.0,
            },
        );
        assert_eq!(out[4], 0);
        assert_eq!(out[4 + 1], 0);
        assert_eq!(out[4 + 2], 0);
        assert_eq!(out[4 + 3], 170);
    }
}

//! Unsharp mask sharpen filter.

use flighthq_types::SurfaceRegion;

use crate::blur::{SurfaceBoxBlurFilterOptions, apply_surface_box_blur_filter};

/// Options for `apply_surface_sharpen_filter`.
#[derive(Clone, Debug)]
pub struct SurfaceSharpenFilterOptions {
    /// Sharpen strength. 0.0 is a no-op; 1.0 is a moderate sharpen; >1.0 is
    /// stronger. Default 1.0.
    pub amount: f32,
    /// Blur radius of the unsharp mask, in pixels. Default 2.
    pub radius_x: u32,
    pub radius_y: u32,
    /// Blur pass count, forwarded to the box blur. Default 1.
    pub passes: u32,
}

impl Default for SurfaceSharpenFilterOptions {
    fn default() -> Self {
        Self {
            amount: 1.0,
            radius_x: 2,
            radius_y: 2,
            passes: 1,
        }
    }
}

/// Sharpens `source` into `out` using an unsharp mask: blurs the source, then
/// adds back `amount × (source − blurred)` so edges are accentuated. Only RGB
/// is sharpened; alpha is copied from the source.
///
/// `scratch` is ping-pong scratch, at least `source.width * source.height * 4`
/// bytes; its contents are undefined after the call.
///
/// `out` must NOT alias `source.surface.data`.
pub fn apply_surface_sharpen_filter(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &SurfaceRegion,
    options: &SurfaceSharpenFilterOptions,
) {
    let amount = options.amount;
    apply_surface_box_blur_filter(
        out,
        scratch,
        source,
        &SurfaceBoxBlurFilterOptions {
            radius_x: options.radius_x,
            radius_y: options.radius_y,
            passes: options.passes,
        },
    );

    let w = source.width;
    let h = source.height;
    let surface_width = source.surface.width;
    let surface_height = source.surface.height;
    let data = &source.surface.data;
    for py in 0..h {
        let sy = source.y + py;
        if sy >= surface_height {
            continue;
        }
        for px in 0..w {
            let sx = source.x + px;
            if sx >= surface_width {
                continue;
            }
            let si = ((sy * surface_width + sx) * 4) as usize;
            let di = ((py * w + px) * 4) as usize;
            let r = data[si] as f32;
            let g = data[si + 1] as f32;
            let b = data[si + 2] as f32;
            out[di] = clamp_byte(r + amount * (r - out[di] as f32));
            out[di + 1] = clamp_byte(g + amount * (g - out[di + 1] as f32));
            out[di + 2] = clamp_byte(b + amount * (b - out[di + 2] as f32));
            out[di + 3] = data[si + 3];
        }
    }
}

fn clamp_byte(value: f32) -> u8 {
    value.round().clamp(0.0, 255.0) as u8
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_surface::create_surface;
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
    fn apply_surface_sharpen_filter_amount_zero_is_unchanged() {
        let mut source = create_surface(3, 1, 0);
        source.data[4] = 10;
        source.data[5] = 20;
        source.data[6] = 30;
        source.data[7] = 120;
        let mut out = vec![0_u8; 12];
        let mut scratch = vec![0_u8; 12];
        apply_surface_sharpen_filter(
            &mut out,
            &mut scratch,
            &region(source),
            &SurfaceSharpenFilterOptions {
                amount: 0.0,
                radius_x: 2,
                radius_y: 2,
                passes: 1,
            },
        );
        assert_eq!(out[4], 10);
        assert_eq!(out[5], 20);
        assert_eq!(out[6], 30);
        assert_eq!(out[7], 120);
    }

    #[test]
    fn apply_surface_sharpen_filter_accentuates_center() {
        let mut source = create_surface(5, 1, 0);
        source.data[2 * 4] = 100;
        for i in 0..5 {
            source.data[i * 4 + 3] = 255;
        }
        let mut out = vec![0_u8; 20];
        let mut scratch = vec![0_u8; 20];
        apply_surface_sharpen_filter(
            &mut out,
            &mut scratch,
            &region(source),
            &SurfaceSharpenFilterOptions {
                amount: 1.0,
                radius_x: 4,
                radius_y: 0,
                passes: 1,
            },
        );
        assert!(out[2 * 4] > 100);
    }

    #[test]
    fn apply_surface_sharpen_filter_preserves_alpha() {
        let mut source = create_surface(3, 1, 0);
        for i in 0..3 {
            source.data[i * 4] = (i * 40) as u8;
            source.data[i * 4 + 3] = 77;
        }
        let mut out = vec![0_u8; 12];
        let mut scratch = vec![0_u8; 12];
        apply_surface_sharpen_filter(
            &mut out,
            &mut scratch,
            &region(source),
            &SurfaceSharpenFilterOptions {
                amount: 2.0,
                radius_x: 2,
                radius_y: 2,
                passes: 1,
            },
        );
        assert_eq!(out[3], 77);
        assert_eq!(out[7], 77);
        assert_eq!(out[11], 77);
    }
}

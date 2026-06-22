//! CPU (bitmap surface) apply functions for each filter type.
//!
//! Each function maps a high-level filter descriptor (from `flighthq-types`)
//! onto the lower-level CPU pixel operations in `flighthq-surface-filters` and
//! invokes them. `out` is RGBA, 4 bytes per pixel, `source.width * source.height`
//! pixels total. `blur_buffer` scratch buffers must be at least
//! `source.width * source.height * 4` bytes; they may not alias `out` unless a
//! function documents otherwise.

use flighthq_surface_filters::{
    SurfaceBevelFilterOptions, SurfaceBevelType, SurfaceConvolutionEdge,
    SurfaceConvolutionFilterOptions, SurfaceDisplacementMapFilterOptions,
    SurfaceDisplacementMapMode, SurfaceDropShadowFilterOptions, SurfaceGlowFilterOptions,
    SurfaceGradientBevelFilterOptions, SurfaceGradientGlowFilterOptions,
    SurfaceInnerGlowFilterOptions, SurfaceInnerShadowFilterOptions, SurfaceSharpenFilterOptions,
    apply_surface_bevel_filter, apply_surface_color_matrix_filter,
    apply_surface_convolution_filter, apply_surface_displacement_map_filter,
    apply_surface_drop_shadow_filter, apply_surface_gaussian_blur_filter,
    apply_surface_glow_filter, apply_surface_gradient_bevel_filter,
    apply_surface_gradient_glow_filter, apply_surface_inner_glow_filter,
    apply_surface_inner_shadow_filter, apply_surface_median_filter, apply_surface_pixelate_filter,
    apply_surface_sharpen_filter, build_surface_gradient_ramp,
};
use flighthq_types::{
    BevelFilter, BevelType, BlurFilter, ColorMatrixFilter, ConvolutionFilter,
    DisplacementMapFilter, DisplacementMapMode, DropShadowFilter, GradientBevelFilter,
    GradientGlowFilter, InnerGlowFilter, InnerShadowFilter, MedianFilter, OuterGlowFilter,
    PixelateFilterDescriptor as PixelateFilter, SharpenFilterDescriptor as SharpenFilter,
    SurfaceRegion,
};

use crate::math::compute_box_blur_radius;

// ---------------------------------------------------------------------------
// Public apply functions
// ---------------------------------------------------------------------------

/// Applies a bevel filter to `source`, writing the bevel mask into `out`.
/// Composite `out` over the original source to complete the effect.
///
/// `blur_buffer` must be at least `source.width * source.height * 4` bytes and
/// must be distinct from `out`. `out` must not alias `source.surface.data`.
pub fn apply_bevel_filter_to_surface(
    out: &mut [u8],
    blur_buffer: &mut [u8],
    source: &SurfaceRegion,
    filter: &BevelFilter,
) {
    let quality = filter.quality.unwrap_or(1);
    let radius_x = compute_box_blur_radius(filter.blur_x.unwrap_or(4.0), quality);
    let radius_y = compute_box_blur_radius(filter.blur_y.unwrap_or(4.0), quality);
    let highlight_color = pack_rgb_alpha(
        filter.highlight_color.unwrap_or(0xffffff),
        filter.highlight_alpha.unwrap_or(1.0),
    );
    let shadow_color = pack_rgb_alpha(
        filter.shadow_color.unwrap_or(0x000000),
        filter.shadow_alpha.unwrap_or(1.0),
    );
    let options = SurfaceBevelFilterOptions {
        angle: filter.angle.unwrap_or(45.0),
        distance: filter.distance.unwrap_or(4.0),
        highlight_color,
        intensity: filter.strength.unwrap_or(1.0),
        passes: quality,
        radius_x,
        radius_y,
        shadow_color,
        bevel_type: bevel_type_to_surface(filter.bevel_type),
    };
    apply_surface_bevel_filter(out, blur_buffer, source, &options);
}

/// Applies a true Gaussian blur to `source`, writing the blurred result into
/// `out`. `blur_x` and `blur_y` on the filter are the Gaussian standard
/// deviations in pixels (matching CSS `blur()`).
///
/// `blur_buffer` must be at least `source.width * source.height * 4` bytes.
/// Safe to pass `source.surface.data` as `out` for a full-surface region.
pub fn apply_blur_filter_to_surface(
    out: &mut [u8],
    blur_buffer: &mut [u8],
    source: &SurfaceRegion,
    filter: &BlurFilter,
) {
    apply_surface_gaussian_blur_filter(
        out,
        blur_buffer,
        source,
        filter.blur_x.unwrap_or(4.0),
        filter.blur_y.unwrap_or(4.0),
        1,
    );
}

/// Applies a 4×5 color matrix to `source`, writing the result into `out`.
///
/// `out` must be at least `source.width * source.height * 4` bytes.
/// Safe to pass `source.surface.data` as `out` for a full-surface region.
pub fn apply_color_matrix_filter_to_surface(
    out: &mut [u8],
    source: &SurfaceRegion,
    filter: &ColorMatrixFilter,
) {
    let mut matrix = [0.0_f32; 20];
    let count = filter.matrix.len().min(20);
    matrix[..count].copy_from_slice(&filter.matrix[..count]);
    apply_surface_color_matrix_filter(out, source, &matrix);
}

/// Applies a kernel convolution to `source`, writing the result into `out`.
/// `out` must not alias `source.surface.data`.
pub fn apply_convolution_filter_to_surface(
    out: &mut [u8],
    source: &SurfaceRegion,
    filter: &ConvolutionFilter,
) {
    // The legacy `clamp` / `color` pair maps onto the edge mode and fill color:
    // `clamp == Some(false)` selects fill, otherwise the default clamp behavior.
    let edge = match filter.clamp {
        Some(false) => SurfaceConvolutionEdge::Fill,
        _ => SurfaceConvolutionEdge::Clamp,
    };
    let options = SurfaceConvolutionFilterOptions {
        bias: filter.bias.unwrap_or(0.0),
        edge,
        fill_color: filter.color.unwrap_or(0),
        divisor: filter.divisor.unwrap_or(0.0),
        matrix: filter.matrix.clone(),
        matrix_x: filter.matrix_x,
        matrix_y: filter.matrix_y,
        preserve_alpha: filter.preserve_alpha.unwrap_or(true),
    };
    apply_surface_convolution_filter(out, source, &options);
}

/// Applies a displacement map warp to `source`, writing the result into `out`.
/// `map` supplies the per-pixel displacement vectors; channels are selected by
/// `filter.component_x` and `filter.component_y`.
///
/// `out` must not alias `source.surface.data`.
pub fn apply_displacement_map_filter_to_surface(
    out: &mut [u8],
    source: &SurfaceRegion,
    map: &SurfaceRegion,
    filter: &DisplacementMapFilter,
) {
    let options = SurfaceDisplacementMapFilterOptions {
        map: map.clone(),
        component_x: filter.component_x.unwrap_or(0),
        component_y: filter.component_y.unwrap_or(1),
        fill_color: pack_rgb_alpha(filter.color.unwrap_or(0), filter.alpha.unwrap_or(0.0)),
        mode: displacement_mode_to_surface(filter.mode),
        scale_x: filter.scale_x.unwrap_or(0.0),
        scale_y: filter.scale_y.unwrap_or(0.0),
    };
    apply_surface_displacement_map_filter(out, source, &options);
}

/// Produces the drop shadow mask for `source`, writing the tinted blurred alpha
/// mask into `out`.
///
/// `blur_buffer` must be at least `source.width * source.height * 4` bytes.
/// Safe to pass `source.surface.data` as `out` for a full-surface region.
pub fn apply_drop_shadow_filter_to_surface(
    out: &mut [u8],
    blur_buffer: &mut [u8],
    source: &SurfaceRegion,
    filter: &DropShadowFilter,
) {
    let quality = filter.quality.unwrap_or(1);
    let radius_x = compute_box_blur_radius(filter.blur_x.unwrap_or(4.0), quality);
    let radius_y = compute_box_blur_radius(filter.blur_y.unwrap_or(4.0), quality);
    let options = SurfaceDropShadowFilterOptions {
        color: pack_rgb_alpha(
            filter.color.unwrap_or(0x000000),
            filter.alpha.unwrap_or(1.0),
        ),
        intensity: filter.strength.unwrap_or(1.0),
        passes: quality,
        radius_x,
        radius_y,
    };
    apply_surface_drop_shadow_filter(out, blur_buffer, source, &options);
}

/// Produces the gradient bevel mask for `source`, writing the result into `out`.
///
/// `blur_buffer` must be at least `source.width * source.height * 4` bytes and
/// must be distinct from `out`. `out` must not alias `source.surface.data`.
pub fn apply_gradient_bevel_filter_to_surface(
    out: &mut [u8],
    blur_buffer: &mut [u8],
    source: &SurfaceRegion,
    filter: &GradientBevelFilter,
) {
    let mut ramp = [0_u8; 1024];
    build_surface_gradient_ramp(
        &mut ramp,
        &filter.colors,
        &filter.alphas,
        &ratios_to_u8(&filter.ratios),
    );
    let quality = filter.quality.unwrap_or(1);
    let radius_x = compute_box_blur_radius(filter.blur_x.unwrap_or(4.0), quality);
    let radius_y = compute_box_blur_radius(filter.blur_y.unwrap_or(4.0), quality);
    let options = SurfaceGradientBevelFilterOptions {
        angle: filter.angle.unwrap_or(45.0),
        distance: filter.distance.unwrap_or(4.0),
        intensity: filter.strength.unwrap_or(1.0),
        passes: quality,
        radius_x,
        radius_y,
        bevel_type: bevel_type_to_surface(filter.bevel_type),
    };
    apply_surface_gradient_bevel_filter(out, blur_buffer, source, &ramp, &options);
}

/// Produces the gradient glow mask for `source`, writing the result into `out`.
///
/// `blur_buffer` must be at least `source.width * source.height * 4` bytes.
/// Safe to pass `source.surface.data` as `out` for a full-surface region.
pub fn apply_gradient_glow_filter_to_surface(
    out: &mut [u8],
    blur_buffer: &mut [u8],
    source: &SurfaceRegion,
    filter: &GradientGlowFilter,
) {
    let mut ramp = [0_u8; 1024];
    build_surface_gradient_ramp(
        &mut ramp,
        &filter.colors,
        &filter.alphas,
        &ratios_to_u8(&filter.ratios),
    );
    let quality = filter.quality.unwrap_or(1);
    let radius_x = compute_box_blur_radius(filter.blur_x.unwrap_or(4.0), quality);
    let radius_y = compute_box_blur_radius(filter.blur_y.unwrap_or(4.0), quality);
    let options = SurfaceGradientGlowFilterOptions {
        intensity: filter.strength.unwrap_or(1.0),
        passes: quality,
        radius_x,
        radius_y,
    };
    apply_surface_gradient_glow_filter(out, blur_buffer, source, &ramp, &options);
}

/// Produces the inner glow mask for `source`, writing the result into `out`.
///
/// `blur_buffer` must be at least `source.width * source.height * 4` bytes.
/// `out` must not alias `source.surface.data`.
pub fn apply_inner_glow_filter_to_surface(
    out: &mut [u8],
    blur_buffer: &mut [u8],
    source: &SurfaceRegion,
    filter: &InnerGlowFilter,
) {
    let quality = filter.quality.unwrap_or(1);
    let radius_x = compute_box_blur_radius(filter.blur_x.unwrap_or(6.0), quality);
    let radius_y = compute_box_blur_radius(filter.blur_y.unwrap_or(6.0), quality);
    let options = SurfaceInnerGlowFilterOptions {
        color: pack_rgb_alpha(
            filter.color.unwrap_or(0xff0000),
            filter.alpha.unwrap_or(1.0),
        ),
        intensity: filter.strength.unwrap_or(1.0),
        passes: quality,
        radius_x,
        radius_y,
    };
    apply_surface_inner_glow_filter(out, blur_buffer, source, &options);
}

/// Produces the inner shadow mask for `source`, writing the result into `out`.
///
/// `blur_buffer` must be at least `source.width * source.height * 4` bytes.
/// `out` must not alias `source.surface.data`.
pub fn apply_inner_shadow_filter_to_surface(
    out: &mut [u8],
    blur_buffer: &mut [u8],
    source: &SurfaceRegion,
    filter: &InnerShadowFilter,
) {
    let quality = filter.quality.unwrap_or(1);
    let radius_x = compute_box_blur_radius(filter.blur_x.unwrap_or(4.0), quality);
    let radius_y = compute_box_blur_radius(filter.blur_y.unwrap_or(4.0), quality);
    let options = SurfaceInnerShadowFilterOptions {
        color: pack_rgb_alpha(
            filter.color.unwrap_or(0x000000),
            filter.alpha.unwrap_or(1.0),
        ),
        intensity: filter.strength.unwrap_or(1.0),
        passes: quality,
        radius_x,
        radius_y,
    };
    apply_surface_inner_shadow_filter(out, blur_buffer, source, &options);
}

/// Applies a median filter to `source`, writing the result into `out`.
/// `out` must not alias `source.surface.data`.
pub fn apply_median_filter_to_surface(
    out: &mut [u8],
    source: &SurfaceRegion,
    filter: &MedianFilter,
) {
    apply_surface_median_filter(out, source, filter.radius.unwrap_or(1.0).round() as u32);
}

/// Produces the outer glow mask for `source`, writing the tinted blurred alpha
/// mask into `out`.
///
/// `blur_buffer` must be at least `source.width * source.height * 4` bytes.
/// Safe to pass `source.surface.data` as `out` for a full-surface region.
pub fn apply_outer_glow_filter_to_surface(
    out: &mut [u8],
    blur_buffer: &mut [u8],
    source: &SurfaceRegion,
    filter: &OuterGlowFilter,
) {
    let quality = filter.quality.unwrap_or(1);
    let radius_x = compute_box_blur_radius(filter.blur_x.unwrap_or(6.0), quality);
    let radius_y = compute_box_blur_radius(filter.blur_y.unwrap_or(6.0), quality);
    let options = SurfaceGlowFilterOptions {
        color: pack_rgb_alpha(
            filter.color.unwrap_or(0xff0000),
            filter.alpha.unwrap_or(1.0),
        ),
        intensity: filter.strength.unwrap_or(1.0),
        passes: quality,
        radius_x,
        radius_y,
    };
    apply_surface_glow_filter(out, blur_buffer, source, &options);
}

/// Pixelates `source` into `out`, averaging each block of `filter.block_size`
/// pixels into a single flat color.
///
/// `out` must be at least `source.width * source.height * 4` bytes.
pub fn apply_pixelate_filter_to_surface(
    out: &mut [u8],
    source: &SurfaceRegion,
    filter: &PixelateFilter,
) {
    apply_surface_pixelate_filter(out, source, filter.block_size.unwrap_or(8.0).round() as u32);
}

/// Sharpens `source` into `out` using an unsharp mask. `blur_x` and `blur_y`
/// are the Gaussian standard deviations of the unsharp mask blur.
///
/// `blur_buffer` must be at least `source.width * source.height * 4` bytes.
/// `out` must not alias `source.surface.data`.
pub fn apply_sharpen_filter_to_surface(
    out: &mut [u8],
    blur_buffer: &mut [u8],
    source: &SurfaceRegion,
    filter: &SharpenFilter,
) {
    let quality = filter.quality.unwrap_or(1);
    let radius_x = compute_box_blur_radius(filter.blur_x.unwrap_or(2.0), quality);
    let radius_y = compute_box_blur_radius(filter.blur_y.unwrap_or(2.0), quality);
    let options = SurfaceSharpenFilterOptions {
        amount: filter.amount.unwrap_or(1.0),
        passes: quality,
        radius_x,
        radius_y,
    };
    apply_surface_sharpen_filter(out, blur_buffer, source, &options);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

fn bevel_type_to_surface(bevel_type: Option<BevelType>) -> SurfaceBevelType {
    match bevel_type {
        Some(BevelType::Inner) => SurfaceBevelType::Inner,
        Some(BevelType::Outer) => SurfaceBevelType::Outer,
        // `full` and the default both map to drawing both edges.
        _ => SurfaceBevelType::Both,
    }
}

fn displacement_mode_to_surface(mode: Option<DisplacementMapMode>) -> SurfaceDisplacementMapMode {
    match mode {
        Some(DisplacementMapMode::Clamp) => SurfaceDisplacementMapMode::Clamp,
        Some(DisplacementMapMode::Color) => SurfaceDisplacementMapMode::Color,
        Some(DisplacementMapMode::Ignore) => SurfaceDisplacementMapMode::Ignore,
        _ => SurfaceDisplacementMapMode::Wrap,
    }
}

/// Packs a 0xRRGGBB color and a 0..1 alpha into a 0xRRGGBBAA value, matching
/// the TS `(color << 8) | round(alpha * 255)` convention.
fn pack_rgb_alpha(color: u32, alpha: f32) -> u32 {
    ((color << 8) & 0xffffff00) | ((alpha * 255.0).round() as u32 & 0xff)
}

fn ratios_to_u8(ratios: &[f32]) -> Vec<u8> {
    ratios
        .iter()
        .map(|&r| r.round().clamp(0.0, 255.0) as u8)
        .collect()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use flighthq_surface::create_surface;
    use flighthq_types::SurfaceRegion;

    use super::*;

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

    fn make_out(w: u32, h: u32) -> Vec<u8> {
        vec![0_u8; (w * h * 4) as usize]
    }

    // These behavioral surface tests exercise the `flighthq-surface-filters`
    // CPU kernels through the descriptor-mapping layer in this file, ported
    // from packages/filters/src/surface.test.ts.

    #[test]
    fn apply_blur_filter_to_surface_writes_without_panic() {
        let source = create_surface(4, 4, 0xff0000ff);
        let mut out = make_out(4, 4);
        let mut blur_buffer = make_out(4, 4);
        apply_blur_filter_to_surface(
            &mut out,
            &mut blur_buffer,
            &region(source),
            &BlurFilter {
                blur_x: Some(4.0),
                blur_y: Some(4.0),
            },
        );
    }

    #[test]
    fn apply_bevel_filter_to_surface_writes_without_panic() {
        let source = create_surface(4, 4, 0xff0000ff);
        let mut out = make_out(4, 4);
        let mut blur_buffer = make_out(4, 4);
        apply_bevel_filter_to_surface(
            &mut out,
            &mut blur_buffer,
            &region(source.clone()),
            &BevelFilter {
                blur_x: Some(0.0),
                blur_y: Some(0.0),
                ..Default::default()
            },
        );
        // Accepts bevelType outer without panicking.
        let mut out2 = make_out(4, 4);
        let mut blur_buffer2 = make_out(4, 4);
        apply_bevel_filter_to_surface(
            &mut out2,
            &mut blur_buffer2,
            &region(source),
            &BevelFilter {
                bevel_type: Some(BevelType::Outer),
                blur_x: Some(0.0),
                blur_y: Some(0.0),
                ..Default::default()
            },
        );
    }

    #[test]
    fn apply_color_matrix_filter_to_surface_identity_preserves_pixels() {
        let source = create_surface(2, 2, 0x336699ff);
        let mut out = make_out(2, 2);
        let identity = vec![
            1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
        ];
        apply_color_matrix_filter_to_surface(
            &mut out,
            &region(source),
            &ColorMatrixFilter { matrix: identity },
        );
        assert_eq!(out[0], 0x33);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn apply_convolution_filter_to_surface_pass_through_copies_source() {
        let source = create_surface(3, 3, 0x336699ff);
        let mut out = make_out(3, 3);
        apply_convolution_filter_to_surface(
            &mut out,
            &region(source),
            &ConvolutionFilter {
                matrix: vec![0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0],
                matrix_x: 3,
                matrix_y: 3,
                ..Default::default()
            },
        );
        assert_eq!(out[0], 0x33);
    }

    #[test]
    fn apply_displacement_map_filter_to_surface_writes_without_panic() {
        let source = create_surface(4, 4, 0xff0000ff);
        let map = create_surface(4, 4, 0x808080ff);
        let mut out = make_out(4, 4);
        apply_displacement_map_filter_to_surface(
            &mut out,
            &region(source),
            &region(map),
            &DisplacementMapFilter {
                scale_x: Some(0.0),
                scale_y: Some(0.0),
                ..Default::default()
            },
        );
    }

    #[test]
    fn apply_drop_shadow_filter_to_surface_writes_without_panic() {
        let source = create_surface(4, 4, 0xff0000ff);
        let mut out = make_out(4, 4);
        let mut blur_buffer = make_out(4, 4);
        apply_drop_shadow_filter_to_surface(
            &mut out,
            &mut blur_buffer,
            &region(source),
            &DropShadowFilter {
                blur_x: Some(0.0),
                blur_y: Some(0.0),
                ..Default::default()
            },
        );
    }

    #[test]
    fn apply_gradient_bevel_filter_to_surface_writes_without_panic() {
        let source = create_surface(4, 4, 0xff0000ff);
        let mut out = make_out(4, 4);
        let mut blur_buffer = make_out(4, 4);
        apply_gradient_bevel_filter_to_surface(
            &mut out,
            &mut blur_buffer,
            &region(source),
            &GradientBevelFilter {
                colors: vec![0xffffff, 0x000000],
                alphas: vec![1.0, 1.0],
                ratios: vec![0.0, 255.0],
                blur_x: Some(0.0),
                blur_y: Some(0.0),
                ..Default::default()
            },
        );
    }

    #[test]
    fn apply_gradient_glow_filter_to_surface_writes_without_panic() {
        let source = create_surface(4, 4, 0xff0000ff);
        let mut out = make_out(4, 4);
        let mut blur_buffer = make_out(4, 4);
        apply_gradient_glow_filter_to_surface(
            &mut out,
            &mut blur_buffer,
            &region(source),
            &GradientGlowFilter {
                colors: vec![0xff0000, 0x000000],
                alphas: vec![1.0, 0.0],
                ratios: vec![0.0, 255.0],
                blur_x: Some(0.0),
                blur_y: Some(0.0),
                ..Default::default()
            },
        );
    }

    #[test]
    fn apply_inner_glow_filter_to_surface_writes_without_panic() {
        let source = create_surface(4, 4, 0xff0000ff);
        let mut out = make_out(4, 4);
        let mut blur_buffer = make_out(4, 4);
        apply_inner_glow_filter_to_surface(
            &mut out,
            &mut blur_buffer,
            &region(source),
            &InnerGlowFilter {
                blur_x: Some(0.0),
                blur_y: Some(0.0),
                ..Default::default()
            },
        );
    }

    #[test]
    fn apply_inner_shadow_filter_to_surface_writes_without_panic() {
        let source = create_surface(4, 4, 0xff0000ff);
        let mut out = make_out(4, 4);
        let mut blur_buffer = make_out(4, 4);
        apply_inner_shadow_filter_to_surface(
            &mut out,
            &mut blur_buffer,
            &region(source),
            &InnerShadowFilter {
                blur_x: Some(0.0),
                blur_y: Some(0.0),
                ..Default::default()
            },
        );
    }

    #[test]
    fn apply_median_filter_to_surface_writes_without_panic() {
        let source = create_surface(4, 4, 0xff0000ff);
        let mut out = make_out(4, 4);
        apply_median_filter_to_surface(
            &mut out,
            &region(source),
            &MedianFilter { radius: Some(1.0) },
        );
    }

    #[test]
    fn apply_outer_glow_filter_to_surface_writes_without_panic() {
        let source = create_surface(4, 4, 0xff0000ff);
        let mut out = make_out(4, 4);
        let mut blur_buffer = make_out(4, 4);
        apply_outer_glow_filter_to_surface(
            &mut out,
            &mut blur_buffer,
            &region(source),
            &OuterGlowFilter {
                blur_x: Some(0.0),
                blur_y: Some(0.0),
                ..Default::default()
            },
        );
    }

    #[test]
    fn apply_pixelate_filter_to_surface_writes_without_panic() {
        let source = create_surface(4, 4, 0xff0000ff);
        let mut out = make_out(4, 4);
        apply_pixelate_filter_to_surface(
            &mut out,
            &region(source),
            &PixelateFilter {
                block_size: Some(2.0),
            },
        );
    }

    #[test]
    fn apply_sharpen_filter_to_surface_writes_without_panic() {
        let source = create_surface(4, 4, 0xff0000ff);
        let mut out = make_out(4, 4);
        let mut blur_buffer = make_out(4, 4);
        apply_sharpen_filter_to_surface(
            &mut out,
            &mut blur_buffer,
            &region(source),
            &SharpenFilter {
                blur_x: Some(0.0),
                blur_y: Some(0.0),
                ..Default::default()
            },
        );
    }

    #[test]
    fn bevel_type_to_surface_maps_variants() {
        assert!(matches!(
            bevel_type_to_surface(Some(BevelType::Inner)),
            SurfaceBevelType::Inner
        ));
        assert!(matches!(
            bevel_type_to_surface(Some(BevelType::Outer)),
            SurfaceBevelType::Outer
        ));
        assert!(matches!(
            bevel_type_to_surface(Some(BevelType::Full)),
            SurfaceBevelType::Both
        ));
        assert!(matches!(
            bevel_type_to_surface(None),
            SurfaceBevelType::Both
        ));
    }

    #[test]
    fn displacement_mode_to_surface_defaults_to_wrap() {
        assert!(matches!(
            displacement_mode_to_surface(None),
            SurfaceDisplacementMapMode::Wrap
        ));
        assert!(matches!(
            displacement_mode_to_surface(Some(DisplacementMapMode::Clamp)),
            SurfaceDisplacementMapMode::Clamp
        ));
        assert!(matches!(
            displacement_mode_to_surface(Some(DisplacementMapMode::Color)),
            SurfaceDisplacementMapMode::Color
        ));
        assert!(matches!(
            displacement_mode_to_surface(Some(DisplacementMapMode::Ignore)),
            SurfaceDisplacementMapMode::Ignore
        ));
    }

    #[test]
    fn pack_rgb_alpha_packs_color_and_alpha() {
        assert_eq!(pack_rgb_alpha(0x000000, 1.0), 0x000000ff);
        assert_eq!(pack_rgb_alpha(0xff8040, 0.5), 0xff804080);
        assert_eq!(pack_rgb_alpha(0xffffff, 0.0), 0xffffff00);
    }

    #[test]
    fn ratios_to_u8_rounds_and_clamps() {
        assert_eq!(
            ratios_to_u8(&[0.0, 127.4, 255.0, 300.0]),
            vec![0, 127, 255, 255]
        );
    }
}

//! Scratch render-target count for the wgpu filter passes.

use flighthq_filters::BitmapFilter;

/// Returns the number of scratch `WgpuRenderTarget` entries required to apply
/// the given filter descriptor via its `apply_*_filter_to_wgpu` function.
///
/// Scratch targets must all be the same size as `dest`. Pass a slice of this
/// length to the filter's `scratch` parameter; pass fewer and the filter will
/// index out of bounds.
///
/// Filters that take no scratch (color matrix, convolution, displacement map,
/// median, pixelate) return 0. All blur-derived effects return 3 (tint/mask,
/// blurred output, blur ping-pong). Sharpen returns 2 (blurred image, blur
/// ping-pong). `BlurFilter` itself only needs 1 (ping-pong temp, passed
/// directly as `temp` rather than through `scratch`).
pub fn get_wgpu_filter_scratch_count(filter: &BitmapFilter) -> u32 {
    match filter {
        // Single-pass filters — no scratch needed.
        BitmapFilter::ColorMatrix(_)
        | BitmapFilter::Convolution(_)
        | BitmapFilter::DisplacementMap(_)
        | BitmapFilter::Median(_)
        | BitmapFilter::Pixelate(_) => 0,
        // BlurFilter: one ping-pong temp target (passed as `temp`, not `scratch`).
        BitmapFilter::Blur(_) => 1,
        // Sharpen: blurred copy + blur ping-pong.
        BitmapFilter::Sharpen(_) => 2,
        // Blur-derived effects: tint/mask, blurred output, blur ping-pong.
        BitmapFilter::Bevel(_)
        | BitmapFilter::DropShadow(_)
        | BitmapFilter::GradientBevel(_)
        | BitmapFilter::GradientGlow(_)
        | BitmapFilter::InnerGlow(_)
        | BitmapFilter::InnerShadow(_)
        | BitmapFilter::OuterGlow(_) => 3,
    }
}

#[cfg(test)]
mod tests {
    use flighthq_filters::{
        BevelFilter, BlurFilter, ColorMatrixFilter, ConvolutionFilter, DisplacementMapFilter,
        DropShadowFilter, GradientBevelFilter, GradientGlowFilter, InnerGlowFilter,
        InnerShadowFilter, MedianFilter, OuterGlowFilter, PixelateFilter, SharpenFilter,
    };

    use super::*;

    // get_wgpu_filter_scratch_count

    #[test]
    fn get_wgpu_filter_scratch_count_returns_0_for_single_pass_filters() {
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::ColorMatrix(ColorMatrixFilter::default())),
            0
        );
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::Convolution(ConvolutionFilter::default())),
            0
        );
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::DisplacementMap(
                DisplacementMapFilter::default()
            )),
            0
        );
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::Median(MedianFilter::default())),
            0
        );
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::Pixelate(PixelateFilter::default())),
            0
        );
    }

    #[test]
    fn get_wgpu_filter_scratch_count_returns_1_for_blur() {
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::Blur(BlurFilter::default())),
            1
        );
    }

    #[test]
    fn get_wgpu_filter_scratch_count_returns_2_for_sharpen() {
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::Sharpen(SharpenFilter::default())),
            2
        );
    }

    #[test]
    fn get_wgpu_filter_scratch_count_returns_3_for_blur_derived_effects() {
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::Bevel(BevelFilter::default())),
            3
        );
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::DropShadow(DropShadowFilter::default())),
            3
        );
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::GradientBevel(
                GradientBevelFilter::default()
            )),
            3
        );
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::GradientGlow(
                GradientGlowFilter::default()
            )),
            3
        );
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::InnerGlow(InnerGlowFilter::default())),
            3
        );
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::InnerShadow(InnerShadowFilter::default())),
            3
        );
        assert_eq!(
            get_wgpu_filter_scratch_count(&BitmapFilter::OuterGlow(OuterGlowFilter::default())),
            3
        );
    }
}

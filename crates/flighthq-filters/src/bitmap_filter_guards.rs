//! Discriminant guards for `BitmapFilter` variants.
//!
//! In TS the filters are tagged objects discriminated by a `kind` string, so the
//! guards narrow an arbitrary value. In Rust `BitmapFilter` is an enum, so each
//! guard is a variant match. `is_bitmap_filter` is kept for parity with the TS
//! `isBitmapFilter` unknown-narrowing guard; given a typed `&BitmapFilter` it is
//! always `true` (every enum variant is a known kind).

use flighthq_types::BitmapFilter;

/// Returns `true` when `filter` is a `BevelFilter`.
pub fn is_bevel_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::Bevel(_))
}

/// Returns `true` when `filter` is one of the known `BitmapFilter` kinds. Mirrors
/// the TS `isBitmapFilter` unknown-narrowing guard; for a typed `BitmapFilter`
/// every variant is a known kind, so this is always `true`.
pub fn is_bitmap_filter(filter: &BitmapFilter) -> bool {
    matches!(
        filter,
        BitmapFilter::Bevel(_)
            | BitmapFilter::Blur(_)
            | BitmapFilter::ColorMatrix(_)
            | BitmapFilter::Convolution(_)
            | BitmapFilter::DisplacementMap(_)
            | BitmapFilter::DropShadow(_)
            | BitmapFilter::GradientBevel(_)
            | BitmapFilter::GradientGlow(_)
            | BitmapFilter::InnerGlow(_)
            | BitmapFilter::InnerShadow(_)
            | BitmapFilter::Median(_)
            | BitmapFilter::OuterGlow(_)
            | BitmapFilter::Pixelate(_)
            | BitmapFilter::Sharpen(_)
    )
}

/// Returns `true` when `filter` is a `BlurFilter`.
pub fn is_blur_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::Blur(_))
}

/// Returns `true` when `filter` is a `ColorMatrixFilter`.
pub fn is_color_matrix_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::ColorMatrix(_))
}

/// Returns `true` when `filter` is a `ConvolutionFilter`.
pub fn is_convolution_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::Convolution(_))
}

/// Returns `true` when `filter` is a `DisplacementMapFilter`.
pub fn is_displacement_map_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::DisplacementMap(_))
}

/// Returns `true` when `filter` is a `DropShadowFilter`.
pub fn is_drop_shadow_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::DropShadow(_))
}

/// Returns `true` when `filter` is a `GradientBevelFilter`.
pub fn is_gradient_bevel_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::GradientBevel(_))
}

/// Returns `true` when `filter` is a `GradientGlowFilter`.
pub fn is_gradient_glow_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::GradientGlow(_))
}

/// Returns `true` when `filter` is an `InnerGlowFilter`.
pub fn is_inner_glow_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::InnerGlow(_))
}

/// Returns `true` when `filter` is an `InnerShadowFilter`.
pub fn is_inner_shadow_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::InnerShadow(_))
}

/// Returns `true` when `filter` is a `MedianFilter`.
pub fn is_median_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::Median(_))
}

/// Returns `true` when `filter` is an `OuterGlowFilter`.
pub fn is_outer_glow_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::OuterGlow(_))
}

/// Returns `true` when `filter` is a `PixelateFilter`.
pub fn is_pixelate_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::Pixelate(_))
}

/// Returns `true` when `filter` is a `SharpenFilter`.
pub fn is_sharpen_filter(filter: &BitmapFilter) -> bool {
    matches!(filter, BitmapFilter::Sharpen(_))
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{BevelFilter, BlurFilter, ColorMatrixFilter, DropShadowFilter};

    #[test]
    fn is_bevel_filter_narrows() {
        assert!(is_bevel_filter(
            &BitmapFilter::Bevel(BevelFilter::default())
        ));
        assert!(!is_bevel_filter(&BitmapFilter::Blur(BlurFilter::default())));
    }

    #[test]
    fn is_bitmap_filter_accepts_known_kinds() {
        assert!(is_bitmap_filter(&BitmapFilter::Bevel(
            BevelFilter::default()
        )));
        assert!(is_bitmap_filter(&BitmapFilter::ColorMatrix(
            ColorMatrixFilter::default()
        )));
    }

    #[test]
    fn is_blur_filter_narrows() {
        assert!(is_blur_filter(&BitmapFilter::Blur(BlurFilter::default())));
        assert!(!is_blur_filter(
            &BitmapFilter::Bevel(BevelFilter::default())
        ));
    }

    #[test]
    fn is_color_matrix_filter_narrows() {
        assert!(is_color_matrix_filter(&BitmapFilter::ColorMatrix(
            ColorMatrixFilter::default()
        )));
        assert!(!is_color_matrix_filter(&BitmapFilter::Blur(
            BlurFilter::default()
        )));
    }

    #[test]
    fn is_convolution_filter_narrows() {
        assert!(is_convolution_filter(&BitmapFilter::Convolution(
            Default::default()
        )));
        assert!(!is_convolution_filter(&BitmapFilter::Blur(
            BlurFilter::default()
        )));
    }

    #[test]
    fn is_displacement_map_filter_narrows() {
        assert!(is_displacement_map_filter(&BitmapFilter::DisplacementMap(
            Default::default()
        )));
        assert!(!is_displacement_map_filter(&BitmapFilter::Blur(
            BlurFilter::default()
        )));
    }

    #[test]
    fn is_drop_shadow_filter_narrows() {
        assert!(is_drop_shadow_filter(&BitmapFilter::DropShadow(
            DropShadowFilter::default()
        )));
        assert!(!is_drop_shadow_filter(&BitmapFilter::Blur(
            BlurFilter::default()
        )));
    }

    #[test]
    fn is_gradient_bevel_filter_narrows() {
        assert!(is_gradient_bevel_filter(&BitmapFilter::GradientBevel(
            Default::default()
        )));
        assert!(!is_gradient_bevel_filter(&BitmapFilter::GradientGlow(
            Default::default()
        )));
    }

    #[test]
    fn is_gradient_glow_filter_narrows() {
        assert!(is_gradient_glow_filter(&BitmapFilter::GradientGlow(
            Default::default()
        )));
        assert!(!is_gradient_glow_filter(&BitmapFilter::GradientBevel(
            Default::default()
        )));
    }

    #[test]
    fn is_inner_glow_filter_narrows() {
        assert!(is_inner_glow_filter(&BitmapFilter::InnerGlow(
            Default::default()
        )));
        assert!(!is_inner_glow_filter(&BitmapFilter::Blur(
            BlurFilter::default()
        )));
    }

    #[test]
    fn is_inner_shadow_filter_narrows() {
        assert!(is_inner_shadow_filter(&BitmapFilter::InnerShadow(
            Default::default()
        )));
        assert!(!is_inner_shadow_filter(&BitmapFilter::Blur(
            BlurFilter::default()
        )));
    }

    #[test]
    fn is_median_filter_narrows() {
        assert!(is_median_filter(&BitmapFilter::Median(Default::default())));
        assert!(!is_median_filter(
            &BitmapFilter::Blur(BlurFilter::default())
        ));
    }

    #[test]
    fn is_outer_glow_filter_narrows() {
        assert!(is_outer_glow_filter(&BitmapFilter::OuterGlow(
            Default::default()
        )));
        assert!(!is_outer_glow_filter(&BitmapFilter::InnerGlow(
            Default::default()
        )));
    }

    #[test]
    fn is_pixelate_filter_narrows() {
        assert!(is_pixelate_filter(&BitmapFilter::Pixelate(
            Default::default()
        )));
        assert!(!is_pixelate_filter(&BitmapFilter::Blur(
            BlurFilter::default()
        )));
    }

    #[test]
    fn is_sharpen_filter_narrows() {
        assert!(is_sharpen_filter(
            &BitmapFilter::Sharpen(Default::default())
        ));
        assert!(!is_sharpen_filter(&BitmapFilter::Blur(
            BlurFilter::default()
        )));
    }
}

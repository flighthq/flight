//! `flighthq-filters` — bitmap filter descriptors, CSS serialization, and
//! bitmap-surface (CPU pixel) implementations.
//!
//! Filter types live in `flighthq-types`; this crate re-exports them and
//! adds construction helpers, CSS serialization, box-blur math, and the
//! CPU-side (surface) apply functions.

pub mod css;
pub mod math;
pub mod surface;

// Re-export filter types from the types crate so users only need one import.
pub use flighthq_types::{
    BevelFilter, BevelType, BitmapFilter, BlurFilter, ColorMatrixFilter, ConvolutionFilter,
    DisplacementMapFilter, DisplacementMapMode, DropShadowFilter, GradientBevelFilter,
    GradientGlowFilter, InnerGlowFilter, InnerShadowFilter, MedianFilter, OuterGlowFilter,
    PixelateFilterDescriptor as PixelateFilter, SharpenFilterDescriptor as SharpenFilter,
    SurfaceRegion,
};

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------

/// Creates a `BevelFilter` with default field values.
pub fn create_bevel_filter(options: BevelFilter) -> BevelFilter {
    options
}

/// Creates a `BlurFilter` with default field values.
pub fn create_blur_filter(options: BlurFilter) -> BlurFilter {
    options
}

/// Creates a `ColorMatrixFilter` from a 20-element matrix.
pub fn create_color_matrix_filter(matrix: Vec<f32>) -> ColorMatrixFilter {
    ColorMatrixFilter { matrix }
}

/// Creates a `ConvolutionFilter`. `matrix_x` and `matrix_y` are the kernel dimensions.
pub fn create_convolution_filter(options: ConvolutionFilter) -> ConvolutionFilter {
    options
}

/// Creates a `DisplacementMapFilter` with default field values.
pub fn create_displacement_map_filter(options: DisplacementMapFilter) -> DisplacementMapFilter {
    options
}

/// Creates a `DropShadowFilter` with default field values.
pub fn create_drop_shadow_filter(options: DropShadowFilter) -> DropShadowFilter {
    options
}

/// Creates a `GradientBevelFilter`. `colors`, `alphas`, and `ratios` are required.
pub fn create_gradient_bevel_filter(options: GradientBevelFilter) -> GradientBevelFilter {
    options
}

/// Creates a `GradientGlowFilter`. `colors`, `alphas`, and `ratios` are required.
pub fn create_gradient_glow_filter(options: GradientGlowFilter) -> GradientGlowFilter {
    options
}

/// Creates an `InnerGlowFilter` with default field values.
pub fn create_inner_glow_filter(options: InnerGlowFilter) -> InnerGlowFilter {
    options
}

/// Creates an `InnerShadowFilter` with default field values.
pub fn create_inner_shadow_filter(options: InnerShadowFilter) -> InnerShadowFilter {
    options
}

/// Creates a `MedianFilter` with default field values.
pub fn create_median_filter(options: MedianFilter) -> MedianFilter {
    options
}

/// Creates an `OuterGlowFilter` with default field values.
pub fn create_outer_glow_filter(options: OuterGlowFilter) -> OuterGlowFilter {
    options
}

/// Creates a `PixelateFilter` with default field values.
pub fn create_pixelate_filter(options: PixelateFilter) -> PixelateFilter {
    options
}

/// Creates a `SharpenFilter` with default field values.
pub fn create_sharpen_filter(options: SharpenFilter) -> SharpenFilter {
    options
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_bevel_filter_spreads_options() {
        let f = create_bevel_filter(BevelFilter {
            strength: Some(2.0),
            bevel_type: Some(BevelType::Outer),
            ..Default::default()
        });
        assert_eq!(f.strength, Some(2.0));
        assert_eq!(f.bevel_type, Some(BevelType::Outer));
    }

    #[test]
    fn create_blur_filter_spreads_options() {
        let f = create_blur_filter(BlurFilter {
            blur_x: Some(8.0),
            blur_y: Some(4.0),
        });
        assert_eq!(f.blur_x, Some(8.0));
        assert_eq!(f.blur_y, Some(4.0));
    }

    #[test]
    fn create_color_matrix_filter_stores_matrix() {
        let f = create_color_matrix_filter(vec![1.0; 20]);
        assert_eq!(f.matrix.len(), 20);
        assert!(f.matrix.iter().all(|&v| v == 1.0));
    }

    #[test]
    fn create_convolution_filter_spreads_required_fields() {
        let f = create_convolution_filter(ConvolutionFilter {
            matrix: vec![0.0, 1.0, 0.0, 1.0, -4.0, 1.0, 0.0, 1.0, 0.0],
            matrix_x: 3,
            matrix_y: 3,
            ..Default::default()
        });
        assert_eq!(f.matrix_x, 3);
        assert_eq!(f.matrix_y, 3);
    }

    #[test]
    fn create_displacement_map_filter_spreads_options() {
        let f = create_displacement_map_filter(DisplacementMapFilter {
            scale_x: Some(10.0),
            scale_y: Some(5.0),
            ..Default::default()
        });
        assert_eq!(f.scale_x, Some(10.0));
        assert_eq!(f.scale_y, Some(5.0));
    }

    #[test]
    fn create_drop_shadow_filter_spreads_options() {
        let f = create_drop_shadow_filter(DropShadowFilter {
            color: Some(0xff0000),
            distance: Some(8.0),
            ..Default::default()
        });
        assert_eq!(f.color, Some(0xff0000));
        assert_eq!(f.distance, Some(8.0));
    }

    #[test]
    fn create_gradient_bevel_filter_stores_arrays() {
        let f = create_gradient_bevel_filter(GradientBevelFilter {
            colors: vec![0xffffff, 0x000000],
            alphas: vec![1.0, 0.0],
            ratios: vec![0.0, 255.0],
            ..Default::default()
        });
        assert_eq!(f.colors, vec![0xffffff, 0x000000]);
        assert_eq!(f.alphas, vec![1.0, 0.0]);
        assert_eq!(f.ratios, vec![0.0, 255.0]);
    }

    #[test]
    fn create_gradient_glow_filter_stores_arrays() {
        let f = create_gradient_glow_filter(GradientGlowFilter {
            colors: vec![0xff0000],
            alphas: vec![1.0],
            ratios: vec![128.0],
            ..Default::default()
        });
        assert_eq!(f.colors, vec![0xff0000]);
    }

    #[test]
    fn create_inner_glow_filter_spreads_options() {
        let f = create_inner_glow_filter(InnerGlowFilter {
            color: Some(0x00ff00),
            strength: Some(2.0),
            ..Default::default()
        });
        assert_eq!(f.color, Some(0x00ff00));
        assert_eq!(f.strength, Some(2.0));
    }

    #[test]
    fn create_inner_shadow_filter_spreads_options() {
        let f = create_inner_shadow_filter(InnerShadowFilter {
            angle: Some(90.0),
            distance: Some(4.0),
            ..Default::default()
        });
        assert_eq!(f.angle, Some(90.0));
        assert_eq!(f.distance, Some(4.0));
    }

    #[test]
    fn create_median_filter_spreads_options() {
        let f = create_median_filter(MedianFilter { radius: Some(3.0) });
        assert_eq!(f.radius, Some(3.0));
    }

    #[test]
    fn create_outer_glow_filter_spreads_options() {
        let f = create_outer_glow_filter(OuterGlowFilter {
            color: Some(0xffff00),
            knockout: Some(true),
            ..Default::default()
        });
        assert_eq!(f.color, Some(0xffff00));
        assert_eq!(f.knockout, Some(true));
    }

    #[test]
    fn create_pixelate_filter_spreads_options() {
        let f = create_pixelate_filter(PixelateFilter {
            block_size: Some(16.0),
        });
        assert_eq!(f.block_size, Some(16.0));
    }

    #[test]
    fn create_sharpen_filter_spreads_options() {
        let f = create_sharpen_filter(SharpenFilter {
            amount: Some(1.5),
            blur_x: Some(3.0),
            ..Default::default()
        });
        assert_eq!(f.amount, Some(1.5));
        assert_eq!(f.blur_x, Some(3.0));
    }
}

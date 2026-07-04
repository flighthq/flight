//! Clone, copy, equality, and normalization operations shared across `BitmapFilter` kinds.
//!
//! In TS these operate on a structurally-typed `unknown`/`Record<string, unknown>` and iterate
//! `Object.keys`. In Rust `BitmapFilter` is a closed enum, so cloning is `Clone::clone`, equality
//! is a field-by-field match per variant, and normalization matches on the variant to fill in
//! canonical defaults.

use flighthq_types::{
    BevelFilter, BevelType, BitmapFilter, BlurFilter, ColorMatrixFilter, ConvolutionFilter,
    DisplacementMapFilter, DisplacementMapMode, DropShadowFilter, GradientBevelFilter,
    GradientGlowFilter, InnerGlowFilter, InnerShadowFilter, MedianFilter, OuterGlowFilter,
    PixelateFilterDescriptor, SharpenFilterDescriptor,
};

// Default values matching canonical Flash/OpenFL filter defaults. Exported so backends can
// reference them instead of duplicating the constants.
pub const DEFAULT_FILTER_ALPHA: f32 = 1.0;
pub const DEFAULT_FILTER_ANGLE: f32 = 45.0;
pub const DEFAULT_FILTER_BLUR_X: f32 = 4.0;
pub const DEFAULT_FILTER_BLUR_Y: f32 = 4.0;
pub const DEFAULT_FILTER_COLOR: u32 = 0x000000;
pub const DEFAULT_FILTER_DISTANCE: f32 = 4.0;
pub const DEFAULT_FILTER_KNOCKOUT: bool = false;
pub const DEFAULT_FILTER_QUALITY: u32 = 1;
pub const DEFAULT_FILTER_STRENGTH: f32 = 1.0;

/// Returns a deep copy of `filter`. Array fields (matrix, colors, alphas, ratios) are copied, not
/// aliased. Allocates a new value; use `copy_bitmap_filter_into` for hot reuse.
pub fn clone_bitmap_filter(filter: &BitmapFilter) -> BitmapFilter {
    filter.clone()
}

/// Returns a list that is a deep copy of `filters`. Each filter's array fields are copied, not
/// aliased. Allocates new values.
pub fn clone_bitmap_filter_list(filters: &[BitmapFilter]) -> Vec<BitmapFilter> {
    filters.to_vec()
}

/// Copies all fields from `source` into `out`. `out` and `source` must share the same variant.
/// Panics on a variant mismatch — this is a programmer error, not an expected failure.
pub fn copy_bitmap_filter_into(out: &mut BitmapFilter, source: &BitmapFilter) {
    match (out, source) {
        (BitmapFilter::Bevel(o), BitmapFilter::Bevel(s)) => *o = s.clone(),
        (BitmapFilter::Blur(o), BitmapFilter::Blur(s)) => *o = s.clone(),
        (BitmapFilter::ColorMatrix(o), BitmapFilter::ColorMatrix(s)) => *o = s.clone(),
        (BitmapFilter::Convolution(o), BitmapFilter::Convolution(s)) => *o = s.clone(),
        (BitmapFilter::DisplacementMap(o), BitmapFilter::DisplacementMap(s)) => *o = s.clone(),
        (BitmapFilter::DropShadow(o), BitmapFilter::DropShadow(s)) => *o = s.clone(),
        (BitmapFilter::GradientBevel(o), BitmapFilter::GradientBevel(s)) => *o = s.clone(),
        (BitmapFilter::GradientGlow(o), BitmapFilter::GradientGlow(s)) => *o = s.clone(),
        (BitmapFilter::InnerGlow(o), BitmapFilter::InnerGlow(s)) => *o = s.clone(),
        (BitmapFilter::InnerShadow(o), BitmapFilter::InnerShadow(s)) => *o = s.clone(),
        (BitmapFilter::Median(o), BitmapFilter::Median(s)) => *o = s.clone(),
        (BitmapFilter::OuterGlow(o), BitmapFilter::OuterGlow(s)) => *o = s.clone(),
        (BitmapFilter::Pixelate(o), BitmapFilter::Pixelate(s)) => *o = s.clone(),
        (BitmapFilter::Sharpen(o), BitmapFilter::Sharpen(s)) => *o = s.clone(),
        _ => panic!("copy_bitmap_filter_into: kind mismatch between out and source"),
    }
}

/// Returns `true` when `a` and `b` are structurally equal: same variant and same field values,
/// including deep comparison of array fields. Returns `false` on any difference, including a
/// variant mismatch.
pub fn equals_bitmap_filter(a: &BitmapFilter, b: &BitmapFilter) -> bool {
    match (a, b) {
        (BitmapFilter::Bevel(a), BitmapFilter::Bevel(b)) => {
            a.angle == b.angle
                && a.bevel_type == b.bevel_type
                && a.blur_x == b.blur_x
                && a.blur_y == b.blur_y
                && a.distance == b.distance
                && a.highlight_alpha == b.highlight_alpha
                && a.highlight_color == b.highlight_color
                && a.knockout == b.knockout
                && a.quality == b.quality
                && a.shadow_alpha == b.shadow_alpha
                && a.shadow_color == b.shadow_color
                && a.strength == b.strength
        }
        (BitmapFilter::Blur(a), BitmapFilter::Blur(b)) => {
            a.blur_x == b.blur_x && a.blur_y == b.blur_y
        }
        (BitmapFilter::ColorMatrix(a), BitmapFilter::ColorMatrix(b)) => a.matrix == b.matrix,
        (BitmapFilter::Convolution(a), BitmapFilter::Convolution(b)) => {
            a.bias == b.bias
                && a.clamp == b.clamp
                && a.color == b.color
                && a.divisor == b.divisor
                && a.matrix == b.matrix
                && a.matrix_x == b.matrix_x
                && a.matrix_y == b.matrix_y
                && a.preserve_alpha == b.preserve_alpha
        }
        (BitmapFilter::DisplacementMap(a), BitmapFilter::DisplacementMap(b)) => {
            a.alpha == b.alpha
                && a.color == b.color
                && a.component_x == b.component_x
                && a.component_y == b.component_y
                && a.mode == b.mode
                && a.scale_x == b.scale_x
                && a.scale_y == b.scale_y
        }
        (BitmapFilter::DropShadow(a), BitmapFilter::DropShadow(b)) => {
            a.alpha == b.alpha
                && a.angle == b.angle
                && a.blur_x == b.blur_x
                && a.blur_y == b.blur_y
                && a.color == b.color
                && a.distance == b.distance
                && a.hide_object == b.hide_object
                && a.knockout == b.knockout
                && a.quality == b.quality
                && a.strength == b.strength
        }
        (BitmapFilter::GradientBevel(a), BitmapFilter::GradientBevel(b)) => {
            a.alphas == b.alphas
                && a.angle == b.angle
                && a.bevel_type == b.bevel_type
                && a.blur_x == b.blur_x
                && a.blur_y == b.blur_y
                && a.colors == b.colors
                && a.distance == b.distance
                && a.quality == b.quality
                && a.ratios == b.ratios
                && a.strength == b.strength
        }
        (BitmapFilter::GradientGlow(a), BitmapFilter::GradientGlow(b)) => {
            a.alphas == b.alphas
                && a.blur_x == b.blur_x
                && a.blur_y == b.blur_y
                && a.colors == b.colors
                && a.quality == b.quality
                && a.ratios == b.ratios
                && a.strength == b.strength
        }
        (BitmapFilter::InnerGlow(a), BitmapFilter::InnerGlow(b)) => {
            a.alpha == b.alpha
                && a.blur_x == b.blur_x
                && a.blur_y == b.blur_y
                && a.color == b.color
                && a.quality == b.quality
                && a.strength == b.strength
        }
        (BitmapFilter::InnerShadow(a), BitmapFilter::InnerShadow(b)) => {
            a.alpha == b.alpha
                && a.angle == b.angle
                && a.blur_x == b.blur_x
                && a.blur_y == b.blur_y
                && a.color == b.color
                && a.distance == b.distance
                && a.quality == b.quality
                && a.strength == b.strength
        }
        (BitmapFilter::Median(a), BitmapFilter::Median(b)) => a.radius == b.radius,
        (BitmapFilter::OuterGlow(a), BitmapFilter::OuterGlow(b)) => {
            a.alpha == b.alpha
                && a.blur_x == b.blur_x
                && a.blur_y == b.blur_y
                && a.color == b.color
                && a.knockout == b.knockout
                && a.quality == b.quality
                && a.strength == b.strength
        }
        (BitmapFilter::Pixelate(a), BitmapFilter::Pixelate(b)) => a.block_size == b.block_size,
        (BitmapFilter::Sharpen(a), BitmapFilter::Sharpen(b)) => {
            a.amount == b.amount
                && a.blur_x == b.blur_x
                && a.blur_y == b.blur_y
                && a.quality == b.quality
        }
        _ => false,
    }
}

/// Returns `true` when `a` and `b` are both structurally equal filter lists: same length, same
/// variants, and same field values for each pair in order.
pub fn equals_bitmap_filter_list(a: &[BitmapFilter], b: &[BitmapFilter]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter()
        .zip(b.iter())
        .all(|(x, y)| equals_bitmap_filter(x, y))
}

/// Returns a copy of `filter` with all optional fields filled in with their canonical Flash/OpenFL
/// defaults. Backends can use this to skip individual field defaulting. Every `Option` field in
/// the result is `Some`. Idempotent: normalizing an already-normalized filter returns an equal
/// value. Allocates a new value.
pub fn normalize_bitmap_filter(filter: &BitmapFilter) -> BitmapFilter {
    match filter {
        BitmapFilter::Bevel(f) => BitmapFilter::Bevel(BevelFilter {
            angle: Some(f.angle.unwrap_or(DEFAULT_FILTER_ANGLE)),
            bevel_type: Some(f.bevel_type.unwrap_or(BevelType::Inner)),
            blur_x: Some(f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X)),
            blur_y: Some(f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y)),
            distance: Some(f.distance.unwrap_or(DEFAULT_FILTER_DISTANCE)),
            highlight_alpha: Some(f.highlight_alpha.unwrap_or(DEFAULT_FILTER_ALPHA)),
            highlight_color: Some(f.highlight_color.unwrap_or(0xffffff)),
            knockout: Some(f.knockout.unwrap_or(DEFAULT_FILTER_KNOCKOUT)),
            quality: Some(f.quality.unwrap_or(DEFAULT_FILTER_QUALITY)),
            shadow_alpha: Some(f.shadow_alpha.unwrap_or(DEFAULT_FILTER_ALPHA)),
            shadow_color: Some(f.shadow_color.unwrap_or(DEFAULT_FILTER_COLOR)),
            strength: Some(f.strength.unwrap_or(DEFAULT_FILTER_STRENGTH)),
        }),
        BitmapFilter::Blur(f) => BitmapFilter::Blur(BlurFilter {
            blur_x: Some(f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X)),
            blur_y: Some(f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y)),
        }),
        BitmapFilter::ColorMatrix(f) => BitmapFilter::ColorMatrix(ColorMatrixFilter {
            matrix: f.matrix.clone(),
        }),
        BitmapFilter::Convolution(f) => BitmapFilter::Convolution(ConvolutionFilter {
            bias: Some(f.bias.unwrap_or(0.0)),
            clamp: Some(f.clamp.unwrap_or(true)),
            color: Some(f.color.unwrap_or(DEFAULT_FILTER_COLOR)),
            divisor: Some(f.divisor.unwrap_or(1.0)),
            matrix: f.matrix.clone(),
            matrix_x: f.matrix_x,
            matrix_y: f.matrix_y,
            preserve_alpha: Some(f.preserve_alpha.unwrap_or(true)),
        }),
        BitmapFilter::DisplacementMap(f) => BitmapFilter::DisplacementMap(DisplacementMapFilter {
            alpha: Some(f.alpha.unwrap_or(0.0)),
            color: Some(f.color.unwrap_or(DEFAULT_FILTER_COLOR)),
            component_x: Some(f.component_x.unwrap_or(0)),
            component_y: Some(f.component_y.unwrap_or(1)),
            mode: Some(f.mode.unwrap_or(DisplacementMapMode::Wrap)),
            scale_x: Some(f.scale_x.unwrap_or(0.0)),
            scale_y: Some(f.scale_y.unwrap_or(0.0)),
        }),
        BitmapFilter::DropShadow(f) => BitmapFilter::DropShadow(DropShadowFilter {
            alpha: Some(f.alpha.unwrap_or(DEFAULT_FILTER_ALPHA)),
            angle: Some(f.angle.unwrap_or(DEFAULT_FILTER_ANGLE)),
            blur_x: Some(f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X)),
            blur_y: Some(f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y)),
            color: Some(f.color.unwrap_or(DEFAULT_FILTER_COLOR)),
            distance: Some(f.distance.unwrap_or(DEFAULT_FILTER_DISTANCE)),
            hide_object: Some(f.hide_object.unwrap_or(false)),
            knockout: Some(f.knockout.unwrap_or(DEFAULT_FILTER_KNOCKOUT)),
            quality: Some(f.quality.unwrap_or(DEFAULT_FILTER_QUALITY)),
            strength: Some(f.strength.unwrap_or(DEFAULT_FILTER_STRENGTH)),
        }),
        BitmapFilter::GradientBevel(f) => BitmapFilter::GradientBevel(GradientBevelFilter {
            alphas: f.alphas.clone(),
            angle: Some(f.angle.unwrap_or(DEFAULT_FILTER_ANGLE)),
            bevel_type: Some(f.bevel_type.unwrap_or(BevelType::Inner)),
            blur_x: Some(f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X)),
            blur_y: Some(f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y)),
            colors: f.colors.clone(),
            distance: Some(f.distance.unwrap_or(DEFAULT_FILTER_DISTANCE)),
            quality: Some(f.quality.unwrap_or(DEFAULT_FILTER_QUALITY)),
            ratios: f.ratios.clone(),
            strength: Some(f.strength.unwrap_or(DEFAULT_FILTER_STRENGTH)),
        }),
        BitmapFilter::GradientGlow(f) => BitmapFilter::GradientGlow(GradientGlowFilter {
            alphas: f.alphas.clone(),
            blur_x: Some(f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X)),
            blur_y: Some(f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y)),
            colors: f.colors.clone(),
            quality: Some(f.quality.unwrap_or(DEFAULT_FILTER_QUALITY)),
            ratios: f.ratios.clone(),
            strength: Some(f.strength.unwrap_or(DEFAULT_FILTER_STRENGTH)),
        }),
        BitmapFilter::InnerGlow(f) => BitmapFilter::InnerGlow(InnerGlowFilter {
            alpha: Some(f.alpha.unwrap_or(DEFAULT_FILTER_ALPHA)),
            blur_x: Some(f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X)),
            blur_y: Some(f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y)),
            color: Some(f.color.unwrap_or(DEFAULT_FILTER_COLOR)),
            quality: Some(f.quality.unwrap_or(DEFAULT_FILTER_QUALITY)),
            strength: Some(f.strength.unwrap_or(DEFAULT_FILTER_STRENGTH)),
        }),
        BitmapFilter::InnerShadow(f) => BitmapFilter::InnerShadow(InnerShadowFilter {
            alpha: Some(f.alpha.unwrap_or(DEFAULT_FILTER_ALPHA)),
            angle: Some(f.angle.unwrap_or(DEFAULT_FILTER_ANGLE)),
            blur_x: Some(f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X)),
            blur_y: Some(f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y)),
            color: Some(f.color.unwrap_or(DEFAULT_FILTER_COLOR)),
            distance: Some(f.distance.unwrap_or(DEFAULT_FILTER_DISTANCE)),
            quality: Some(f.quality.unwrap_or(DEFAULT_FILTER_QUALITY)),
            strength: Some(f.strength.unwrap_or(DEFAULT_FILTER_STRENGTH)),
        }),
        BitmapFilter::Median(f) => BitmapFilter::Median(MedianFilter { radius: f.radius }),
        BitmapFilter::OuterGlow(f) => BitmapFilter::OuterGlow(OuterGlowFilter {
            alpha: Some(f.alpha.unwrap_or(DEFAULT_FILTER_ALPHA)),
            blur_x: Some(f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X)),
            blur_y: Some(f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y)),
            color: Some(f.color.unwrap_or(DEFAULT_FILTER_COLOR)),
            knockout: Some(f.knockout.unwrap_or(DEFAULT_FILTER_KNOCKOUT)),
            quality: Some(f.quality.unwrap_or(DEFAULT_FILTER_QUALITY)),
            strength: Some(f.strength.unwrap_or(DEFAULT_FILTER_STRENGTH)),
        }),
        BitmapFilter::Pixelate(f) => BitmapFilter::Pixelate(PixelateFilterDescriptor {
            block_size: f.block_size,
        }),
        BitmapFilter::Sharpen(f) => BitmapFilter::Sharpen(SharpenFilterDescriptor {
            amount: Some(f.amount.unwrap_or(1.0)),
            blur_x: Some(f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X)),
            blur_y: Some(f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y)),
            quality: Some(f.quality.unwrap_or(DEFAULT_FILTER_QUALITY)),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clone_bitmap_filter_deep_copies_array_fields() {
        let original = BitmapFilter::ColorMatrix(ColorMatrixFilter {
            matrix: vec![1.0; 20],
        });
        let mut cloned = clone_bitmap_filter(&original);
        if let BitmapFilter::ColorMatrix(f) = &mut cloned {
            f.matrix[0] = 99.0;
        }
        if let BitmapFilter::ColorMatrix(f) = &original {
            assert_eq!(f.matrix[0], 1.0);
        } else {
            unreachable!();
        }
    }

    #[test]
    fn clone_bitmap_filter_list_deep_copies_each_element() {
        let list = vec![
            BitmapFilter::Blur(BlurFilter::default()),
            BitmapFilter::Median(MedianFilter { radius: Some(2.0) }),
        ];
        let cloned = clone_bitmap_filter_list(&list);
        assert_eq!(cloned.len(), 2);
        assert!(equals_bitmap_filter(&cloned[1], &list[1]));
    }

    #[test]
    fn copy_bitmap_filter_into_copies_matching_kind() {
        let source = BitmapFilter::Blur(BlurFilter {
            blur_x: Some(8.0),
            blur_y: Some(2.0),
        });
        let mut out = BitmapFilter::Blur(BlurFilter::default());
        copy_bitmap_filter_into(&mut out, &source);
        assert!(equals_bitmap_filter(&out, &source));
    }

    #[test]
    #[should_panic]
    fn copy_bitmap_filter_into_panics_on_kind_mismatch() {
        let source = BitmapFilter::Blur(BlurFilter::default());
        let mut out = BitmapFilter::Median(MedianFilter::default());
        copy_bitmap_filter_into(&mut out, &source);
    }

    #[test]
    fn equals_bitmap_filter_true_for_identical_filters() {
        let a = BitmapFilter::DropShadow(DropShadowFilter {
            color: Some(0xff0000),
            distance: Some(8.0),
            ..Default::default()
        });
        let b = BitmapFilter::DropShadow(DropShadowFilter {
            color: Some(0xff0000),
            distance: Some(8.0),
            ..Default::default()
        });
        assert!(equals_bitmap_filter(&a, &b));
    }

    #[test]
    fn equals_bitmap_filter_false_for_different_kind() {
        let a = BitmapFilter::Blur(BlurFilter::default());
        let b = BitmapFilter::Median(MedianFilter::default());
        assert!(!equals_bitmap_filter(&a, &b));
    }

    #[test]
    fn equals_bitmap_filter_false_for_different_field_values() {
        let a = BitmapFilter::Blur(BlurFilter {
            blur_x: Some(4.0),
            blur_y: Some(4.0),
        });
        let b = BitmapFilter::Blur(BlurFilter {
            blur_x: Some(8.0),
            blur_y: Some(4.0),
        });
        assert!(!equals_bitmap_filter(&a, &b));
    }

    #[test]
    fn equals_bitmap_filter_list_true_for_identical_lists() {
        let a = vec![BitmapFilter::Blur(BlurFilter::default())];
        let b = vec![BitmapFilter::Blur(BlurFilter::default())];
        assert!(equals_bitmap_filter_list(&a, &b));
    }

    #[test]
    fn equals_bitmap_filter_list_false_for_different_lengths() {
        let a = vec![BitmapFilter::Blur(BlurFilter::default())];
        let b = vec![
            BitmapFilter::Blur(BlurFilter::default()),
            BitmapFilter::Median(MedianFilter::default()),
        ];
        assert!(!equals_bitmap_filter_list(&a, &b));
    }

    #[test]
    fn normalize_bitmap_filter_fills_in_defaults() {
        let f = BitmapFilter::Blur(BlurFilter::default());
        let normalized = normalize_bitmap_filter(&f);
        if let BitmapFilter::Blur(b) = normalized {
            assert_eq!(b.blur_x, Some(DEFAULT_FILTER_BLUR_X));
            assert_eq!(b.blur_y, Some(DEFAULT_FILTER_BLUR_Y));
        } else {
            unreachable!();
        }
    }

    #[test]
    fn normalize_bitmap_filter_is_idempotent() {
        let f = BitmapFilter::DropShadow(DropShadowFilter::default());
        let once = normalize_bitmap_filter(&f);
        let twice = normalize_bitmap_filter(&once);
        assert!(equals_bitmap_filter(&once, &twice));
    }

    #[test]
    fn normalize_bitmap_filter_retains_explicit_values() {
        let f = BitmapFilter::Sharpen(SharpenFilterDescriptor {
            amount: Some(3.0),
            ..Default::default()
        });
        let normalized = normalize_bitmap_filter(&f);
        if let BitmapFilter::Sharpen(s) = normalized {
            assert_eq!(s.amount, Some(3.0));
        } else {
            unreachable!();
        }
    }
}

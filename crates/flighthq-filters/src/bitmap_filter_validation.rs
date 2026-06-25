//! Filter clamps and structural validation.
//!
//! In TS the validators narrow `unknown` and check field presence; in Rust the
//! input is an already-typed `BitmapFilter`, so the remaining checks are the
//! structural ones the type system does not enforce — color-matrix length and
//! convolution `matrix.len() == matrix_x * matrix_y`. All other known kinds are
//! structurally valid once typed.

use flighthq_types::BitmapFilter;

use crate::bitmap_filter_guards::is_bitmap_filter;
use crate::color_matrix_math::COLOR_MATRIX_LENGTH;

/// Clamps `quality` to the valid Flash quality range (1–15).
pub fn clamp_filter_quality(quality: f32) -> u32 {
    quality.round().clamp(1.0, 15.0) as u32
}

/// Clamps `strength` to the valid Flash strength range (0–255).
pub fn clamp_filter_strength(strength: f32) -> f32 {
    strength.clamp(0.0, 255.0)
}

/// Returns `true` when `filter` is a structurally valid `BitmapFilter` — known
/// kind, with array lengths sane for kinds that constrain them.
pub fn is_valid_bitmap_filter(filter: &BitmapFilter) -> bool {
    if !is_bitmap_filter(filter) {
        return false;
    }
    match filter {
        BitmapFilter::ColorMatrix(f) => f.matrix.len() == COLOR_MATRIX_LENGTH,
        BitmapFilter::Convolution(f) => {
            f.matrix.len() == (f.matrix_x as usize) * (f.matrix_y as usize)
        }
        _ => true,
    }
}

/// Returns `true` when every element of `filters` passes `is_valid_bitmap_filter`.
pub fn is_valid_bitmap_filter_list(filters: &[BitmapFilter]) -> bool {
    filters.iter().all(is_valid_bitmap_filter)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{ColorMatrixFilter, ConvolutionFilter};

    #[test]
    fn clamp_filter_quality_clamps_and_rounds() {
        assert_eq!(clamp_filter_quality(0.0), 1);
        assert_eq!(clamp_filter_quality(20.0), 15);
        assert_eq!(clamp_filter_quality(3.4), 3);
        assert_eq!(clamp_filter_quality(3.6), 4);
    }

    #[test]
    fn clamp_filter_strength_clamps() {
        assert_eq!(clamp_filter_strength(-5.0), 0.0);
        assert_eq!(clamp_filter_strength(300.0), 255.0);
        assert_eq!(clamp_filter_strength(128.0), 128.0);
    }

    #[test]
    fn is_valid_bitmap_filter_color_matrix_length() {
        let good = BitmapFilter::ColorMatrix(ColorMatrixFilter {
            matrix: vec![0.0; 20],
        });
        let bad = BitmapFilter::ColorMatrix(ColorMatrixFilter {
            matrix: vec![0.0; 19],
        });
        assert!(is_valid_bitmap_filter(&good));
        assert!(!is_valid_bitmap_filter(&bad));
    }

    #[test]
    fn is_valid_bitmap_filter_convolution_dimensions() {
        let good = BitmapFilter::Convolution(ConvolutionFilter {
            matrix: vec![0.0; 9],
            matrix_x: 3,
            matrix_y: 3,
            ..Default::default()
        });
        let bad = BitmapFilter::Convolution(ConvolutionFilter {
            matrix: vec![0.0; 8],
            matrix_x: 3,
            matrix_y: 3,
            ..Default::default()
        });
        assert!(is_valid_bitmap_filter(&good));
        assert!(!is_valid_bitmap_filter(&bad));
    }

    #[test]
    fn is_valid_bitmap_filter_simple_kinds_valid() {
        assert!(is_valid_bitmap_filter(&BitmapFilter::Blur(
            Default::default()
        )));
    }

    #[test]
    fn is_valid_bitmap_filter_list_all_valid() {
        let list = vec![
            BitmapFilter::Blur(Default::default()),
            BitmapFilter::ColorMatrix(ColorMatrixFilter {
                matrix: vec![0.0; 20],
            }),
        ];
        assert!(is_valid_bitmap_filter_list(&list));
    }

    #[test]
    fn is_valid_bitmap_filter_list_one_invalid() {
        let list = vec![
            BitmapFilter::Blur(Default::default()),
            BitmapFilter::ColorMatrix(ColorMatrixFilter {
                matrix: vec![0.0; 5],
            }),
        ];
        assert!(!is_valid_bitmap_filter_list(&list));
    }
}

//! Per-side pixel margin a `BitmapFilter` adds around the source bounds.

use flighthq_types::{BitmapFilter, BitmapFilterMargin};

use crate::bitmap_filter_guards::{
    is_bevel_filter, is_blur_filter, is_drop_shadow_filter, is_gradient_bevel_filter,
    is_gradient_glow_filter, is_outer_glow_filter,
};
use crate::bitmap_filter_ops::{
    DEFAULT_FILTER_ANGLE, DEFAULT_FILTER_BLUR_X, DEFAULT_FILTER_BLUR_Y, DEFAULT_FILTER_DISTANCE,
};
use crate::blur_quality::get_blur_pass_count_for_quality;
use crate::math::compute_box_blur_radius;

/// Computes the per-side pixel expansion `filter` needs around the source bounds, writing the
/// result into `out`. The result is the smallest bounding box that guarantees no rendered pixels
/// are clipped. Backends use this to size their intermediate surfaces; the actual rectangle
/// expansion stays in the backends.
///
/// Inner effects (`InnerShadowFilter`, `InnerGlowFilter`) always leave `out` at zero on all sides
/// — they paint inside the source bounds. Colour-matrix, convolution, displacement, median,
/// pixelate, and sharpen filters likewise leave `out` at zero — they transform pixels in place
/// without expanding the bounds.
///
/// Blur-radius expansion uses the single-pass box approximation (`compute_box_blur_radius`) for
/// the given quality level, which matches what backends apply.
pub fn get_bitmap_filter_margin(out: &mut BitmapFilterMargin, filter: &BitmapFilter) {
    if is_blur_filter(filter) {
        if let BitmapFilter::Blur(f) = filter {
            let blur_x = f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X);
            let blur_y = f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y);
            let passes = 1; // BlurFilter has no quality field — single pass
            let rx = compute_box_blur_radius(blur_x / 2.0, passes);
            let ry = compute_box_blur_radius(blur_y / 2.0, passes);
            out.top = ry;
            out.right = rx;
            out.bottom = ry;
            out.left = rx;
        }
        return;
    }
    if is_drop_shadow_filter(filter) {
        if let BitmapFilter::DropShadow(f) = filter {
            let blur_x = f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X);
            let blur_y = f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y);
            let quality = f.quality.unwrap_or(1);
            let angle = f.angle.unwrap_or(DEFAULT_FILTER_ANGLE);
            let distance = f.distance.unwrap_or(DEFAULT_FILTER_DISTANCE);
            let passes = get_blur_pass_count_for_quality(quality);
            let rx = compute_box_blur_radius(blur_x / 2.0, passes);
            let ry = compute_box_blur_radius(blur_y / 2.0, passes);
            let rad = angle.to_radians();
            let dx = (rad.cos() * distance).round().abs() as u32;
            let dy = (rad.sin() * distance).round().abs() as u32;
            out.top = ry + dy;
            out.right = rx + dx;
            out.bottom = ry + dy;
            out.left = rx + dx;
        }
        return;
    }
    if is_outer_glow_filter(filter)
        || is_gradient_glow_filter(filter)
        || is_bevel_filter(filter)
        || is_gradient_bevel_filter(filter)
    {
        let (blur_x, blur_y, quality) = match filter {
            BitmapFilter::OuterGlow(f) => (
                f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X),
                f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y),
                f.quality.unwrap_or(1),
            ),
            BitmapFilter::GradientGlow(f) => (
                f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X),
                f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y),
                f.quality.unwrap_or(1),
            ),
            BitmapFilter::Bevel(f) => (
                f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X),
                f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y),
                f.quality.unwrap_or(1),
            ),
            BitmapFilter::GradientBevel(f) => (
                f.blur_x.unwrap_or(DEFAULT_FILTER_BLUR_X),
                f.blur_y.unwrap_or(DEFAULT_FILTER_BLUR_Y),
                f.quality.unwrap_or(1),
            ),
            _ => unreachable!(),
        };
        let passes = get_blur_pass_count_for_quality(quality);
        let rx = compute_box_blur_radius(blur_x / 2.0, passes);
        let ry = compute_box_blur_radius(blur_y / 2.0, passes);
        out.top = ry;
        out.right = rx;
        out.bottom = ry;
        out.left = rx;
        return;
    }
    // Inner effects (InnerGlowFilter, InnerShadowFilter) paint inside the source bounds, and
    // pixel-transform filters (ColorMatrix, Convolution, DisplacementMap, Median, Pixelate,
    // Sharpen) keep the output the same size as the input.
    out.top = 0;
    out.right = 0;
    out.bottom = 0;
    out.left = 0;
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{
        BevelFilter, BlurFilter, DropShadowFilter, InnerGlowFilter, OuterGlowFilter,
    };

    #[test]
    fn get_bitmap_filter_margin_bevel_filter_expands_all_sides() {
        let filter = BitmapFilter::Bevel(BevelFilter {
            blur_x: Some(8.0),
            blur_y: Some(8.0),
            quality: Some(1),
            ..Default::default()
        });
        let mut out = BitmapFilterMargin::default();
        get_bitmap_filter_margin(&mut out, &filter);
        assert!(out.top > 0);
        assert!(out.left > 0);
    }

    #[test]
    fn get_bitmap_filter_margin_blur_filter_expands_all_sides() {
        let filter = BitmapFilter::Blur(BlurFilter {
            blur_x: Some(8.0),
            blur_y: Some(4.0),
        });
        let mut out = BitmapFilterMargin::default();
        get_bitmap_filter_margin(&mut out, &filter);
        assert!(out.left > 0);
        assert!(out.right > 0);
        assert!(out.top > 0);
        assert!(out.bottom > 0);
    }

    #[test]
    fn get_bitmap_filter_margin_drop_shadow_filter_expands_asymmetrically() {
        let filter = BitmapFilter::DropShadow(DropShadowFilter {
            angle: Some(0.0),
            distance: Some(10.0),
            blur_x: Some(0.0),
            blur_y: Some(0.0),
            ..Default::default()
        });
        let mut out = BitmapFilterMargin::default();
        get_bitmap_filter_margin(&mut out, &filter);
        assert!(out.right >= out.top);
    }

    #[test]
    fn get_bitmap_filter_margin_inner_glow_filter_is_zero() {
        let filter = BitmapFilter::InnerGlow(InnerGlowFilter {
            blur_x: Some(8.0),
            blur_y: Some(8.0),
            ..Default::default()
        });
        let mut out = BitmapFilterMargin {
            top: 99,
            right: 99,
            bottom: 99,
            left: 99,
        };
        get_bitmap_filter_margin(&mut out, &filter);
        assert_eq!(out, BitmapFilterMargin::default());
    }

    #[test]
    fn get_bitmap_filter_margin_outer_glow_filter_expands_all_sides() {
        let filter = BitmapFilter::OuterGlow(OuterGlowFilter {
            blur_x: Some(6.0),
            blur_y: Some(6.0),
            ..Default::default()
        });
        let mut out = BitmapFilterMargin::default();
        get_bitmap_filter_margin(&mut out, &filter);
        assert!(out.top > 0);
        assert!(out.left > 0);
    }
}

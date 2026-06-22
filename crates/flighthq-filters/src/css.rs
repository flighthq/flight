//! CSS filter serialization for filters that have an equivalent CSS form.
//!
//! Not all filters map cleanly to a CSS filter primitive. Functions in this
//! module return `None` when the filter parameters fall outside what CSS can
//! represent (e.g. asymmetric blur radii).

use flighthq_types::{BlurFilter, DropShadowFilter, OuterGlowFilter};

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Returns the CSS `blur(Xpx)` string for a `BlurFilter`, or `None` if the X
/// and Y radii differ (CSS blur is isotropic).
pub fn compute_blur_filter_css(filter: &BlurFilter) -> Option<String> {
    let bx = filter.blur_x.unwrap_or(4.0);
    let by = filter.blur_y.unwrap_or(4.0);
    if (bx - by).abs() > f32::EPSILON {
        return None;
    }
    if bx <= 0.0 {
        return None;
    }
    Some(format!("blur({}px)", bx))
}

/// Returns the CSS `drop-shadow(…)` string for a `DropShadowFilter`, or
/// `None` when the filter uses knockout or has asymmetric blur radii.
pub fn compute_drop_shadow_filter_css(filter: &DropShadowFilter) -> Option<String> {
    if filter.knockout.unwrap_or(false) {
        return None;
    }
    let blur_x = filter.blur_x.unwrap_or(4.0);
    let blur_y = filter.blur_y.unwrap_or(4.0);
    if (blur_x - blur_y).abs() > f32::EPSILON {
        return None;
    }
    let (dx, dy) = get_shadow_filter_offset_values(
        filter.angle.unwrap_or(45.0),
        filter.distance.unwrap_or(4.0),
    );
    let color = filter.color.unwrap_or(0);
    let alpha = filter.alpha.unwrap_or(1.0);
    let css_color = rgba_from_packed_rgb(color, alpha);
    Some(format!(
        "drop-shadow({}px {}px {}px {})",
        dx, dy, blur_x, css_color
    ))
}

/// Returns the CSS `drop-shadow(0 0 Xpx …)` string for an `OuterGlowFilter`,
/// or `None` when the filter uses knockout or has asymmetric blur radii.
pub fn compute_outer_glow_filter_css(filter: &OuterGlowFilter) -> Option<String> {
    if filter.knockout.unwrap_or(false) {
        return None;
    }
    let blur_x = filter.blur_x.unwrap_or(6.0);
    let blur_y = filter.blur_y.unwrap_or(6.0);
    if (blur_x - blur_y).abs() > f32::EPSILON {
        return None;
    }
    let color = filter.color.unwrap_or(0xff0000);
    let alpha = filter.alpha.unwrap_or(1.0);
    let css_color = rgba_from_packed_rgb(color, alpha);
    Some(format!("drop-shadow(0px 0px {}px {})", blur_x, css_color))
}

/// Computes the `(dx, dy)` pixel offset for a shadow or bevel effect from
/// `angle` (degrees, 0 = right, increasing clockwise) and `distance` (pixels).
pub fn get_shadow_filter_offset(filter_angle: f32, filter_distance: f32) -> (f32, f32) {
    get_shadow_filter_offset_values(filter_angle, filter_distance)
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

fn get_shadow_filter_offset_values(angle_deg: f32, distance: f32) -> (f32, f32) {
    let radians = angle_deg.to_radians();
    let dx = (radians.cos() * distance).round();
    let dy = (radians.sin() * distance).round();
    (dx, dy)
}

fn rgba_from_packed_rgb(color: u32, alpha: f32) -> String {
    let r = (color >> 16) & 0xff;
    let g = (color >> 8) & 0xff;
    let b = color & 0xff;
    format!("rgba({},{},{},{:.3})", r, g, b, alpha)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_blur_filter_css_symmetric() {
        let f = BlurFilter {
            blur_x: Some(4.0),
            blur_y: Some(4.0),
        };
        assert_eq!(compute_blur_filter_css(&f), Some("blur(4px)".to_string()));
    }

    #[test]
    fn compute_blur_filter_css_asymmetric_returns_none() {
        let f = BlurFilter {
            blur_x: Some(4.0),
            blur_y: Some(8.0),
        };
        assert!(compute_blur_filter_css(&f).is_none());
    }

    #[test]
    fn compute_blur_filter_css_zero_returns_none() {
        let f = BlurFilter {
            blur_x: Some(0.0),
            blur_y: Some(0.0),
        };
        assert!(compute_blur_filter_css(&f).is_none());
    }

    #[test]
    fn compute_drop_shadow_filter_css_knockout_returns_none() {
        let f = DropShadowFilter {
            knockout: Some(true),
            ..Default::default()
        };
        assert!(compute_drop_shadow_filter_css(&f).is_none());
    }

    #[test]
    fn compute_blur_filter_css_default_radii() {
        // Defaults blur_x = blur_y = 4.
        assert_eq!(
            compute_blur_filter_css(&BlurFilter::default()),
            Some("blur(4px)".to_string())
        );
    }

    #[test]
    fn compute_drop_shadow_filter_css_basic_shadow() {
        let f = DropShadowFilter {
            angle: Some(0.0),
            distance: Some(4.0),
            blur_x: Some(2.0),
            blur_y: Some(2.0),
            color: Some(0),
            alpha: Some(1.0),
            ..Default::default()
        };
        assert_eq!(
            compute_drop_shadow_filter_css(&f),
            Some("drop-shadow(4px 0px 2px rgba(0,0,0,1.000))".to_string())
        );
    }

    #[test]
    fn compute_drop_shadow_filter_css_anisotropic_returns_none() {
        let f = DropShadowFilter {
            blur_x: Some(2.0),
            blur_y: Some(8.0),
            ..Default::default()
        };
        assert!(compute_drop_shadow_filter_css(&f).is_none());
    }

    #[test]
    fn compute_drop_shadow_filter_css_encodes_color() {
        let f = DropShadowFilter {
            angle: Some(0.0),
            distance: Some(0.0),
            color: Some(0xff8040),
            alpha: Some(0.5),
            ..Default::default()
        };
        let css = compute_drop_shadow_filter_css(&f).unwrap();
        assert!(css.contains("rgba(255,128,64,0.500)"));
    }

    #[test]
    fn compute_drop_shadow_filter_css_produces_string() {
        let f = DropShadowFilter {
            blur_x: Some(4.0),
            blur_y: Some(4.0),
            color: Some(0x000000),
            alpha: Some(1.0),
            angle: Some(45.0),
            distance: Some(4.0),
            ..Default::default()
        };
        let css = compute_drop_shadow_filter_css(&f);
        assert!(css.is_some());
        assert!(css.unwrap().starts_with("drop-shadow("));
    }

    #[test]
    fn compute_outer_glow_filter_css_anisotropic_returns_none() {
        let f = OuterGlowFilter {
            blur_x: Some(4.0),
            blur_y: Some(8.0),
            ..Default::default()
        };
        assert!(compute_outer_glow_filter_css(&f).is_none());
    }

    #[test]
    fn compute_outer_glow_filter_css_basic_glow() {
        let f = OuterGlowFilter {
            blur_x: Some(6.0),
            blur_y: Some(6.0),
            color: Some(0xff0000),
            alpha: Some(1.0),
            ..Default::default()
        };
        assert_eq!(
            compute_outer_glow_filter_css(&f),
            Some("drop-shadow(0px 0px 6px rgba(255,0,0,1.000))".to_string())
        );
    }

    #[test]
    fn compute_outer_glow_filter_css_default_radii() {
        let css = compute_outer_glow_filter_css(&OuterGlowFilter::default()).unwrap();
        assert!(css.starts_with("drop-shadow(0px 0px 6px"));
    }

    #[test]
    fn compute_outer_glow_filter_css_knockout_returns_none() {
        let f = OuterGlowFilter {
            knockout: Some(true),
            ..Default::default()
        };
        assert!(compute_outer_glow_filter_css(&f).is_none());
    }

    #[test]
    fn compute_outer_glow_filter_css_produces_string() {
        let f = OuterGlowFilter {
            blur_x: Some(6.0),
            blur_y: Some(6.0),
            color: Some(0xff0000),
            alpha: Some(1.0),
            ..Default::default()
        };
        let css = compute_outer_glow_filter_css(&f);
        assert!(css.is_some());
    }

    #[test]
    fn get_shadow_filter_offset_default_angle_and_distance() {
        // Defaults: angle 45, distance 4.
        let (dx, dy) = get_shadow_filter_offset(45.0, 4.0);
        let expected = (45.0_f32.to_radians().cos() * 4.0).round();
        assert_eq!(dx, expected);
        assert_eq!(dy, expected);
    }

    #[test]
    fn get_shadow_filter_offset_ninety_angle() {
        // 90 degrees = down: dx ≈ 0, dy > 0
        let (dx, dy) = get_shadow_filter_offset(90.0, 10.0);
        assert_eq!(dx, 0.0);
        assert_eq!(dy, 10.0);
    }

    #[test]
    fn get_shadow_filter_offset_zero_angle() {
        // 0 degrees = right: dx > 0, dy ≈ 0
        let (dx, dy) = get_shadow_filter_offset(0.0, 4.0);
        assert_eq!(dx, 4.0);
        assert_eq!(dy, 0.0);
    }
}

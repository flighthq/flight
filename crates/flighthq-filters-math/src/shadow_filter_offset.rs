use std::f32::consts::PI;

use flighthq_types::{BevelFilter, DropShadowFilter, InnerShadowFilter};

/// Output struct for the pixel offset computed from a shadow or bevel filter's
/// angle and distance fields.
pub struct ShadowFilterOffset {
    pub dx: f32,
    pub dy: f32,
}

/// Trait implemented by filter types that carry an `angle` and `distance` for
/// shadow offset computation.
pub trait HasShadowOffset {
    fn shadow_angle(&self) -> Option<f32>;
    fn shadow_distance(&self) -> Option<f32>;
}

impl HasShadowOffset for BevelFilter {
    fn shadow_angle(&self) -> Option<f32> {
        self.angle
    }
    fn shadow_distance(&self) -> Option<f32> {
        self.distance
    }
}

impl HasShadowOffset for DropShadowFilter {
    fn shadow_angle(&self) -> Option<f32> {
        self.angle
    }
    fn shadow_distance(&self) -> Option<f32> {
        self.distance
    }
}

impl HasShadowOffset for InnerShadowFilter {
    fn shadow_angle(&self) -> Option<f32> {
        self.angle
    }
    fn shadow_distance(&self) -> Option<f32> {
        self.distance
    }
}

/// Computes the pixel offset (dx, dy) for shadow and bevel effects from the
/// `angle` and `distance` fields on the filter. Angle is in degrees; 0 points
/// right and increases clockwise (matching Flash/OpenFL conventions). The result
/// is written into `out`.
///
/// Used by every backend that needs to position or shift the shadow mask — the
/// calculation is shared so backends do not re-derive it independently.
pub fn get_shadow_filter_offset<F: HasShadowOffset>(filter: &F, out: &mut ShadowFilterOffset) {
    let angle = (filter.shadow_angle().unwrap_or(45.0) * PI) / 180.0;
    let distance = filter.shadow_distance().unwrap_or(4.0);
    out.dx = f32::round(f32::cos(angle) * distance);
    out.dy = f32::round(f32::sin(angle) * distance);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_drop_shadow(angle: Option<f32>, distance: Option<f32>) -> DropShadowFilter {
        DropShadowFilter {
            angle,
            distance,
            ..Default::default()
        }
    }

    fn make_inner_shadow(angle: Option<f32>, distance: Option<f32>) -> InnerShadowFilter {
        InnerShadowFilter {
            angle,
            distance,
            ..Default::default()
        }
    }

    fn make_bevel(angle: Option<f32>, distance: Option<f32>) -> BevelFilter {
        BevelFilter {
            angle,
            distance,
            ..Default::default()
        }
    }

    fn offset<F: HasShadowOffset>(filter: &F) -> (f32, f32) {
        let mut out = ShadowFilterOffset { dx: 0.0, dy: 0.0 };
        get_shadow_filter_offset(filter, &mut out);
        (out.dx, out.dy)
    }

    #[test]
    fn get_shadow_filter_offset_angle_0_gives_positive_x_axis() {
        let (dx, dy) = offset(&make_drop_shadow(Some(0.0), Some(4.0)));
        assert_eq!(dx, 4.0);
        assert_eq!(dy, 0.0);
    }

    #[test]
    fn get_shadow_filter_offset_angle_90_gives_positive_y_axis() {
        let (dx, dy) = offset(&make_drop_shadow(Some(90.0), Some(4.0)));
        assert_eq!(dx, 0.0);
        assert_eq!(dy, 4.0);
    }

    #[test]
    fn get_shadow_filter_offset_uses_defaults_when_angle_and_distance_omitted() {
        let (dx, dy) = offset(&make_drop_shadow(None, None));
        let expected = f32::round(f32::cos(PI / 4.0) * 4.0);
        assert_eq!(dx, expected);
        assert_eq!(dy, expected);
    }

    #[test]
    fn get_shadow_filter_offset_works_for_inner_shadow_filter() {
        let (dx, dy) = offset(&make_inner_shadow(Some(0.0), Some(8.0)));
        assert_eq!(dx, 8.0);
        assert_eq!(dy, 0.0);
    }

    #[test]
    fn get_shadow_filter_offset_works_for_bevel_filter() {
        let (dx, dy) = offset(&make_bevel(Some(180.0), Some(4.0)));
        assert_eq!(dx, -4.0);
        assert!((dy).abs() < 0.5);
    }
}

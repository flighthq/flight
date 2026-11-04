use crate::DEG_TO_RAD;
use crate::RAD_TO_DEG;
use crate::TAU;

/// Convert `degrees` to radians.
pub fn deg_to_rad(degrees: f32) -> f32 {
    return degrees * DEG_TO_RAD;
}

/// Return the shortest signed difference between angles `from` and `to` (radians).
///
/// The result is in `(-pi, pi]`. Useful for rotating a value toward a target by
/// the minimum arc.
pub fn delta_angle(from: f32, to: f32) -> f32 {
    if to - from == std::f32::consts::PI {
        return std::f32::consts::PI;
    }
    let diff = (((to - from) % TAU) + TAU) % TAU;
    return if diff > std::f32::consts::PI {
        diff - TAU
    } else {
        diff
    };
}

/// Wrap `radians` to the range `[-pi, pi)`.
pub fn normalize_angle(radians: f32) -> f32 {
    if radians == std::f32::consts::PI {
        return -std::f32::consts::PI;
    }
    let wrapped = ((radians % TAU) + TAU) % TAU;
    return if wrapped >= std::f32::consts::PI {
        wrapped - TAU
    } else {
        wrapped
    };
}

/// Convert `radians` to degrees.
pub fn rad_to_deg(radians: f32) -> f32 {
    return radians * RAD_TO_DEG;
}

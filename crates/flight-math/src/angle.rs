use crate::DEG_TO_RAD;
use crate::RAD_TO_DEG;
use crate::TAU;

/// Convert `degrees` to radians.
pub fn deg_to_rad(degrees: f64) -> f64 {
    return degrees * DEG_TO_RAD;
}

/// Return the shortest signed difference between angles `from` and `to` (radians).
///
/// The result is in `(-pi, pi]`. Useful for rotating a value toward a target by
/// the minimum arc.
pub fn delta_angle(from: f64, to: f64) -> f64 {
    if to - from == std::f64::consts::PI {
        return std::f64::consts::PI;
    }
    let diff = (((to - from) % TAU) + TAU) % TAU;
    return if diff > std::f64::consts::PI {
        diff - TAU
    } else {
        diff
    };
}

/// Wrap `radians` to the range `[-pi, pi)`.
pub fn normalize_angle(radians: f64) -> f64 {
    if radians == std::f64::consts::PI {
        return -std::f64::consts::PI;
    }
    let wrapped = ((radians % TAU) + TAU) % TAU;
    return if wrapped >= std::f64::consts::PI {
        wrapped - TAU
    } else {
        wrapped
    };
}

/// Convert `radians` to degrees.
pub fn rad_to_deg(radians: f64) -> f64 {
    return radians * RAD_TO_DEG;
}

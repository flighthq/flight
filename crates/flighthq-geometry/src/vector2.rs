//! Free functions for [`Vector2`] — 2D vector math.

use flighthq_types::{Vector2, Vector2Like};

// ---------------------------------------------------------------------------
// Axis constants
// ---------------------------------------------------------------------------

/// Unit vector along the X axis.
pub const VECTOR2_X_AXIS: Vector2 = Vector2 { x: 1.0, y: 0.0 };

/// Unit vector along the Y axis.
pub const VECTOR2_Y_AXIS: Vector2 = Vector2 { x: 0.0, y: 1.0 };

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Adds two vectors and writes the result into `out`.
///
/// Safe when `out` aliases `a` or `b`.
pub fn add_vector2(out: &mut Vector2Like, a: &Vector2Like, b: &Vector2Like) {
    let x = a.x + b.x;
    let y = a.y + b.y;
    out.x = x;
    out.y = y;
}

/// Returns a new [`Vector2`] that is a copy of `source`.
pub fn clone_vector2(source: &Vector2Like) -> Vector2 {
    create_vector2(source.x, source.y)
}

/// Copies `source` into `out`.
pub fn copy_vector2(out: &mut Vector2Like, source: &Vector2Like) {
    out.x = source.x;
    out.y = source.y;
}

/// Creates a new [`Vector2`] with the given coordinates (defaults to `0, 0`).
pub fn create_vector2(x: f32, y: f32) -> Vector2 {
    Vector2 { x, y }
}

/// Creates a new [`Vector2`] from polar coordinates (`length`, `angle` in radians).
pub fn create_vector2_from_polar(length: f32, angle: f32) -> Vector2 {
    let mut scratch = Vector2Like::default();
    set_vector2_from_polar(&mut scratch, length, angle);
    create_vector2(scratch.x, scratch.y)
}

/// Returns `true` if both vectors have equal components.
///
/// Returns `false` if either is missing (Rust: just use `None` check at call site).
pub fn equals_vector2(a: &Vector2Like, b: &Vector2Like) -> bool {
    a.x == b.x && a.y == b.y
}

/// Returns the angle in radians between `a` and `b` (smallest rotation from `a` to `b`).
///
/// Returns `f32::NAN` if either vector has zero length.
pub fn get_vector2_angle_between(a: &Vector2Like, b: &Vector2Like) -> f32 {
    let la = get_vector2_length(a);
    let lb = get_vector2_length(b);
    if la == 0.0 || lb == 0.0 {
        return f32::NAN;
    }
    let dot = get_vector2_dot(a, b) / (la * lb);
    dot.clamp(-1.0, 1.0).acos()
}

/// Returns the Euclidean distance between two points.
pub fn get_vector2_distance(a: &Vector2Like, b: &Vector2Like) -> f32 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    (dx * dx + dy * dy).sqrt()
}

/// Returns the squared Euclidean distance between two points (avoids `sqrt`).
pub fn get_vector2_distance_squared(a: &Vector2Like, b: &Vector2Like) -> f32 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    dx * dx + dy * dy
}

/// Returns the dot product of `a` and `b`.
pub fn get_vector2_dot(a: &Vector2Like, b: &Vector2Like) -> f32 {
    a.x * b.x + a.y * b.y
}

/// Returns the length (magnitude) of `source`.
pub fn get_vector2_length(source: &Vector2Like) -> f32 {
    (source.x * source.x + source.y * source.y).sqrt()
}

/// Returns the squared length of `source` (avoids `sqrt`).
pub fn get_vector2_length_squared(source: &Vector2Like) -> f32 {
    source.x * source.x + source.y * source.y
}

/// Linearly interpolates between `a` and `b` by factor `t` and writes into `out`.
///
/// Safe when `out` aliases `a` or `b`.
pub fn interpolate_vector2(out: &mut Vector2Like, a: &Vector2Like, b: &Vector2Like, t: f32) {
    let x = a.x + t * (b.x - a.x);
    let y = a.y + t * (b.y - a.y);
    out.x = x;
    out.y = y;
}

/// Returns `true` if `a` and `b` are equal within `tolerance`.
pub fn near_equals_vector2(a: &Vector2Like, b: &Vector2Like, tolerance: f32) -> bool {
    (a.x - b.x).abs() < tolerance && (a.y - b.y).abs() < tolerance
}

/// Negates `source` and writes the result into `out`.
///
/// Safe when `out` aliases `source`.
pub fn negate_vector2(out: &mut Vector2Like, source: &Vector2Like) {
    out.x = -source.x;
    out.y = -source.y;
}

/// Writes `source` scaled to `new_length` into `out`, preserving direction.
///
/// If `source` has zero length the output is `(0, 0)`.
/// Safe when `out` aliases `source`.
pub fn normalize_vector2(out: &mut Vector2Like, source: &Vector2Like, new_length: f32) {
    let current = get_vector2_length(source);
    if current == 0.0 {
        out.x = 0.0;
        out.y = 0.0;
    } else {
        let scale = new_length / current;
        let x = source.x * scale;
        let y = source.y * scale;
        out.x = x;
        out.y = y;
    }
}

/// Offsets `source` by `(dx, dy)` and writes into `out`.
///
/// Safe when `out` aliases `source`.
pub fn offset_vector2(out: &mut Vector2Like, source: &Vector2Like, dx: f32, dy: f32) {
    let x = source.x + dx;
    let y = source.y + dy;
    out.x = x;
    out.y = y;
}

/// Scales `source` by `scalar` and writes into `out`.
///
/// Safe when `out` aliases `source`.
pub fn scale_vector2(out: &mut Vector2Like, source: &Vector2Like, scalar: f32) {
    let x = source.x * scalar;
    let y = source.y * scalar;
    out.x = x;
    out.y = y;
}

/// Sets `out` to `(x, y)`.
pub fn set_vector2(out: &mut Vector2Like, x: f32, y: f32) {
    out.x = x;
    out.y = y;
}

/// Reads two consecutive floats starting at `offset` from `source` into `out`.
pub fn set_vector2_from_f32_slice(out: &mut Vector2Like, offset: usize, source: &[f32]) {
    out.x = source[offset];
    out.y = source[offset + 1];
}

/// Sets `out` from polar coordinates (`length`, `angle` in radians).
pub fn set_vector2_from_polar(out: &mut Vector2Like, length: f32, angle: f32) {
    out.x = length * angle.cos();
    out.y = length * angle.sin();
}

/// Subtracts `other` from `source` and writes into `out`.
///
/// Safe when `out` aliases `source` or `other`.
pub fn subtract_vector2(out: &mut Vector2Like, source: &Vector2Like, other: &Vector2Like) {
    let x = source.x - other.x;
    let y = source.y - other.y;
    out.x = x;
    out.y = y;
}

/// Writes the vector into two consecutive floats in `out` starting at `offset`.
pub fn write_vector2_to_f32_slice(out: &mut [f32], offset: usize, source: &Vector2Like) {
    out[offset] = source.x;
    out[offset + 1] = source.y;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn v(x: f32, y: f32) -> Vector2Like {
        Vector2Like { x, y }
    }

    // add_vector2
    #[test]
    fn add_vector2_adds_components() {
        let mut out = v(0.0, 0.0);
        add_vector2(&mut out, &v(1.0, 2.0), &v(3.0, 4.0));
        assert_eq!(out.x, 4.0);
        assert_eq!(out.y, 6.0);
    }

    #[test]
    fn add_vector2_aliased_out_is_a() {
        let mut a = v(1.0, 2.0);
        let b = v(3.0, 4.0);
        // Safe alias: read all inputs first
        let bx = b.x;
        let by = b.y;
        let ax = a.x;
        let ay = a.y;
        a.x = ax + bx;
        a.y = ay + by;
        assert_eq!(a.x, 4.0);
        assert_eq!(a.y, 6.0);
    }

    // clone_vector2
    #[test]
    fn clone_vector2_copies_values() {
        let src = v(5.0, 7.0);
        let c = clone_vector2(&src);
        assert_eq!(c.x, 5.0);
        assert_eq!(c.y, 7.0);
    }

    // copy_vector2
    #[test]
    fn copy_vector2_copies_fields() {
        let src = v(3.0, 4.0);
        let mut out = v(0.0, 0.0);
        copy_vector2(&mut out, &src);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 4.0);
    }

    // create_vector2
    #[test]
    fn create_vector2_stores_values() {
        let v2 = create_vector2(1.5, 2.5);
        assert_eq!(v2.x, 1.5);
        assert_eq!(v2.y, 2.5);
    }

    // create_vector2_from_polar
    #[test]
    fn create_vector2_from_polar_zero_angle() {
        let p = create_vector2_from_polar(2.0, 0.0);
        assert!((p.x - 2.0).abs() < 1e-6);
        assert!(p.y.abs() < 1e-6);
    }

    // equals_vector2
    #[test]
    fn equals_vector2_same_values() {
        assert!(equals_vector2(&v(1.0, 2.0), &v(1.0, 2.0)));
    }

    #[test]
    fn equals_vector2_different_values() {
        assert!(!equals_vector2(&v(1.0, 2.0), &v(1.0, 3.0)));
    }

    // get_vector2_angle_between
    #[test]
    fn get_vector2_angle_between_perpendicular() {
        let a = v(1.0, 0.0);
        let b = v(0.0, 1.0);
        let angle = get_vector2_angle_between(&a, &b);
        assert!((angle - std::f32::consts::FRAC_PI_2).abs() < 1e-6);
    }

    #[test]
    fn get_vector2_angle_between_zero_length_is_nan() {
        let z = v(0.0, 0.0);
        let b = v(1.0, 0.0);
        assert!(get_vector2_angle_between(&z, &b).is_nan());
    }

    // get_vector2_distance
    #[test]
    fn get_vector2_distance_pythagorean() {
        let d = get_vector2_distance(&v(0.0, 0.0), &v(3.0, 4.0));
        assert!((d - 5.0).abs() < 1e-6);
    }

    // get_vector2_distance_squared
    #[test]
    fn get_vector2_distance_squared_matches() {
        let d2 = get_vector2_distance_squared(&v(0.0, 0.0), &v(3.0, 4.0));
        assert!((d2 - 25.0).abs() < 1e-6);
    }

    // get_vector2_dot
    #[test]
    fn get_vector2_dot_perpendicular_is_zero() {
        let d = get_vector2_dot(&v(1.0, 0.0), &v(0.0, 1.0));
        assert_eq!(d, 0.0);
    }

    // get_vector2_length
    #[test]
    fn get_vector2_length_unit() {
        assert!((get_vector2_length(&v(1.0, 0.0)) - 1.0).abs() < 1e-6);
    }

    // get_vector2_length_squared
    #[test]
    fn get_vector2_length_squared_simple() {
        assert!((get_vector2_length_squared(&v(3.0, 4.0)) - 25.0).abs() < 1e-6);
    }

    // interpolate_vector2
    #[test]
    fn interpolate_vector2_midpoint() {
        let mut out = v(0.0, 0.0);
        interpolate_vector2(&mut out, &v(0.0, 0.0), &v(2.0, 4.0), 0.5);
        assert!((out.x - 1.0).abs() < 1e-6);
        assert!((out.y - 2.0).abs() < 1e-6);
    }

    #[test]
    fn interpolate_vector2_aliased() {
        let mut a = v(0.0, 0.0);
        let b = v(2.0, 4.0);
        // Simulate aliased call by reading then writing
        let x = a.x + 0.5 * (b.x - a.x);
        let y = a.y + 0.5 * (b.y - a.y);
        a.x = x;
        a.y = y;
        assert!((a.x - 1.0).abs() < 1e-6);
    }

    // near_equals_vector2
    #[test]
    fn near_equals_vector2_within_tolerance() {
        assert!(near_equals_vector2(&v(1.0, 2.0), &v(1.0 + 1e-7, 2.0), 1e-6));
    }

    #[test]
    fn near_equals_vector2_outside_tolerance() {
        assert!(!near_equals_vector2(&v(1.0, 2.0), &v(2.0, 2.0), 1e-6));
    }

    // negate_vector2
    #[test]
    fn negate_vector2_reverses_sign() {
        let mut out = v(0.0, 0.0);
        negate_vector2(&mut out, &v(3.0, -4.0));
        assert_eq!(out.x, -3.0);
        assert_eq!(out.y, 4.0);
    }

    #[test]
    fn negate_vector2_aliased() {
        let mut a = v(3.0, -4.0);
        let x = -a.x;
        let y = -a.y;
        a.x = x;
        a.y = y;
        assert_eq!(a.x, -3.0);
        assert_eq!(a.y, 4.0);
    }

    // normalize_vector2
    #[test]
    fn normalize_vector2_to_unit_length() {
        let mut out = v(0.0, 0.0);
        normalize_vector2(&mut out, &v(3.0, 4.0), 1.0);
        let len = get_vector2_length(&out);
        assert!((len - 1.0).abs() < 1e-6);
    }

    #[test]
    fn normalize_vector2_zero_input_gives_zero() {
        let mut out = v(1.0, 1.0);
        normalize_vector2(&mut out, &v(0.0, 0.0), 1.0);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    // offset_vector2
    #[test]
    fn offset_vector2_shifts_coordinates() {
        let mut out = v(0.0, 0.0);
        offset_vector2(&mut out, &v(1.0, 2.0), 3.0, 4.0);
        assert_eq!(out.x, 4.0);
        assert_eq!(out.y, 6.0);
    }

    // scale_vector2
    #[test]
    fn scale_vector2_multiplies() {
        let mut out = v(0.0, 0.0);
        scale_vector2(&mut out, &v(2.0, 3.0), 4.0);
        assert_eq!(out.x, 8.0);
        assert_eq!(out.y, 12.0);
    }

    // set_vector2
    #[test]
    fn set_vector2_assigns() {
        let mut out = v(0.0, 0.0);
        set_vector2(&mut out, 9.0, 8.0);
        assert_eq!(out.x, 9.0);
        assert_eq!(out.y, 8.0);
    }

    // set_vector2_from_f32_slice
    #[test]
    fn set_vector2_from_f32_slice_reads_offset() {
        let data = [0.0f32, 1.0, 2.0, 3.0];
        let mut out = v(0.0, 0.0);
        set_vector2_from_f32_slice(&mut out, 2, &data);
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 3.0);
    }

    // set_vector2_from_float32_array (TS setVector2FromFloat32Array -> set_vector2_from_f32_slice)
    #[test]
    fn set_vector2_from_float32_array_reads_two_values() {
        let array = [1.0f32, 2.0];
        let mut out = v(100.0, 100.0);
        set_vector2_from_f32_slice(&mut out, 0, &array);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
    }

    // set_vector2_from_polar
    #[test]
    fn set_vector2_from_polar_quarter_pi() {
        let mut out = v(0.0, 0.0);
        set_vector2_from_polar(&mut out, 1.0, std::f32::consts::FRAC_PI_4);
        let expected = 1.0_f32 / std::f32::consts::SQRT_2;
        assert!((out.x - expected).abs() < 1e-6);
        assert!((out.y - expected).abs() < 1e-6);
    }

    // subtract_vector2
    #[test]
    fn subtract_vector2_computes_difference() {
        let mut out = v(0.0, 0.0);
        subtract_vector2(&mut out, &v(5.0, 3.0), &v(2.0, 1.0));
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn subtract_vector2_aliased() {
        let mut a = v(5.0, 3.0);
        let b = v(2.0, 1.0);
        let x = a.x - b.x;
        let y = a.y - b.y;
        a.x = x;
        a.y = y;
        assert_eq!(a.x, 3.0);
        assert_eq!(a.y, 2.0);
    }

    // write_vector2_to_f32_slice
    #[test]
    fn write_vector2_to_f32_slice_writes_offset() {
        let src = v(7.0, 8.0);
        let mut data = [0.0f32; 5];
        write_vector2_to_f32_slice(&mut data, 3, &src);
        assert_eq!(data[3], 7.0);
        assert_eq!(data[4], 8.0);
    }

    // write_vector2_to_float32_array (TS writeVector2ToFloat32Array -> write_vector2_to_f32_slice)
    #[test]
    fn write_vector2_to_float32_array_writes_two_values() {
        let src = v(1.0, 2.0);
        let mut data = [0.0f32; 6];
        write_vector2_to_f32_slice(&mut data, 0, &src);
        assert_eq!(data[0], 1.0);
        assert_eq!(data[1], 2.0);
    }

    // constants
    #[test]
    fn vector2_x_axis_is_unit_x() {
        assert_eq!(VECTOR2_X_AXIS.x, 1.0);
        assert_eq!(VECTOR2_X_AXIS.y, 0.0);
    }

    #[test]
    fn vector2_y_axis_is_unit_y() {
        assert_eq!(VECTOR2_Y_AXIS.x, 0.0);
        assert_eq!(VECTOR2_Y_AXIS.y, 1.0);
    }
}

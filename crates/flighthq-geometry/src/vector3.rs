//! Free functions for [`Vector3`] — 3D vector math.

use flighthq_types::{Vector2Like, Vector3, Vector3Like};

// ---------------------------------------------------------------------------
// Axis constants
// ---------------------------------------------------------------------------

/// Unit vector along the X axis.
pub const VECTOR3_X_AXIS: Vector3 = Vector3 {
    x: 1.0,
    y: 0.0,
    z: 0.0,
};

/// Unit vector along the Y axis.
pub const VECTOR3_Y_AXIS: Vector3 = Vector3 {
    x: 0.0,
    y: 1.0,
    z: 0.0,
};

/// Unit vector along the Z axis.
pub const VECTOR3_Z_AXIS: Vector3 = Vector3 {
    x: 0.0,
    y: 0.0,
    z: 1.0,
};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Adds two vectors and writes the result into `out`.
///
/// Safe when `out` aliases `a` or `b`.
pub fn add_vector3(out: &mut Vector3Like, a: &Vector3Like, b: &Vector3Like) {
    let x = a.x + b.x;
    let y = a.y + b.y;
    let z = a.z + b.z;
    out.x = x;
    out.y = y;
    out.z = z;
}

/// Returns a new [`Vector3`] that is a copy of `source`.
pub fn clone_vector3(source: &Vector3Like) -> Vector3 {
    create_vector3(source.x, source.y, source.z)
}

/// Copies `source` into `out`.
pub fn copy_vector3(out: &mut Vector3Like, source: &Vector3Like) {
    out.x = source.x;
    out.y = source.y;
    out.z = source.z;
}

/// Creates a new [`Vector3`] with the given coordinates.
pub fn create_vector3(x: f32, y: f32, z: f32) -> Vector3 {
    Vector3 { x, y, z }
}

/// Writes the cross product of `source` × `other` into `out`.
///
/// Safe when `out` aliases `source` or `other` (all inputs read before any write).
pub fn cross_vector3(out: &mut Vector3Like, source: &Vector3Like, other: &Vector3Like) {
    let x = source.y * other.z - source.z * other.y;
    let y = source.z * other.x - source.x * other.z;
    let z = source.x * other.y - source.y * other.x;
    out.x = x;
    out.y = y;
    out.z = z;
}

/// Returns `true` if both vectors have equal components.
pub fn equals_vector3(a: &Vector3Like, b: &Vector3Like) -> bool {
    a.x == b.x && a.y == b.y && a.z == b.z
}

/// Returns the angle in radians between `a` and `b`.
///
/// Returns `f32::NAN` if either vector has zero length.
pub fn get_vector3_angle_between(a: &Vector3Like, b: &Vector3Like) -> f32 {
    let la = get_vector3_length(a);
    let lb = get_vector3_length(b);
    if la == 0.0 || lb == 0.0 {
        return f32::NAN;
    }
    let dot = get_vector3_dot(a, b) / (la * lb);
    dot.clamp(-1.0, 1.0).acos()
}

/// Returns the Euclidean distance between two points.
pub fn get_vector3_distance(a: &Vector3Like, b: &Vector3Like) -> f32 {
    let x = b.x - a.x;
    let y = b.y - a.y;
    let z = b.z - a.z;
    (x * x + y * y + z * z).sqrt()
}

/// Returns the squared Euclidean distance (avoids `sqrt`).
pub fn get_vector3_distance_squared(a: &Vector3Like, b: &Vector3Like) -> f32 {
    let x = b.x - a.x;
    let y = b.y - a.y;
    let z = b.z - a.z;
    x * x + y * y + z * z
}

/// Returns the dot product of `a` and `b`.
pub fn get_vector3_dot(a: &Vector3Like, b: &Vector3Like) -> f32 {
    a.x * b.x + a.y * b.y + a.z * b.z
}

/// Returns the length (magnitude) of `source`.
pub fn get_vector3_length(source: &Vector3Like) -> f32 {
    (source.x * source.x + source.y * source.y + source.z * source.z).sqrt()
}

/// Returns the squared length (avoids `sqrt`).
pub fn get_vector3_length_squared(source: &Vector3Like) -> f32 {
    source.x * source.x + source.y * source.y + source.z * source.z
}

/// Returns `true` if the two vectors are equal within `tolerance`.
pub fn near_equals_vector3(a: &Vector3Like, b: &Vector3Like, tolerance: f32) -> bool {
    (a.x - b.x).abs() < tolerance && (a.y - b.y).abs() < tolerance && (a.z - b.z).abs() < tolerance
}

/// Negates `source` and writes into `out`.
///
/// Safe when `out` aliases `source`.
pub fn negate_vector3(out: &mut Vector3Like, source: &Vector3Like) {
    out.x = -source.x;
    out.y = -source.y;
    out.z = -source.z;
}

/// Converts `source` to a unit vector and writes into `out`.
///
/// Returns the original length. If length is zero, writes `(0,0,0)`.
/// Safe when `out` aliases `source`.
pub fn normalize_vector3(out: &mut Vector3Like, source: &Vector3Like) -> f32 {
    let l = get_vector3_length(source);
    if l != 0.0 {
        let inv = 1.0 / l;
        let x = source.x * inv;
        let y = source.y * inv;
        let z = source.z * inv;
        out.x = x;
        out.y = y;
        out.z = z;
    } else {
        out.x = 0.0;
        out.y = 0.0;
        out.z = 0.0;
    }
    l
}

/// Offsets `source` by `(dx, dy, dz)` and writes into `out`.
///
/// Safe when `out` aliases `source`.
pub fn offset_vector3(out: &mut Vector3Like, source: &Vector3Like, dx: f32, dy: f32, dz: f32) {
    let x = source.x + dx;
    let y = source.y + dy;
    let z = source.z + dz;
    out.x = x;
    out.y = y;
    out.z = z;
}

/// Performs a perspective divide: writes `(source.x/source.z, source.y/source.z)` into `out`.
pub fn project_vector3(out: &mut Vector2Like, source: &Vector3Like) {
    out.x = source.x / source.z;
    out.y = source.y / source.z;
}

/// Scales `source` by `scalar` and writes into `out`.
///
/// Safe when `out` aliases `source`.
pub fn scale_vector3(out: &mut Vector3Like, source: &Vector3Like, scalar: f32) {
    let x = source.x * scalar;
    let y = source.y * scalar;
    let z = source.z * scalar;
    out.x = x;
    out.y = y;
    out.z = z;
}

/// Sets `out` to `(x, y, z)`.
pub fn set_vector3(out: &mut Vector3Like, x: f32, y: f32, z: f32) {
    out.x = x;
    out.y = y;
    out.z = z;
}

/// Subtracts `other` from `source` and writes into `out`.
///
/// Safe when `out` aliases `source` or `other`.
pub fn subtract_vector3(out: &mut Vector3Like, source: &Vector3Like, other: &Vector3Like) {
    let x = source.x - other.x;
    let y = source.y - other.y;
    let z = source.z - other.z;
    out.x = x;
    out.y = y;
    out.z = z;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn v(x: f32, y: f32, z: f32) -> Vector3Like {
        Vector3Like { x, y, z }
    }

    fn v2(x: f32, y: f32) -> Vector2Like {
        Vector2Like { x, y }
    }

    // add_vector3
    #[test]
    fn add_vector3_sums_components() {
        let mut out = v(0.0, 0.0, 0.0);
        add_vector3(&mut out, &v(1.0, 2.0, 3.0), &v(4.0, 5.0, 6.0));
        assert_eq!((out.x, out.y, out.z), (5.0, 7.0, 9.0));
    }

    #[test]
    fn add_vector3_aliased_safe() {
        let a = v(1.0, 2.0, 3.0);
        let b = v(4.0, 5.0, 6.0);
        let mut out = a;
        add_vector3(&mut out, &a, &b);
        assert_eq!((out.x, out.y, out.z), (5.0, 7.0, 9.0));
    }

    // clone_vector3
    #[test]
    fn clone_vector3_copies() {
        let src = v(1.0, 2.0, 3.0);
        let c = clone_vector3(&src);
        assert_eq!((c.x, c.y, c.z), (1.0, 2.0, 3.0));
    }

    // copy_vector3
    #[test]
    fn copy_vector3_copies_fields() {
        let src = v(3.0, 4.0, 5.0);
        let mut out = v(0.0, 0.0, 0.0);
        copy_vector3(&mut out, &src);
        assert_eq!((out.x, out.y, out.z), (3.0, 4.0, 5.0));
    }

    // create_vector3
    #[test]
    fn create_vector3_stores_values() {
        let v3 = create_vector3(1.0, 2.0, 3.0);
        assert_eq!((v3.x, v3.y, v3.z), (1.0, 2.0, 3.0));
    }

    // cross_vector3
    #[test]
    fn cross_vector3_x_cross_y_is_z() {
        let mut out = v(0.0, 0.0, 0.0);
        cross_vector3(&mut out, &v(1.0, 0.0, 0.0), &v(0.0, 1.0, 0.0));
        assert!((out.x).abs() < 1e-6);
        assert!((out.y).abs() < 1e-6);
        assert!((out.z - 1.0).abs() < 1e-6);
    }

    #[test]
    fn cross_vector3_aliased() {
        let a = v(1.0, 0.0, 0.0);
        let b = v(0.0, 1.0, 0.0);
        let mut out = a;
        cross_vector3(&mut out, &a, &b);
        assert!((out.x).abs() < 1e-6);
        assert!((out.z - 1.0).abs() < 1e-6);
    }

    // equals_vector3
    #[test]
    fn equals_vector3_same() {
        assert!(equals_vector3(&v(1.0, 2.0, 3.0), &v(1.0, 2.0, 3.0)));
    }

    #[test]
    fn equals_vector3_different() {
        assert!(!equals_vector3(&v(1.0, 2.0, 3.0), &v(1.0, 2.0, 4.0)));
    }

    // get_vector3_angle_between
    #[test]
    fn get_vector3_angle_between_perpendicular() {
        let angle = get_vector3_angle_between(&v(1.0, 0.0, 0.0), &v(0.0, 1.0, 0.0));
        assert!((angle - std::f32::consts::FRAC_PI_2).abs() < 1e-6);
    }

    #[test]
    fn get_vector3_angle_between_zero_is_nan() {
        assert!(get_vector3_angle_between(&v(0.0, 0.0, 0.0), &v(1.0, 0.0, 0.0)).is_nan());
    }

    // get_vector3_distance
    #[test]
    fn get_vector3_distance_known() {
        let d = get_vector3_distance(&v(0.0, 0.0, 0.0), &v(1.0, 0.0, 0.0));
        assert!((d - 1.0).abs() < 1e-6);
    }

    // get_vector3_distance_squared
    #[test]
    fn get_vector3_distance_squared_matches() {
        let d2 = get_vector3_distance_squared(&v(0.0, 0.0, 0.0), &v(1.0, 2.0, 2.0));
        assert!((d2 - 9.0).abs() < 1e-6);
    }

    // get_vector3_dot
    #[test]
    fn get_vector3_dot_perpendicular_zero() {
        let d = get_vector3_dot(&v(1.0, 0.0, 0.0), &v(0.0, 1.0, 0.0));
        assert_eq!(d, 0.0);
    }

    // get_vector3_length
    #[test]
    fn get_vector3_length_unit() {
        assert!((get_vector3_length(&v(1.0, 0.0, 0.0)) - 1.0).abs() < 1e-6);
    }

    // get_vector3_length_squared
    #[test]
    fn get_vector3_length_squared_simple() {
        assert!((get_vector3_length_squared(&v(1.0, 2.0, 2.0)) - 9.0).abs() < 1e-6);
    }

    // near_equals_vector3
    #[test]
    fn near_equals_vector3_within_tolerance() {
        assert!(near_equals_vector3(
            &v(1.0, 2.0, 3.0),
            &v(1.0 + 1e-7, 2.0, 3.0),
            1e-6
        ));
    }

    // negate_vector3
    #[test]
    fn negate_vector3_flips_signs() {
        let mut out = v(0.0, 0.0, 0.0);
        negate_vector3(&mut out, &v(1.0, -2.0, 3.0));
        assert_eq!((out.x, out.y, out.z), (-1.0, 2.0, -3.0));
    }

    // normalize_vector3
    #[test]
    fn normalize_vector3_unit_result() {
        let mut out = v(0.0, 0.0, 0.0);
        let l = normalize_vector3(&mut out, &v(2.0, 0.0, 0.0));
        assert!((l - 2.0).abs() < 1e-6);
        assert!((out.x - 1.0).abs() < 1e-6);
    }

    #[test]
    fn normalize_vector3_zero_gives_zero() {
        let mut out = v(1.0, 1.0, 1.0);
        let l = normalize_vector3(&mut out, &v(0.0, 0.0, 0.0));
        assert_eq!(l, 0.0);
        assert_eq!((out.x, out.y, out.z), (0.0, 0.0, 0.0));
    }

    #[test]
    fn normalize_vector3_aliased() {
        let src = v(3.0, 0.0, 0.0);
        let mut out = src;
        normalize_vector3(&mut out, &src);
        assert!((out.x - 1.0).abs() < 1e-6);
    }

    // offset_vector3
    #[test]
    fn offset_vector3_shifts() {
        let mut out = v(0.0, 0.0, 0.0);
        offset_vector3(&mut out, &v(1.0, 2.0, 3.0), 1.0, 1.0, 1.0);
        assert_eq!((out.x, out.y, out.z), (2.0, 3.0, 4.0));
    }

    // project_vector3
    #[test]
    fn project_vector3_divides_by_z() {
        let mut out = v2(0.0, 0.0);
        project_vector3(&mut out, &v(4.0, 6.0, 2.0));
        assert!((out.x - 2.0).abs() < 1e-6);
        assert!((out.y - 3.0).abs() < 1e-6);
    }

    // scale_vector3
    #[test]
    fn scale_vector3_multiplies() {
        let mut out = v(0.0, 0.0, 0.0);
        scale_vector3(&mut out, &v(1.0, 2.0, 3.0), 2.0);
        assert_eq!((out.x, out.y, out.z), (2.0, 4.0, 6.0));
    }

    // set_vector3
    #[test]
    fn set_vector3_assigns() {
        let mut out = v(0.0, 0.0, 0.0);
        set_vector3(&mut out, 7.0, 8.0, 9.0);
        assert_eq!((out.x, out.y, out.z), (7.0, 8.0, 9.0));
    }

    // subtract_vector3
    #[test]
    fn subtract_vector3_difference() {
        let mut out = v(0.0, 0.0, 0.0);
        subtract_vector3(&mut out, &v(5.0, 3.0, 2.0), &v(1.0, 1.0, 1.0));
        assert_eq!((out.x, out.y, out.z), (4.0, 2.0, 1.0));
    }

    #[test]
    fn subtract_vector3_aliased() {
        let a = v(5.0, 3.0, 2.0);
        let b = v(1.0, 1.0, 1.0);
        let mut out = a;
        subtract_vector3(&mut out, &a, &b);
        assert_eq!((out.x, out.y, out.z), (4.0, 2.0, 1.0));
    }

    // constants
    #[test]
    fn vector3_axes_are_unit_vectors() {
        assert_eq!(
            (VECTOR3_X_AXIS.x, VECTOR3_X_AXIS.y, VECTOR3_X_AXIS.z),
            (1.0, 0.0, 0.0)
        );
        assert_eq!(
            (VECTOR3_Y_AXIS.x, VECTOR3_Y_AXIS.y, VECTOR3_Y_AXIS.z),
            (0.0, 1.0, 0.0)
        );
        assert_eq!(
            (VECTOR3_Z_AXIS.x, VECTOR3_Z_AXIS.y, VECTOR3_Z_AXIS.z),
            (0.0, 0.0, 1.0)
        );
    }
}

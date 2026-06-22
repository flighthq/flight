//! Free functions for [`Vector4`] — 4D vector math.

use flighthq_types::{Vector3Like, Vector4, Vector4Like};

// ---------------------------------------------------------------------------
// Axis constants
// ---------------------------------------------------------------------------

/// Unit vector along the W axis (`0,0,0,1`).
pub const VECTOR4_W_UNIT: Vector4 = Vector4 {
    x: 0.0,
    y: 0.0,
    z: 0.0,
    w: 1.0,
};

/// Unit vector along the X axis.
pub const VECTOR4_X_AXIS: Vector4 = Vector4 {
    x: 1.0,
    y: 0.0,
    z: 0.0,
    w: 0.0,
};

/// Unit vector along the Y axis.
pub const VECTOR4_Y_AXIS: Vector4 = Vector4 {
    x: 0.0,
    y: 1.0,
    z: 0.0,
    w: 0.0,
};

/// Unit vector along the Z axis.
pub const VECTOR4_Z_AXIS: Vector4 = Vector4 {
    x: 0.0,
    y: 0.0,
    z: 1.0,
    w: 0.0,
};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Adds two vectors and writes into `out`.
///
/// Safe when `out` aliases `a` or `b`.
pub fn add_vector4(out: &mut Vector4Like, a: &Vector4Like, b: &Vector4Like) {
    let x = a.x + b.x;
    let y = a.y + b.y;
    let z = a.z + b.z;
    let w = a.w + b.w;
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
}

/// Returns a new [`Vector4`] that is a copy of `source`.
pub fn clone_vector4(source: &Vector4Like) -> Vector4 {
    create_vector4(source.x, source.y, source.z, source.w)
}

/// Copies `source` into `out`.
pub fn copy_vector4(out: &mut Vector4Like, source: &Vector4Like) {
    out.x = source.x;
    out.y = source.y;
    out.z = source.z;
    out.w = source.w;
}

/// Creates a new [`Vector4`] with the given components.
pub fn create_vector4(x: f32, y: f32, z: f32, w: f32) -> Vector4 {
    Vector4 { x, y, z, w }
}

/// Returns `true` if both vectors have equal components.
pub fn equals_vector4(a: &Vector4Like, b: &Vector4Like) -> bool {
    a.x == b.x && a.y == b.y && a.z == b.z && a.w == b.w
}

/// Returns the angle in radians between `a` and `b`.
///
/// Returns `f32::NAN` if either vector has zero length.
pub fn get_vector4_angle_between(a: &Vector4Like, b: &Vector4Like) -> f32 {
    let la = get_vector4_length(a);
    let lb = get_vector4_length(b);
    if la == 0.0 || lb == 0.0 {
        return f32::NAN;
    }
    let dot = get_vector4_dot(a, b) / (la * lb);
    dot.clamp(-1.0, 1.0).acos()
}

/// Returns the Euclidean distance between two points.
pub fn get_vector4_distance(a: &Vector4Like, b: &Vector4Like) -> f32 {
    let x = b.x - a.x;
    let y = b.y - a.y;
    let z = b.z - a.z;
    let w = b.w - a.w;
    (x * x + y * y + z * z + w * w).sqrt()
}

/// Returns the squared distance (avoids `sqrt`).
pub fn get_vector4_distance_squared(a: &Vector4Like, b: &Vector4Like) -> f32 {
    let x = b.x - a.x;
    let y = b.y - a.y;
    let z = b.z - a.z;
    let w = b.w - a.w;
    x * x + y * y + z * z + w * w
}

/// Returns the dot product of `a` and `b`.
pub fn get_vector4_dot(a: &Vector4Like, b: &Vector4Like) -> f32 {
    a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
}

/// Returns the length (magnitude) of `source`.
pub fn get_vector4_length(source: &Vector4Like) -> f32 {
    (source.x * source.x + source.y * source.y + source.z * source.z + source.w * source.w).sqrt()
}

/// Returns the squared length (avoids `sqrt`).
pub fn get_vector4_length_squared(source: &Vector4Like) -> f32 {
    source.x * source.x + source.y * source.y + source.z * source.z + source.w * source.w
}

/// Returns `true` if the two vectors are equal within `tolerance`.
pub fn near_equals_vector4(a: &Vector4Like, b: &Vector4Like, tolerance: f32) -> bool {
    (a.x - b.x).abs() < tolerance
        && (a.y - b.y).abs() < tolerance
        && (a.z - b.z).abs() < tolerance
        && (a.w - b.w).abs() < tolerance
}

/// Negates `source` and writes into `out`.
///
/// Safe when `out` aliases `source`.
pub fn negate_vector4(out: &mut Vector4Like, source: &Vector4Like) {
    out.x = -source.x;
    out.y = -source.y;
    out.z = -source.z;
    out.w = -source.w;
}

/// Normalizes `source` to a unit vector and writes into `out`.
///
/// Returns the original length. If zero length, writes `(0,0,0,0)`.
/// Safe when `out` aliases `source`.
pub fn normalize_vector4(out: &mut Vector4Like, source: &Vector4Like) -> f32 {
    let l = get_vector4_length(source);
    if l != 0.0 {
        let inv = 1.0 / l;
        let x = source.x * inv;
        let y = source.y * inv;
        let z = source.z * inv;
        let w = source.w * inv;
        out.x = x;
        out.y = y;
        out.z = z;
        out.w = w;
    } else {
        out.x = 0.0;
        out.y = 0.0;
        out.z = 0.0;
        out.w = 0.0;
    }
    l
}

/// Offsets `source` by `(dx, dy, dz, dw)` and writes into `out`.
///
/// Safe when `out` aliases `source`.
pub fn offset_vector4(
    out: &mut Vector4Like,
    source: &Vector4Like,
    dx: f32,
    dy: f32,
    dz: f32,
    dw: f32,
) {
    let x = source.x + dx;
    let y = source.y + dy;
    let z = source.z + dz;
    let w = source.w + dw;
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
}

/// Performs a homogeneous divide: writes `(x/w, y/w, z/w)` into `out`.
pub fn project_vector4(out: &mut Vector3Like, source: &Vector4Like) {
    out.x = source.x / source.w;
    out.y = source.y / source.w;
    out.z = source.z / source.w;
}

/// Scales `source` by `scalar` and writes into `out`.
///
/// Safe when `out` aliases `source`.
pub fn scale_vector4(out: &mut Vector4Like, source: &Vector4Like, scalar: f32) {
    let x = source.x * scalar;
    let y = source.y * scalar;
    let z = source.z * scalar;
    let w = source.w * scalar;
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
}

/// Sets `out` to `(x, y, z, w)`.
pub fn set_vector4(out: &mut Vector4Like, x: f32, y: f32, z: f32, w: f32) {
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
}

/// Subtracts `other` from `source` and writes into `out`.
///
/// Safe when `out` aliases `source` or `other`.
pub fn subtract_vector4(out: &mut Vector4Like, source: &Vector4Like, other: &Vector4Like) {
    let x = source.x - other.x;
    let y = source.y - other.y;
    let z = source.z - other.z;
    let w = source.w - other.w;
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn v(x: f32, y: f32, z: f32, w: f32) -> Vector4Like {
        Vector4Like { x, y, z, w }
    }

    fn v3(x: f32, y: f32, z: f32) -> Vector3Like {
        Vector3Like { x, y, z }
    }

    // add_vector4
    #[test]
    fn add_vector4_sums_components() {
        let mut out = v(0.0, 0.0, 0.0, 0.0);
        add_vector4(&mut out, &v(1.0, 2.0, 3.0, 4.0), &v(4.0, 3.0, 2.0, 1.0));
        assert_eq!((out.x, out.y, out.z, out.w), (5.0, 5.0, 5.0, 5.0));
    }

    #[test]
    fn add_vector4_aliased() {
        let a = v(1.0, 2.0, 3.0, 4.0);
        let b = v(4.0, 3.0, 2.0, 1.0);
        let mut out = a;
        add_vector4(&mut out, &a, &b);
        assert_eq!((out.x, out.y, out.z, out.w), (5.0, 5.0, 5.0, 5.0));
    }

    // clone_vector4
    #[test]
    fn clone_vector4_copies() {
        let src = v(1.0, 2.0, 3.0, 4.0);
        let c = clone_vector4(&src);
        assert_eq!((c.x, c.y, c.z, c.w), (1.0, 2.0, 3.0, 4.0));
    }

    // copy_vector4
    #[test]
    fn copy_vector4_copies_fields() {
        let src = v(3.0, 4.0, 5.0, 6.0);
        let mut out = v(0.0, 0.0, 0.0, 0.0);
        copy_vector4(&mut out, &src);
        assert_eq!((out.x, out.y, out.z, out.w), (3.0, 4.0, 5.0, 6.0));
    }

    // create_vector4
    #[test]
    fn create_vector4_stores_values() {
        let v4 = create_vector4(1.0, 2.0, 3.0, 4.0);
        assert_eq!((v4.x, v4.y, v4.z, v4.w), (1.0, 2.0, 3.0, 4.0));
    }

    // equals_vector4
    #[test]
    fn equals_vector4_same() {
        assert!(equals_vector4(
            &v(1.0, 2.0, 3.0, 4.0),
            &v(1.0, 2.0, 3.0, 4.0)
        ));
    }

    #[test]
    fn equals_vector4_different() {
        assert!(!equals_vector4(
            &v(1.0, 2.0, 3.0, 4.0),
            &v(1.0, 2.0, 3.0, 5.0)
        ));
    }

    // get_vector4_angle_between
    #[test]
    fn get_vector4_angle_between_zero_is_nan() {
        assert!(get_vector4_angle_between(&v(0.0, 0.0, 0.0, 0.0), &v(1.0, 0.0, 0.0, 0.0)).is_nan());
    }

    // get_vector4_distance
    #[test]
    fn get_vector4_distance_known() {
        let d = get_vector4_distance(&v(0.0, 0.0, 0.0, 0.0), &v(1.0, 0.0, 0.0, 0.0));
        assert!((d - 1.0).abs() < 1e-6);
    }

    // get_vector4_distance_squared
    #[test]
    fn get_vector4_distance_squared_matches() {
        let d2 = get_vector4_distance_squared(&v(0.0, 0.0, 0.0, 0.0), &v(1.0, 2.0, 2.0, 0.0));
        assert!((d2 - 9.0).abs() < 1e-6);
    }

    // get_vector4_dot
    #[test]
    fn get_vector4_dot_known() {
        let d = get_vector4_dot(&v(1.0, 0.0, 0.0, 0.0), &v(0.0, 1.0, 0.0, 0.0));
        assert_eq!(d, 0.0);
    }

    // get_vector4_length
    #[test]
    fn get_vector4_length_unit() {
        assert!((get_vector4_length(&v(1.0, 0.0, 0.0, 0.0)) - 1.0).abs() < 1e-6);
    }

    // get_vector4_length_squared
    #[test]
    fn get_vector4_length_squared_simple() {
        assert!((get_vector4_length_squared(&v(1.0, 2.0, 2.0, 0.0)) - 9.0).abs() < 1e-6);
    }

    // near_equals_vector4
    #[test]
    fn near_equals_vector4_within_tolerance() {
        assert!(near_equals_vector4(
            &v(1.0, 2.0, 3.0, 4.0),
            &v(1.0 + 1e-7, 2.0, 3.0, 4.0),
            1e-6
        ));
    }

    // negate_vector4
    #[test]
    fn negate_vector4_flips_signs() {
        let mut out = v(0.0, 0.0, 0.0, 0.0);
        negate_vector4(&mut out, &v(1.0, -2.0, 3.0, -4.0));
        assert_eq!((out.x, out.y, out.z, out.w), (-1.0, 2.0, -3.0, 4.0));
    }

    // normalize_vector4
    #[test]
    fn normalize_vector4_unit_result() {
        let mut out = v(0.0, 0.0, 0.0, 0.0);
        let l = normalize_vector4(&mut out, &v(2.0, 0.0, 0.0, 0.0));
        assert!((l - 2.0).abs() < 1e-6);
        assert!((out.x - 1.0).abs() < 1e-6);
    }

    #[test]
    fn normalize_vector4_zero_gives_zero() {
        let mut out = v(1.0, 1.0, 1.0, 1.0);
        let l = normalize_vector4(&mut out, &v(0.0, 0.0, 0.0, 0.0));
        assert_eq!(l, 0.0);
        assert_eq!((out.x, out.y, out.z, out.w), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn normalize_vector4_aliased() {
        let src = v(3.0, 0.0, 0.0, 0.0);
        let mut out = src;
        normalize_vector4(&mut out, &src);
        assert!((out.x - 1.0).abs() < 1e-6);
    }

    // offset_vector4
    #[test]
    fn offset_vector4_shifts() {
        let mut out = v(0.0, 0.0, 0.0, 0.0);
        offset_vector4(&mut out, &v(1.0, 2.0, 3.0, 4.0), 1.0, 1.0, 1.0, 1.0);
        assert_eq!((out.x, out.y, out.z, out.w), (2.0, 3.0, 4.0, 5.0));
    }

    // project_vector4
    #[test]
    fn project_vector4_divides_by_w() {
        let mut out = v3(0.0, 0.0, 0.0);
        project_vector4(&mut out, &v(4.0, 6.0, 8.0, 2.0));
        assert!((out.x - 2.0).abs() < 1e-6);
        assert!((out.y - 3.0).abs() < 1e-6);
        assert!((out.z - 4.0).abs() < 1e-6);
    }

    // scale_vector4
    #[test]
    fn scale_vector4_multiplies() {
        let mut out = v(0.0, 0.0, 0.0, 0.0);
        scale_vector4(&mut out, &v(1.0, 2.0, 3.0, 4.0), 2.0);
        assert_eq!((out.x, out.y, out.z, out.w), (2.0, 4.0, 6.0, 8.0));
    }

    // set_vector4
    #[test]
    fn set_vector4_assigns() {
        let mut out = v(0.0, 0.0, 0.0, 0.0);
        set_vector4(&mut out, 1.0, 2.0, 3.0, 4.0);
        assert_eq!((out.x, out.y, out.z, out.w), (1.0, 2.0, 3.0, 4.0));
    }

    // subtract_vector4
    #[test]
    fn subtract_vector4_difference() {
        let mut out = v(0.0, 0.0, 0.0, 0.0);
        subtract_vector4(&mut out, &v(5.0, 4.0, 3.0, 2.0), &v(1.0, 1.0, 1.0, 1.0));
        assert_eq!((out.x, out.y, out.z, out.w), (4.0, 3.0, 2.0, 1.0));
    }

    #[test]
    fn subtract_vector4_aliased() {
        let a = v(5.0, 4.0, 3.0, 2.0);
        let b = v(1.0, 1.0, 1.0, 1.0);
        let mut out = a;
        subtract_vector4(&mut out, &a, &b);
        assert_eq!((out.x, out.y, out.z, out.w), (4.0, 3.0, 2.0, 1.0));
    }

    // constants
    #[test]
    fn vector4_constants_correct() {
        assert_eq!((VECTOR4_X_AXIS.x, VECTOR4_X_AXIS.w), (1.0, 0.0));
        assert_eq!((VECTOR4_Y_AXIS.y, VECTOR4_Y_AXIS.w), (1.0, 0.0));
        assert_eq!((VECTOR4_Z_AXIS.z, VECTOR4_Z_AXIS.w), (1.0, 0.0));
        assert_eq!((VECTOR4_W_UNIT.x, VECTOR4_W_UNIT.w), (0.0, 1.0));
    }
}

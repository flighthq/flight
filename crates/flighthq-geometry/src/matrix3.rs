//! Free functions for [`Matrix3`] — 3×3 homogeneous matrix stored row-major.
//!
//! Layout:
//! ```text
//! [ m[0]  m[1]  m[2] ]    row 0
//! [ m[3]  m[4]  m[5] ]    row 1
//! [ m[6]  m[7]  m[8] ]    row 2
//! ```

use flighthq_types::{Matrix3, Matrix3Like, Matrix4Like, MatrixLike, Vector3Like};

const IDENTITY: [f32; 9] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns a new [`Matrix3`] that is a copy of `source`.
pub fn clone_matrix3(source: &Matrix3Like) -> Matrix3 {
    Matrix3 { m: source.m }
}

/// Copies `source` into `out`.
pub fn copy_matrix3(out: &mut Matrix3Like, source: &Matrix3Like) {
    out.m = source.m;
}

/// Copies a column from a `Vector3Like` into `out`. Column index must be 0–2.
///
/// Column layout (column-major within the row-major storage):
/// - col 0 → m[0], m[3], m[6]
/// - col 1 → m[1], m[4], m[7]
/// - col 2 → m[2], m[5], m[8]
///
/// # Panics
/// Panics if `column > 2`.
pub fn copy_matrix3_column_from_vector3(
    out: &mut Matrix3Like,
    column: usize,
    source: &Vector3Like,
) {
    match column {
        0 => {
            out.m[0] = source.x;
            out.m[3] = source.y;
            out.m[6] = source.z;
        }
        1 => {
            out.m[1] = source.x;
            out.m[4] = source.y;
            out.m[7] = source.z;
        }
        2 => {
            out.m[2] = source.x;
            out.m[5] = source.y;
            out.m[8] = source.z;
        }
        _ => panic!("Column {column} out of bounds (2)"),
    }
}

/// Copies a column from the matrix into a `Vector3Like`. Column index must be 0–2.
///
/// # Panics
/// Panics if `column > 2`.
pub fn copy_matrix3_column_to_vector3(out: &mut Vector3Like, column: usize, source: &Matrix3Like) {
    match column {
        0 => {
            out.x = source.m[0];
            out.y = source.m[3];
            out.z = source.m[6];
        }
        1 => {
            out.x = source.m[1];
            out.y = source.m[4];
            out.z = source.m[7];
        }
        2 => {
            out.x = source.m[2];
            out.y = source.m[5];
            out.z = source.m[8];
        }
        _ => panic!("Column {column} out of bounds (2)"),
    }
}

/// Copies a row from a `Vector3Like` into `out`. Row index must be 0–2.
///
/// # Panics
/// Panics if `row > 2`.
pub fn copy_matrix3_row_from_vector3(out: &mut Matrix3Like, row: usize, source: &Vector3Like) {
    match row {
        0 => {
            out.m[0] = source.x;
            out.m[1] = source.y;
            out.m[2] = source.z;
        }
        1 => {
            out.m[3] = source.x;
            out.m[4] = source.y;
            out.m[5] = source.z;
        }
        2 => {
            out.m[6] = source.x;
            out.m[7] = source.y;
            out.m[8] = source.z;
        }
        _ => panic!("Row {row} out of bounds (2)"),
    }
}

/// Copies a row from the matrix into a `Vector3Like`. Row index must be 0–2.
///
/// # Panics
/// Panics if `row > 2`.
pub fn copy_matrix3_row_to_vector3(out: &mut Vector3Like, row: usize, source: &Matrix3Like) {
    match row {
        0 => {
            out.x = source.m[0];
            out.y = source.m[1];
            out.z = source.m[2];
        }
        1 => {
            out.x = source.m[3];
            out.y = source.m[4];
            out.z = source.m[5];
        }
        2 => {
            out.x = source.m[6];
            out.y = source.m[7];
            out.z = source.m[8];
        }
        _ => panic!("Row {row} out of bounds (2)"),
    }
}

/// Creates a new identity [`Matrix3`].
pub fn create_matrix3_identity() -> Matrix3 {
    Matrix3 { m: IDENTITY }
}

/// Creates a new [`Matrix3`] with explicit element values (row-major).
#[allow(clippy::too_many_arguments)]
pub fn create_matrix3(
    m00: f32,
    m01: f32,
    m02: f32,
    m10: f32,
    m11: f32,
    m12: f32,
    m20: f32,
    m21: f32,
    m22: f32,
) -> Matrix3 {
    Matrix3 {
        m: [m00, m01, m02, m10, m11, m12, m20, m21, m22],
    }
}

/// Returns `true` if all nine elements of `a` and `b` are equal.
pub fn equals_matrix3(a: &Matrix3Like, b: &Matrix3Like) -> bool {
    a.m == b.m
}

/// Returns the element at `(row, column)`.
pub fn get_matrix3_element(source: &Matrix3Like, row: usize, column: usize) -> f32 {
    source.m[row * 3 + column]
}

/// Returns `true` if the matrix is affine (`m[6]==0, m[7]==0, m[8]==1`).
pub fn is_affine_matrix3(source: &Matrix3Like) -> bool {
    source.m[6] == 0.0 && source.m[7] == 0.0 && source.m[8] == 1.0
}

/// Inverts `source` and writes into `out`.
///
/// Uses an affine fast path when `is_affine_matrix3` is true.
/// For a singular non-affine matrix this panics (matching TS throw behaviour).
/// Safe when `out` aliases `source` (all inputs read before any write).
pub fn inverse_matrix3(out: &mut Matrix3Like, source: &Matrix3Like) {
    let m0 = source.m[0];
    let m1 = source.m[1];
    let m2 = source.m[2];
    let m3 = source.m[3];
    let m4 = source.m[4];
    let m5 = source.m[5];
    let m6 = source.m[6];
    let m7 = source.m[7];
    let m8 = source.m[8];

    if is_affine_matrix3(source) {
        let det = m0 * m4 - m1 * m3;
        if det == 0.0 {
            out.m[0] = 0.0;
            out.m[1] = 0.0;
            out.m[2] = -m2;
            out.m[3] = 0.0;
            out.m[4] = 0.0;
            out.m[5] = -m5;
            out.m[6] = 0.0;
            out.m[7] = 0.0;
            out.m[8] = 1.0;
            return;
        }
        let inv_det = 1.0 / det;
        let out0 = m4 * inv_det;
        let out1 = -m1 * inv_det;
        let out3 = -m3 * inv_det;
        let out4 = m0 * inv_det;
        out.m[0] = out0;
        out.m[1] = out1;
        out.m[2] = -(out0 * m2 + out3 * m5);
        out.m[3] = out3;
        out.m[4] = out4;
        out.m[5] = -(out1 * m2 + out4 * m5);
        out.m[6] = 0.0;
        out.m[7] = 0.0;
        out.m[8] = 1.0;
        return;
    }

    let det =
        m0 * m4 * m8 + m1 * m5 * m6 + m2 * m3 * m7 - m2 * m4 * m6 - m1 * m3 * m8 - m0 * m5 * m7;

    if det == 0.0 {
        panic!("Matrix is not invertible");
    }

    let inv = 1.0 / det;

    let r0 = (m4 * m8 - m5 * m7) * inv;
    let r1 = (m2 * m7 - m1 * m8) * inv;
    let r2 = (m1 * m5 - m2 * m4) * inv;
    let r3 = (m5 * m6 - m3 * m8) * inv;
    let r4 = (m0 * m8 - m2 * m6) * inv;
    let r5 = (m2 * m3 - m0 * m5) * inv;
    let r6 = (m3 * m7 - m4 * m6) * inv;
    let r7 = (m1 * m6 - m0 * m7) * inv;
    let r8 = (m0 * m4 - m1 * m3) * inv;

    out.m[0] = r0;
    out.m[1] = r1;
    out.m[2] = r2;
    out.m[3] = r3;
    out.m[4] = r4;
    out.m[5] = r5;
    out.m[6] = r6;
    out.m[7] = r7;
    out.m[8] = r8;
}

/// Multiplies `a × b` and writes into `out`. Uses affine fast path when both are affine.
///
/// Safe when `out` aliases `a` or `b`.
pub fn multiply_matrix3(out: &mut Matrix3Like, a: &Matrix3Like, b: &Matrix3Like) {
    if is_affine_matrix3(a) && is_affine_matrix3(b) {
        let a0 = a.m[0];
        let a1 = a.m[1];
        let a2 = a.m[2];
        let a3 = a.m[3];
        let a4 = a.m[4];
        let a5 = a.m[5];
        let b0 = b.m[0];
        let b1 = b.m[1];
        let b2 = b.m[2];
        let b3 = b.m[3];
        let b4 = b.m[4];
        let b5 = b.m[5];

        out.m[0] = a0 * b0 + a1 * b3;
        out.m[1] = a0 * b1 + a1 * b4;
        out.m[2] = a0 * b2 + a1 * b5 + a2;
        out.m[3] = a3 * b0 + a4 * b3;
        out.m[4] = a3 * b1 + a4 * b4;
        out.m[5] = a3 * b2 + a4 * b5 + a5;
        out.m[6] = 0.0;
        out.m[7] = 0.0;
        out.m[8] = 1.0;
        return;
    }

    let m00 = a.m[0] * b.m[0] + a.m[1] * b.m[3] + a.m[2] * b.m[6];
    let m01 = a.m[0] * b.m[1] + a.m[1] * b.m[4] + a.m[2] * b.m[7];
    let m02 = a.m[0] * b.m[2] + a.m[1] * b.m[5] + a.m[2] * b.m[8];
    let m10 = a.m[3] * b.m[0] + a.m[4] * b.m[3] + a.m[5] * b.m[6];
    let m11 = a.m[3] * b.m[1] + a.m[4] * b.m[4] + a.m[5] * b.m[7];
    let m12 = a.m[3] * b.m[2] + a.m[4] * b.m[5] + a.m[5] * b.m[8];
    let m20 = a.m[6] * b.m[0] + a.m[7] * b.m[3] + a.m[8] * b.m[6];
    let m21 = a.m[6] * b.m[1] + a.m[7] * b.m[4] + a.m[8] * b.m[7];
    let m22 = a.m[6] * b.m[2] + a.m[7] * b.m[5] + a.m[8] * b.m[8];

    out.m[0] = m00;
    out.m[1] = m01;
    out.m[2] = m02;
    out.m[3] = m10;
    out.m[4] = m11;
    out.m[5] = m12;
    out.m[6] = m20;
    out.m[7] = m21;
    out.m[8] = m22;
}

/// Applies a rotation by `theta` radians and writes into `out`.
///
/// Safe when `out` aliases `source`.
pub fn rotate_matrix3(out: &mut Matrix3Like, source: &Matrix3Like, theta: f32) {
    let c = theta.cos();
    let s = theta.sin();

    let a0 = source.m[0];
    let a1 = source.m[1];
    let a2 = source.m[2];
    let a3 = source.m[3];
    let a4 = source.m[4];
    let a5 = source.m[5];
    let a6 = source.m[6];
    let a7 = source.m[7];
    let a8 = source.m[8];

    out.m[0] = a0 * c + a1 * s;
    out.m[1] = a0 * (-s) + a1 * c;
    out.m[2] = a2;
    out.m[3] = a3 * c + a4 * s;
    out.m[4] = a3 * (-s) + a4 * c;
    out.m[5] = a5;
    out.m[6] = a6 * c + a7 * s;
    out.m[7] = a6 * (-s) + a7 * c;
    out.m[8] = a8;
}

/// Scales `source` by `(sx, sy)` and writes into `out`.
///
/// Safe when `out` aliases `source`.
pub fn scale_matrix3(out: &mut Matrix3Like, source: &Matrix3Like, sx: f32, sy: f32) {
    let a0 = source.m[0];
    let a1 = source.m[1];
    let a2 = source.m[2];
    let a3 = source.m[3];
    let a4 = source.m[4];
    let a5 = source.m[5];
    let a6 = source.m[6];
    let a7 = source.m[7];
    let a8 = source.m[8];

    out.m[0] = a0 * sx;
    out.m[1] = a1 * sy;
    out.m[2] = a2;
    out.m[3] = a3 * sx;
    out.m[4] = a4 * sy;
    out.m[5] = a5;
    out.m[6] = a6 * sx;
    out.m[7] = a7 * sy;
    out.m[8] = a8;
}

/// Sets all nine elements of `out`.
#[allow(clippy::too_many_arguments)]
pub fn set_matrix3(
    out: &mut Matrix3Like,
    m00: f32,
    m01: f32,
    m02: f32,
    m10: f32,
    m11: f32,
    m12: f32,
    m20: f32,
    m21: f32,
    m22: f32,
) {
    out.m[0] = m00;
    out.m[1] = m01;
    out.m[2] = m02;
    out.m[3] = m10;
    out.m[4] = m11;
    out.m[5] = m12;
    out.m[6] = m20;
    out.m[7] = m21;
    out.m[8] = m22;
}

/// Sets the element at `(row, column)`.
pub fn set_matrix3_element(out: &mut Matrix3Like, row: usize, column: usize, value: f32) {
    out.m[row * 3 + column] = value;
}

/// Sets `out` from a [`MatrixLike`] (2D affine), embedding it in a 3×3.
///
/// Maps: `a=m[0], b=m[1], tx=m[2], c=m[3], d=m[4], ty=m[5]`. Bottom row = `[0,0,1]`.
pub fn set_matrix3_from_matrix(out: &mut Matrix3Like, source: &MatrixLike) {
    out.m[0] = source.a;
    out.m[1] = source.b;
    out.m[2] = source.tx;
    out.m[3] = source.c;
    out.m[4] = source.d;
    out.m[5] = source.ty;
    out.m[6] = 0.0;
    out.m[7] = 0.0;
    out.m[8] = 1.0;
}

/// Sets `out` from a [`Matrix4Like`] — extracts the upper-left 3×3.
///
/// Column-major Matrix4 → row-major Matrix3 mapping mirrors the TS implementation.
pub fn set_matrix3_from_matrix4(out: &mut Matrix3Like, source: &Matrix4Like) {
    let s = &source.m;
    out.m[0] = s[0];
    out.m[1] = s[4];
    out.m[2] = s[8];
    out.m[3] = s[1];
    out.m[4] = s[5];
    out.m[5] = s[9];
    out.m[6] = s[2];
    out.m[7] = s[6];
    out.m[8] = s[10];
}

/// Resets `out` to the identity matrix.
pub fn set_matrix3_identity(out: &mut Matrix3Like) {
    out.m = IDENTITY;
}

/// Applies a translation by `(tx, ty)` in the affine sense and writes into `out`.
///
/// Safe when `out` aliases `source`.
pub fn translate_matrix3(out: &mut Matrix3Like, source: &Matrix3Like, tx: f32, ty: f32) {
    let a0 = source.m[0];
    let a1 = source.m[1];
    let a2 = source.m[2];
    let a3 = source.m[3];
    let a4 = source.m[4];
    let a5 = source.m[5];
    let a6 = source.m[6];
    let a7 = source.m[7];
    let a8 = source.m[8];

    out.m[0] = a0;
    out.m[1] = a1;
    out.m[2] = a0 * tx + a1 * ty + a2;
    out.m[3] = a3;
    out.m[4] = a4;
    out.m[5] = a3 * tx + a4 * ty + a5;
    out.m[6] = a6;
    out.m[7] = a7;
    out.m[8] = a6 * tx + a7 * ty + a8;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn identity() -> Matrix3Like {
        Matrix3Like { m: IDENTITY }
    }

    fn like(m: [f32; 9]) -> Matrix3Like {
        Matrix3Like { m }
    }

    fn v3(x: f32, y: f32, z: f32) -> Vector3Like {
        Vector3Like { x, y, z }
    }

    // clone_matrix3
    #[test]
    fn clone_matrix3_copies() {
        let src = like([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
        let c = clone_matrix3(&src);
        assert_eq!(c.m, src.m);
    }

    // copy_matrix3
    #[test]
    fn copy_matrix3_copies_fields() {
        let src = like([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 0.0, 0.0, 1.0]);
        let mut out = identity();
        copy_matrix3(&mut out, &src);
        assert_eq!(out.m, src.m);
    }

    // copy_matrix3_column_from_vector3
    #[test]
    fn copy_matrix3_column_from_vector3_col1() {
        let mut out = identity();
        copy_matrix3_column_from_vector3(&mut out, 1, &v3(7.0, 8.0, 9.0));
        assert_eq!(out.m[1], 7.0);
        assert_eq!(out.m[4], 8.0);
        assert_eq!(out.m[7], 9.0);
    }

    // copy_matrix3_column_to_vector3
    #[test]
    fn copy_matrix3_column_to_vector3_col0() {
        let src = like([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
        let mut out = v3(0.0, 0.0, 0.0);
        copy_matrix3_column_to_vector3(&mut out, 0, &src);
        assert_eq!((out.x, out.y, out.z), (1.0, 4.0, 7.0));
    }

    // create_matrix3
    #[test]
    fn create_matrix3_stores_all_elements() {
        let m = create_matrix3(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        assert_eq!(m.m, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
    }

    // equals_matrix3
    #[test]
    fn equals_matrix3_identical() {
        let a = identity();
        let b = identity();
        assert!(equals_matrix3(&a, &b));
    }

    #[test]
    fn equals_matrix3_different() {
        let a = identity();
        let mut b = identity();
        b.m[0] = 2.0;
        assert!(!equals_matrix3(&a, &b));
    }

    // get_matrix3_element
    #[test]
    fn get_matrix3_element_row_major() {
        let m = like([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
        assert_eq!(get_matrix3_element(&m, 1, 2), 6.0);
    }

    // is_affine_matrix3
    #[test]
    fn is_affine_matrix3_identity_is_affine() {
        assert!(is_affine_matrix3(&identity()));
    }

    #[test]
    fn is_affine_matrix3_non_affine() {
        let mut m = identity();
        m.m[6] = 1.0;
        assert!(!is_affine_matrix3(&m));
    }

    // inverse_matrix3
    #[test]
    fn inverse_matrix3_identity_stays_identity() {
        let src = identity();
        let mut out = identity();
        inverse_matrix3(&mut out, &src);
        assert!((out.m[0] - 1.0).abs() < 1e-6);
        assert!((out.m[4] - 1.0).abs() < 1e-6);
        assert!((out.m[8] - 1.0).abs() < 1e-6);
    }

    #[test]
    fn inverse_matrix3_scale2_inverts() {
        let src = like([2.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 1.0]);
        let mut out = identity();
        inverse_matrix3(&mut out, &src);
        assert!((out.m[0] - 0.5).abs() < 1e-6);
        assert!((out.m[4] - 0.5).abs() < 1e-6);
    }

    // multiply_matrix3
    #[test]
    fn multiply_matrix3_identity_times_other() {
        let mut out = identity();
        let other = like([2.0, 0.0, 3.0, 0.0, 2.0, 4.0, 0.0, 0.0, 1.0]);
        multiply_matrix3(&mut out, &identity(), &other);
        assert_eq!(out.m, other.m);
    }

    #[test]
    fn multiply_matrix3_scale2_times_scale3() {
        let a = like([2.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 1.0]);
        let b = like([3.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 1.0]);
        let mut out = identity();
        multiply_matrix3(&mut out, &a, &b);
        assert_eq!(out.m[0], 6.0);
        assert_eq!(out.m[4], 6.0);
    }

    // rotate_matrix3
    #[test]
    fn rotate_matrix3_zero_angle_is_copy() {
        let mut out = Matrix3Like { m: [0.0; 9] };
        rotate_matrix3(&mut out, &identity(), 0.0);
        assert!((out.m[0] - 1.0).abs() < 1e-6);
        assert!((out.m[4] - 1.0).abs() < 1e-6);
    }

    // scale_matrix3
    #[test]
    fn scale_matrix3_scales_first_two_cols() {
        let mut out = Matrix3Like { m: [0.0; 9] };
        scale_matrix3(&mut out, &identity(), 2.0, 3.0);
        assert_eq!(out.m[0], 2.0);
        assert_eq!(out.m[4], 3.0);
    }

    // set_matrix3_identity
    #[test]
    fn set_matrix3_identity_resets() {
        let mut out = Matrix3Like { m: [5.0; 9] };
        set_matrix3_identity(&mut out);
        assert_eq!(out.m, IDENTITY);
    }

    // set_matrix3_from_matrix
    #[test]
    fn set_matrix3_from_matrix_maps_correctly() {
        let src = MatrixLike {
            a: 1.0,
            b: 2.0,
            c: 3.0,
            d: 4.0,
            tx: 5.0,
            ty: 6.0,
        };
        let mut out = identity();
        set_matrix3_from_matrix(&mut out, &src);
        assert_eq!(out.m, [1.0, 2.0, 5.0, 3.0, 4.0, 6.0, 0.0, 0.0, 1.0]);
    }

    // translate_matrix3
    #[test]
    fn translate_matrix3_identity_sets_translation() {
        let mut out = identity();
        translate_matrix3(&mut out, &identity(), 3.0, 4.0);
        assert_eq!(out.m[2], 3.0);
        assert_eq!(out.m[5], 4.0);
    }

    #[test]
    fn translate_matrix3_with_copy() {
        let src = identity();
        let mut out = src.clone();
        translate_matrix3(&mut out, &src, 5.0, 6.0);
        assert_eq!(out.m[2], 5.0);
        assert_eq!(out.m[5], 6.0);
    }

    // copy_matrix3_row_from_vector3
    #[test]
    fn copy_matrix3_row_from_vector3_row0() {
        let mut m = identity();
        copy_matrix3_row_from_vector3(&mut m, 0, &v3(1.0, 2.0, 3.0));
        assert_eq!(get_matrix3_element(&m, 0, 0), 1.0);
        assert_eq!(get_matrix3_element(&m, 0, 1), 2.0);
        assert_eq!(get_matrix3_element(&m, 0, 2), 3.0);
    }

    #[test]
    fn copy_matrix3_row_from_vector3_row1() {
        let mut m = identity();
        copy_matrix3_row_from_vector3(&mut m, 1, &v3(2.0, 4.0, 6.0));
        assert_eq!(get_matrix3_element(&m, 1, 0), 2.0);
        assert_eq!(get_matrix3_element(&m, 1, 1), 4.0);
        assert_eq!(get_matrix3_element(&m, 1, 2), 6.0);
    }

    #[test]
    #[should_panic]
    fn copy_matrix3_row_from_vector3_panics_out_of_bounds() {
        let mut m = identity();
        copy_matrix3_row_from_vector3(&mut m, 3, &v3(0.0, 0.0, 0.0));
    }

    // copy_matrix3_row_to_vector3
    #[test]
    fn copy_matrix3_row_to_vector3_row0() {
        let m = like([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
        let mut v = v3(0.0, 0.0, 0.0);
        copy_matrix3_row_to_vector3(&mut v, 0, &m);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 2.0);
        assert_eq!(v.z, 3.0);
    }

    #[test]
    fn copy_matrix3_row_to_vector3_row1() {
        let m = like([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
        let mut v = v3(0.0, 0.0, 0.0);
        copy_matrix3_row_to_vector3(&mut v, 1, &m);
        assert_eq!(v.x, 4.0);
        assert_eq!(v.y, 5.0);
        assert_eq!(v.z, 6.0);
    }

    #[test]
    fn copy_matrix3_row_to_vector3_row2_identity() {
        let m = identity();
        let mut v = v3(0.0, 0.0, 0.0);
        copy_matrix3_row_to_vector3(&mut v, 2, &m);
        assert_eq!(v.x, 0.0);
        assert_eq!(v.y, 0.0);
        assert_eq!(v.z, 1.0);
    }

    // set_matrix3_element
    #[test]
    fn set_matrix3_element_writes_value() {
        let mut m = identity();
        set_matrix3_element(&mut m, 1, 2, 42.0);
        assert_eq!(get_matrix3_element(&m, 1, 2), 42.0);
    }

    #[test]
    fn set_matrix3_element_leaves_others_unchanged() {
        let mut m = identity();
        set_matrix3_element(&mut m, 0, 1, 7.0);
        assert_eq!(get_matrix3_element(&m, 0, 0), 1.0);
        assert_eq!(get_matrix3_element(&m, 1, 1), 1.0);
    }

    // set_matrix3_from_matrix4
    #[test]
    fn set_matrix3_from_matrix4_identity() {
        let m4 = flighthq_types::Matrix4Like {
            m: [
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 3.0, 4.0, 5.0, 1.0,
            ],
        };
        let mut m = identity();
        set_matrix3_from_matrix4(&mut m, &m4);
        assert_eq!(m.m, [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn set_matrix3_from_matrix4_non_identity() {
        let m4 = flighthq_types::Matrix4Like {
            m: [
                2.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 0.0, 4.0, 0.0, 5.0, 6.0, 7.0, 1.0,
            ],
        };
        let mut m = identity();
        set_matrix3_from_matrix4(&mut m, &m4);
        assert_eq!(m.m, [2.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 4.0]);
    }
}

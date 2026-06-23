//! Free functions for [`Matrix4`] — 4×4 homogeneous matrix, column-major (OpenGL-compatible).
//!
//! Storage layout (column-major): column `c`, row `r` → `m[c*4 + r]`.
//!
//! Column vectors are assumed: `v' = M · v`.

use flighthq_types::{Matrix3Like, Matrix4, Matrix4Like, MatrixLike, Vector3Like, Vector4Like};

use crate::pool::Pool;

// Thread-local pool for temporary Matrix4Like values used in append/prepend helpers.
std::thread_local! {
    static MATRIX4_POOL: std::cell::RefCell<Pool<Matrix4Like>> =
        std::cell::RefCell::new(Pool::new());
}

fn acquire_matrix4() -> Matrix4Like {
    MATRIX4_POOL.with(|p| p.borrow_mut().acquire())
}

fn acquire_identity_matrix4() -> Matrix4Like {
    let mut m = acquire_matrix4();
    set_matrix4_identity(&mut m);
    m
}

fn release_matrix4(m: Matrix4Like) {
    MATRIX4_POOL.with(|p| p.borrow_mut().release(m));
}

#[rustfmt::skip]
const IDENTITY: [f32; 16] = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
];

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Post-multiplies `source` by `other` (world-space append): `out = source · other`.
pub fn append_matrix4(out: &mut Matrix4Like, source: &Matrix4Like, other: &Matrix4Like) {
    multiply_matrix4(out, source, other);
}

/// Applies a world-space rotation around `axis` by `degrees`, with optional `pivot_point`.
pub fn append_rotation_matrix4(
    out: &mut Matrix4Like,
    source: &Matrix4Like,
    degrees: f32,
    axis: &Vector4Like,
    pivot_point: Option<&Vector4Like>,
) {
    let mut m = acquire_identity_matrix4();
    get_axis_rotation(&mut m, axis.x, axis.y, axis.z, degrees);

    if let Some(p) = pivot_point {
        let mut t1 = acquire_identity_matrix4();
        let mut t2 = acquire_identity_matrix4();
        let t1_src = t1.clone();
        append_translation_matrix4(&mut t1, &t1_src, -p.x, -p.y, -p.z);
        let t2_src = t2.clone();
        append_translation_matrix4(&mut t2, &t2_src, p.x, p.y, p.z);
        let tmp = m.clone();
        multiply_matrix4(&mut m, &t1, &tmp);
        let tmp2 = m.clone();
        multiply_matrix4(&mut m, &tmp2, &t2);
        release_matrix4(t1);
        release_matrix4(t2);
    }

    append_matrix4(out, source, &m);
    release_matrix4(m);
}

/// Applies a world-space scale and writes into `out`.
pub fn append_scale_matrix4(
    out: &mut Matrix4Like,
    source: &Matrix4Like,
    x_scale: f32,
    y_scale: f32,
    z_scale: f32,
) {
    let mut m = acquire_matrix4();
    set_matrix4(
        &mut m, x_scale, 0.0, 0.0, 0.0, 0.0, y_scale, 0.0, 0.0, 0.0, 0.0, z_scale, 0.0, 0.0, 0.0,
        0.0, 1.0,
    );
    append_matrix4(out, source, &m);
    release_matrix4(m);
}

/// Applies a world-space translation. Only `m[12..=14]` are modified; all other
/// elements are copied from `source` first.
pub fn append_translation_matrix4(
    out: &mut Matrix4Like,
    source: &Matrix4Like,
    x: f32,
    y: f32,
    z: f32,
) {
    // Read translation before writing — safe even if caller clones source as out.
    let tx = source.m[12] + x;
    let ty = source.m[13] + y;
    let tz = source.m[14] + z;
    out.m = source.m;
    out.m[12] = tx;
    out.m[13] = ty;
    out.m[14] = tz;
}

/// Returns a new [`Matrix4`] that is a copy of `source`.
pub fn clone_matrix4(source: &Matrix4Like) -> Matrix4 {
    Matrix4 { m: source.m }
}

/// Copies `source` into `out`.
pub fn copy_matrix4(out: &mut Matrix4Like, source: &Matrix4Like) {
    out.m = source.m;
}

/// Copies a column from a `Vector4Like` into `out`. Column index must be 0–3.
///
/// # Panics
/// Panics if `column > 3`.
pub fn copy_matrix4_column_from_vector4(
    out: &mut Matrix4Like,
    column: usize,
    source: &Vector4Like,
) {
    let base = column * 4;
    match column {
        0..=3 => {
            out.m[base] = source.x;
            out.m[base + 1] = source.y;
            out.m[base + 2] = source.z;
            out.m[base + 3] = source.w;
        }
        _ => panic!("Column {column} out of bounds [0, ..., 3]"),
    }
}

/// Copies a column from the matrix into a `Vector4Like`. Column index must be 0–3.
///
/// # Panics
/// Panics if `column > 3`.
pub fn copy_matrix4_column_to_vector4(out: &mut Vector4Like, column: usize, source: &Matrix4Like) {
    let base = column * 4;
    match column {
        0..=3 => {
            out.x = source.m[base];
            out.y = source.m[base + 1];
            out.z = source.m[base + 2];
            out.w = source.m[base + 3];
        }
        _ => panic!("Column {column} out of bounds [0, ..., 3]"),
    }
}

/// Copies a row from a `Vector4Like` into `out`. Row index must be 0–3.
///
/// In column-major storage, row `r` is at indices `[r, r+4, r+8, r+12]`.
///
/// # Panics
/// Panics if `row > 3`.
pub fn copy_matrix4_row_from_vector4(out: &mut Matrix4Like, row: usize, source: &Vector4Like) {
    match row {
        0..=3 => {
            out.m[row] = source.x;
            out.m[row + 4] = source.y;
            out.m[row + 8] = source.z;
            out.m[row + 12] = source.w;
        }
        _ => panic!("Row {row} out of bounds [0, ..., 3]"),
    }
}

/// Copies a row from the matrix into a `Vector4Like`. Row index must be 0–3.
///
/// # Panics
/// Panics if `row > 3`.
pub fn copy_matrix4_row_to_vector4(out: &mut Vector4Like, row: usize, source: &Matrix4Like) {
    match row {
        0..=3 => {
            out.x = source.m[row];
            out.y = source.m[row + 4];
            out.z = source.m[row + 8];
            out.w = source.m[row + 12];
        }
        _ => panic!("Row {row} out of bounds [0, ..., 3]"),
    }
}

/// Creates a new identity [`Matrix4`].
pub fn create_matrix4_identity() -> Matrix4 {
    Matrix4 { m: IDENTITY }
}

/// Creates a new [`Matrix4`] from a 2D affine transform (`a, b, c, d`) with optional `tx`/`ty`.
pub fn create_matrix4_from_2d(a: f32, b: f32, c: f32, d: f32, tx: f32, ty: f32) -> Matrix4 {
    let mut out = Matrix4Like { m: IDENTITY };
    set_matrix4_from_2d(&mut out, a, b, c, d, tx, ty);
    Matrix4 { m: out.m }
}

/// Creates an orthographic projection matrix.
pub fn create_orthographic_matrix4(
    left: f32,
    right: f32,
    bottom: f32,
    top: f32,
    z_near: f32,
    z_far: f32,
) -> Matrix4 {
    let mut out = Matrix4Like { m: IDENTITY };
    set_orthographic_matrix4(&mut out, left, right, bottom, top, z_near, z_far);
    Matrix4 { m: out.m }
}

/// Creates a perspective projection matrix.
pub fn create_perspective_matrix4(fov: f32, aspect: f32, z_near: f32, z_far: f32) -> Matrix4 {
    let mut out = Matrix4Like { m: IDENTITY };
    set_perspective_matrix4(&mut out, fov, aspect, z_near, z_far);
    Matrix4 { m: out.m }
}

/// Returns `true` if all 16 elements of `a` and `b` are equal.
pub fn equals_matrix4(a: &Matrix4Like, b: &Matrix4Like) -> bool {
    a.m == b.m
}

/// Returns the determinant of `source`.
pub fn get_matrix4_determinant(source: &Matrix4Like) -> f32 {
    let s = &source.m;
    (s[0] * s[5] - s[4] * s[1]) * (s[10] * s[15] - s[14] * s[11])
        - (s[0] * s[9] - s[8] * s[1]) * (s[6] * s[15] - s[14] * s[7])
        + (s[0] * s[13] - s[12] * s[1]) * (s[6] * s[11] - s[10] * s[7])
        + (s[4] * s[9] - s[8] * s[5]) * (s[2] * s[15] - s[14] * s[3])
        - (s[4] * s[13] - s[12] * s[5]) * (s[2] * s[11] - s[10] * s[3])
        + (s[8] * s[13] - s[12] * s[9]) * (s[2] * s[7] - s[6] * s[3])
}

/// Returns the element at `(row, column)` (column-major: index = `column*4 + row`).
pub fn get_matrix4_element(source: &Matrix4Like, row: usize, column: usize) -> f32 {
    source.m[column * 4 + row]
}

/// Reads the translation column into `out`.
pub fn get_matrix4_position(out: &mut Vector3Like, source: &Matrix4Like) {
    out.x = source.m[12];
    out.y = source.m[13];
    out.z = source.m[14];
}

/// Linearly interpolates between `a` and `b` element-wise by factor `t`.
///
/// Safe when `out` aliases `a` or `b`.
pub fn interpolate_matrix4(out: &mut Matrix4Like, a: &Matrix4Like, b: &Matrix4Like, t: f32) {
    for i in 0..16 {
        out.m[i] = a.m[i] + (b.m[i] - a.m[i]) * t;
    }
}

/// Inverts `source` and writes into `out`. Returns `false` if the matrix is not invertible
/// (determinant near zero), in which case all elements are set to `f32::NAN`.
///
/// Safe when `out` aliases `source`.
pub fn inverse_matrix4(out: &mut Matrix4Like, source: &Matrix4Like) -> bool {
    let d = get_matrix4_determinant(source);
    const EPS: f32 = 1e-6;
    if d.abs() <= EPS {
        out.m = [f32::NAN; 16];
        return false;
    }
    let d = 1.0 / d;

    let s = &source.m;
    let m11 = s[0];
    let m21 = s[4];
    let m31 = s[8];
    let m41 = s[12];
    let m12 = s[1];
    let m22 = s[5];
    let m32 = s[9];
    let m42 = s[13];
    let m13 = s[2];
    let m23 = s[6];
    let m33 = s[10];
    let m43 = s[14];
    let m14 = s[3];
    let m24 = s[7];
    let m34 = s[11];
    let m44 = s[15];

    let r0 = d
        * (m22 * (m33 * m44 - m43 * m34) - m32 * (m23 * m44 - m43 * m24)
            + m42 * (m23 * m34 - m33 * m24));
    let r1 = -d
        * (m12 * (m33 * m44 - m43 * m34) - m32 * (m13 * m44 - m43 * m14)
            + m42 * (m13 * m34 - m33 * m14));
    let r2 = d
        * (m12 * (m23 * m44 - m43 * m24) - m22 * (m13 * m44 - m43 * m14)
            + m42 * (m13 * m24 - m23 * m14));
    let r3 = -d
        * (m12 * (m23 * m34 - m33 * m24) - m22 * (m13 * m34 - m33 * m14)
            + m32 * (m13 * m24 - m23 * m14));
    let r4 = -d
        * (m21 * (m33 * m44 - m43 * m34) - m31 * (m23 * m44 - m43 * m24)
            + m41 * (m23 * m34 - m33 * m24));
    let r5 = d
        * (m11 * (m33 * m44 - m43 * m34) - m31 * (m13 * m44 - m43 * m14)
            + m41 * (m13 * m34 - m33 * m14));
    let r6 = -d
        * (m11 * (m23 * m44 - m43 * m24) - m21 * (m13 * m44 - m43 * m14)
            + m41 * (m13 * m24 - m23 * m14));
    let r7 = d
        * (m11 * (m23 * m34 - m33 * m24) - m21 * (m13 * m34 - m33 * m14)
            + m31 * (m13 * m24 - m23 * m14));
    let r8 = d
        * (m21 * (m32 * m44 - m42 * m34) - m31 * (m22 * m44 - m42 * m24)
            + m41 * (m22 * m34 - m32 * m24));
    let r9 = -d
        * (m11 * (m32 * m44 - m42 * m34) - m31 * (m12 * m44 - m42 * m14)
            + m41 * (m12 * m34 - m32 * m14));
    let r10 = d
        * (m11 * (m22 * m44 - m42 * m24) - m21 * (m12 * m44 - m42 * m14)
            + m41 * (m12 * m24 - m22 * m14));
    let r11 = -d
        * (m11 * (m22 * m34 - m32 * m24) - m21 * (m12 * m34 - m32 * m14)
            + m31 * (m12 * m24 - m22 * m14));
    let r12 = -d
        * (m21 * (m32 * m43 - m42 * m33) - m31 * (m22 * m43 - m42 * m23)
            + m41 * (m22 * m33 - m32 * m23));
    let r13 = d
        * (m11 * (m32 * m43 - m42 * m33) - m31 * (m12 * m43 - m42 * m13)
            + m41 * (m12 * m33 - m32 * m13));
    let r14 = -d
        * (m11 * (m22 * m43 - m42 * m23) - m21 * (m12 * m43 - m42 * m13)
            + m41 * (m12 * m23 - m22 * m13));
    let r15 = d
        * (m11 * (m22 * m33 - m32 * m23) - m21 * (m12 * m33 - m32 * m13)
            + m31 * (m12 * m23 - m22 * m13));

    out.m = [
        r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15,
    ];
    true
}

/// Returns `true` if the matrix has an affine bottom row (`m[3]=0, m[7]=0, m[11]=0, m[15]=1`).
pub fn is_affine_matrix4(source: &Matrix4Like) -> bool {
    source.m[3] == 0.0 && source.m[7] == 0.0 && source.m[11] == 0.0 && source.m[15] == 1.0
}

/// Transforms `point` by `source` (including translation).
///
/// Safe when `out` aliases `source` fields via a different pointer.
pub fn matrix4_transform_point(out: &mut Vector3Like, source: &Matrix4Like, point: &Vector3Like) {
    let s = &source.m;
    let x = point.x;
    let y = point.y;
    let z = point.z;
    let rx = x * s[0] + y * s[4] + z * s[8] + s[12];
    let ry = x * s[1] + y * s[5] + z * s[9] + s[13];
    let rz = x * s[2] + y * s[6] + z * s[10] + s[14];
    out.x = rx;
    out.y = ry;
    out.z = rz;
}

/// Transforms a `Vector4Like` by `source`.
///
/// Safe when `out` aliases `vector`.
pub fn matrix4_transform_vector(out: &mut Vector4Like, source: &Matrix4Like, vector: &Vector4Like) {
    let s = &source.m;
    let x = vector.x;
    let y = vector.y;
    let z = vector.z;
    let w = vector.w;
    let rx = x * s[0] + y * s[4] + z * s[8] + w * s[12];
    let ry = x * s[1] + y * s[5] + z * s[9] + w * s[13];
    let rz = x * s[2] + y * s[6] + z * s[10] + w * s[14];
    let rw = x * s[3] + y * s[7] + z * s[11] + w * s[15];
    out.x = rx;
    out.y = ry;
    out.z = rz;
    out.w = rw;
}

/// Transforms a series of `[x, y, z]` triples stored in a flat slice.
///
/// `out` and `vectors` must have the same length and it must be a multiple of 3.
pub fn matrix4_transform_vectors(out: &mut [f32], source: &Matrix4Like, vectors: &[f32]) {
    let s = &source.m;
    let mut i = 0;
    while i + 3 <= vectors.len() {
        let x = vectors[i];
        let y = vectors[i + 1];
        let z = vectors[i + 2];
        out[i] = x * s[0] + y * s[4] + z * s[8] + s[12];
        out[i + 1] = x * s[1] + y * s[5] + z * s[9] + s[13];
        out[i + 2] = x * s[2] + y * s[6] + z * s[10] + s[14];
        i += 3;
    }
}

/// Multiplies `a × b` and writes into `out`.
///
/// Safe when `out` aliases `a` or `b`.
pub fn multiply_matrix4(out: &mut Matrix4Like, a: &Matrix4Like, b: &Matrix4Like) {
    let a = &a.m;
    let b = &b.m;

    let m111 = a[0];
    let m121 = a[4];
    let m131 = a[8];
    let m141 = a[12];
    let m112 = a[1];
    let m122 = a[5];
    let m132 = a[9];
    let m142 = a[13];
    let m113 = a[2];
    let m123 = a[6];
    let m133 = a[10];
    let m143 = a[14];
    let m114 = a[3];
    let m124 = a[7];
    let m134 = a[11];
    let m144 = a[15];
    let m211 = b[0];
    let m221 = b[4];
    let m231 = b[8];
    let m241 = b[12];
    let m212 = b[1];
    let m222 = b[5];
    let m232 = b[9];
    let m242 = b[13];
    let m213 = b[2];
    let m223 = b[6];
    let m233 = b[10];
    let m243 = b[14];
    let m214 = b[3];
    let m224 = b[7];
    let m234 = b[11];
    let m244 = b[15];

    out.m[0] = m211 * m111 + m212 * m121 + m213 * m131 + m214 * m141;
    out.m[1] = m211 * m112 + m212 * m122 + m213 * m132 + m214 * m142;
    out.m[2] = m211 * m113 + m212 * m123 + m213 * m133 + m214 * m143;
    out.m[3] = m211 * m114 + m212 * m124 + m213 * m134 + m214 * m144;
    out.m[4] = m221 * m111 + m222 * m121 + m223 * m131 + m224 * m141;
    out.m[5] = m221 * m112 + m222 * m122 + m223 * m132 + m224 * m142;
    out.m[6] = m221 * m113 + m222 * m123 + m223 * m133 + m224 * m143;
    out.m[7] = m221 * m114 + m222 * m124 + m223 * m134 + m224 * m144;
    out.m[8] = m231 * m111 + m232 * m121 + m233 * m131 + m234 * m141;
    out.m[9] = m231 * m112 + m232 * m122 + m233 * m132 + m234 * m142;
    out.m[10] = m231 * m113 + m232 * m123 + m233 * m133 + m234 * m143;
    out.m[11] = m231 * m114 + m232 * m124 + m233 * m134 + m234 * m144;
    out.m[12] = m241 * m111 + m242 * m121 + m243 * m131 + m244 * m141;
    out.m[13] = m241 * m112 + m242 * m122 + m243 * m132 + m244 * m142;
    out.m[14] = m241 * m113 + m242 * m123 + m243 * m133 + m244 * m143;
    out.m[15] = m241 * m114 + m242 * m124 + m243 * m134 + m244 * m144;
}

/// Pre-multiplies `source` by `other` (world-space prepend): `out = other · source`.
pub fn prepend_matrix4(out: &mut Matrix4Like, source: &Matrix4Like, other: &Matrix4Like) {
    multiply_matrix4(out, other, source);
}

/// Prepends a rotation before all local-space transforms.
pub fn prepend_rotation_matrix4(
    out: &mut Matrix4Like,
    source: &Matrix4Like,
    degrees: f32,
    axis: &Vector4Like,
    pivot_point: Option<&Vector4Like>,
) {
    let mut m = acquire_identity_matrix4();
    get_axis_rotation(&mut m, axis.x, axis.y, axis.z, degrees);

    if let Some(p) = pivot_point {
        let mut t1 = acquire_identity_matrix4();
        let mut t2 = acquire_identity_matrix4();
        let t1_src = t1.clone();
        append_translation_matrix4(&mut t1, &t1_src, -p.x, -p.y, -p.z);
        let t2_src = t2.clone();
        append_translation_matrix4(&mut t2, &t2_src, p.x, p.y, p.z);
        let tmp = m.clone();
        multiply_matrix4(&mut m, &tmp, &t1);
        let tmp2 = m.clone();
        multiply_matrix4(&mut m, &t2, &tmp2);
        release_matrix4(t1);
        release_matrix4(t2);
    }

    prepend_matrix4(out, source, &m);
    release_matrix4(m);
}

/// Prepends scale before all local-space transforms.
pub fn prepend_scale_matrix4(
    out: &mut Matrix4Like,
    source: &Matrix4Like,
    x_scale: f32,
    y_scale: f32,
    z_scale: f32,
) {
    let mut m = acquire_matrix4();
    set_matrix4(
        &mut m, x_scale, 0.0, 0.0, 0.0, 0.0, y_scale, 0.0, 0.0, 0.0, 0.0, z_scale, 0.0, 0.0, 0.0,
        0.0, 1.0,
    );
    prepend_matrix4(out, source, &m);
    release_matrix4(m);
}

/// Prepends a local-space translation.
pub fn prepend_translation_matrix4(
    out: &mut Matrix4Like,
    source: &Matrix4Like,
    x: f32,
    y: f32,
    z: f32,
) {
    let mut m = acquire_identity_matrix4();
    let m_src = m.clone();
    translate_matrix4(&mut m, &m_src, x, y, z);
    multiply_matrix4(out, &m, source);
    release_matrix4(m);
}

/// Applies a local-space rotation around `axis` by `degrees`.
pub fn rotate_matrix4(
    out: &mut Matrix4Like,
    source: &Matrix4Like,
    axis: &Vector3Like,
    degrees: f32,
) {
    let mut m = acquire_identity_matrix4();
    get_axis_rotation(&mut m, axis.x, axis.y, axis.z, degrees);
    multiply_matrix4(out, source, &m);
    release_matrix4(m);
}

/// Applies a local-space scale.
pub fn scale_matrix4(out: &mut Matrix4Like, source: &Matrix4Like, sx: f32, sy: f32, sz: f32) {
    // Copy all elements first, then overwrite scaled columns.
    let a = source.m;
    out.m = a;
    if sx != 1.0 {
        out.m[0] = a[0] * sx;
        out.m[4] = a[4] * sx;
        out.m[8] = a[8] * sx;
    }
    if sy != 1.0 {
        out.m[1] = a[1] * sy;
        out.m[5] = a[5] * sy;
        out.m[9] = a[9] * sy;
    }
    if sz != 1.0 {
        out.m[2] = a[2] * sz;
        out.m[6] = a[6] * sz;
        out.m[10] = a[10] * sz;
    }
}

/// Sets all 16 elements of `out` in column-major order.
#[allow(clippy::too_many_arguments)]
pub fn set_matrix4(
    out: &mut Matrix4Like,
    m00: f32,
    m01: f32,
    m02: f32,
    m03: f32,
    m10: f32,
    m11: f32,
    m12: f32,
    m13: f32,
    m20: f32,
    m21: f32,
    m22: f32,
    m23: f32,
    m30: f32,
    m31: f32,
    m32: f32,
    m33: f32,
) {
    out.m[0] = m00;
    out.m[1] = m01;
    out.m[2] = m02;
    out.m[3] = m03;
    out.m[4] = m10;
    out.m[5] = m11;
    out.m[6] = m12;
    out.m[7] = m13;
    out.m[8] = m20;
    out.m[9] = m21;
    out.m[10] = m22;
    out.m[11] = m23;
    out.m[12] = m30;
    out.m[13] = m31;
    out.m[14] = m32;
    out.m[15] = m33;
}

/// Sets `out.m[column*4 + row]`.
pub fn set_matrix4_element(out: &mut Matrix4Like, row: usize, column: usize, value: f32) {
    out.m[column * 4 + row] = value;
}

/// Sets `out` from 2D affine values embedded in a 4×4.
pub fn set_matrix4_from_2d(
    out: &mut Matrix4Like,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
) {
    let m = &mut out.m;
    m[0] = a;
    m[1] = b;
    m[2] = 0.0;
    m[3] = 0.0;
    m[4] = c;
    m[5] = d;
    m[6] = 0.0;
    m[7] = 0.0;
    m[8] = 0.0;
    m[9] = 0.0;
    m[10] = 1.0;
    m[11] = 0.0;
    m[12] = tx;
    m[13] = ty;
    m[14] = 0.0;
    m[15] = 1.0;
}

/// Sets `out` from a 2D affine [`MatrixLike`].
pub fn set_matrix4_from_matrix(out: &mut Matrix4Like, source: &MatrixLike) {
    set_matrix4_from_2d(
        out, source.a, source.b, source.c, source.d, source.tx, source.ty,
    );
}

/// Sets `out` from a 3×3 matrix.
pub fn set_matrix4_from_matrix3(out: &mut Matrix4Like, source: &Matrix3Like) {
    let s = &source.m;
    set_matrix4_from_2d(out, s[0], s[1], s[3], s[4], s[2], s[5]);
    out.m[2] = s[6];
    out.m[6] = s[7];
    out.m[10] = s[8];
}

/// Resets `out` to the identity matrix.
pub fn set_matrix4_identity(out: &mut Matrix4Like) {
    out.m = IDENTITY;
}

/// Sets the translation column.
pub fn set_matrix4_position(out: &mut Matrix4Like, source: &Vector3Like) {
    out.m[12] = source.x;
    out.m[13] = source.y;
    out.m[14] = source.z;
}

/// Sets an orthographic projection matrix.
pub fn set_orthographic_matrix4(
    out: &mut Matrix4Like,
    left: f32,
    right: f32,
    bottom: f32,
    top: f32,
    z_near: f32,
    z_far: f32,
) {
    let sx = 1.0 / (right - left);
    let sy = 1.0 / (top - bottom);
    let sz = 1.0 / (z_far - z_near);

    let m = &mut out.m;
    m[0] = 2.0 * sx;
    m[1] = 0.0;
    m[2] = 0.0;
    m[3] = 0.0;
    m[4] = 0.0;
    m[5] = 2.0 * sy;
    m[6] = 0.0;
    m[7] = 0.0;
    m[8] = 0.0;
    m[9] = 0.0;
    m[10] = -2.0 * sz;
    m[11] = 0.0;
    m[12] = -(left + right) * sx;
    m[13] = -(bottom + top) * sy;
    m[14] = -(z_near + z_far) * sz;
    m[15] = 1.0;
}

/// Sets a perspective projection matrix.
///
/// # Panics
/// Panics if `aspect` is approximately zero.
pub fn set_perspective_matrix4(
    out: &mut Matrix4Like,
    fov: f32,
    aspect: f32,
    z_near: f32,
    z_far: f32,
) {
    if aspect > -1e-7 && aspect < 1e-7 {
        panic!("Aspect ratio may not be 0");
    }
    let top = fov * z_near;
    let bottom = -top;
    let right = top * aspect;
    let left = -right;

    let m = &mut out.m;
    m[0] = (2.0 * z_near) / (right - left);
    m[1] = 0.0;
    m[2] = 0.0;
    m[3] = 0.0;
    m[4] = 0.0;
    m[5] = (2.0 * z_near) / (top - bottom);
    m[6] = 0.0;
    m[7] = 0.0;
    m[8] = (right + left) / (right - left);
    m[9] = (top + bottom) / (top - bottom);
    m[10] = -(z_far + z_near) / (z_far - z_near);
    m[11] = -1.0;
    m[12] = 0.0;
    m[13] = 0.0;
    m[14] = (-2.0 * z_far * z_near) / (z_far - z_near);
    m[15] = 1.0;
}

/// Applies a local-space translation using the matrix's own rotation/scale basis.
pub fn translate_matrix4(out: &mut Matrix4Like, source: &Matrix4Like, tx: f32, ty: f32, tz: f32) {
    // Read all inputs before writing (handles aliased caller cloning source as out).
    let a = source.m;
    let t12 = a[0] * tx + a[4] * ty + a[8] * tz + a[12];
    let t13 = a[1] * tx + a[5] * ty + a[9] * tz + a[13];
    let t14 = a[2] * tx + a[6] * ty + a[10] * tz + a[14];
    out.m = a;
    out.m[12] = t12;
    out.m[13] = t13;
    out.m[14] = t14;
}

/// Transposes `source` and writes into `out` (mathematical transpose, not memory reorder).
pub fn transpose_matrix4(out: &mut Matrix4Like, source: &Matrix4Like) {
    // Read all elements before writing any (safe regardless of aliasing at call site).
    let s = source.m;
    out.m[0] = s[0];
    out.m[1] = s[4];
    out.m[2] = s[8];
    out.m[3] = s[12];
    out.m[4] = s[1];
    out.m[5] = s[5];
    out.m[6] = s[9];
    out.m[7] = s[13];
    out.m[8] = s[2];
    out.m[9] = s[6];
    out.m[10] = s[10];
    out.m[11] = s[14];
    out.m[12] = s[3];
    out.m[13] = s[7];
    out.m[14] = s[11];
    out.m[15] = s[15];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Builds a rotation matrix around an arbitrary axis by `degrees` (degrees, not radians).
fn get_axis_rotation(out: &mut Matrix4Like, x: f32, y: f32, z: f32, degrees: f32) {
    let rad = -degrees * (std::f32::consts::PI / 180.0);
    let c = rad.cos();
    let s = rad.sin();
    let t = 1.0 - c;

    out.m[0] = c + x * x * t;
    out.m[5] = c + y * y * t;
    out.m[10] = c + z * z * t;

    let tmp1 = x * y * t;
    let tmp2 = z * s;
    out.m[4] = tmp1 + tmp2;
    out.m[1] = tmp1 - tmp2;

    let tmp1 = x * z * t;
    let tmp2 = y * s;
    out.m[8] = tmp1 - tmp2;
    out.m[2] = tmp1 + tmp2;

    let tmp1 = y * z * t;
    let tmp2 = x * s;
    out.m[9] = tmp1 + tmp2;
    out.m[6] = tmp1 - tmp2;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn identity() -> Matrix4Like {
        Matrix4Like { m: IDENTITY }
    }

    fn v3(x: f32, y: f32, z: f32) -> Vector3Like {
        Vector3Like { x, y, z }
    }

    fn v4(x: f32, y: f32, z: f32, w: f32) -> Vector4Like {
        Vector4Like { x, y, z, w }
    }

    // clone_matrix4
    #[test]
    fn clone_matrix4_copies() {
        let src = identity();
        let c = clone_matrix4(&src);
        assert_eq!(c.m, src.m);
    }

    // copy_matrix4
    #[test]
    fn copy_matrix4_copies_fields() {
        let src = identity();
        let mut out = Matrix4Like { m: [0.0; 16] };
        copy_matrix4(&mut out, &src);
        assert_eq!(out.m, IDENTITY);
    }

    // copy_matrix4_column_from_vector4
    #[test]
    fn copy_matrix4_column_from_vector4_col0() {
        let mut out = identity();
        copy_matrix4_column_from_vector4(&mut out, 0, &v4(1.0, 2.0, 3.0, 4.0));
        assert_eq!(&out.m[0..4], &[1.0, 2.0, 3.0, 4.0]);
    }

    // copy_matrix4_column_to_vector4
    #[test]
    fn copy_matrix4_column_to_vector4_col3() {
        let mut src = Matrix4Like { m: [0.0; 16] };
        src.m[12] = 5.0;
        src.m[13] = 6.0;
        src.m[14] = 7.0;
        src.m[15] = 8.0;
        let mut out = v4(0.0, 0.0, 0.0, 0.0);
        copy_matrix4_column_to_vector4(&mut out, 3, &src);
        assert_eq!((out.x, out.y, out.z, out.w), (5.0, 6.0, 7.0, 8.0));
    }

    // copy_matrix4_row_from_vector4
    #[test]
    fn copy_matrix4_row_from_vector4_row0() {
        let mut out = Matrix4Like { m: [0.0; 16] };
        copy_matrix4_row_from_vector4(&mut out, 0, &v4(1.0, 2.0, 3.0, 4.0));
        assert_eq!(out.m[0], 1.0);
        assert_eq!(out.m[4], 2.0);
        assert_eq!(out.m[8], 3.0);
        assert_eq!(out.m[12], 4.0);
    }

    // create_matrix4_from_2d
    #[test]
    fn create_matrix4_from_2d_maps_correctly() {
        let m = create_matrix4_from_2d(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        assert_eq!(m.m[0], 1.0);
        assert_eq!(m.m[1], 2.0);
        assert_eq!(m.m[4], 3.0);
        assert_eq!(m.m[5], 4.0);
        assert_eq!(m.m[12], 5.0);
        assert_eq!(m.m[13], 6.0);
    }

    // equals_matrix4
    #[test]
    fn equals_matrix4_identical() {
        assert!(equals_matrix4(&identity(), &identity()));
    }

    #[test]
    fn equals_matrix4_different() {
        let mut b = identity();
        b.m[0] = 2.0;
        assert!(!equals_matrix4(&identity(), &b));
    }

    // get_matrix4_determinant
    #[test]
    fn get_matrix4_determinant_identity_is_one() {
        let d = get_matrix4_determinant(&identity());
        assert!((d - 1.0).abs() < 1e-5);
    }

    // get_matrix4_element
    #[test]
    fn get_matrix4_element_column_major() {
        let mut m = identity();
        m.m[4] = 7.0; // column 1, row 0
        assert_eq!(get_matrix4_element(&m, 0, 1), 7.0);
    }

    // get_matrix4_position
    #[test]
    fn get_matrix4_position_reads_col3() {
        let mut m = identity();
        m.m[12] = 1.0;
        m.m[13] = 2.0;
        m.m[14] = 3.0;
        let mut out = v3(0.0, 0.0, 0.0);
        get_matrix4_position(&mut out, &m);
        assert_eq!((out.x, out.y, out.z), (1.0, 2.0, 3.0));
    }

    // interpolate_matrix4
    #[test]
    fn interpolate_matrix4_midpoint() {
        let a = Matrix4Like { m: [0.0; 16] };
        let b = Matrix4Like { m: [2.0; 16] };
        let mut out = Matrix4Like { m: [0.0; 16] };
        interpolate_matrix4(&mut out, &a, &b, 0.5);
        assert!((out.m[0] - 1.0).abs() < 1e-6);
    }

    // inverse_matrix4
    #[test]
    fn inverse_matrix4_identity_gives_identity() {
        let mut out = Matrix4Like { m: [0.0; 16] };
        let result = inverse_matrix4(&mut out, &identity());
        assert!(result);
        assert!((out.m[0] - 1.0).abs() < 1e-5);
        assert!((out.m[5] - 1.0).abs() < 1e-5);
        assert!((out.m[10] - 1.0).abs() < 1e-5);
        assert!((out.m[15] - 1.0).abs() < 1e-5);
    }

    #[test]
    fn inverse_matrix4_singular_returns_false() {
        let m = Matrix4Like { m: [0.0; 16] };
        let mut out = identity();
        let result = inverse_matrix4(&mut out, &m);
        assert!(!result);
        assert!(out.m[0].is_nan());
    }

    #[test]
    fn inverse_matrix4_overwrites_out() {
        let src = identity();
        let mut out = Matrix4Like { m: [0.0; 16] };
        let result = inverse_matrix4(&mut out, &src);
        assert!(result);
        assert!((out.m[0] - 1.0).abs() < 1e-5);
    }

    // is_affine_matrix4
    #[test]
    fn is_affine_matrix4_identity_is_affine() {
        assert!(is_affine_matrix4(&identity()));
    }

    // matrix4_transform_point
    #[test]
    fn matrix4_transform_point_translate() {
        let mut m = identity();
        m.m[12] = 3.0;
        m.m[13] = 4.0;
        m.m[14] = 5.0;
        let mut out = v3(0.0, 0.0, 0.0);
        matrix4_transform_point(&mut out, &m, &v3(0.0, 0.0, 0.0));
        assert_eq!((out.x, out.y, out.z), (3.0, 4.0, 5.0));
    }

    // matrix4_transform_vectors
    #[test]
    fn matrix4_transform_vectors_identity() {
        let vecs = [1.0f32, 2.0, 3.0, 4.0, 5.0, 6.0];
        let mut out = [0.0f32; 6];
        matrix4_transform_vectors(&mut out, &identity(), &vecs);
        assert!((out[0] - 1.0).abs() < 1e-5);
        assert!((out[1] - 2.0).abs() < 1e-5);
        assert!((out[2] - 3.0).abs() < 1e-5);
    }

    // multiply_matrix4
    #[test]
    fn multiply_matrix4_identity_times_other_is_other() {
        let mut m = identity();
        m.m[12] = 5.0;
        let mut out = Matrix4Like { m: [0.0; 16] };
        multiply_matrix4(&mut out, &identity(), &m);
        assert_eq!(out.m[12], 5.0);
    }

    #[test]
    fn multiply_matrix4_aliased() {
        let a = identity();
        let b = identity();
        let mut out = a.clone();
        multiply_matrix4(&mut out, &a, &b);
        assert!((out.m[0] - 1.0).abs() < 1e-6);
    }

    // set_matrix4_identity
    #[test]
    fn set_matrix4_identity_resets() {
        let mut out = Matrix4Like { m: [5.0; 16] };
        set_matrix4_identity(&mut out);
        assert_eq!(out.m, IDENTITY);
    }

    // set_orthographic_matrix4
    #[test]
    fn set_orthographic_matrix4_diagonal_values() {
        let mut out = identity();
        set_orthographic_matrix4(&mut out, -1.0, 1.0, -1.0, 1.0, -1.0, 1.0);
        assert!((out.m[0] - 1.0).abs() < 1e-6);
        assert!((out.m[5] - 1.0).abs() < 1e-6);
        assert!((out.m[10] + 1.0).abs() < 1e-6);
    }

    // translate_matrix4
    #[test]
    fn translate_matrix4_moves_translation_col() {
        let mut out = Matrix4Like { m: [0.0; 16] };
        translate_matrix4(&mut out, &identity(), 1.0, 2.0, 3.0);
        assert_eq!((out.m[12], out.m[13], out.m[14]), (1.0, 2.0, 3.0));
    }

    // transpose_matrix4
    #[test]
    fn transpose_matrix4_identity_stays_identity() {
        let mut out = Matrix4Like { m: [0.0; 16] };
        transpose_matrix4(&mut out, &identity());
        assert_eq!(out.m, IDENTITY);
    }

    #[test]
    fn transpose_matrix4_swaps_off_diagonal() {
        let mut m = identity();
        m.m[1] = 3.0; // col 0, row 1 (column-major)
        let src = m.clone();
        let mut out = Matrix4Like { m: [0.0; 16] };
        transpose_matrix4(&mut out, &src);
        // After transpose: what was at [1] (col=0,row=1) should be at [4] (col=1,row=0).
        assert_eq!(out.m[4], 3.0);
    }

    #[test]
    fn transpose_matrix4_write_to_separate_out() {
        let mut src = identity();
        src.m[1] = 5.0;
        let mut out = Matrix4Like { m: [0.0; 16] };
        transpose_matrix4(&mut out, &src);
        assert_eq!(out.m[4], 5.0);
        assert_eq!(out.m[1], 0.0);
    }

    fn z_axis() -> Vector4Like {
        v4(0.0, 0.0, 1.0, 0.0)
    }

    fn x_axis() -> Vector4Like {
        v4(1.0, 0.0, 0.0, 0.0)
    }

    fn y_axis() -> Vector4Like {
        v4(0.0, 1.0, 0.0, 0.0)
    }

    // append_matrix4
    #[test]
    fn append_matrix4_equals_multiply() {
        let mut a = identity();
        let a_src = a.clone();
        translate_matrix4(&mut a, &a_src, 5.0, 0.0, 0.0);
        let mut b = identity();
        let b_src = b.clone();
        scale_matrix4(&mut b, &b_src, 2.0, 2.0, 2.0);

        let mut out1 = identity();
        append_matrix4(&mut out1, &a, &b);
        let mut out2 = identity();
        multiply_matrix4(&mut out2, &a, &b);
        assert!(equals_matrix4(&out1, &out2));
    }

    #[test]
    fn append_matrix4_supports_out_alias() {
        let mut a = identity();
        let a_src = a.clone();
        translate_matrix4(&mut a, &a_src, 5.0, 0.0, 0.0);
        let mut b = identity();
        let b_src = b.clone();
        scale_matrix4(&mut b, &b_src, 2.0, 3.0, 4.0);

        let mut expected = identity();
        append_matrix4(&mut expected, &a, &b);
        let a_snapshot = a.clone();
        append_matrix4(&mut a, &a_snapshot, &b);
        assert!(equals_matrix4(&a, &expected));
    }

    // append_rotation_matrix4
    #[test]
    fn append_rotation_matrix4_rotates_z_90() {
        let mut m = identity();
        let src = m.clone();
        append_rotation_matrix4(&mut m, &src, 90.0, &z_axis(), None);
        assert!(m.m[0].abs() < 1e-6);
        assert!((m.m[1] - 1.0).abs() < 1e-6);
        assert!((m.m[4] + 1.0).abs() < 1e-6);
        assert!(m.m[5].abs() < 1e-6);
    }

    #[test]
    fn append_rotation_matrix4_does_not_rotate_translation() {
        let mut m = identity();
        let src = m.clone();
        translate_matrix4(&mut m, &src, 10.0, 0.0, 0.0);
        let src2 = m.clone();
        append_rotation_matrix4(&mut m, &src2, 90.0, &z_axis(), None);
        assert!((m.m[12] - 10.0).abs() < 1e-6);
        assert!(m.m[13].abs() < 1e-6);
    }

    #[test]
    fn append_rotation_matrix4_rotates_around_pivot() {
        let mut m = identity();
        let src = m.clone();
        translate_matrix4(&mut m, &src, 10.0, 0.0, 0.0);
        let src2 = m.clone();
        let pivot = v4(5.0, 0.0, 0.0, 1.0);
        append_rotation_matrix4(&mut m, &src2, 90.0, &z_axis(), Some(&pivot));
        assert!((m.m[12] - 5.0).abs() < 1e-5);
        assert!((m.m[13] - 5.0).abs() < 1e-5);
    }

    // append_scale_matrix4
    #[test]
    fn append_scale_matrix4_scales_identity() {
        let mut m = identity();
        let src = m.clone();
        append_scale_matrix4(&mut m, &src, 2.0, 3.0, 4.0);
        assert_eq!(m.m[0], 2.0);
        assert_eq!(m.m[5], 3.0);
        assert_eq!(m.m[10], 4.0);
    }

    #[test]
    fn append_scale_matrix4_accumulates() {
        let mut m = identity();
        let src = m.clone();
        scale_matrix4(&mut m, &src, 2.0, 2.0, 2.0);
        let src2 = m.clone();
        append_scale_matrix4(&mut m, &src2, 3.0, 4.0, 5.0);
        assert_eq!(m.m[0], 6.0);
        assert_eq!(m.m[5], 8.0);
        assert_eq!(m.m[10], 10.0);
    }

    // append_translation_matrix4
    #[test]
    fn append_translation_matrix4_adds_to_identity() {
        let mut m = identity();
        let src = m.clone();
        append_translation_matrix4(&mut m, &src, 1.0, 2.0, 3.0);
        assert_eq!(m.m[12], 1.0);
        assert_eq!(m.m[13], 2.0);
        assert_eq!(m.m[14], 3.0);
    }

    #[test]
    fn append_translation_matrix4_adds_to_existing() {
        let mut m = identity();
        m.m[12] = 10.0;
        m.m[13] = 20.0;
        m.m[14] = 30.0;
        let src = m.clone();
        append_translation_matrix4(&mut m, &src, 1.0, 2.0, 3.0);
        assert_eq!(m.m[12], 11.0);
        assert_eq!(m.m[13], 22.0);
        assert_eq!(m.m[14], 33.0);
    }

    // copy_matrix4_row_to_vector4
    #[test]
    fn copy_matrix4_row_to_vector4_row2() {
        let m = Matrix4Like {
            m: [
                1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0,
                16.0,
            ],
        };
        let mut out = v4(0.0, 0.0, 0.0, 0.0);
        copy_matrix4_row_to_vector4(&mut out, 2, &m);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 7.0);
        assert_eq!(out.z, 11.0);
        assert_eq!(out.w, 15.0);
    }

    #[test]
    #[should_panic]
    fn copy_matrix4_row_to_vector4_panics_invalid_row() {
        let m = identity();
        let mut out = v4(0.0, 0.0, 0.0, 0.0);
        copy_matrix4_row_to_vector4(&mut out, 42, &m);
    }

    // create_matrix4_from2_d (TS createMatrix4From2D)
    #[test]
    fn create_matrix4_from2_d_uses_set2d_semantics() {
        let m = create_matrix4_from_2d(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        assert_eq!(
            m.m,
            [
                1.0, 2.0, 0.0, 0.0, 3.0, 4.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 5.0, 6.0, 0.0, 1.0
            ]
        );
    }

    #[test]
    fn create_matrix4_from2_d_does_not_share_storage() {
        let a = create_matrix4_from_2d(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut b = create_matrix4_from_2d(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        b.m[0] = 42.0;
        assert_eq!(a.m[0], 1.0);
        assert_eq!(b.m[0], 42.0);
    }

    // create_orthographic_matrix4
    #[test]
    fn create_orthographic_matrix4_equals_set() {
        let m1 = create_orthographic_matrix4(-1.0, 1.0, -1.0, 1.0, 0.1, 100.0);
        let mut m2 = identity();
        set_orthographic_matrix4(&mut m2, -1.0, 1.0, -1.0, 1.0, 0.1, 100.0);
        let m1_like = Matrix4Like { m: m1.m };
        assert!(equals_matrix4(&m1_like, &m2));
    }

    // create_perspective_matrix4
    #[test]
    fn create_perspective_matrix4_equals_set() {
        let m1 = create_perspective_matrix4(0.5, 1.6, 0.1, 1000.0);
        let mut m2 = identity();
        set_perspective_matrix4(&mut m2, 0.5, 1.6, 0.1, 1000.0);
        let m1_like = Matrix4Like { m: m1.m };
        assert!(equals_matrix4(&m1_like, &m2));
    }

    // matrix4_transform_vector
    #[test]
    fn matrix4_transform_vector_transforms_point() {
        let mut m = identity();
        let src = m.clone();
        translate_matrix4(&mut m, &src, 5.0, 10.0, 15.0);
        let mut out = v4(0.0, 0.0, 0.0, 0.0);
        matrix4_transform_vector(&mut out, &m, &v4(1.0, 2.0, 3.0, 1.0));
        assert!((out.x - 6.0).abs() < 1e-5);
        assert!((out.y - 12.0).abs() < 1e-5);
        assert!((out.z - 18.0).abs() < 1e-5);
    }

    #[test]
    fn matrix4_transform_vector_ignores_translation_for_direction() {
        let mut m = identity();
        let src = m.clone();
        translate_matrix4(&mut m, &src, 5.0, 10.0, 15.0);
        let mut out = v4(0.0, 0.0, 0.0, 0.0);
        matrix4_transform_vector(&mut out, &m, &v4(1.0, 2.0, 3.0, 0.0));
        assert!((out.x - 1.0).abs() < 1e-5);
        assert!((out.y - 2.0).abs() < 1e-5);
        assert!((out.z - 3.0).abs() < 1e-5);
        assert!(out.w.abs() < 1e-5);
    }

    #[test]
    fn matrix4_transform_vector_supports_out_alias() {
        let mut m = identity();
        let src = m.clone();
        translate_matrix4(&mut m, &src, 5.0, 10.0, 15.0);
        let mut vector = v4(1.0, 2.0, 3.0, 1.0);
        let snapshot = vector;
        matrix4_transform_vector(&mut vector, &m, &snapshot);
        assert!((vector.x - 6.0).abs() < 1e-5);
        assert!((vector.y - 12.0).abs() < 1e-5);
        assert!((vector.z - 18.0).abs() < 1e-5);
        assert!((vector.w - 1.0).abs() < 1e-5);
    }

    // prepend_matrix4
    #[test]
    fn prepend_matrix4_equals_multiply_other_first() {
        let mut a = identity();
        let a_src = a.clone();
        translate_matrix4(&mut a, &a_src, 5.0, 0.0, 0.0);
        let mut b = identity();
        let b_src = b.clone();
        scale_matrix4(&mut b, &b_src, 2.0, 2.0, 2.0);

        let mut out1 = identity();
        prepend_matrix4(&mut out1, &a, &b);
        let mut out2 = identity();
        multiply_matrix4(&mut out2, &b, &a);
        assert!(equals_matrix4(&out1, &out2));
    }

    #[test]
    fn prepend_matrix4_supports_out_alias() {
        let mut a = identity();
        let a_src = a.clone();
        translate_matrix4(&mut a, &a_src, 5.0, 0.0, 0.0);
        let mut b = identity();
        let b_src = b.clone();
        scale_matrix4(&mut b, &b_src, 2.0, 3.0, 4.0);

        let mut expected = identity();
        prepend_matrix4(&mut expected, &a, &b);
        let a_snapshot = a.clone();
        prepend_matrix4(&mut a, &a_snapshot, &b);
        assert!(equals_matrix4(&a, &expected));
    }

    // prepend_rotation_matrix4
    #[test]
    fn prepend_rotation_matrix4_rotates_z() {
        let mut m = identity();
        let src = m.clone();
        prepend_rotation_matrix4(&mut m, &src, 90.0, &z_axis(), None);
        assert!(m.m[0].abs() < 1e-6);
        assert!((m.m[1] - 1.0).abs() < 1e-6);
    }

    #[test]
    fn prepend_rotation_matrix4_rotates_translation() {
        let mut m = identity();
        let src = m.clone();
        translate_matrix4(&mut m, &src, 10.0, 0.0, 0.0);
        let src2 = m.clone();
        prepend_rotation_matrix4(&mut m, &src2, 90.0, &z_axis(), None);
        assert!(m.m[12].abs() < 1e-5);
        assert!((m.m[13] - 10.0).abs() < 1e-5);
    }

    // prepend_scale_matrix4
    #[test]
    fn prepend_scale_matrix4_scales_identity() {
        let mut m = identity();
        let src = m.clone();
        prepend_scale_matrix4(&mut m, &src, 2.0, 3.0, 4.0);
        assert_eq!(m.m[0], 2.0);
        assert_eq!(m.m[5], 3.0);
        assert_eq!(m.m[10], 4.0);
    }

    #[test]
    fn prepend_scale_matrix4_scales_translation() {
        let mut m = identity();
        let src = m.clone();
        translate_matrix4(&mut m, &src, 10.0, 20.0, 30.0);
        let src2 = m.clone();
        prepend_scale_matrix4(&mut m, &src2, 2.0, 3.0, 4.0);
        assert_eq!(m.m[12], 20.0);
        assert_eq!(m.m[13], 60.0);
        assert_eq!(m.m[14], 120.0);
    }

    // prepend_translation_matrix4
    #[test]
    fn prepend_translation_matrix4_translates_identity() {
        let mut m = identity();
        let src = m.clone();
        prepend_translation_matrix4(&mut m, &src, 1.0, 2.0, 3.0);
        assert_eq!(m.m[12], 1.0);
        assert_eq!(m.m[13], 2.0);
        assert_eq!(m.m[14], 3.0);
    }

    #[test]
    fn prepend_translation_matrix4_matches_translate_on_identity() {
        let mut a = identity();
        let a_src = a.clone();
        translate_matrix4(&mut a, &a_src, 1.0, 2.0, 3.0);
        let mut c = identity();
        let c_src = c.clone();
        prepend_translation_matrix4(&mut c, &c_src, 1.0, 2.0, 3.0);
        assert!(equals_matrix4(&a, &c));
    }

    // rotate_matrix4
    #[test]
    fn rotate_matrix4_matches_append_rotation_on_identity() {
        let mut a = identity();
        let a_src = a.clone();
        rotate_matrix4(&mut a, &a_src, &v3(0.0, 0.0, 1.0), 90.0);
        let mut b = identity();
        let b_src = b.clone();
        append_rotation_matrix4(&mut b, &b_src, 90.0, &z_axis(), None);
        assert!(equals_matrix4(&a, &b));
    }

    #[test]
    fn rotate_matrix4_preserves_translation() {
        let mut m = identity();
        let src = m.clone();
        translate_matrix4(&mut m, &src, 5.0, 0.0, 0.0);
        let src2 = m.clone();
        rotate_matrix4(&mut m, &src2, &v3(0.0, 0.0, 1.0), 90.0);
        assert!((m.m[12] - 5.0).abs() < 1e-5);
        assert!(m.m[13].abs() < 1e-5);
    }

    #[test]
    fn rotate_matrix4_around_x_preserves_x_basis() {
        let mut m = identity();
        let src = m.clone();
        append_rotation_matrix4(&mut m, &src, 90.0, &x_axis(), None);
        assert!((m.m[0] - 1.0).abs() < 1e-6);
        assert!(m.m[1].abs() < 1e-6);
        assert!(m.m[2].abs() < 1e-6);
    }

    #[test]
    fn rotate_matrix4_around_y_preserves_y_basis() {
        let mut m = identity();
        let src = m.clone();
        append_rotation_matrix4(&mut m, &src, 90.0, &y_axis(), None);
        assert!(m.m[4].abs() < 1e-6);
        assert!((m.m[5] - 1.0).abs() < 1e-6);
        assert!(m.m[6].abs() < 1e-6);
    }

    // scale_matrix4
    #[test]
    fn scale_matrix4_scales_identity() {
        let mut m = identity();
        let src = m.clone();
        scale_matrix4(&mut m, &src, 2.0, 3.0, 4.0);
        assert_eq!(m.m[0], 2.0);
        assert_eq!(m.m[5], 3.0);
        assert_eq!(m.m[10], 4.0);
    }

    #[test]
    fn scale_matrix4_accumulates() {
        let mut m = identity();
        let src = m.clone();
        scale_matrix4(&mut m, &src, 2.0, 3.0, 4.0);
        let src2 = m.clone();
        scale_matrix4(&mut m, &src2, 5.0, 6.0, 7.0);
        assert_eq!(m.m[0], 10.0);
        assert_eq!(m.m[5], 18.0);
        assert_eq!(m.m[10], 28.0);
    }

    #[test]
    fn scale_matrix4_does_not_modify_translation() {
        let mut m = identity();
        let src = m.clone();
        translate_matrix4(&mut m, &src, 10.0, 20.0, 30.0);
        let src2 = m.clone();
        scale_matrix4(&mut m, &src2, 2.0, 3.0, 4.0);
        assert_eq!(m.m[12], 10.0);
        assert_eq!(m.m[13], 20.0);
        assert_eq!(m.m[14], 30.0);
    }

    // set_matrix4_element
    #[test]
    fn set_matrix4_element_writes_value() {
        let mut m = identity();
        set_matrix4_element(&mut m, 2, 3, 42.0);
        assert_eq!(get_matrix4_element(&m, 2, 3), 42.0);
    }

    #[test]
    fn set_matrix4_element_leaves_others_unchanged() {
        let mut m = identity();
        set_matrix4_element(&mut m, 1, 2, 7.0);
        assert_eq!(get_matrix4_element(&m, 0, 0), 1.0);
        assert_eq!(get_matrix4_element(&m, 3, 3), 1.0);
    }

    // set_matrix4_from2_d (TS setMatrix4From2D)
    #[test]
    fn set_matrix4_from2_d_sets_transform() {
        let mut m = identity();
        set_matrix4_from_2d(&mut m, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        assert_eq!(
            m.m,
            [
                1.0, 2.0, 0.0, 0.0, 3.0, 4.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 5.0, 6.0, 0.0, 1.0
            ]
        );
    }

    #[test]
    fn set_matrix4_from2_d_produces_affine() {
        let mut m = identity();
        set_matrix4_from_2d(&mut m, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(is_affine_matrix4(&m));
    }

    // set_matrix4_from_matrix
    #[test]
    fn set_matrix4_from_matrix_identity() {
        let mat2d = MatrixLike::default();
        let mut m = identity();
        set_matrix4_from_matrix(&mut m, &mat2d);
        assert_eq!(
            m.m,
            [
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
            ]
        );
    }

    #[test]
    fn set_matrix4_from_matrix_scale_and_translation() {
        let mat2d = MatrixLike {
            a: 2.0,
            b: 0.0,
            c: 0.0,
            d: 3.0,
            tx: 5.0,
            ty: 10.0,
        };
        let mut m = identity();
        set_matrix4_from_matrix(&mut m, &mat2d);
        assert_eq!(get_matrix4_element(&m, 0, 0), 2.0);
        assert_eq!(get_matrix4_element(&m, 0, 3), 5.0);
        assert_eq!(get_matrix4_element(&m, 1, 1), 3.0);
        assert_eq!(get_matrix4_element(&m, 1, 3), 10.0);
        assert_eq!(get_matrix4_element(&m, 2, 2), 1.0);
        assert_eq!(get_matrix4_element(&m, 3, 3), 1.0);
    }

    // set_matrix4_from_matrix3
    #[test]
    fn set_matrix4_from_matrix3_identity() {
        let mat3 = Matrix3Like::default();
        let mut m = identity();
        set_matrix4_from_matrix3(&mut m, &mat3);
        assert_eq!(
            m.m,
            [
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
            ]
        );
    }

    #[test]
    fn set_matrix4_from_matrix3_scale_and_translation() {
        let mat3 = Matrix3Like {
            m: [2.0, 0.0, 5.0, 0.0, 3.0, 10.0, 0.0, 0.0, 1.0],
        };
        let mut m = identity();
        set_matrix4_from_matrix3(&mut m, &mat3);
        assert_eq!(get_matrix4_element(&m, 0, 0), 2.0);
        assert_eq!(get_matrix4_element(&m, 0, 3), 5.0);
        assert_eq!(get_matrix4_element(&m, 1, 1), 3.0);
        assert_eq!(get_matrix4_element(&m, 1, 3), 10.0);
        assert_eq!(get_matrix4_element(&m, 2, 2), 1.0);
        assert_eq!(get_matrix4_element(&m, 3, 3), 1.0);
    }

    // set_matrix4_position
    #[test]
    fn set_matrix4_position_sets_translation() {
        let mut m = identity();
        set_matrix4_position(&mut m, &v3(5.0, 6.0, 7.0));
        assert_eq!(m.m[12], 5.0);
        assert_eq!(m.m[13], 6.0);
        assert_eq!(m.m[14], 7.0);
    }

    #[test]
    fn set_matrix4_position_does_not_modify_basis() {
        let mut m = identity();
        let before = m.m;
        set_matrix4_position(&mut m, &v3(1.0, 2.0, 3.0));
        assert_eq!(m.m[0], before[0]);
        assert_eq!(m.m[5], before[5]);
        assert_eq!(m.m[10], before[10]);
        assert_eq!(m.m[15], before[15]);
    }

    // set_perspective_matrix4
    #[test]
    #[should_panic]
    fn set_perspective_matrix4_panics_on_zero_aspect() {
        let mut m = identity();
        set_perspective_matrix4(&mut m, 0.5, 0.0, 0.1, 1000.0);
    }

    #[test]
    fn set_perspective_matrix4_sets_m11_negative_one() {
        let mut m = identity();
        set_perspective_matrix4(&mut m, 0.5, 1.6, 0.1, 1000.0);
        assert_eq!(m.m[11], -1.0);
    }
}

//! Free functions for [`Matrix`] — 2D affine transform (3×2, six components).
//!
//! Layout (row-major display, column-vector math):
//! ```text
//! [ a  c  tx ]
//! [ b  d  ty ]
//! ```

use flighthq_types::{
    Matrix, Matrix3Like, Matrix4Like, MatrixLike, RectangleLike, Vector2Like, Vector3Like,
};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns a new [`Matrix`] that is a copy of `source`.
pub fn clone_matrix(source: &MatrixLike) -> Matrix {
    Matrix {
        a: source.a,
        b: source.b,
        c: source.c,
        d: source.d,
        tx: source.tx,
        ty: source.ty,
    }
}

/// Copies `source` into `out`.
pub fn copy_matrix(out: &mut MatrixLike, source: &MatrixLike) {
    set_matrix(
        out, source.a, source.b, source.c, source.d, source.tx, source.ty,
    );
}

/// Copies a column from `source` Vector3 into `out` matrix. Column index must be 0–2.
///
/// Column 0 → (a, b); column 1 → (c, d); column 2 → (tx, ty). The z component is ignored.
///
/// # Panics
/// Panics if `column > 2`.
pub fn copy_matrix_column_from_vector3(out: &mut MatrixLike, column: usize, source: &Vector3Like) {
    match column {
        0 => {
            out.a = source.x;
            out.b = source.y;
        }
        1 => {
            out.c = source.x;
            out.d = source.y;
        }
        2 => {
            out.tx = source.x;
            out.ty = source.y;
        }
        _ => panic!("Column {column} out of bounds (2)"),
    }
}

/// Copies a column from the matrix into `out` Vector3. Column index must be 0–2.
///
/// Column 0 → (a, b, 0); column 1 → (c, d, 0); column 2 → (tx, ty, 1).
///
/// # Panics
/// Panics if `column > 2`.
pub fn copy_matrix_column_to_vector3(out: &mut Vector3Like, column: usize, source: &MatrixLike) {
    match column {
        0 => {
            out.x = source.a;
            out.y = source.b;
            out.z = 0.0;
        }
        1 => {
            out.x = source.c;
            out.y = source.d;
            out.z = 0.0;
        }
        2 => {
            out.x = source.tx;
            out.y = source.ty;
            out.z = 1.0;
        }
        _ => panic!("Column {column} out of bounds (2)"),
    }
}

/// Copies a row from a Vector3 into the matrix. Row 2 is ignored (3×2 matrix).
///
/// Row 0 → (a, c, tx); row 1 → (b, d, ty).
///
/// # Panics
/// Panics if `row > 2`.
pub fn copy_matrix_row_from_vector3(out: &mut MatrixLike, row: usize, source: &Vector3Like) {
    match row {
        0 => {
            out.a = source.x;
            out.c = source.y;
            out.tx = source.z;
        }
        1 => {
            out.b = source.x;
            out.d = source.y;
            out.ty = source.z;
        }
        2 => {}
        _ => panic!("Row {row} out of bounds (2)"),
    }
}

/// Copies a row from the matrix into a Vector3. Row 2 uses identity values.
///
/// Row 0 → (a, c, tx); row 1 → (b, d, ty); row 2 → (0, 0, 1).
///
/// # Panics
/// Panics if `row > 2`.
pub fn copy_matrix_row_to_vector3(out: &mut Vector3Like, row: usize, source: &MatrixLike) {
    match row {
        0 => {
            out.x = source.a;
            out.y = source.c;
            out.z = source.tx;
        }
        1 => {
            out.x = source.b;
            out.y = source.d;
            out.z = source.ty;
        }
        2 => {
            out.x = 0.0;
            out.y = 0.0;
            out.z = 1.0;
        }
        _ => panic!("Row {row} out of bounds (2)"),
    }
}

/// Creates a gradient transform matrix used by gradient fill/stroke helpers.
pub fn create_gradient_transform_matrix(
    width: f32,
    height: f32,
    rotation: f32,
    tx: f32,
    ty: f32,
) -> Matrix {
    let mut out = MatrixLike::default();
    set_gradient_transform_matrix(&mut out, width, height, rotation, tx, ty);
    Matrix {
        a: out.a,
        b: out.b,
        c: out.c,
        d: out.d,
        tx: out.tx,
        ty: out.ty,
    }
}

/// Creates a new 2D affine [`Matrix`]. Defaults to identity (`a=1, b=0, c=0, d=1, tx=0, ty=0`).
pub fn create_matrix(a: f32, b: f32, c: f32, d: f32, tx: f32, ty: f32) -> Matrix {
    Matrix { a, b, c, d, tx, ty }
}

/// Creates a transform matrix from scale, optional rotation, and optional translation.
pub fn create_transform_matrix(
    scale_x: f32,
    scale_y: f32,
    rotation: f32,
    tx: f32,
    ty: f32,
) -> Matrix {
    let mut out = MatrixLike::default();
    set_transform_matrix(&mut out, scale_x, scale_y, rotation, tx, ty);
    Matrix {
        a: out.a,
        b: out.b,
        c: out.c,
        d: out.d,
        tx: out.tx,
        ty: out.ty,
    }
}

/// Returns `true` if `a` and `b` are equal. If `compare_translation` is false, ignores `tx`/`ty`.
pub fn equals_matrix(a: &MatrixLike, b: &MatrixLike, compare_translation: bool) -> bool {
    if a.a != b.a || a.b != b.b || a.c != b.c || a.d != b.d {
        return false;
    }
    if compare_translation && (a.tx != b.tx || a.ty != b.ty) {
        return false;
    }
    true
}

/// Computes the inverse of a 2D affine matrix and writes it to `out`.
///
/// If the determinant is zero the linear part is zeroed and the translation
/// is negated (degenerate behaviour matching the TS implementation).
/// Safe when `out` aliases `source`.
pub fn inverse_matrix(out: &mut MatrixLike, source: &MatrixLike) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let tx = source.tx;
    let ty = source.ty;
    let det = a * d - c * b;
    if det == 0.0 {
        out.a = 0.0;
        out.b = 0.0;
        out.c = 0.0;
        out.d = 0.0;
        out.tx = -tx;
        out.ty = -ty;
    } else {
        let inv = 1.0 / det;
        let out_a = d * inv;
        let out_b = -b * inv;
        let out_c = -c * inv;
        let out_d = a * inv;
        out.a = out_a;
        out.b = out_b;
        out.c = out_c;
        out.d = out_d;
        out.tx = -(out_a * tx + out_b * ty);
        out.ty = -(out_c * tx + out_d * ty);
    }
}

/// Transforms a point using the inverse of the matrix (including translation).
///
/// Safe when `out` aliases `matrix` fields indirectly (reads all inputs first).
pub fn inverse_matrix_transform_point(
    out: &mut Vector2Like,
    matrix: &MatrixLike,
    point: &Vector2Like,
) {
    inverse_matrix_transform_point_xy(out, matrix, point.x, point.y);
}

/// Transforms `(x, y)` using the inverse of `source` including translation.
///
/// Safe when `out` is a separate allocation.
pub fn inverse_matrix_transform_point_xy(
    out: &mut Vector2Like,
    source: &MatrixLike,
    x: f32,
    y: f32,
) {
    let norm = source.a * source.d - source.b * source.c;
    if norm == 0.0 {
        out.x = -source.tx;
        out.y = -source.ty;
    } else {
        let inv = 1.0 / norm;
        let px = inv * (source.c * (source.ty - y) + source.d * (x - source.tx));
        let py = inv * (source.a * (y - source.ty) + source.b * (source.tx - x));
        out.x = px;
        out.y = py;
    }
}

/// Transforms a vector using the inverse of the matrix (excluding translation).
pub fn inverse_matrix_transform_vector(
    out: &mut Vector2Like,
    matrix: &MatrixLike,
    vector: &Vector2Like,
) {
    inverse_matrix_transform_vector_xy(out, matrix, vector.x, vector.y);
}

/// Transforms `(x, y)` using the inverse of `source`, excluding translation.
pub fn inverse_matrix_transform_vector_xy(
    out: &mut Vector2Like,
    source: &MatrixLike,
    x: f32,
    y: f32,
) {
    let norm = source.a * source.d - source.b * source.c;
    if norm == 0.0 {
        out.x = 0.0;
        out.y = 0.0;
    } else {
        let inv = 1.0 / norm;
        let px = inv * (source.d * x - source.c * y);
        let py = inv * (-source.b * x + source.a * y);
        out.x = px;
        out.y = py;
    }
}

/// Transforms an AABB defined by two opposite corners into world-space AABB.
///
/// The input corners may be in any order.
pub fn matrix_transform_bounds(
    out: &mut RectangleLike,
    source: &MatrixLike,
    ax: f32,
    ay: f32,
    bx: f32,
    by: f32,
) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;

    if ax == bx && ay == by {
        out.x = source.tx;
        out.y = source.ty;
        out.width = 0.0;
        out.height = 0.0;
        return;
    }

    let mut tx0 = a * ax + c * ay;
    let mut tx1 = tx0;
    let mut ty0 = b * ax + d * ay;
    let mut ty1 = ty0;

    let tx = a * bx + c * ay;
    let ty = b * bx + d * ay;
    if tx < tx0 {
        tx0 = tx;
    }
    if ty < ty0 {
        ty0 = ty;
    }
    if tx > tx1 {
        tx1 = tx;
    }
    if ty > ty1 {
        ty1 = ty;
    }

    let tx = a * bx + c * by;
    let ty = b * bx + d * by;
    if tx < tx0 {
        tx0 = tx;
    }
    if ty < ty0 {
        ty0 = ty;
    }
    if tx > tx1 {
        tx1 = tx;
    }
    if ty > ty1 {
        ty1 = ty;
    }

    let tx = a * ax + c * by;
    let ty = b * ax + d * by;
    if tx < tx0 {
        tx0 = tx;
    }
    if ty < ty0 {
        ty0 = ty;
    }
    if tx > tx1 {
        tx1 = tx;
    }
    if ty > ty1 {
        ty1 = ty;
    }

    out.x = tx0 + source.tx;
    out.y = ty0 + source.ty;
    out.width = tx1 - tx0;
    out.height = ty1 - ty0;
}

/// Transforms an AABB given as two [`Vector2Like`] corners.
pub fn matrix_transform_bounds_vector2(
    out: &mut RectangleLike,
    matrix: &MatrixLike,
    a: &Vector2Like,
    b: &Vector2Like,
) {
    matrix_transform_bounds(out, matrix, a.x, a.y, b.x, b.y);
}

/// Transforms a point (including translation).
pub fn matrix_transform_point(out: &mut Vector2Like, matrix: &MatrixLike, point: &Vector2Like) {
    matrix_transform_point_xy(out, matrix, point.x, point.y);
}

/// Transforms `(x, y)` including translation.
///
/// Safe when `out` aliases elements of `source` — reads all inputs first.
pub fn matrix_transform_point_xy(out: &mut Vector2Like, source: &MatrixLike, x: f32, y: f32) {
    let rx = x * source.a + y * source.c + source.tx;
    let ry = x * source.b + y * source.d + source.ty;
    out.x = rx;
    out.y = ry;
}

/// Transforms a rectangle — applies the matrix to all four corners and returns
/// the axis-aligned bounding box.
pub fn matrix_transform_rectangle(
    out: &mut RectangleLike,
    matrix: &MatrixLike,
    source: &RectangleLike,
) {
    matrix_transform_bounds(
        out,
        matrix,
        source.x,
        source.y,
        source.x + source.width,
        source.y + source.height,
    );
}

/// Transforms a vector (excluding translation).
pub fn matrix_transform_vector(out: &mut Vector2Like, matrix: &MatrixLike, vector: &Vector2Like) {
    matrix_transform_vector_xy(out, matrix, vector.x, vector.y);
}

/// Transforms `(x, y)` excluding translation.
pub fn matrix_transform_vector_xy(out: &mut Vector2Like, source: &MatrixLike, x: f32, y: f32) {
    let rx = x * source.a + y * source.c;
    let ry = x * source.b + y * source.d;
    out.x = rx;
    out.y = ry;
}

/// Multiplies `a × b` and writes the result into `out`.
///
/// Safe when `out` aliases `a` or `b`.
pub fn multiply_matrix(out: &mut MatrixLike, a: &MatrixLike, b: &MatrixLike) {
    let a1 = a.a;
    let b1 = a.b;
    let tx1 = a.tx;
    let c1 = a.c;
    let d1 = a.d;
    let ty1 = a.ty;
    let a2 = b.a;
    let b2 = b.b;
    let tx2 = b.tx;
    let c2 = b.c;
    let d2 = b.d;
    let ty2 = b.ty;

    out.a = a1 * a2 + c1 * b2;
    out.b = b1 * a2 + d1 * b2;
    out.tx = a1 * tx2 + c1 * ty2 + tx1;
    out.c = a1 * c2 + c1 * d2;
    out.d = b1 * c2 + d1 * d2;
    out.ty = b1 * tx2 + d1 * ty2 + ty1;
}

/// Applies a rotation by `theta` radians to `source` and writes into `out`.
///
/// Safe when `out` aliases `source`.
pub fn rotate_matrix(out: &mut MatrixLike, source: &MatrixLike, theta: f32) {
    let cos = theta.cos();
    let sin = theta.sin();

    let a1 = source.a * cos - source.b * sin;
    let b1 = source.a * sin + source.b * cos;
    let c1 = source.c * cos - source.d * sin;
    let d1 = source.c * sin + source.d * cos;
    let tx1 = source.tx * cos - source.ty * sin;
    let ty1 = source.tx * sin + source.ty * cos;

    out.a = a1;
    out.b = b1;
    out.c = c1;
    out.d = d1;
    out.tx = tx1;
    out.ty = ty1;
}

/// Scales `source` by `(sx, sy)` and writes into `out`.
///
/// Safe when `out` aliases `source`.
pub fn scale_matrix(out: &mut MatrixLike, source: &MatrixLike, sx: f32, sy: f32) {
    out.a = source.a * sx;
    out.b = source.b * sy;
    out.c = source.c * sx;
    out.d = source.d * sy;
    out.tx = source.tx * sx;
    out.ty = source.ty * sy;
}

/// Sets a gradient transform matrix for use with gradient fill/stroke helpers.
pub fn set_gradient_transform_matrix(
    out: &mut MatrixLike,
    width: f32,
    height: f32,
    rotation: f32,
    tx: f32,
    ty: f32,
) {
    out.a = width / 1638.4;
    out.d = height / 1638.4;

    if rotation != 0.0 {
        let cos = rotation.cos();
        let sin = rotation.sin();
        out.b = sin * out.d;
        out.c = -sin * out.a;
        out.a *= cos;
        out.d *= cos;
    } else {
        out.b = 0.0;
        out.c = 0.0;
    }

    out.tx = tx + width / 2.0;
    out.ty = ty + height / 2.0;
}

/// Sets all six components of `out`.
pub fn set_matrix(out: &mut MatrixLike, a: f32, b: f32, c: f32, d: f32, tx: f32, ty: f32) {
    out.a = a;
    out.b = b;
    out.c = c;
    out.d = d;
    out.tx = tx;
    out.ty = ty;
}

/// Reads six consecutive floats from `source` starting at `offset` into `out`.
///
/// Order: `[a, b, c, d, tx, ty]`.
pub fn set_matrix_from_f32_slice(out: &mut MatrixLike, offset: usize, source: &[f32]) {
    out.a = source[offset];
    out.b = source[offset + 1];
    out.c = source[offset + 2];
    out.d = source[offset + 3];
    out.tx = source[offset + 4];
    out.ty = source[offset + 5];
}

/// Sets `out` from a `Matrix3Like` (row-major 3×3, affine assumed).
///
/// Mapping: `a=m[0], b=m[1], c=m[3], d=m[4], tx=m[2], ty=m[5]`.
pub fn set_matrix_from_matrix3(out: &mut MatrixLike, source: &Matrix3Like) {
    let m = &source.m;
    set_matrix(out, m[0], m[1], m[3], m[4], m[2], m[5]);
}

/// Sets `out` from the upper-left 2×2 and first column of translation of a [`Matrix4Like`].
pub fn set_matrix_from_matrix4(out: &mut MatrixLike, source: &Matrix4Like) {
    let s = &source.m;
    out.a = s[0];
    out.b = s[4];
    out.tx = s[12];
    out.c = s[1];
    out.d = s[5];
    out.ty = s[13];
}

/// Resets `out` to the identity matrix (`a=1, b=0, c=0, d=1, tx=0, ty=0`).
pub fn set_matrix_identity(out: &mut MatrixLike) {
    set_matrix(out, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
}

/// Sets a combined scale+rotation+translation transform, equivalent to
/// identity → rotate → scale → translate applied in succession.
pub fn set_transform_matrix(
    out: &mut MatrixLike,
    scale_x: f32,
    scale_y: f32,
    rotation: f32,
    tx: f32,
    ty: f32,
) {
    if rotation != 0.0 {
        let cos = rotation.cos();
        let sin = rotation.sin();
        out.a = cos * scale_x;
        out.b = sin * scale_y;
        out.c = -sin * scale_x;
        out.d = cos * scale_y;
    } else {
        out.a = scale_x;
        out.b = 0.0;
        out.c = 0.0;
        out.d = scale_y;
    }
    out.tx = tx;
    out.ty = ty;
}

/// Translates `source` by `(dx, dy)` and writes into `out`.
///
/// Only modifies `tx` and `ty`; all other fields are copied from `source`.
/// Safe when `out` aliases `source`.
pub fn translate_matrix(out: &mut MatrixLike, source: &MatrixLike, dx: f32, dy: f32) {
    out.a = source.a;
    out.b = source.b;
    out.c = source.c;
    out.d = source.d;
    out.tx = source.tx + dx;
    out.ty = source.ty + dy;
}

/// Translates `source` by transforming `vector` through the linear part and
/// adding the result to the translation.
pub fn translate_matrix_by_vector(out: &mut MatrixLike, matrix: &MatrixLike, vector: &Vector2Like) {
    translate_matrix_by_vector_xy(out, matrix, vector.x, vector.y);
}

/// Translates `source` by transforming `(x, y)` through the linear part.
pub fn translate_matrix_by_vector_xy(out: &mut MatrixLike, source: &MatrixLike, x: f32, y: f32) {
    // Copy linear part first (safe for aliased out == source)
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let tx = source.tx + a * x + c * y;
    let ty = source.ty + b * x + d * y;
    out.a = a;
    out.b = b;
    out.c = c;
    out.d = d;
    out.tx = tx;
    out.ty = ty;
}

/// Writes the matrix into six consecutive floats in `out` starting at `offset`.
///
/// Order: `[a, b, c, d, tx, ty]`.
pub fn write_matrix_to_f32_slice(out: &mut [f32], offset: usize, source: &MatrixLike) {
    out[offset] = source.a;
    out[offset + 1] = source.b;
    out[offset + 2] = source.c;
    out[offset + 3] = source.d;
    out[offset + 4] = source.tx;
    out[offset + 5] = source.ty;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn identity() -> MatrixLike {
        MatrixLike {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 0.0,
            ty: 0.0,
        }
    }

    fn mat(a: f32, b: f32, c: f32, d: f32, tx: f32, ty: f32) -> MatrixLike {
        MatrixLike { a, b, c, d, tx, ty }
    }

    fn v2(x: f32, y: f32) -> Vector2Like {
        Vector2Like { x, y }
    }

    fn rect(x: f32, y: f32, w: f32, h: f32) -> RectangleLike {
        RectangleLike {
            x,
            y,
            width: w,
            height: h,
        }
    }

    // clone_matrix
    #[test]
    fn clone_matrix_produces_copy() {
        let src = mat(2.0, 0.0, 0.0, 3.0, 4.0, 5.0);
        let c = clone_matrix(&src);
        assert_eq!((c.a, c.d, c.tx, c.ty), (2.0, 3.0, 4.0, 5.0));
    }

    // copy_matrix
    #[test]
    fn copy_matrix_copies_all_fields() {
        let src = mat(2.0, 1.0, 0.5, 3.0, 4.0, 5.0);
        let mut out = identity();
        copy_matrix(&mut out, &src);
        assert_eq!(
            (out.a, out.b, out.c, out.d, out.tx, out.ty),
            (2.0, 1.0, 0.5, 3.0, 4.0, 5.0)
        );
    }

    // copy_matrix_column_from_vector3
    #[test]
    fn copy_matrix_column_from_vector3_col0() {
        let mut out = identity();
        let v = Vector3Like {
            x: 2.0,
            y: 3.0,
            z: 0.0,
        };
        copy_matrix_column_from_vector3(&mut out, 0, &v);
        assert_eq!(out.a, 2.0);
        assert_eq!(out.b, 3.0);
    }

    // copy_matrix_column_to_vector3
    #[test]
    fn copy_matrix_column_to_vector3_col2() {
        let src = mat(1.0, 0.0, 0.0, 1.0, 7.0, 8.0);
        let mut out = Vector3Like {
            x: 0.0,
            y: 0.0,
            z: 0.0,
        };
        copy_matrix_column_to_vector3(&mut out, 2, &src);
        assert_eq!((out.x, out.y, out.z), (7.0, 8.0, 1.0));
    }

    // copy_matrix_row_from_vector3
    #[test]
    fn copy_matrix_row_from_vector3_row0() {
        let mut out = identity();
        let v = Vector3Like {
            x: 2.0,
            y: 3.0,
            z: 4.0,
        };
        copy_matrix_row_from_vector3(&mut out, 0, &v);
        assert_eq!((out.a, out.c, out.tx), (2.0, 3.0, 4.0));
    }

    // copy_matrix_row_to_vector3
    #[test]
    fn copy_matrix_row_to_vector3_row2_identity() {
        let src = mat(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut out = Vector3Like {
            x: 0.0,
            y: 0.0,
            z: 0.0,
        };
        copy_matrix_row_to_vector3(&mut out, 2, &src);
        assert_eq!((out.x, out.y, out.z), (0.0, 0.0, 1.0));
    }

    // create_matrix
    #[test]
    fn create_matrix_stores_values() {
        let m = create_matrix(2.0, 0.5, 1.0, 3.0, 4.0, 5.0);
        assert_eq!(
            (m.a, m.b, m.c, m.d, m.tx, m.ty),
            (2.0, 0.5, 1.0, 3.0, 4.0, 5.0)
        );
    }

    // equals_matrix
    #[test]
    fn equals_matrix_identical() {
        let a = mat(1.0, 0.0, 0.0, 1.0, 2.0, 3.0);
        let b = mat(1.0, 0.0, 0.0, 1.0, 2.0, 3.0);
        assert!(equals_matrix(&a, &b, true));
    }

    #[test]
    fn equals_matrix_ignore_translation() {
        let a = mat(1.0, 0.0, 0.0, 1.0, 2.0, 3.0);
        let b = mat(1.0, 0.0, 0.0, 1.0, 99.0, 99.0);
        assert!(equals_matrix(&a, &b, false));
        assert!(!equals_matrix(&a, &b, true));
    }

    // inverse_matrix
    #[test]
    fn inverse_matrix_identity_is_identity() {
        let mut out = mat(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        inverse_matrix(&mut out, &identity());
        assert!((out.a - 1.0).abs() < 1e-6);
        assert!((out.d - 1.0).abs() < 1e-6);
        assert!(out.tx.abs() < 1e-6);
    }

    #[test]
    fn inverse_matrix_aliased() {
        let src = mat(2.0, 0.0, 0.0, 2.0, 4.0, 6.0);
        let mut out = src;
        inverse_matrix(&mut out, &src);
        assert!((out.a - 0.5).abs() < 1e-6);
    }

    // inverse_matrix_transform_point_xy
    #[test]
    fn inverse_matrix_transform_point_xy_roundtrip() {
        let m = mat(2.0, 0.0, 0.0, 2.0, 10.0, 10.0);
        let mut fwd = v2(0.0, 0.0);
        matrix_transform_point_xy(&mut fwd, &m, 1.0, 2.0);
        let mut back = v2(0.0, 0.0);
        inverse_matrix_transform_point_xy(&mut back, &m, fwd.x, fwd.y);
        assert!((back.x - 1.0).abs() < 1e-5);
        assert!((back.y - 2.0).abs() < 1e-5);
    }

    // matrix_transform_bounds
    #[test]
    fn matrix_transform_bounds_identity_preserves() {
        let mut out = rect(0.0, 0.0, 0.0, 0.0);
        matrix_transform_bounds(&mut out, &identity(), 0.0, 0.0, 4.0, 3.0);
        assert_eq!((out.x, out.y, out.width, out.height), (0.0, 0.0, 4.0, 3.0));
    }

    #[test]
    fn matrix_transform_bounds_empty_stays_at_translation() {
        let m = mat(1.0, 0.0, 0.0, 1.0, 5.0, 7.0);
        let mut out = rect(0.0, 0.0, 0.0, 0.0);
        matrix_transform_bounds(&mut out, &m, 2.0, 2.0, 2.0, 2.0);
        assert_eq!((out.x, out.y, out.width, out.height), (5.0, 7.0, 0.0, 0.0));
    }

    // matrix_transform_point_xy
    #[test]
    fn matrix_transform_point_xy_translate() {
        let m = mat(1.0, 0.0, 0.0, 1.0, 3.0, 4.0);
        let mut out = v2(0.0, 0.0);
        matrix_transform_point_xy(&mut out, &m, 1.0, 1.0);
        assert_eq!((out.x, out.y), (4.0, 5.0));
    }

    #[test]
    fn matrix_transform_point_xy_scale() {
        let m = mat(2.0, 0.0, 0.0, 3.0, 0.0, 0.0);
        let mut out = v2(0.0, 0.0);
        matrix_transform_point_xy(&mut out, &m, 4.0, 5.0);
        assert_eq!((out.x, out.y), (8.0, 15.0));
    }

    // matrix_transform_vector_xy
    #[test]
    fn matrix_transform_vector_xy_ignores_translation() {
        let m = mat(2.0, 0.0, 0.0, 2.0, 99.0, 99.0);
        let mut out = v2(0.0, 0.0);
        matrix_transform_vector_xy(&mut out, &m, 1.0, 1.0);
        assert_eq!((out.x, out.y), (2.0, 2.0));
    }

    // multiply_matrix
    #[test]
    fn multiply_matrix_identity_times_translate() {
        let t = mat(1.0, 0.0, 0.0, 1.0, 3.0, 4.0);
        let mut out = identity();
        multiply_matrix(&mut out, &identity(), &t);
        assert_eq!((out.tx, out.ty), (3.0, 4.0));
    }

    #[test]
    fn multiply_matrix_aliased() {
        let a = mat(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let b = mat(3.0, 0.0, 0.0, 3.0, 0.0, 0.0);
        let mut out = a;
        multiply_matrix(&mut out, &a, &b);
        assert_eq!(out.a, 6.0);
    }

    // rotate_matrix
    #[test]
    fn rotate_matrix_pi_halves() {
        let mut out = mat(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        rotate_matrix(&mut out, &identity(), std::f32::consts::FRAC_PI_2);
        assert!((out.a).abs() < 1e-6);
        assert!((out.b - 1.0).abs() < 1e-6);
    }

    // scale_matrix
    #[test]
    fn scale_matrix_scales_components() {
        let mut out = mat(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        scale_matrix(&mut out, &identity(), 2.0, 3.0);
        assert_eq!((out.a, out.d), (2.0, 3.0));
    }

    // set_matrix_identity
    #[test]
    fn set_matrix_identity_resets() {
        let mut out = mat(5.0, 5.0, 5.0, 5.0, 5.0, 5.0);
        set_matrix_identity(&mut out);
        assert_eq!(
            (out.a, out.b, out.c, out.d, out.tx, out.ty),
            (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
        );
    }

    // set_transform_matrix
    #[test]
    fn set_transform_matrix_no_rotation() {
        let mut out = identity();
        set_transform_matrix(&mut out, 2.0, 3.0, 0.0, 5.0, 6.0);
        assert_eq!((out.a, out.d, out.tx, out.ty), (2.0, 3.0, 5.0, 6.0));
    }

    // translate_matrix
    #[test]
    fn translate_matrix_shifts_translation() {
        let src = mat(1.0, 0.0, 0.0, 1.0, 1.0, 2.0);
        let mut out = identity();
        translate_matrix(&mut out, &src, 3.0, 4.0);
        assert_eq!((out.tx, out.ty), (4.0, 6.0));
    }

    // write_matrix_to_f32_slice
    #[test]
    fn write_matrix_to_f32_slice_correct_order() {
        let src = mat(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        let mut data = [0.0f32; 8];
        write_matrix_to_f32_slice(&mut data, 1, &src);
        assert_eq!(&data[1..7], &[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    }

    // set_matrix_from_f32_slice
    #[test]
    fn set_matrix_from_f32_slice_reads_offset() {
        let data = [0.0f32, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let mut out = identity();
        set_matrix_from_f32_slice(&mut out, 1, &data);
        assert_eq!(
            (out.a, out.b, out.c, out.d, out.tx, out.ty),
            (1.0, 2.0, 3.0, 4.0, 5.0, 6.0)
        );
    }

    // create_gradient_transform_matrix
    #[test]
    fn create_gradient_transform_matrix_equivalent_to_set() {
        let m1 = create_gradient_transform_matrix(100.0, 200.0, 0.0, 0.0, 0.0);
        let mut m2 = identity();
        set_gradient_transform_matrix(&mut m2, 100.0, 200.0, 0.0, 0.0, 0.0);
        let m1_like = mat(m1.a, m1.b, m1.c, m1.d, m1.tx, m1.ty);
        assert!(equals_matrix(&m1_like, &m2, true));
    }

    #[test]
    fn create_gradient_transform_matrix_offsets_translation() {
        let m = create_gradient_transform_matrix(100.0, 200.0, 0.0, 10.0, 20.0);
        assert!((m.tx - 60.0).abs() < 1e-4);
        assert!((m.ty - 120.0).abs() < 1e-4);
    }

    // create_transform_matrix
    #[test]
    fn create_transform_matrix_equivalent_to_set() {
        let m1 = create_transform_matrix(2.0, 4.0, 45.0_f32.to_radians(), 10.0, 100.0);
        let mut m2 = identity();
        set_transform_matrix(&mut m2, 2.0, 4.0, 45.0_f32.to_radians(), 10.0, 100.0);
        let m1_like = mat(m1.a, m1.b, m1.c, m1.d, m1.tx, m1.ty);
        assert!(equals_matrix(&m1_like, &m2, true));
    }

    // inverse_matrix_transform_vector
    #[test]
    fn inverse_matrix_transform_vector_applies_inverse() {
        let m = mat(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let p = v2(2.0, 2.0);
        let mut out = v2(0.0, 0.0);
        inverse_matrix_transform_vector(&mut out, &m, &p);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 1.0);
    }

    #[test]
    fn inverse_matrix_transform_vector_does_not_modify_input() {
        let m = mat(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let p = v2(2.0, 2.0);
        let mut out = v2(0.0, 0.0);
        inverse_matrix_transform_vector(&mut out, &m, &p);
        assert_eq!(p.x, 2.0);
        assert_eq!(p.y, 2.0);
    }

    #[test]
    fn inverse_matrix_transform_vector_supports_out_alias() {
        // Translation is excluded by this function (direction transform).
        let m = mat(2.0, 0.0, 0.0, 4.0, 10.0, 20.0);
        let mut p = v2(2.0, 8.0);
        let snapshot = p;
        inverse_matrix_transform_vector(&mut p, &m, &snapshot);
        assert_eq!(p.x, 1.0);
        assert_eq!(p.y, 2.0);
    }

    // inverse_matrix_transform_vector_xy
    #[test]
    fn inverse_matrix_transform_vector_xy_applies_inverse() {
        let m = mat(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let mut out = v2(0.0, 0.0);
        inverse_matrix_transform_vector_xy(&mut out, &m, 2.0, 2.0);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 1.0);
    }

    #[test]
    fn inverse_matrix_transform_vector_xy_handles_singular_matrix() {
        let m = mat(1.0, 2.0, 2.0, 4.0, 10.0, 20.0); // determinant = 0
        let mut out = v2(0.0, 0.0);
        inverse_matrix_transform_vector_xy(&mut out, &m, 5.0, 5.0);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    // set_gradient_transform_matrix
    #[test]
    fn set_gradient_transform_matrix_sets_scale() {
        let mut m = identity();
        set_gradient_transform_matrix(&mut m, 1638.4, 1638.4, 0.0, 0.0, 0.0);
        assert!((m.a - 1.0).abs() < 1e-4);
        assert!((m.d - 1.0).abs() < 1e-4);
    }

    #[test]
    fn set_gradient_transform_matrix_offsets_translation() {
        let mut m = identity();
        set_gradient_transform_matrix(&mut m, 200.0, 400.0, 0.0, 0.0, 0.0);
        assert!((m.tx - 100.0).abs() < 1e-4);
        assert!((m.ty - 200.0).abs() < 1e-4);
    }

    #[test]
    fn set_gradient_transform_matrix_applies_rotation() {
        let mut m = identity();
        set_gradient_transform_matrix(
            &mut m,
            1638.4,
            1638.4,
            std::f32::consts::FRAC_PI_2,
            0.0,
            0.0,
        );
        assert!((m.b - 1.0).abs() < 1e-4);
        assert!((m.c + 1.0).abs() < 1e-4);
    }

    // set_matrix_from_matrix3
    #[test]
    fn set_matrix_from_matrix3_copies_first_six_values() {
        let mat3 = flighthq_types::Matrix3Like {
            m: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0],
        };
        let mut out = identity();
        set_matrix_from_matrix3(&mut out, &mat3);
        assert_eq!(out.a, 1.0);
        assert_eq!(out.b, 2.0);
        assert_eq!(out.tx, 3.0);
        assert_eq!(out.c, 4.0);
        assert_eq!(out.d, 5.0);
        assert_eq!(out.ty, 6.0);
    }

    #[test]
    fn set_matrix_from_matrix3_does_not_modify_source() {
        let mat3 = flighthq_types::Matrix3Like {
            m: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0],
        };
        let original = mat3.m;
        let mut out = identity();
        set_matrix_from_matrix3(&mut out, &mat3);
        assert_eq!(mat3.m, original);
    }

    // set_matrix_from_matrix4
    #[test]
    fn set_matrix_from_matrix4_copies_affine_part() {
        let mat4 = flighthq_types::Matrix4Like {
            m: [
                1.0, 4.0, 0.0, 0.0, 2.0, 5.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 3.0, 6.0, 0.0, 1.0,
            ],
        };
        let mut out = identity();
        set_matrix_from_matrix4(&mut out, &mat4);
        assert_eq!(out.a, 1.0);
        assert_eq!(out.b, 2.0);
        assert_eq!(out.tx, 3.0);
        assert_eq!(out.c, 4.0);
        assert_eq!(out.d, 5.0);
        assert_eq!(out.ty, 6.0);
    }

    // translate_matrix_by_vector
    #[test]
    fn translate_matrix_by_vector_transforms_offset() {
        let m = mat(2.0, 0.0, 0.0, 2.0, 5.0, 10.0);
        let mut out = identity();
        translate_matrix_by_vector(&mut out, &m, &v2(3.0, 4.0));
        assert!((out.tx - 11.0).abs() < 1e-4);
        assert!((out.ty - 18.0).abs() < 1e-4);
    }

    // translate_matrix_by_vector_xy
    #[test]
    fn translate_matrix_by_vector_xy_transforms_offset() {
        let m = mat(2.0, 0.0, 0.0, 2.0, 5.0, 10.0);
        let mut out = identity();
        translate_matrix_by_vector_xy(&mut out, &m, 3.0, 4.0);
        assert!((out.tx - 11.0).abs() < 1e-4);
        assert!((out.ty - 18.0).abs() < 1e-4);
    }

    #[test]
    fn translate_matrix_by_vector_xy_supports_out_alias() {
        let mut m = mat(1.0, 0.0, 0.0, 1.0, 5.0, 10.0);
        let snapshot = m;
        translate_matrix_by_vector_xy(&mut m, &snapshot, 2.0, 3.0);
        assert!((m.tx - 7.0).abs() < 1e-4);
        assert!((m.ty - 13.0).abs() < 1e-4);
    }

    // set_matrix_from_float32_array (TS reserveFloat32Array -> set_matrix_from_f32_slice)
    #[test]
    fn set_matrix_from_float32_array_writes_six_values() {
        let array = [0.0f32, 1.0, 2.0, 3.0, 4.0, 5.0];
        let mut out = identity();
        set_matrix_from_f32_slice(&mut out, 0, &array);
        assert_eq!(out.a, 0.0);
        assert_eq!(out.b, 1.0);
        assert_eq!(out.c, 2.0);
        assert_eq!(out.d, 3.0);
        assert_eq!(out.tx, 4.0);
        assert_eq!(out.ty, 5.0);
    }

    // write_matrix_to_float32_array (TS writeMatrixToFloat32Array -> write_matrix_to_f32_slice)
    #[test]
    fn write_matrix_to_float32_array_writes_six_values() {
        let m = mat(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        let mut array = [0.0f32; 6];
        write_matrix_to_f32_slice(&mut array, 0, &m);
        for i in 0..6 {
            assert_eq!(array[i], (i + 1) as f32);
        }
    }

    // matrix_transform_bounds_vector2
    #[test]
    fn matrix_transform_bounds_vector2_identity() {
        let m = identity();
        let mut out = rect(0.0, 0.0, 0.0, 0.0);
        matrix_transform_bounds_vector2(&mut out, &m, &v2(10.0, 10.0), &v2(0.0, 0.0));
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 10.0);
        assert_eq!(out.height, 10.0);
    }

    #[test]
    fn matrix_transform_bounds_vector2_supports_out_alias() {
        let m = mat(2.0, 0.0, 0.0, 3.0, 5.0, 7.0);
        let mut out = rect(0.0, 0.0, 0.0, 0.0);
        let b = v2(10.0, 20.0);
        let a = Vector2Like { x: out.x, y: out.y };
        matrix_transform_bounds_vector2(&mut out, &m, &a, &b);
        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, 7.0);
        assert_eq!(out.width, 20.0);
        assert_eq!(out.height, 60.0);
    }

    // matrix_transform_rectangle
    #[test]
    fn matrix_transform_rectangle_identity_unchanged() {
        let r = rect(0.0, 0.0, 10.0, 20.0);
        let m = identity();
        let mut out = rect(0.0, 0.0, 0.0, 0.0);
        matrix_transform_rectangle(&mut out, &m, &r);
        assert!((out.x - 0.0).abs() < 1e-4);
        assert!((out.y - 0.0).abs() < 1e-4);
        assert!((out.width - 10.0).abs() < 1e-4);
        assert!((out.height - 20.0).abs() < 1e-4);
    }

    #[test]
    fn matrix_transform_rectangle_applies_scale() {
        let r = rect(0.0, 0.0, 10.0, 20.0);
        let m = mat(2.0, 0.0, 0.0, 3.0, 0.0, 0.0);
        let mut out = rect(0.0, 0.0, 0.0, 0.0);
        matrix_transform_rectangle(&mut out, &m, &r);
        assert!((out.width - 20.0).abs() < 1e-4);
        assert!((out.height - 60.0).abs() < 1e-4);
    }

    #[test]
    fn matrix_transform_rectangle_supports_out_alias() {
        let mut r = rect(0.0, 0.0, 10.0, 20.0);
        let m = mat(2.0, 0.0, 0.0, 3.0, 5.0, 7.0);
        let snapshot = r;
        matrix_transform_rectangle(&mut r, &m, &snapshot);
        assert!((r.x - 5.0).abs() < 1e-4);
        assert!((r.y - 7.0).abs() < 1e-4);
        assert!((r.width - 20.0).abs() < 1e-4);
        assert!((r.height - 60.0).abs() < 1e-4);
    }
}

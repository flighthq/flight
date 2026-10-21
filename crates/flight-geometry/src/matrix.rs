use flight_entity::Float32Array;
use crate::Matrix3;
use crate::Matrix4;
use crate::Rectangle;
use crate::Vector2;
use crate::Vector3;

/// A Matrix object represents two-dimensional coordinate space.
/// It is a 2x3 matrix, with a, b, c, d for a two-dimensional transform,
/// and tx, ty for translation.
///
/// [ a c tx ]
/// [ b d ty ]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Matrix {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub tx: f32,
    pub ty: f32,
}

pub fn create_gradient_transform_matrix(
    width: f32,
    height: f32,
    rotation: f32,
    tx: f32,
    ty: f32,
) -> Matrix {
    let mut out = Matrix::default();
    set_gradient_transform_matrix(&mut out, width, height, rotation, tx, ty);
    return out;
}

pub fn create_matrix(a: f32, b: f32, c: f32, d: f32, tx: f32, ty: f32) -> Matrix {
    let mut out = Matrix::default();
    initialize_matrix(&mut out, a, b, c, d, tx, ty);
    return out;
}

pub fn create_transform_matrix(
    scale_x: f32,
    scale_y: f32,
    rotation: f32,
    tx: f32,
    ty: f32,
) -> Matrix {
    let mut out = Matrix::default();
    set_transform_matrix(&mut out, scale_x, scale_y, rotation, tx, ty);
    return out;
}

pub fn initialize_matrix(out: &mut Matrix, a: f32, b: f32, c: f32, d: f32, tx: f32, ty: f32) {
    out.a = a;
    out.b = b;
    out.c = c;
    out.d = d;
    out.tx = tx;
    out.ty = ty;
}

pub fn clone_matrix(source: &Matrix) -> Matrix {
    return create_matrix(source.a, source.b, source.c, source.d, source.tx, source.ty);
}

pub fn copy_matrix(out: &mut Matrix, source: &Matrix) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let tx = source.tx;
    let ty = source.ty;
    set_matrix(out, a, b, c, d, tx, ty);
}

/// Copies a column from a vector. The z component will be ignored (3x2 matrix).
pub fn copy_matrix_column_from_vector3(out: &mut Matrix, column: i32, source: &Vector3) {
    let x = source.x;
    let y = source.y;
    match column {
        0 => {
            out.a = x;
            out.b = y;
        }
        1 => {
            out.c = x;
            out.d = y;
        }
        2 => {
            out.tx = x;
            out.ty = y;
        }
        _ => {}
    }
}

/// Copies a column to a vector. The z component will use identity values.
pub fn copy_matrix_column_to_vector3(out: &mut Vector3, column: i32, source: &Matrix) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let tx = source.tx;
    let ty = source.ty;
    match column {
        0 => {
            out.x = a;
            out.y = b;
            out.z = 0.0;
        }
        1 => {
            out.x = c;
            out.y = d;
            out.z = 0.0;
        }
        2 => {
            out.x = tx;
            out.y = ty;
            out.z = 1.0;
        }
        _ => {}
    }
}

/// Copies a row from a vector. The third row (row 2) will be ignored (3x2 matrix).
pub fn copy_matrix_row_from_vector3(out: &mut Matrix, row: i32, source: &Vector3) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    match row {
        0 => {
            out.a = x;
            out.c = y;
            out.tx = z;
        }
        1 => {
            out.b = x;
            out.d = y;
            out.ty = z;
        }
        2 => {}
        _ => {}
    }
}

/// Copies a row to a vector. The third row will use identity values (3x2 matrix).
pub fn copy_matrix_row_to_vector3(out: &mut Vector3, row: i32, source: &Matrix) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let tx = source.tx;
    let ty = source.ty;
    match row {
        0 => {
            out.x = a;
            out.y = c;
            out.z = tx;
        }
        1 => {
            out.x = b;
            out.y = d;
            out.z = ty;
        }
        2 => {
            out.x = 0.0;
            out.y = 0.0;
            out.z = 1.0;
        }
        _ => {}
    }
}

pub fn equals_matrix(
    a: Option<&Matrix>,
    b: Option<&Matrix>,
    compare_translation: bool,
) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => {
            if std::ptr::eq(a, b) {
                return true;
            }
            (!compare_translation || (a.tx == b.tx && a.ty == b.ty))
                && a.a == b.a
                && a.b == b.b
                && a.c == b.c
                && a.d == b.d
        }
        (None, None) => true,
        _ => false,
    };
}

/// Computes the inverse of a 2D affine matrix and writes it to out. Returns `true` on success.
/// When the matrix is singular (determinant zero, non-invertible) -- an expected failure -- writes a
/// documented degenerate fill (zeroed linear part, negated translation) and returns `false` as the
/// sentinel.
///
/// Translation (tx, ty) is applied after the linear transformation (scale/rotation/shear) is inverted.
pub fn inverse_matrix(out: &mut Matrix, source: &Matrix) -> bool {
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
        return false;
    }
    let inv_det = 1.0 / det;
    let out_a = d * inv_det;
    let out_b = -b * inv_det;
    let out_c = -c * inv_det;
    let out_d = a * inv_det;
    out.a = out_a;
    out.b = out_b;
    out.c = out_c;
    out.d = out_d;
    out.tx = -(out_a * tx + out_c * ty);
    out.ty = -(out_b * tx + out_d * ty);
    return true;
}

/// Use an inverse of the source matrix to transform
/// a given point, including translation.
pub fn inverse_matrix_transform_point(
    out: &mut Vector2,
    matrix: &Matrix,
    point: &Vector2,
) {
    let px = point.x;
    let py = point.y;
    inverse_matrix_transform_point_xy(out, matrix, px, py);
}

pub fn inverse_matrix_transform_point_xy(
    out: &mut Vector2,
    source: &Matrix,
    x: f32,
    y: f32,
) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let tx = source.tx;
    let ty = source.ty;
    let norm = a * d - b * c;
    if norm == 0.0 {
        out.x = -tx;
        out.y = -ty;
    } else {
        let px = (1.0 / norm) * (c * (ty - y) + d * (x - tx));
        out.y = (1.0 / norm) * (a * (y - ty) + b * (tx - x));
        out.x = px;
    }
}

/// Use an inverse of the source matrix to transform
/// a given point, excluding translation.
pub fn inverse_matrix_transform_vector(
    out: &mut Vector2,
    matrix: &Matrix,
    vector: &Vector2,
) {
    let vx = vector.x;
    let vy = vector.y;
    inverse_matrix_transform_vector_xy(out, matrix, vx, vy);
}

pub fn inverse_matrix_transform_vector_xy(
    out: &mut Vector2,
    source: &Matrix,
    x: f32,
    y: f32,
) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let norm = a * d - b * c;
    if norm == 0.0 {
        out.x = 0.0;
        out.y = 0.0;
    } else {
        let px = (1.0 / norm) * (d * x - c * y);
        out.y = (1.0 / norm) * (-b * x + a * y);
        out.x = px;
    }
}

/// Transforms an axis-aligned bounding box defined by two opposite corners
/// (ax, ay) and (bx, by) into a world-space axis-aligned bounding box.
///
/// The input points may be in any order (min/max not required).
///
/// This accounts for translation, rotation, scaling, and skew
/// from the source matrix.
pub fn matrix_transform_bounds(
    out: &mut Rectangle,
    source: &Matrix,
    ax: f32,
    ay: f32,
    bx: f32,
    by: f32,
) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let source_tx = source.tx;
    let source_ty = source.ty;

    if ax == bx && ay == by {
        out.x = source_tx;
        out.y = source_ty;
        out.width = 0.0;
        out.height = 0.0;
        return;
    }

    let mut tx0 = a * ax + c * ay;
    let mut tx1 = tx0;
    let mut ty0 = b * ax + d * ay;
    let mut ty1 = ty0;

    let mut txv = a * bx + c * ay;
    let mut tyv = b * bx + d * ay;

    if txv < tx0 { tx0 = txv; }
    if tyv < ty0 { ty0 = tyv; }
    if txv > tx1 { tx1 = txv; }
    if tyv > ty1 { ty1 = tyv; }

    txv = a * bx + c * by;
    tyv = b * bx + d * by;

    if txv < tx0 { tx0 = txv; }
    if tyv < ty0 { ty0 = tyv; }
    if txv > tx1 { tx1 = txv; }
    if tyv > ty1 { ty1 = tyv; }

    txv = a * ax + c * by;
    tyv = b * ax + d * by;

    if txv < tx0 { tx0 = txv; }
    if tyv < ty0 { ty0 = tyv; }
    if txv > tx1 { tx1 = txv; }
    if tyv > ty1 { ty1 = tyv; }

    out.x = tx0 + source_tx;
    out.y = ty0 + source_ty;
    out.width = tx1 - tx0;
    out.height = ty1 - ty0;
}

pub fn matrix_transform_bounds_vector2(
    out: &mut Rectangle,
    matrix: &Matrix,
    a: &Vector2,
    b: &Vector2,
) {
    let ax = a.x;
    let ay = a.y;
    let bx = b.x;
    let by = b.y;
    matrix_transform_bounds(out, matrix, ax, ay, bx, by);
}

/// Transforms a point using the given matrix.
pub fn matrix_transform_point(
    out: &mut Vector2,
    matrix: &Matrix,
    point: &Vector2,
) {
    let px = point.x;
    let py = point.y;
    matrix_transform_point_xy(out, matrix, px, py);
}

/// Transforms an (x, y) point using the given matrix.
pub fn matrix_transform_point_xy(out: &mut Vector2, source: &Matrix, x: f32, y: f32) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let tx = source.tx;
    let ty = source.ty;
    out.x = x * a + y * c + tx;
    out.y = x * b + y * d + ty;
}

/// Applies a point transform to each corner of a rectangle and updates it
/// to the axis-aligned bounding box of the transformed rectangle.
///
/// This accounts for translation, rotation, scaling, and skew
/// from the given matrix.
pub fn matrix_transform_rectangle(
    out: &mut Rectangle,
    matrix: &Matrix,
    source: &Rectangle,
) {
    let sx = source.x;
    let sy = source.y;
    let sw = source.width;
    let sh = source.height;
    matrix_transform_bounds(out, matrix, sx, sy, sx + sw, sy + sh);
}

/// Given a point in the pretransform coordinate space, returns the
/// coordinates of that point after the transformation occurs. Unlike the
/// standard transformation applied using the `matrix_transform_point()`
/// method, the `matrix_transform_vector()` method's transformation
/// does not consider the translation parameters `tx` and `ty`.
pub fn matrix_transform_vector(
    out: &mut Vector2,
    matrix: &Matrix,
    vector: &Vector2,
) {
    let vx = vector.x;
    let vy = vector.y;
    matrix_transform_vector_xy(out, matrix, vx, vy);
}

pub fn matrix_transform_vector_xy(out: &mut Vector2, source: &Matrix, x: f32, y: f32) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    out.x = x * a + y * c;
    out.y = x * b + y * d;
}

/// Multiplies a by b and writes the result to out.
///
/// out = a * b
pub fn multiply_matrix(out: &mut Matrix, a: &Matrix, b: &Matrix) {
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

/// Applies a world-space rotation to the complete 2D affine transform, including its translation.
///
/// `out = R * source`
pub fn rotate_matrix(out: &mut Matrix, source: &Matrix, theta: f32) {
    let cos = theta.cos();
    let sin = theta.sin();
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let tx = source.tx;
    let ty = source.ty;

    let a1 = a * cos - b * sin;
    out.b = a * sin + b * cos;
    out.a = a1;

    let c1 = c * cos - d * sin;
    out.d = c * sin + d * cos;
    out.c = c1;

    let tx1 = tx * cos - ty * sin;
    out.ty = tx * sin + ty * cos;
    out.tx = tx1;
}

/// Applies a world-space scale to the complete 2D affine transform, including its translation.
/// The _x_ axis is multiplied by `sx`, and the _y_ axis is multiplied by `sy`.
///
/// `out = S * source`
pub fn scale_matrix(out: &mut Matrix, source: &Matrix, sx: f32, sy: f32) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let tx = source.tx;
    let ty = source.ty;
    out.a = a * sx;
    out.b = b * sy;
    out.c = c * sx;
    out.d = d * sy;
    out.tx = tx * sx;
    out.ty = ty * sy;
}

/// Creates the specific style of matrix expected by the
/// `appendShapeBeginGradientFill()` and `appendShapeLineGradientStyle()`
/// helpers. Width and height are scaled to a `scaleX`/`scaleY`
/// pair and the `tx`/`ty` values are offset by half the width and height.
pub fn set_gradient_transform_matrix(
    out: &mut Matrix,
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
        out.a = out.a * cos;
        out.d = out.d * cos;
    } else {
        out.b = 0.0;
        out.c = 0.0;
    }

    out.tx = tx + width / 2.0;
    out.ty = ty + height / 2.0;
}

pub fn set_matrix(out: &mut Matrix, a: f32, b: f32, c: f32, d: f32, tx: f32, ty: f32) {
    out.a = a;
    out.b = b;
    out.c = c;
    out.d = d;
    out.tx = tx;
    out.ty = ty;
}

pub fn set_matrix_from_float32_array(out: &mut Matrix, offset: usize, source: &Float32Array) {
    out.a = source[offset];
    out.b = source[offset + 1];
    out.c = source[offset + 2];
    out.d = source[offset + 3];
    out.tx = source[offset + 4];
    out.ty = source[offset + 5];
}

pub fn set_matrix_from_matrix3(out: &mut Matrix, source: &Matrix3) {
    let m = &source.m;
    set_matrix(out, m[0], m[3], m[1], m[4], m[6], m[7]);
}

pub fn set_matrix_from_matrix4(out: &mut Matrix, source: &Matrix4) {
    let s = &source.m;
    out.a = s[0];
    out.b = s[4];
    out.tx = s[12];
    out.c = s[1];
    out.d = s[5];
    out.ty = s[13];
}

/// Sets each matrix property to a value that causes a null
/// transformation. An object transformed by applying an identity matrix
/// will be identical to the original.
/// After calling the `set_matrix_identity()` method, the resulting matrix has the
/// following properties: `a`=1, `b`=0, `c`=0, `d`=1, `tx`=0, `ty`=0.
pub fn set_matrix_identity(out: &mut Matrix) {
    set_matrix(out, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
}

/// Using `set_transform_matrix()` lets you obtain the same matrix as
/// if you applied `set_matrix_identity()`, `rotate_matrix()`, `scale_matrix()`, and
/// `translate_matrix()` in succession.
pub fn set_transform_matrix(
    out: &mut Matrix,
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

/// Applies a world-space translation along the _x_ and _y_ axes. The delta is added directly to
/// the existing translation, independently of the source basis.
///
/// `out = T * source`
pub fn translate_matrix(out: &mut Matrix, source: &Matrix, dx: f32, dy: f32) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let tx = source.tx;
    let ty = source.ty;
    set_matrix(out, a, b, c, d, tx + dx, ty + dy);
}

/// Transforms a vector, then translates by the result.
pub fn translate_matrix_by_vector(
    out: &mut Matrix,
    matrix: &Matrix,
    vector: &Vector2,
) {
    let vx = vector.x;
    let vy = vector.y;
    translate_matrix_by_vector_xy(out, matrix, vx, vy);
}

pub fn translate_matrix_by_vector_xy(out: &mut Matrix, source: &Matrix, x: f32, y: f32) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let tx = source.tx;
    let ty = source.ty;
    set_matrix(out, a, b, c, d, tx + a * x + c * y, ty + b * x + d * y);
}

pub fn write_matrix_to_float32_array(out: &mut [f32], offset: usize, source: &Matrix) {
    out[offset] = source.a;
    out[offset + 1] = source.b;
    out[offset + 2] = source.c;
    out[offset + 3] = source.d;
    out[offset + 4] = source.tx;
    out[offset + 5] = source.ty;
}

impl Default for Matrix {
    fn default() -> Self {
        return Matrix { a: 1.0, b: 0.0, c: 0.0, d: 1.0, tx: 0.0, ty: 0.0 };
    }
}

impl Matrix {
    pub fn new(a: f32, b: f32, c: f32, d: f32, tx: f32, ty: f32) -> Self {
        return create_matrix(a, b, c, d, tx, ty);
    }

    pub fn clone_matrix(&self) -> Self {
        return clone_matrix(self);
    }

    pub fn copy(&mut self, source: &Self) {
        copy_matrix(self, source);
    }

    pub fn equals(&self, other: &Self, compare_translation: bool) -> bool {
        return equals_matrix(Some(self), Some(other), compare_translation);
    }

    pub fn inverse(&self) -> Self {
        let mut out = Self::default();
        inverse_matrix(&mut out, self);
        return out;
    }

    pub fn multiply(&self, other: &Self) -> Self {
        let mut out = Self::default();
        multiply_matrix(&mut out, self, other);
        return out;
    }

    pub fn rotated(&self, theta: f32) -> Self {
        let mut out = Self::default();
        rotate_matrix(&mut out, self, theta);
        return out;
    }

    pub fn scaled(&self, sx: f32, sy: f32) -> Self {
        let mut out = Self::default();
        scale_matrix(&mut out, self, sx, sy);
        return out;
    }

    pub fn translated(&self, dx: f32, dy: f32) -> Self {
        let mut out = Self::default();
        translate_matrix(&mut out, self, dx, dy);
        return out;
    }
}

pub const MATRIX_IDENTITY: Matrix = Matrix { a: 1.0, b: 0.0, c: 0.0, d: 1.0, tx: 0.0, ty: 0.0 };

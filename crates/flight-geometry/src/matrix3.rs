use flight_entity::{EntityRuntimeSlot, Float32Array, allocate_entity};
use crate::Matrix;
use crate::Matrix4;
use crate::Vector3;

/// A 3x3 homogeneous matrix.
///
/// Storage is column-major: element (row r, column c) lives at m[3 * c + r].
/// This matches Matrix4 and the GL/GLSL/WGSL uniform ABI.
#[derive(Debug, Clone, PartialEq)]
pub struct Matrix3 {
    runtime: EntityRuntimeSlot,
    pub m: [f32; 9],
}

pub fn create_matrix3() -> Matrix3 {
    let mut out: Matrix3 = allocate_entity();
    initialize_matrix3(&mut out);
    return out;
}

pub fn create_matrix3_from_values(
    m00: f32, m01: f32, m02: f32,
    m10: f32, m11: f32, m12: f32,
    m20: f32, m21: f32, m22: f32,
) -> Matrix3 {
    let mut out = create_matrix3();
    set_matrix3(&mut out, m00, m01, m02, m10, m11, m12, m20, m21, m22);
    return out;
}

pub fn initialize_matrix3(out: &mut Matrix3) {
    out.m = [
        1.0, 0.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 0.0, 1.0,
    ];
}

pub fn clone_matrix3(source: &Matrix3) -> Matrix3 {
    let m = create_matrix3();
    let mut out = m;
    copy_matrix3(&mut out, source);
    return out;
}

pub fn copy_matrix3(out: &mut Matrix3, source: &Matrix3) {
    let m = source.m;
    out.m = m;
}

/// Copies a column of a Matrix3 from a Vector3.
///
/// Column-major: a column's three elements are contiguous at 3*column + row.
pub fn copy_matrix3_column_from_vector3(out: &mut Matrix3, column: usize, source: &Vector3) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    match column {
        0 | 1 | 2 => {
            let base = column * 3;
            out.m[base] = x;
            out.m[base + 1] = y;
            out.m[base + 2] = z;
        }
        _ => panic!("Column {} out of bounds (2)", column),
    }
}

/// Copies a column of a Matrix3 into a Vector3.
pub fn copy_matrix3_column_to_vector3(out: &mut Vector3, column: usize, source: &Matrix3) {
    match column {
        0 | 1 | 2 => {
            let base = column * 3;
            let x = source.m[base];
            let y = source.m[base + 1];
            let z = source.m[base + 2];
            out.x = x;
            out.y = y;
            out.z = z;
        }
        _ => panic!("Column {} out of bounds (2)", column),
    }
}

/// Copies a row of a Matrix3 from a Vector3.
///
/// Column-major: a row's three elements are strided by 3 at 3*column + row.
pub fn copy_matrix3_row_from_vector3(out: &mut Matrix3, row: usize, source: &Vector3) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    match row {
        0 | 1 | 2 => {
            out.m[row] = x;
            out.m[row + 3] = y;
            out.m[row + 6] = z;
        }
        _ => panic!("Row {} out of bounds (2)", row),
    }
}

/// Copies a row of a Matrix3 into a Vector3.
pub fn copy_matrix3_row_to_vector3(out: &mut Vector3, row: usize, source: &Matrix3) {
    match row {
        0 | 1 | 2 => {
            let x = source.m[row];
            let y = source.m[row + 3];
            let z = source.m[row + 6];
            out.x = x;
            out.y = y;
            out.z = z;
        }
        _ => panic!("Row {} out of bounds (2)", row),
    }
}

pub fn equals_matrix3(a: Option<&Matrix3>, b: Option<&Matrix3>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => std::ptr::eq(a, b) || a.m == b.m,
        (None, None) => true,
        _ => false,
    };
}

/// Returns the determinant of a 3x3 matrix. The determinant is transpose-invariant,
/// so this flat-index form is independent of row/column-major storage.
pub fn get_matrix3_determinant(source: &Matrix3) -> f32 {
    let m = &source.m;
    return m[0] * m[4] * m[8]
        + m[1] * m[5] * m[6]
        + m[2] * m[3] * m[7]
        - m[2] * m[4] * m[6]
        - m[1] * m[3] * m[8]
        - m[0] * m[5] * m[7];
}

pub fn get_matrix3_element(source: &Matrix3, row: usize, column: usize) -> f32 {
    return source.m[column * 3 + row];
}

/// Attempts to invert a 3x3 matrix, writing the result to `out`. Returns `true` on success.
/// When the matrix is singular (determinant zero, non-invertible), fills `out` with NaN
/// and returns `false`.
pub fn inverse_matrix3(out: &mut Matrix3, source: &Matrix3) -> bool {
    let a00 = source.m[0];
    let a10 = source.m[1];
    let a20 = source.m[2];
    let a01 = source.m[3];
    let a11 = source.m[4];
    let a21 = source.m[5];
    let a02 = source.m[6];
    let a12 = source.m[7];
    let a22 = source.m[8];

    let is_affine = a20 == 0.0 && a21 == 0.0 && a22 == 1.0;

    if is_affine {
        let det = a00 * a11 - a01 * a10;

        if det == 0.0 {
            out.m.fill(f32::NAN);
            return false;
        }

        let inv_det = 1.0 / det;
        let i00 = a11 * inv_det;
        let i01 = -a01 * inv_det;
        let i10 = -a10 * inv_det;
        let i11 = a00 * inv_det;

        out.m[0] = i00;
        out.m[1] = i10;
        out.m[2] = 0.0;
        out.m[3] = i01;
        out.m[4] = i11;
        out.m[5] = 0.0;
        out.m[6] = -(i00 * a02 + i01 * a12);
        out.m[7] = -(i10 * a02 + i11 * a12);
        out.m[8] = 1.0;
        return true;
    }

    let det = a00 * (a11 * a22 - a12 * a21)
        - a01 * (a10 * a22 - a12 * a20)
        + a02 * (a10 * a21 - a11 * a20);

    if det == 0.0 {
        out.m.fill(f32::NAN);
        return false;
    }

    let inv = 1.0 / det;

    out.m[0] = (a11 * a22 - a12 * a21) * inv;
    out.m[1] = (a12 * a20 - a10 * a22) * inv;
    out.m[2] = (a10 * a21 - a11 * a20) * inv;

    out.m[3] = (a02 * a21 - a01 * a22) * inv;
    out.m[4] = (a00 * a22 - a02 * a20) * inv;
    out.m[5] = (a01 * a20 - a00 * a21) * inv;

    out.m[6] = (a01 * a12 - a02 * a11) * inv;
    out.m[7] = (a02 * a10 - a00 * a12) * inv;
    out.m[8] = (a00 * a11 - a01 * a10) * inv;
    return true;
}

pub fn is_affine_matrix3(source: &Matrix3) -> bool {
    return source.m[2] == 0.0 && source.m[5] == 0.0 && source.m[8] == 1.0;
}

/// out = a * b
pub fn multiply_matrix3(out: &mut Matrix3, a: &Matrix3, b: &Matrix3) {
    let a00 = a.m[0];
    let a10 = a.m[1];
    let a20 = a.m[2];
    let a01 = a.m[3];
    let a11 = a.m[4];
    let a21 = a.m[5];
    let a02 = a.m[6];
    let a12 = a.m[7];
    let a22 = a.m[8];

    let b00 = b.m[0];
    let b10 = b.m[1];
    let b20 = b.m[2];
    let b01 = b.m[3];
    let b11 = b.m[4];
    let b21 = b.m[5];
    let b02 = b.m[6];
    let b12 = b.m[7];
    let b22 = b.m[8];

    let a_is_affine = a20 == 0.0 && a21 == 0.0 && a22 == 1.0;
    let b_is_affine = b20 == 0.0 && b21 == 0.0 && b22 == 1.0;

    if a_is_affine && b_is_affine {
        out.m[0] = a00 * b00 + a01 * b10;
        out.m[1] = a10 * b00 + a11 * b10;
        out.m[2] = 0.0;
        out.m[3] = a00 * b01 + a01 * b11;
        out.m[4] = a10 * b01 + a11 * b11;
        out.m[5] = 0.0;
        out.m[6] = a00 * b02 + a01 * b12 + a02;
        out.m[7] = a10 * b02 + a11 * b12 + a12;
        out.m[8] = 1.0;
        return;
    }

    out.m[0] = a00 * b00 + a01 * b10 + a02 * b20;
    out.m[1] = a10 * b00 + a11 * b10 + a12 * b20;
    out.m[2] = a20 * b00 + a21 * b10 + a22 * b20;

    out.m[3] = a00 * b01 + a01 * b11 + a02 * b21;
    out.m[4] = a10 * b01 + a11 * b11 + a12 * b21;
    out.m[5] = a20 * b01 + a21 * b11 + a22 * b21;

    out.m[6] = a00 * b02 + a01 * b12 + a02 * b22;
    out.m[7] = a10 * b02 + a11 * b12 + a12 * b22;
    out.m[8] = a20 * b02 + a21 * b12 + a22 * b22;
}

/// Applies a local-space rotation in the (0,1) plane. The translation column is preserved.
///
/// `out = source * R`
pub fn rotate_matrix3(out: &mut Matrix3, source: &Matrix3, theta: f32) {
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

    out.m[0] = a0 * c + a3 * s;
    out.m[1] = a1 * c + a4 * s;
    out.m[2] = a2 * c + a5 * s;

    out.m[3] = a0 * -s + a3 * c;
    out.m[4] = a1 * -s + a4 * c;
    out.m[5] = a2 * -s + a5 * c;

    out.m[6] = a6;
    out.m[7] = a7;
    out.m[8] = a8;
}

/// Applies a local-space scale in the (0,1) plane. The translation column is preserved.
///
/// `out = source * S`
pub fn scale_matrix3(out: &mut Matrix3, source: &Matrix3, sx: f32, sy: f32) {
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
    out.m[1] = a1 * sx;
    out.m[2] = a2 * sx;

    out.m[3] = a3 * sy;
    out.m[4] = a4 * sy;
    out.m[5] = a5 * sy;

    out.m[6] = a6;
    out.m[7] = a7;
    out.m[8] = a8;
}

/// Sets all 9 elements of a Matrix3. Arguments are in reading (row-major) order;
/// stored column-major at 3 * col + row.
pub fn set_matrix3(
    out: &mut Matrix3,
    m00: f32, m01: f32, m02: f32,
    m10: f32, m11: f32, m12: f32,
    m20: f32, m21: f32, m22: f32,
) {
    out.m[0] = m00;
    out.m[3] = m01;
    out.m[6] = m02;
    out.m[1] = m10;
    out.m[4] = m11;
    out.m[7] = m12;
    out.m[2] = m20;
    out.m[5] = m21;
    out.m[8] = m22;
}

pub fn set_matrix3_element(out: &mut Matrix3, row: usize, column: usize, value: f32) {
    out.m[column * 3 + row] = value;
}

/// Reads a Matrix3 from a float slice at an element offset (column-major, 9 floats).
pub fn set_matrix3_from_float32_array(out: &mut Matrix3, offset: usize, source: &Float32Array) {
    let mut i = 0;
    while i < 9 {
        out.m[i] = source[offset + i];
        i += 1;
    }
}

/// Converts a 2D affine Matrix (a,b,c,d,tx,ty) to a Matrix3.
///
/// The 2D affine [[a,b,tx],[c,d,ty],[0,0,1]] embeds column-major.
pub fn set_matrix3_from_matrix(out: &mut Matrix3, source: &Matrix) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let tx = source.tx;
    let ty = source.ty;
    out.m[0] = a;
    out.m[1] = c;
    out.m[2] = 0.0;
    out.m[3] = b;
    out.m[4] = d;
    out.m[5] = 0.0;
    out.m[6] = tx;
    out.m[7] = ty;
    out.m[8] = 1.0;
}

/// Copies the upper-left 3x3 of a Matrix4 into a Matrix3.
///
/// Both are column-major: the copy is straight through, dropping Matrix4's 4th row/column.
pub fn set_matrix3_from_matrix4(out: &mut Matrix3, source: &Matrix4) {
    let s = &source.m;
    out.m[0] = s[0];
    out.m[1] = s[1];
    out.m[2] = s[2];

    out.m[3] = s[4];
    out.m[4] = s[5];
    out.m[5] = s[6];

    out.m[6] = s[8];
    out.m[7] = s[9];
    out.m[8] = s[10];
}

pub fn set_matrix3_identity(out: &mut Matrix3) {
    out.m = [
        1.0, 0.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 0.0, 1.0,
    ];
}

/// Writes the normal matrix for a Matrix4 model transform: the inverse-transpose of its
/// upper-left 3x3. Transforming normals by this (instead of the model matrix) keeps them
/// perpendicular to surfaces under non-uniform scale and shear.
pub fn set_matrix3_normal_from_matrix4(out: &mut Matrix3, source: &Matrix4) {
    let mut scratch = create_matrix3();
    set_matrix3_from_matrix4(&mut scratch, source);
    let scratch_copy = clone_matrix3(&scratch);
    inverse_matrix3(&mut scratch, &scratch_copy);
    transpose_matrix3(out, &scratch);
}

/// Applies a local-space translation mapped through the source basis.
///
/// `out = source * T`
pub fn translate_matrix3(out: &mut Matrix3, source: &Matrix3, tx: f32, ty: f32) {
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
    out.m[2] = a2;

    out.m[3] = a3;
    out.m[4] = a4;
    out.m[5] = a5;

    out.m[6] = a0 * tx + a3 * ty + a6;
    out.m[7] = a1 * tx + a4 * ty + a7;
    out.m[8] = a2 * tx + a5 * ty + a8;
}

/// Transposes a 3x3 matrix (swaps rows and columns). Reads each off-diagonal pair into a
/// temporary before writing, so it is safe when `out` aliases `source`.
pub fn transpose_matrix3(out: &mut Matrix3, source: &Matrix3) {
    let m1 = source.m[1];
    let m2 = source.m[2];
    let m3 = source.m[3];
    let m5 = source.m[5];
    let m6 = source.m[6];
    let m7 = source.m[7];

    out.m[0] = source.m[0];
    out.m[1] = m3;
    out.m[2] = m6;
    out.m[3] = m1;
    out.m[4] = source.m[4];
    out.m[5] = m7;
    out.m[6] = m2;
    out.m[7] = m5;
    out.m[8] = source.m[8];
}

/// Writes a Matrix3 into a float slice at an element offset (column-major, 9 floats).
pub fn write_matrix3_to_float32_array(out: &mut [f32], offset: usize, source: &Matrix3) {
    let mut i = 0;
    while i < 9 {
        out[offset + i] = source.m[i];
        i += 1;
    }
}

impl Default for Matrix3 {
    fn default() -> Self {
        return Matrix3 {
            runtime: EntityRuntimeSlot::default(),
            m: [
                1.0, 0.0, 0.0,
                0.0, 1.0, 0.0,
                0.0, 0.0, 1.0,
            ],
        };
    }
}

impl Matrix3 {
    pub fn new() -> Self {
        return create_matrix3();
    }

    pub fn determinant(&self) -> f32 {
        return get_matrix3_determinant(self);
    }

    pub fn from_values(
        m00: f32, m01: f32, m02: f32,
        m10: f32, m11: f32, m12: f32,
        m20: f32, m21: f32, m22: f32,
    ) -> Self {
        return create_matrix3_from_values(m00, m01, m02, m10, m11, m12, m20, m21, m22);
    }

    pub fn inverse(&self) -> Self {
        let mut out = Self::default();
        inverse_matrix3(&mut out, self);
        return out;
    }

    pub fn is_affine(&self) -> bool {
        return is_affine_matrix3(self);
    }

    pub fn multiply(&self, other: &Self) -> Self {
        let mut out = Self::default();
        multiply_matrix3(&mut out, self, other);
        return out;
    }

    pub fn rotated(&self, theta: f32) -> Self {
        let mut out = Self::default();
        rotate_matrix3(&mut out, self, theta);
        return out;
    }

    pub fn scaled(&self, sx: f32, sy: f32) -> Self {
        let mut out = Self::default();
        scale_matrix3(&mut out, self, sx, sy);
        return out;
    }

    pub fn translated(&self, tx: f32, ty: f32) -> Self {
        let mut out = Self::default();
        translate_matrix3(&mut out, self, tx, ty);
        return out;
    }

    pub fn transposed(&self) -> Self {
        let mut out = Self::default();
        transpose_matrix3(&mut out, self);
        return out;
    }
}

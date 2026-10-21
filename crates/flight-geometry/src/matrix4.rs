use flight_entity::{EntityRuntimeSlot, Float32Array, allocate_entity};
use crate::Matrix;
use crate::Matrix3;
use crate::Quaternion;
use crate::Vector3;
use crate::Vector4;

/// A 4x4 homogeneous matrix.
///
/// Storage is column-major (OpenGL-compatible).
///
/// This matrix assumes column vectors, multiplied on the right:
/// v' = M * v
#[derive(Debug, Clone, PartialEq)]
pub struct Matrix4 {
    runtime: EntityRuntimeSlot,
    pub m: [f32; 16],
}

/// Creates an identity matrix.
pub fn create_matrix4(
    m00: Option<f32>,
    m01: Option<f32>,
    m02: Option<f32>,
    m03: Option<f32>,
    m10: Option<f32>,
    m11: Option<f32>,
    m12: Option<f32>,
    m13: Option<f32>,
    m20: Option<f32>,
    m21: Option<f32>,
    m22: Option<f32>,
    m23: Option<f32>,
    m30: Option<f32>,
    m31: Option<f32>,
    m32: Option<f32>,
    m33: Option<f32>,
) -> Matrix4 {
    let mut out: Matrix4 = allocate_entity();
    out.m = [
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 1.0,
    ];
    let components = [
        m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33,
    ];
    for (index, component) in components.iter().enumerate() {
        if let Some(value) = component {
            out.m[index] = *value;
        }
    }
    return out;
}

/// Creates a matrix using two-dimensional transform values.
pub fn create_matrix4_from_2d(a: f32, b: f32, c: f32, d: f32, tx: f32, ty: f32) -> Matrix4 {
    let mut out = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    set_matrix4_from_2d(&mut out, a, b, c, d, tx, ty);
    return out;
}

/// Creates a matrix with all 16 values specified in column-major order.
pub fn create_matrix4_from_values(
    m00: f32, m01: f32, m02: f32, m03: f32,
    m10: f32, m11: f32, m12: f32, m13: f32,
    m20: f32, m21: f32, m22: f32, m23: f32,
    m30: f32, m31: f32, m32: f32, m33: f32,
) -> Matrix4 {
    let mut out = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    set_matrix4(
        &mut out, m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33,
    );
    return out;
}

/// Initializes this matrix with values for an orthographic projection.
pub fn create_orthographic_matrix4(
    left: f32, right: f32, bottom: f32, top: f32, z_near: f32, z_far: f32,
) -> Matrix4 {
    let mut out = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    set_orthographic_matrix4(&mut out, left, right, bottom, top, z_near, z_far);
    return out;
}

/// Creates a perspective projection matrix. `tan_half_fov_y` is tan(fovY / 2), not the angle itself.
pub fn create_perspective_matrix4(
    tan_half_fov_y: f32, aspect: f32, z_near: f32, z_far: f32,
) -> Matrix4 {
    let mut out = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    set_perspective_matrix4(&mut out, tan_half_fov_y, aspect, z_near, z_far);
    return out;
}

/// Initializes a Matrix4 to identity.

/// Sets a Matrix4 from a column-major float array during construction (TS `initializeMatrix4`).
pub fn initialize_matrix4(out: &mut Matrix4, m: &Float32Array) {
    set_matrix4_from_float32_array(out, 0, m);
}

/// Appends a matrix in world space: `other` applies AFTER everything already in `source`.
///
/// out = other * source
pub fn append_matrix4(out: &mut Matrix4, source: &Matrix4, other: &Matrix4) {
    let s = source.clone();
    let o = other.clone();
    multiply_matrix4(out, &o, &s);
}

/// Applies a world-space rotation to the current matrix.
///
/// Rotation is applied after all transformations of source are completed.
pub fn append_rotation_matrix4(
    out: &mut Matrix4,
    source: &Matrix4,
    radians: f32,
    axis: &Vector4,
    pivot_point: Option<&Vector4>,
) {
    let mut m = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    get_axis_rotation(&mut m, axis.x, axis.y, axis.z, radians);

    if let Some(p) = pivot_point {
        let mut t1 = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        t1.m[12] = -p.x;
        t1.m[13] = -p.y;
        t1.m[14] = -p.z;

        let mut t2 = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        t2.m[12] = p.x;
        t2.m[13] = p.y;
        t2.m[14] = p.z;

        let mut temp = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        multiply_matrix4(&mut temp, &m, &t1);
        multiply_matrix4(&mut m, &t2, &temp);
    }

    let source_copy = source.clone();
    append_matrix4(out, &source_copy, &m);
}

/// Applies a world-space scale value to the source matrix.
///
/// Scale is applied after all transformations of source are completed.
pub fn append_scale_matrix4(
    out: &mut Matrix4,
    source: &Matrix4,
    x_scale: f32,
    y_scale: f32,
    z_scale: f32,
) {
    let mut m = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    set_matrix4(
        &mut m, x_scale, 0.0, 0.0, 0.0, 0.0, y_scale, 0.0, 0.0, 0.0, 0.0, z_scale, 0.0, 0.0, 0.0,
        0.0, 1.0,
    );
    let source_copy = source.clone();
    append_matrix4(out, &source_copy, &m);
}

/// Applies a world-space translation to source matrix.
///
/// Translation is applied after all transformations of source are completed.
pub fn append_translation_matrix4(
    out: &mut Matrix4,
    source: &Matrix4,
    x: f32,
    y: f32,
    z: f32,
) {
    let s = source.m;
    out.m = s;
    out.m[12] = s[12] + x;
    out.m[13] = s[13] + y;
    out.m[14] = s[14] + z;
}

pub fn clone_matrix4(source: &Matrix4) -> Matrix4 {
    let mut m = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    copy_matrix4(&mut m, source);
    return m;
}

/// Composes a transform matrix from a translation, a rotation quaternion and a per-axis
/// scale: out = T * R * S. This is the inverse operation of decompose_matrix4.
pub fn compose_matrix4(
    out: &mut Matrix4,
    position: &Vector3,
    rotation: &Quaternion,
    scale: &Vector3,
) {
    let x = rotation.x;
    let y = rotation.y;
    let z = rotation.z;
    let w = rotation.w;
    let x2 = x + x;
    let y2 = y + y;
    let z2 = z + z;
    let xx = x * x2;
    let xy = x * y2;
    let xz = x * z2;
    let yy = y * y2;
    let yz = y * z2;
    let zz = z * z2;
    let wx = w * x2;
    let wy = w * y2;
    let wz = w * z2;

    let sx = scale.x;
    let sy = scale.y;
    let sz = scale.z;

    out.m[0] = (1.0 - (yy + zz)) * sx;
    out.m[1] = (xy + wz) * sx;
    out.m[2] = (xz - wy) * sx;
    out.m[3] = 0.0;

    out.m[4] = (xy - wz) * sy;
    out.m[5] = (1.0 - (xx + zz)) * sy;
    out.m[6] = (yz + wx) * sy;
    out.m[7] = 0.0;

    out.m[8] = (xz + wy) * sz;
    out.m[9] = (yz - wx) * sz;
    out.m[10] = (1.0 - (xx + yy)) * sz;
    out.m[11] = 0.0;

    out.m[12] = position.x;
    out.m[13] = position.y;
    out.m[14] = position.z;
    out.m[15] = 1.0;
}

pub fn copy_matrix4(out: &mut Matrix4, source: &Matrix4) {
    let s = source.m;
    out.m = s;
}

/// Copies a column of data from a Vector4 instance into the values of the target matrix.
pub fn copy_matrix4_column_from_vector4(out: &mut Matrix4, column: usize, source: &Vector4) {
    match column {
        0 => {
            out.m[0] = source.x;
            out.m[1] = source.y;
            out.m[2] = source.z;
            out.m[3] = source.w;
        }
        1 => {
            out.m[4] = source.x;
            out.m[5] = source.y;
            out.m[6] = source.z;
            out.m[7] = source.w;
        }
        2 => {
            out.m[8] = source.x;
            out.m[9] = source.y;
            out.m[10] = source.z;
            out.m[11] = source.w;
        }
        3 => {
            out.m[12] = source.x;
            out.m[13] = source.y;
            out.m[14] = source.z;
            out.m[15] = source.w;
        }
        _ => panic!("Column {} out of bounds [0, ..., 3]", column),
    }
}

/// Copies a column of data from the source matrix into a Vector4 instance.
pub fn copy_matrix4_column_to_vector4(out: &mut Vector4, column: usize, source: &Matrix4) {
    let s = source.m;
    match column {
        0 => {
            out.x = s[0];
            out.y = s[1];
            out.z = s[2];
            out.w = s[3];
        }
        1 => {
            out.x = s[4];
            out.y = s[5];
            out.z = s[6];
            out.w = s[7];
        }
        2 => {
            out.x = s[8];
            out.y = s[9];
            out.z = s[10];
            out.w = s[11];
        }
        3 => {
            out.x = s[12];
            out.y = s[13];
            out.z = s[14];
            out.w = s[15];
        }
        _ => panic!("Column {} out of bounds [0, ..., 3]", column),
    }
}

/// Copies a row of data from a Vector4 instance into the values of the out matrix.
pub fn copy_matrix4_row_from_vector4(out: &mut Matrix4, row: usize, source: &Vector4) {
    match row {
        0 => {
            out.m[0] = source.x;
            out.m[4] = source.y;
            out.m[8] = source.z;
            out.m[12] = source.w;
        }
        1 => {
            out.m[1] = source.x;
            out.m[5] = source.y;
            out.m[9] = source.z;
            out.m[13] = source.w;
        }
        2 => {
            out.m[2] = source.x;
            out.m[6] = source.y;
            out.m[10] = source.z;
            out.m[14] = source.w;
        }
        3 => {
            out.m[3] = source.x;
            out.m[7] = source.y;
            out.m[11] = source.z;
            out.m[15] = source.w;
        }
        _ => panic!("Row {} out of bounds [0, ..., 3]", row),
    }
}

/// Copies a row of data from the source matrix into a Vector4 instance.
pub fn copy_matrix4_row_to_vector4(out: &mut Vector4, row: usize, source: &Matrix4) {
    let s = source.m;
    match row {
        0 => {
            out.x = s[0];
            out.y = s[4];
            out.z = s[8];
            out.w = s[12];
        }
        1 => {
            out.x = s[1];
            out.y = s[5];
            out.z = s[9];
            out.w = s[13];
        }
        2 => {
            out.x = s[2];
            out.y = s[6];
            out.z = s[10];
            out.w = s[14];
        }
        3 => {
            out.x = s[3];
            out.y = s[7];
            out.z = s[11];
            out.w = s[15];
        }
        _ => panic!("Row {} out of bounds [0, ..., 3]", row),
    }
}

/// Decomposes a transform matrix into its translation, rotation quaternion and per-axis
/// scale, the inverse of compose_matrix4.
pub fn decompose_matrix4(
    out_position: &mut Vector3,
    out_rotation: &mut Quaternion,
    out_scale: &mut Vector3,
    m: &Matrix4,
) {
    let _m = m.m;

    let m00 = _m[0];
    let m01 = _m[1];
    let m02 = _m[2];
    let m10 = _m[4];
    let m11 = _m[5];
    let m12 = _m[6];
    let m20 = _m[8];
    let m21 = _m[9];
    let m22 = _m[10];
    let tx = _m[12];
    let ty = _m[13];
    let tz = _m[14];

    let mut sx = (m00 * m00 + m01 * m01 + m02 * m02).sqrt();
    let sy = (m10 * m10 + m11 * m11 + m12 * m12).sqrt();
    let sz = (m20 * m20 + m21 * m21 + m22 * m22).sqrt();

    let det = m00 * (m11 * m22 - m12 * m21) - m10 * (m01 * m22 - m02 * m21) + m20 * (m01 * m12 - m02 * m11);
    if det < 0.0 {
        sx = -sx;
    }

    out_position.x = tx;
    out_position.y = ty;
    out_position.z = tz;

    out_scale.x = sx;
    out_scale.y = sy;
    out_scale.z = sz;

    let inv_sx = if sx != 0.0 { 1.0 / sx } else { 0.0 };
    let inv_sy = if sy != 0.0 { 1.0 / sy } else { 0.0 };
    let inv_sz = if sz != 0.0 { 1.0 / sz } else { 0.0 };

    let r00 = m00 * inv_sx;
    let r01 = m01 * inv_sx;
    let r02 = m02 * inv_sx;
    let r10 = m10 * inv_sy;
    let r11 = m11 * inv_sy;
    let r12 = m12 * inv_sy;
    let r20 = m20 * inv_sz;
    let r21 = m21 * inv_sz;
    let r22 = m22 * inv_sz;

    let trace = r00 + r11 + r22;

    if trace > 0.0 {
        let s = 0.5 / (trace + 1.0).sqrt();
        out_rotation.w = 0.25 / s;
        out_rotation.x = (r12 - r21) * s;
        out_rotation.y = (r20 - r02) * s;
        out_rotation.z = (r01 - r10) * s;
    } else if r00 > r11 && r00 > r22 {
        let s = 2.0 * (1.0 + r00 - r11 - r22).sqrt();
        out_rotation.w = (r12 - r21) / s;
        out_rotation.x = 0.25 * s;
        out_rotation.y = (r10 + r01) / s;
        out_rotation.z = (r20 + r02) / s;
    } else if r11 > r22 {
        let s = 2.0 * (1.0 + r11 - r00 - r22).sqrt();
        out_rotation.w = (r20 - r02) / s;
        out_rotation.x = (r10 + r01) / s;
        out_rotation.y = 0.25 * s;
        out_rotation.z = (r21 + r12) / s;
    } else {
        let s = 2.0 * (1.0 + r22 - r00 - r11).sqrt();
        out_rotation.w = (r01 - r10) / s;
        out_rotation.x = (r20 + r02) / s;
        out_rotation.y = (r21 + r12) / s;
        out_rotation.z = 0.25 * s;
    }
}

pub fn equals_matrix4(a: Option<&Matrix4>, b: Option<&Matrix4>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => std::ptr::eq(a, b) || a.m == b.m,
        _ => false,
    };
}

fn get_axis_rotation(out: &mut Matrix4, x: f32, y: f32, z: f32, radians: f32) {
    let ax = x;
    let ay = y;
    let az = z;
    let rad = -radians;
    let c = rad.cos();
    let s = rad.sin();
    let t = 1.0 - c;

    out.m[0] = c + ax * ax * t;
    out.m[5] = c + ay * ay * t;
    out.m[10] = c + az * az * t;

    let mut tmp1 = ax * ay * t;
    let mut tmp2 = az * s;
    out.m[4] = tmp1 + tmp2;
    out.m[1] = tmp1 - tmp2;
    tmp1 = ax * az * t;
    tmp2 = ay * s;
    out.m[8] = tmp1 - tmp2;
    out.m[2] = tmp1 + tmp2;
    tmp1 = ay * az * t;
    tmp2 = ax * s;
    out.m[9] = tmp1 + tmp2;
    out.m[6] = tmp1 - tmp2;
}

pub fn get_matrix4_determinant(source: &Matrix4) -> f32 {
    let s = source.m;
    return (s[0] * s[5] - s[4] * s[1]) * (s[10] * s[15] - s[14] * s[11])
        - (s[0] * s[9] - s[8] * s[1]) * (s[6] * s[15] - s[14] * s[7])
        + (s[0] * s[13] - s[12] * s[1]) * (s[6] * s[11] - s[10] * s[7])
        + (s[4] * s[9] - s[8] * s[5]) * (s[2] * s[15] - s[14] * s[3])
        - (s[4] * s[13] - s[12] * s[5]) * (s[2] * s[11] - s[10] * s[3])
        + (s[8] * s[13] - s[12] * s[9]) * (s[2] * s[7] - s[6] * s[3]);
}

pub fn get_matrix4_element(source: &Matrix4, row: usize, column: usize) -> f32 {
    return source.m[column * 4 + row];
}

pub fn get_matrix4_position(out: &mut Vector3, source: &Matrix4) {
    let s = source.m;
    out.x = s[12];
    out.y = s[13];
    out.z = s[14];
}

/// Interpolates from one Matrix4 instance to another, given a percentage between the two.
pub fn interpolate_matrix4(out: &mut Matrix4, a: &Matrix4, b: &Matrix4, t: f32) {
    let am = a.m;
    let bm = b.m;
    for i in 0..16 {
        out.m[i] = am[i] + (bm[i] - am[i]) * t;
    }
}

/// Writes the inverse of `source` and returns whether it existed.
///
/// A matrix whose determinant is within 1e-6 of zero is treated as singular:
/// `out` is filled with NaN and the return is `false`.
pub fn inverse_matrix4(out: &mut Matrix4, source: &Matrix4) -> bool {
    let s = source.m;

    let mut d = get_matrix4_determinant(source);

    let eps: f32 = 1e-6;
    let invertable = d.abs() > eps;

    if !invertable {
        out.m = [f32::NAN; 16];
        return false;
    }

    d = 1.0 / d;

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

    out.m[0] = d * (m22 * (m33 * m44 - m43 * m34) - m32 * (m23 * m44 - m43 * m24) + m42 * (m23 * m34 - m33 * m24));
    out.m[1] = -d * (m12 * (m33 * m44 - m43 * m34) - m32 * (m13 * m44 - m43 * m14) + m42 * (m13 * m34 - m33 * m14));
    out.m[2] = d * (m12 * (m23 * m44 - m43 * m24) - m22 * (m13 * m44 - m43 * m14) + m42 * (m13 * m24 - m23 * m14));
    out.m[3] = -d * (m12 * (m23 * m34 - m33 * m24) - m22 * (m13 * m34 - m33 * m14) + m32 * (m13 * m24 - m23 * m14));

    out.m[4] = -d * (m21 * (m33 * m44 - m43 * m34) - m31 * (m23 * m44 - m43 * m24) + m41 * (m23 * m34 - m33 * m24));
    out.m[5] = d * (m11 * (m33 * m44 - m43 * m34) - m31 * (m13 * m44 - m43 * m14) + m41 * (m13 * m34 - m33 * m14));
    out.m[6] = -d * (m11 * (m23 * m44 - m43 * m24) - m21 * (m13 * m44 - m43 * m14) + m41 * (m13 * m24 - m23 * m14));
    out.m[7] = d * (m11 * (m23 * m34 - m33 * m24) - m21 * (m13 * m34 - m33 * m14) + m31 * (m13 * m24 - m23 * m14));

    out.m[8] = d * (m21 * (m32 * m44 - m42 * m34) - m31 * (m22 * m44 - m42 * m24) + m41 * (m22 * m34 - m32 * m24));
    out.m[9] = -d * (m11 * (m32 * m44 - m42 * m34) - m31 * (m12 * m44 - m42 * m14) + m41 * (m12 * m34 - m32 * m14));
    out.m[10] = d * (m11 * (m22 * m44 - m42 * m24) - m21 * (m12 * m44 - m42 * m14) + m41 * (m12 * m24 - m22 * m14));
    out.m[11] = -d * (m11 * (m22 * m34 - m32 * m24) - m21 * (m12 * m34 - m32 * m14) + m31 * (m12 * m24 - m22 * m14));

    out.m[12] = -d * (m21 * (m32 * m43 - m42 * m33) - m31 * (m22 * m43 - m42 * m23) + m41 * (m22 * m33 - m32 * m23));
    out.m[13] = d * (m11 * (m32 * m43 - m42 * m33) - m31 * (m12 * m43 - m42 * m13) + m41 * (m12 * m33 - m32 * m13));
    out.m[14] = -d * (m11 * (m22 * m43 - m42 * m23) - m21 * (m12 * m43 - m42 * m13) + m41 * (m12 * m23 - m22 * m13));
    out.m[15] = d * (m11 * (m22 * m33 - m32 * m23) - m21 * (m12 * m33 - m32 * m13) + m31 * (m12 * m23 - m22 * m13));

    return invertable;
}

pub fn is_affine_matrix4(source: &Matrix4) -> bool {
    let s = source.m;
    return s[3] == 0.0 && s[7] == 0.0 && s[11] == 0.0 && s[15] == 1.0;
}

/// Transforms a point using this matrix, including the translation of the matrix.
pub fn matrix4_transform_point(out: &mut Vector3, source: &Matrix4, point: &Vector3) {
    let s = source.m;
    let x = point.x;
    let y = point.y;
    let z = point.z;
    out.x = x * s[0] + y * s[4] + z * s[8] + s[12];
    out.y = x * s[1] + y * s[5] + z * s[9] + s[13];
    out.z = x * s[2] + y * s[6] + z * s[10] + s[14];
}

/// Transforms a Vector4 instance using this matrix.
pub fn matrix4_transform_vector(out: &mut Vector4, source: &Matrix4, vector: &Vector4) {
    let s = source.m;
    let x = vector.x;
    let y = vector.y;
    let z = vector.z;
    let w = vector.w;
    out.x = x * s[0] + y * s[4] + z * s[8] + w * s[12];
    out.y = x * s[1] + y * s[5] + z * s[9] + w * s[13];
    out.z = x * s[2] + y * s[6] + z * s[10] + w * s[14];
    out.w = x * s[3] + y * s[7] + z * s[11] + w * s[15];
}

/// Transforms a series of [x, y, z] triples at once.
pub fn matrix4_transform_vectors(out: &mut [f32], source: &Matrix4, vectors: &Float32Array) {
    let s = source.m;
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

/// Matrix multiplication: out = a * b
pub fn multiply_matrix4(out: &mut Matrix4, a: &Matrix4, b: &Matrix4) {
    let am = a.m;
    let bm = b.m;

    out.m[0] = bm[0] * am[0] + bm[1] * am[4] + bm[2] * am[8] + bm[3] * am[12];
    out.m[1] = bm[0] * am[1] + bm[1] * am[5] + bm[2] * am[9] + bm[3] * am[13];
    out.m[2] = bm[0] * am[2] + bm[1] * am[6] + bm[2] * am[10] + bm[3] * am[14];
    out.m[3] = bm[0] * am[3] + bm[1] * am[7] + bm[2] * am[11] + bm[3] * am[15];

    out.m[4] = bm[4] * am[0] + bm[5] * am[4] + bm[6] * am[8] + bm[7] * am[12];
    out.m[5] = bm[4] * am[1] + bm[5] * am[5] + bm[6] * am[9] + bm[7] * am[13];
    out.m[6] = bm[4] * am[2] + bm[5] * am[6] + bm[6] * am[10] + bm[7] * am[14];
    out.m[7] = bm[4] * am[3] + bm[5] * am[7] + bm[6] * am[11] + bm[7] * am[15];

    out.m[8] = bm[8] * am[0] + bm[9] * am[4] + bm[10] * am[8] + bm[11] * am[12];
    out.m[9] = bm[8] * am[1] + bm[9] * am[5] + bm[10] * am[9] + bm[11] * am[13];
    out.m[10] = bm[8] * am[2] + bm[9] * am[6] + bm[10] * am[10] + bm[11] * am[14];
    out.m[11] = bm[8] * am[3] + bm[9] * am[7] + bm[10] * am[11] + bm[11] * am[15];

    out.m[12] = bm[12] * am[0] + bm[13] * am[4] + bm[14] * am[8] + bm[15] * am[12];
    out.m[13] = bm[12] * am[1] + bm[13] * am[5] + bm[14] * am[9] + bm[15] * am[13];
    out.m[14] = bm[12] * am[2] + bm[13] * am[6] + bm[14] * am[10] + bm[15] * am[14];
    out.m[15] = bm[12] * am[3] + bm[13] * am[7] + bm[14] * am[11] + bm[15] * am[15];
}

/// Prepends a matrix in local space: `other` applies BEFORE everything already in `source`.
///
/// out = source * other
pub fn prepend_matrix4(out: &mut Matrix4, source: &Matrix4, other: &Matrix4) {
    let s = source.clone();
    let o = other.clone();
    multiply_matrix4(out, &s, &o);
}

/// Prepends rotation before all local-space transforms.
pub fn prepend_rotation_matrix4(
    out: &mut Matrix4,
    source: &Matrix4,
    radians: f32,
    axis: &Vector4,
    pivot_point: Option<&Vector4>,
) {
    let mut m = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    get_axis_rotation(&mut m, axis.x, axis.y, axis.z, radians);

    if let Some(p) = pivot_point {
        let mut t1 = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        t1.m[12] = -p.x;
        t1.m[13] = -p.y;
        t1.m[14] = -p.z;

        let mut t2 = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        t2.m[12] = p.x;
        t2.m[13] = p.y;
        t2.m[14] = p.z;

        let mut temp = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        multiply_matrix4(&mut temp, &m, &t1);
        multiply_matrix4(&mut m, &t2, &temp);
    }

    let source_copy = source.clone();
    prepend_matrix4(out, &source_copy, &m);
}

/// Prepends scale before all local-space transforms.
pub fn prepend_scale_matrix4(
    out: &mut Matrix4,
    source: &Matrix4,
    x_scale: f32,
    y_scale: f32,
    z_scale: f32,
) {
    let mut m = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    set_matrix4(
        &mut m, x_scale, 0.0, 0.0, 0.0, 0.0, y_scale, 0.0, 0.0, 0.0, 0.0, z_scale, 0.0, 0.0, 0.0,
        0.0, 1.0,
    );
    let source_copy = source.clone();
    prepend_matrix4(out, &source_copy, &m);
}

/// Prepends a translation before all local-space transforms.
///
/// out = source * T(x, y, z)
pub fn prepend_translation_matrix4(out: &mut Matrix4, source: &Matrix4, x: f32, y: f32, z: f32) {
    let mut m = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    m.m[12] = x;
    m.m[13] = y;
    m.m[14] = z;
    let source_copy = source.clone();
    prepend_matrix4(out, &source_copy, &m);
}

/// Applies a local-space rotation relative to the matrix's existing orientation.
///
/// out = source * R
///
/// Translation is preserved.
pub fn rotate_matrix4(out: &mut Matrix4, source: &Matrix4, axis: &Vector3, radians: f32) {
    let mut m = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    get_axis_rotation(&mut m, axis.x, axis.y, axis.z, radians);
    let source_copy = source.clone();
    multiply_matrix4(out, &source_copy, &m);
}

/// Applies a local-space scale relative to the matrix's existing orientation.
///
/// out = source * S
///
/// Translation is preserved.
pub fn scale_matrix4(
    out: &mut Matrix4,
    source: &Matrix4,
    sx: f32,
    sy: f32,
    sz: f32,
) {
    let a = source.m;
    out.m[0] = a[0] * sx;
    out.m[1] = a[1] * sx;
    out.m[2] = a[2] * sx;
    out.m[3] = a[3] * sx;

    out.m[4] = a[4] * sy;
    out.m[5] = a[5] * sy;
    out.m[6] = a[6] * sy;
    out.m[7] = a[7] * sy;

    out.m[8] = a[8] * sz;
    out.m[9] = a[9] * sz;
    out.m[10] = a[10] * sz;
    out.m[11] = a[11] * sz;

    out.m[12] = a[12];
    out.m[13] = a[13];
    out.m[14] = a[14];
    out.m[15] = a[15];
}

pub fn set_matrix4(
    out: &mut Matrix4,
    m00: f32, m01: f32, m02: f32, m03: f32,
    m10: f32, m11: f32, m12: f32, m13: f32,
    m20: f32, m21: f32, m22: f32, m23: f32,
    m30: f32, m31: f32, m32: f32, m33: f32,
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

pub fn set_matrix4_element(out: &mut Matrix4, row: usize, column: usize, value: f32) {
    out.m[column * 4 + row] = value;
}

/// Resets the current matrix using two-dimensional transform values.
pub fn set_matrix4_from_2d(
    out: &mut Matrix4,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
) {
    out.m[0] = a;
    out.m[1] = b;
    out.m[2] = 0.0;
    out.m[3] = 0.0;

    out.m[4] = c;
    out.m[5] = d;
    out.m[6] = 0.0;
    out.m[7] = 0.0;

    out.m[8] = 0.0;
    out.m[9] = 0.0;
    out.m[10] = 1.0;
    out.m[11] = 0.0;

    out.m[12] = tx;
    out.m[13] = ty;
    out.m[14] = 0.0;
    out.m[15] = 1.0;
}

/// Reads 16 elements of a column-major f32 slice at `offset` into a Matrix4.
pub fn set_matrix4_from_float32_array(out: &mut Matrix4, offset: usize, source: &Float32Array) {
    for i in 0..16 {
        out.m[i] = source[offset + i];
    }
}

pub fn set_matrix4_from_matrix(out: &mut Matrix4, source: &Matrix) {
    set_matrix4_from_2d(out, source.a, source.b, source.c, source.d, source.tx, source.ty);
}

pub fn set_matrix4_from_matrix3(out: &mut Matrix4, source: &Matrix3) {
    let s = source.m;
    set_matrix4_from_2d(out, s[0], s[3], s[1], s[4], s[6], s[7]);
    out.m[2] = s[2];
    out.m[6] = s[5];
    out.m[10] = s[8];
}

/// Writes the rotation described by a unit quaternion into the upper-left 3x3 of an
/// identity matrix (translation cleared, bottom row 0,0,0,1).
pub fn set_matrix4_from_quaternion(out: &mut Matrix4, source: &Quaternion) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let w = source.w;
    let x2 = x + x;
    let y2 = y + y;
    let z2 = z + z;
    let xx = x * x2;
    let xy = x * y2;
    let xz = x * z2;
    let yy = y * y2;
    let yz = y * z2;
    let zz = z * z2;
    let wx = w * x2;
    let wy = w * y2;
    let wz = w * z2;

    out.m[0] = 1.0 - (yy + zz);
    out.m[1] = xy + wz;
    out.m[2] = xz - wy;
    out.m[3] = 0.0;

    out.m[4] = xy - wz;
    out.m[5] = 1.0 - (xx + zz);
    out.m[6] = yz + wx;
    out.m[7] = 0.0;

    out.m[8] = xz + wy;
    out.m[9] = yz - wx;
    out.m[10] = 1.0 - (xx + yy);
    out.m[11] = 0.0;

    out.m[12] = 0.0;
    out.m[13] = 0.0;
    out.m[14] = 0.0;
    out.m[15] = 1.0;
}

/// Resets the current matrix using default identity values.
pub fn set_matrix4_identity(out: &mut Matrix4) {
    set_matrix4(out, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0);
}

/// Builds a right-handed look-at view matrix that positions a camera at `eye` looking toward
/// `target`, with `up` defining the camera roll.
pub fn set_matrix4_look_at(
    out: &mut Matrix4,
    eye: &Vector3,
    target: &Vector3,
    up: &Vector3,
) {
    let eye_x = eye.x;
    let eye_y = eye.y;
    let eye_z = eye.z;

    let mut zx = eye_x - target.x;
    let mut zy = eye_y - target.y;
    let mut zz = eye_z - target.z;
    let mut zl = (zx * zx + zy * zy + zz * zz).sqrt();
    if zl == 0.0 {
        zz = 1.0;
        zl = 1.0;
    }
    zx /= zl;
    zy /= zl;
    zz /= zl;

    let mut xx = up.y * zz - up.z * zy;
    let mut xy = up.z * zx - up.x * zz;
    let mut xz = up.x * zy - up.y * zx;
    let mut xl = (xx * xx + xy * xy + xz * xz).sqrt();
    if xl == 0.0 {
        if zz.abs() < 0.9 {
            xx = -zy;
            xy = zx;
            xz = 0.0;
        } else {
            xx = 0.0;
            xy = -zz;
            xz = zy;
        }
        xl = (xx * xx + xy * xy + xz * xz).sqrt();
    }
    xx /= xl;
    xy /= xl;
    xz /= xl;

    let yx = zy * xz - zz * xy;
    let yy = zz * xx - zx * xz;
    let yz = zx * xy - zy * xx;

    out.m[0] = xx;
    out.m[1] = yx;
    out.m[2] = zx;
    out.m[3] = 0.0;

    out.m[4] = xy;
    out.m[5] = yy;
    out.m[6] = zy;
    out.m[7] = 0.0;

    out.m[8] = xz;
    out.m[9] = yz;
    out.m[10] = zz;
    out.m[11] = 0.0;

    out.m[12] = -(xx * eye_x + xy * eye_y + xz * eye_z);
    out.m[13] = -(yx * eye_x + yy * eye_y + yz * eye_z);
    out.m[14] = -(zx * eye_x + zy * eye_y + zz * eye_z);
    out.m[15] = 1.0;
}

pub fn set_matrix4_position(out: &mut Matrix4, source: &Vector3) {
    out.m[12] = source.x;
    out.m[13] = source.y;
    out.m[14] = source.z;
}

/// Initializes a matrix with values for an orthographic projection.
pub fn set_orthographic_matrix4(
    out: &mut Matrix4,
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

    out.m[0] = 2.0 * sx;
    out.m[1] = 0.0;
    out.m[2] = 0.0;
    out.m[3] = 0.0;

    out.m[4] = 0.0;
    out.m[5] = 2.0 * sy;
    out.m[6] = 0.0;
    out.m[7] = 0.0;

    out.m[8] = 0.0;
    out.m[9] = 0.0;
    out.m[10] = -2.0 * sz;
    out.m[11] = 0.0;

    out.m[12] = -(left + right) * sx;
    out.m[13] = -(bottom + top) * sy;
    out.m[14] = -(z_near + z_far) * sz;
    out.m[15] = 1.0;
}

/// Writes a perspective projection into `out`. `tan_half_fov_y` is tan(fovY / 2), not the angle itself.
pub fn set_perspective_matrix4(
    out: &mut Matrix4,
    tan_half_fov_y: f32,
    aspect: f32,
    z_near: f32,
    z_far: f32,
) {
    if aspect > -0.0000001 && aspect < 0.0000001 {
        panic!("Aspect ratio may not be 0");
    }

    let top = tan_half_fov_y * z_near;
    let bottom = -top;
    let right = top * aspect;
    let left = -right;

    out.m[0] = (2.0 * z_near) / (right - left);
    out.m[1] = 0.0;
    out.m[2] = 0.0;
    out.m[3] = 0.0;

    out.m[4] = 0.0;
    out.m[5] = (2.0 * z_near) / (top - bottom);
    out.m[6] = 0.0;
    out.m[7] = 0.0;

    out.m[8] = (right + left) / (right - left);
    out.m[9] = (top + bottom) / (top - bottom);
    out.m[10] = if z_far == f32::INFINITY { -1.0 } else { -(z_far + z_near) / (z_far - z_near) };
    out.m[11] = -1.0;

    out.m[12] = 0.0;
    out.m[13] = 0.0;
    out.m[14] = if z_far == f32::INFINITY { -2.0 * z_near } else { (-2.0 * z_far * z_near) / (z_far - z_near) };
    out.m[15] = 0.0;
}

/// Applies a local-space translation to the matrix, taking into account the source
/// matrix's rotation and scale.
///
/// out = source * T
pub fn translate_matrix4(
    out: &mut Matrix4,
    source: &Matrix4,
    tx: f32,
    ty: f32,
    tz: f32,
) {
    let a = source.m;
    out.m = a;
    out.m[12] = a[0] * tx + a[4] * ty + a[8] * tz + a[12];
    out.m[13] = a[1] * tx + a[5] * ty + a[9] * tz + a[13];
    out.m[14] = a[2] * tx + a[6] * ty + a[10] * tz + a[14];
}

/// Transposes the matrix (swaps rows and columns).
pub fn transpose_matrix4(out: &mut Matrix4, source: &Matrix4) {
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

/// Writes 16 column-major elements of a Matrix4 into a f32 slice at `offset`.
pub fn write_matrix4_to_float32_array(out: &mut [f32], offset: usize, source: &Matrix4) {
    for i in 0..16 {
        out[offset + i] = source.m[i];
    }
}

impl Default for Matrix4 {
    fn default() -> Self {
        return Matrix4 {
            runtime: EntityRuntimeSlot::default(),
            m: [
                1.0, 0.0, 0.0, 0.0,
                0.0, 1.0, 0.0, 0.0,
                0.0, 0.0, 1.0, 0.0,
                0.0, 0.0, 0.0, 1.0,
            ],
        };
    }
}

impl Matrix4 {
    pub fn new() -> Self {
        return create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
    }

    pub fn determinant(&self) -> f32 {
        return get_matrix4_determinant(self);
    }

    pub fn element(&self, row: usize, column: usize) -> f32 {
        return get_matrix4_element(self, row, column);
    }

    pub fn interpolate(&self, other: &Self, t: f32) -> Self {
        let mut out = Self::default();
        interpolate_matrix4(&mut out, self, other, t);
        return out;
    }

    pub fn inverse(&self) -> (Self, bool) {
        let mut out = Self::default();
        let ok = inverse_matrix4(&mut out, self);
        return (out, ok);
    }

    pub fn is_affine(&self) -> bool {
        return is_affine_matrix4(self);
    }

    pub fn multiply(&self, other: &Self) -> Self {
        let mut out = Self::default();
        multiply_matrix4(&mut out, self, other);
        return out;
    }

    pub fn scaled(&self, sx: f32, sy: f32, sz: f32) -> Self {
        let mut out = Self::default();
        scale_matrix4(&mut out, self, sx, sy, sz);
        return out;
    }

    pub fn translated(&self, tx: f32, ty: f32, tz: f32) -> Self {
        let mut out = Self::default();
        translate_matrix4(&mut out, self, tx, ty, tz);
        return out;
    }

    pub fn transposed(&self) -> Self {
        let mut out = Self::default();
        transpose_matrix4(&mut out, self);
        return out;
    }
}

flight_entity::impl_entity!(Matrix4);

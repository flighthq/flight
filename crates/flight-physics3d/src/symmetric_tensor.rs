// flight-lint: allow-file(conform-params) D9b: native tensor writers keep the output parameter first
pub const TENSOR_XX: usize = 0;
pub const TENSOR_YY: usize = 1;
pub const TENSOR_ZZ: usize = 2;
pub const TENSOR_XY: usize = 3;
pub const TENSOR_XZ: usize = 4;
pub const TENSOR_YZ: usize = 5;

pub fn apply_symmetric_tensor(out: &mut [f32; 3], tensor: &[f32; 6], vx: f32, vy: f32, vz: f32) {
    let xx = tensor[TENSOR_XX];
    let yy = tensor[TENSOR_YY];
    let zz = tensor[TENSOR_ZZ];
    let xy = tensor[TENSOR_XY];
    let xz = tensor[TENSOR_XZ];
    let yz = tensor[TENSOR_YZ];
    out[0] = xx * vx + xy * vy + xz * vz;
    out[1] = xy * vx + yy * vy + yz * vz;
    out[2] = xz * vx + yz * vy + zz * vz;
}

pub fn inverse_symmetric_tensor(out: &mut [f32; 6], tensor: &[f32; 6]) -> bool {
    let xx = tensor[TENSOR_XX];
    let yy = tensor[TENSOR_YY];
    let zz = tensor[TENSOR_ZZ];
    let xy = tensor[TENSOR_XY];
    let xz = tensor[TENSOR_XZ];
    let yz = tensor[TENSOR_YZ];
    let cofactor_xx = yy * zz - yz * yz;
    let cofactor_xy = xz * yz - xy * zz;
    let cofactor_xz = xy * yz - xz * yy;
    let determinant = xx * cofactor_xx + xy * cofactor_xy + xz * cofactor_xz;
    let scale = xx.abs() + yy.abs() + zz.abs();
    if !determinant.is_finite() || determinant.abs() <= 1e-12_f32 * scale * scale * scale {
        *out = [0.0; 6];
        return false;
    }
    let inverse_determinant = 1.0 / determinant;
    out[TENSOR_XX] = cofactor_xx * inverse_determinant;
    out[TENSOR_YY] = (xx * zz - xz * xz) * inverse_determinant;
    out[TENSOR_ZZ] = (xx * yy - xy * xy) * inverse_determinant;
    out[TENSOR_XY] = cofactor_xy * inverse_determinant;
    out[TENSOR_XZ] = cofactor_xz * inverse_determinant;
    out[TENSOR_YZ] = (xy * xz - xx * yz) * inverse_determinant;
    return true;
}

pub fn rotate_symmetric_tensor(
    out: &mut [f32; 6],
    tensor: &[f32; 6],
    quaternion_x: f32,
    quaternion_y: f32,
    quaternion_z: f32,
    quaternion_w: f32,
) {
    let x2 = quaternion_x + quaternion_x;
    let y2 = quaternion_y + quaternion_y;
    let z2 = quaternion_z + quaternion_z;
    let xx2 = quaternion_x * x2;
    let yy2 = quaternion_y * y2;
    let zz2 = quaternion_z * z2;
    let xy2 = quaternion_x * y2;
    let xz2 = quaternion_x * z2;
    let yz2 = quaternion_y * z2;
    let wx2 = quaternion_w * x2;
    let wy2 = quaternion_w * y2;
    let wz2 = quaternion_w * z2;
    let r00 = 1.0 - yy2 - zz2;
    let r10 = xy2 + wz2;
    let r20 = xz2 - wy2;
    let r01 = xy2 - wz2;
    let r11 = 1.0 - xx2 - zz2;
    let r21 = yz2 + wx2;
    let r02 = xz2 + wy2;
    let r12 = yz2 - wx2;
    let r22 = 1.0 - xx2 - yy2;
    let xx = tensor[TENSOR_XX];
    let yy = tensor[TENSOR_YY];
    let zz = tensor[TENSOR_ZZ];
    let xy = tensor[TENSOR_XY];
    let xz = tensor[TENSOR_XZ];
    let yz = tensor[TENSOR_YZ];
    let m00 = xx * r00 + xy * r01 + xz * r02;
    let m01 = xx * r10 + xy * r11 + xz * r12;
    let m02 = xx * r20 + xy * r21 + xz * r22;
    let m10 = xy * r00 + yy * r01 + yz * r02;
    let m11 = xy * r10 + yy * r11 + yz * r12;
    let m12 = xy * r20 + yy * r21 + yz * r22;
    let m20 = xz * r00 + yz * r01 + zz * r02;
    let m21 = xz * r10 + yz * r11 + zz * r12;
    let m22 = xz * r20 + yz * r21 + zz * r22;
    out[TENSOR_XX] = r00 * m00 + r01 * m10 + r02 * m20;
    out[TENSOR_YY] = r10 * m01 + r11 * m11 + r12 * m21;
    out[TENSOR_ZZ] = r20 * m02 + r21 * m12 + r22 * m22;
    out[TENSOR_XY] = r00 * m01 + r01 * m11 + r02 * m21;
    out[TENSOR_XZ] = r00 * m02 + r01 * m12 + r02 * m22;
    out[TENSOR_YZ] = r10 * m02 + r11 * m12 + r12 * m22;
}

pub fn translate_symmetric_tensor(
    out: &mut [f32; 6],
    tensor: &[f32; 6],
    mass: f32,
    dx: f32,
    dy: f32,
    dz: f32,
) {
    let xx = tensor[TENSOR_XX];
    let yy = tensor[TENSOR_YY];
    let zz = tensor[TENSOR_ZZ];
    let xy = tensor[TENSOR_XY];
    let xz = tensor[TENSOR_XZ];
    let yz = tensor[TENSOR_YZ];
    out[TENSOR_XX] = xx + mass * (dy * dy + dz * dz);
    out[TENSOR_YY] = yy + mass * (dx * dx + dz * dz);
    out[TENSOR_ZZ] = zz + mass * (dx * dx + dy * dy);
    out[TENSOR_XY] = xy - mass * dx * dy;
    out[TENSOR_XZ] = xz - mass * dx * dz;
    out[TENSOR_YZ] = yz - mass * dy * dz;
}

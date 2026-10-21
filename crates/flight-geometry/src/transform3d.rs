use crate::{Matrix4, Quaternion, Vector3, initialize_quaternion, initialize_vector3};
use flight_entity::{EntityRuntimeSlot, allocate_entity};

#[derive(Debug, Clone, PartialEq)]
pub struct Transform3D {
    pub runtime: EntityRuntimeSlot,
    pub position: Vector3,
    pub rotation: Quaternion,
    pub scale: Vector3,
}

pub fn create_transform3d() -> Transform3D {
    let mut out: Transform3D = allocate_entity();
    initialize_transform3d(&mut out);
    return out;
}

pub fn initialize_transform3d(out: &mut Transform3D) {
    initialize_vector3(&mut out.position, 0.0, 0.0, 0.0);
    initialize_quaternion(&mut out.rotation, 0.0, 0.0, 0.0, 1.0);
    initialize_vector3(&mut out.scale, 1.0, 1.0, 1.0);
}

/// Composes a carrier's translation/rotation/scale into a Matrix4 (TRS order).
pub fn compose_matrix4_from_transform3d(out: &mut Matrix4, source: &Transform3D) {
    let x = source.rotation.x;
    let y = source.rotation.y;
    let z = source.rotation.z;
    let w = source.rotation.w;
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

    let sx = source.scale.x;
    let sy = source.scale.y;
    let sz = source.scale.z;

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
    out.m[12] = source.position.x;
    out.m[13] = source.position.y;
    out.m[14] = source.position.z;
    out.m[15] = 1.0;
}

/// Decomposes a Matrix4 into a carrier's translation/rotation/scale (Shepperd method for the
/// quaternion). Best-effort: lossy on shear.
pub fn decompose_matrix4_to_transform3d(out: &mut Transform3D, m: &Matrix4) {
    let mm = &m.m;

    let m00 = mm[0];
    let m01 = mm[1];
    let m02 = mm[2];
    let m10 = mm[4];
    let m11 = mm[5];
    let m12 = mm[6];
    let m20 = mm[8];
    let m21 = mm[9];
    let m22 = mm[10];
    let tx = mm[12];
    let ty = mm[13];
    let tz = mm[14];

    let mut sx = (m00 * m00 + m01 * m01 + m02 * m02).sqrt();
    let sy = (m10 * m10 + m11 * m11 + m12 * m12).sqrt();
    let sz = (m20 * m20 + m21 * m21 + m22 * m22).sqrt();

    let det = m00 * (m11 * m22 - m12 * m21) - m10 * (m01 * m22 - m02 * m21) + m20 * (m01 * m12 - m02 * m11);
    if det < 0.0 { sx = -sx; }

    out.position.x = tx;
    out.position.y = ty;
    out.position.z = tz;
    out.scale.x = sx;
    out.scale.y = sy;
    out.scale.z = sz;

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
        out.rotation.w = 0.25 / s;
        out.rotation.x = (r12 - r21) * s;
        out.rotation.y = (r20 - r02) * s;
        out.rotation.z = (r01 - r10) * s;
    } else if r00 > r11 && r00 > r22 {
        let s = 2.0 * (1.0 + r00 - r11 - r22).sqrt();
        out.rotation.w = (r12 - r21) / s;
        out.rotation.x = 0.25 * s;
        out.rotation.y = (r10 + r01) / s;
        out.rotation.z = (r20 + r02) / s;
    } else if r11 > r22 {
        let s = 2.0 * (1.0 + r11 - r00 - r22).sqrt();
        out.rotation.w = (r20 - r02) / s;
        out.rotation.x = (r10 + r01) / s;
        out.rotation.y = 0.25 * s;
        out.rotation.z = (r21 + r12) / s;
    } else {
        let s = 2.0 * (1.0 + r22 - r00 - r11).sqrt();
        out.rotation.w = (r01 - r10) / s;
        out.rotation.x = (r20 + r02) / s;
        out.rotation.y = (r21 + r12) / s;
        out.rotation.z = 0.25 * s;
    }
}

impl Default for Transform3D {
    fn default() -> Self {
        let mut out = Transform3D {
            runtime: EntityRuntimeSlot::default(),
            position: Vector3::default(),
            rotation: Quaternion::default(),
            scale: Vector3::default(),
        };
        initialize_transform3d(&mut out);
        return out;
    }
}

impl Transform3D {
    pub fn new() -> Self {
        return create_transform3d();
    }
}

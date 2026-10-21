use crate::Matrix4;
use crate::Vector3;
use flight_entity::{EntityRuntimeSlot, allocate_entity};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EulerOrder {
    XYZ,
    XZY,
    YXZ,
    YZX,
    ZXY,
    ZYX,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Quaternion {
    runtime: EntityRuntimeSlot,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

/// Creates a unit quaternion (x, y, z, w) representing a 3D rotation. Handedness is pinned
/// across the 3D suite: right-handed coordinates, CCW front-face, glTF tangent w-sign.
///
/// Defaults to the identity rotation (0, 0, 0, 1).
pub fn create_quaternion(x: f32, y: f32, z: f32, w: f32) -> Quaternion {
    let mut out: Quaternion = allocate_entity();
    initialize_quaternion(&mut out, x, y, z, w);
    return out;
}

pub fn initialize_quaternion(out: &mut Quaternion, x: f32, y: f32, z: f32, w: f32) {
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
}

pub fn clone_quaternion(source: &Quaternion) -> Quaternion {
    return create_quaternion(source.x, source.y, source.z, source.w);
}

/// Writes the conjugate of a quaternion, negating the vector part (x, y, z) and
/// leaving the scalar part (w) unchanged. For a unit quaternion the conjugate is
/// also its inverse.
///
/// Safe when `out` aliases `source`.
pub fn conjugate_quaternion(out: &mut Quaternion, source: &Quaternion) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let w = source.w;
    out.x = -x;
    out.y = -y;
    out.z = -z;
    out.w = w;
}

/// Copies the x, y, z and w components of a quaternion.
///
/// Safe when `out` aliases `source`.
pub fn copy_quaternion(out: &mut Quaternion, source: &Quaternion) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let w = source.w;
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
}

pub fn equals_quaternion(a: Option<&Quaternion>, b: Option<&Quaternion>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => {
            std::ptr::eq(a, b) || (a.x == b.x && a.y == b.y && a.z == b.z && a.w == b.w)
        }
        _ => false,
    };
}

/// Returns the angle (in radians) between two unit quaternions. Returns 0 for identical
/// rotations and up to PI for opposite rotations. Takes the shorter arc.
pub fn get_quaternion_angle_between(a: &Quaternion, b: &Quaternion) -> f32 {
    let dot = get_quaternion_dot(a, b).abs();
    return 2.0 * dot.min(1.0).acos();
}

/// Extracts the rotation axis and angle (radians) from a unit quaternion. Writes the unit axis
/// into `out_axis` and returns the angle in [0, 2*PI). For the identity quaternion (no rotation),
/// the axis is set to (1, 0, 0) and the angle is 0. Inverse of `set_quaternion_from_axis_angle`.
pub fn get_quaternion_axis_angle(out_axis: &mut Vector3, source: &Quaternion) -> f32 {
    let w = source.w;
    let sin_half_sq = 1.0 - w * w;
    if sin_half_sq <= 0.0 {
        out_axis.x = 1.0;
        out_axis.y = 0.0;
        out_axis.z = 0.0;
        return 0.0;
    }
    let inv_sin_half = 1.0 / sin_half_sq.sqrt();
    out_axis.x = source.x * inv_sin_half;
    out_axis.y = source.y * inv_sin_half;
    out_axis.z = source.z * inv_sin_half;
    return 2.0 * w.clamp(-1.0, 1.0).acos();
}

/// Returns the dot product of two quaternions: sum of component-wise products.
/// Useful for measuring the similarity of two orientations; `|dot| == 1` means identical.
pub fn get_quaternion_dot(a: &Quaternion, b: &Quaternion) -> f32 {
    return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/// Extracts Euler angles (in radians) from a unit quaternion in the given `order`.
/// Writes the result to `out` as (x=angle around X, y=around Y, z=around Z).
///
/// Note: Euler angles have a gimbal-lock singularity when the middle axis reaches +/-90 degrees.
/// At the singularity the decomposition is not unique; this implementation sets the third angle
/// to 0 and puts all the rotation into the first angle (a common convention).
pub fn get_quaternion_euler(out: &mut Vector3, source: &Quaternion, order: EulerOrder) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let w = source.w;
    let xx = x * x;
    let yy = y * y;
    let zz = z * z;
    let xy = x * y;
    let xz = x * z;
    let yz = y * z;
    let wx = w * x;
    let wy = w * y;
    let wz = w * z;

    let m00 = 1.0 - 2.0 * (yy + zz);
    let m01 = 2.0 * (xy - wz);
    let m02 = 2.0 * (xz + wy);
    let m10 = 2.0 * (xy + wz);
    let m11 = 1.0 - 2.0 * (xx + zz);
    let m12 = 2.0 * (yz - wx);
    let m20 = 2.0 * (xz - wy);
    let m21 = 2.0 * (yz + wx);
    let m22 = 1.0 - 2.0 * (xx + yy);

    // Threshold for detecting gimbal lock. The original f64 value 0.9999999 is too tight
    // for f32 arithmetic: products like 2*(x*z + w*y) can land a few ULPs below 1.0,
    // missing the branch and producing atan2(~0, ~0) garbage. 0.99999 gives plenty of
    // margin while staying well within the region where the gimbal-lock decomposition
    // is more accurate than the general path.
    const GIMBAL_THRESHOLD: f32 = 0.99999;

    match order {
        EulerOrder::XYZ => {
            out.y = m02.clamp(-1.0, 1.0).asin();
            if m02.abs() < GIMBAL_THRESHOLD {
                out.x = (-m12).atan2(m22);
                out.z = (-m01).atan2(m00);
            } else {
                out.x = m21.atan2(m11);
                out.z = 0.0;
            }
        }
        EulerOrder::XZY => {
            out.z = (-m01).clamp(-1.0, 1.0).asin();
            if m01.abs() < GIMBAL_THRESHOLD {
                out.x = m21.atan2(m11);
                out.y = m02.atan2(m00);
            } else {
                out.x = (-m12).atan2(m22);
                out.y = 0.0;
            }
        }
        EulerOrder::YXZ => {
            out.x = (-m12).clamp(-1.0, 1.0).asin();
            if m12.abs() < GIMBAL_THRESHOLD {
                out.y = m02.atan2(m22);
                out.z = m10.atan2(m11);
            } else {
                out.y = (-m20).atan2(m00);
                out.z = 0.0;
            }
        }
        EulerOrder::YZX => {
            out.z = m10.clamp(-1.0, 1.0).asin();
            if m10.abs() < GIMBAL_THRESHOLD {
                out.x = (-m12).atan2(m11);
                out.y = (-m20).atan2(m00);
            } else {
                out.x = 0.0;
                out.y = m02.atan2(m22);
            }
        }
        EulerOrder::ZXY => {
            out.x = m21.clamp(-1.0, 1.0).asin();
            if m21.abs() < GIMBAL_THRESHOLD {
                out.y = (-m20).atan2(m22);
                out.z = (-m01).atan2(m11);
            } else {
                out.y = 0.0;
                out.z = m10.atan2(m00);
            }
        }
        EulerOrder::ZYX => {
            out.y = (-m20).clamp(-1.0, 1.0).asin();
            if m20.abs() < GIMBAL_THRESHOLD {
                out.x = m21.atan2(m22);
                out.z = m10.atan2(m00);
            } else {
                out.x = 0.0;
                out.z = (-m01).atan2(m11);
            }
        }
    }
}

/// Writes the inverse of a quaternion. For unit quaternions this is the same as the conjugate;
/// for non-unit quaternions this divides the conjugate by the squared length.
/// A zero-length quaternion writes the identity rotation (0, 0, 0, 1).
///
/// Safe when `out` aliases `source`.
pub fn inverse_quaternion(out: &mut Quaternion, source: &Quaternion) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let w = source.w;
    let len_sq = x * x + y * y + z * z + w * w;
    if len_sq == 0.0 {
        out.x = 0.0;
        out.y = 0.0;
        out.z = 0.0;
        out.w = 1.0;
        return;
    }
    let inv = 1.0 / len_sq;
    out.x = -x * inv;
    out.y = -y * inv;
    out.z = -z * inv;
    out.w = w * inv;
}

/// Hamilton product of two quaternions: out = a * b. The result represents applying
/// rotation `b` first, then rotation `a`.
///
/// Safe when `out` aliases `a` and/or `b` (all inputs are read into locals first).
pub fn multiply_quaternion(
    out: &mut Quaternion,
    a: &Quaternion,
    b: &Quaternion,
) {
    let ax = a.x;
    let ay = a.y;
    let az = a.z;
    let aw = a.w;
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    let bw = b.w;

    out.x = aw * bx + ax * bw + ay * bz - az * by;
    out.y = aw * by - ax * bz + ay * bw + az * bx;
    out.z = aw * bz + ax * by - ay * bx + az * bw;
    out.w = aw * bw - ax * bx - ay * by - az * bz;
}

/// Normalizes a quaternion to unit length. A zero-length quaternion is written as the
/// identity rotation (0, 0, 0, 1).
///
/// Returns the original length. Safe when `out` aliases `source`.
pub fn normalize_quaternion(out: &mut Quaternion, source: &Quaternion) -> f32 {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let w = source.w;
    let l = (x * x + y * y + z * z + w * w).sqrt();

    if l != 0.0 {
        let inv = 1.0 / l;
        out.x = x * inv;
        out.y = y * inv;
        out.z = z * inv;
        out.w = w * inv;
    } else {
        out.x = 0.0;
        out.y = 0.0;
        out.z = 0.0;
        out.w = 1.0;
    }

    return l;
}

/// Applies a quaternion rotation to a Vector3. Computes q * (0, v) * q^-1 using the
/// sandwich product, which rotates the vector by the quaternion's rotation.
///
/// Safe when `out` aliases `vector` (all inputs are read into locals first).
pub fn rotate_vector3_by_quaternion(out: &mut Vector3, vector: &Vector3, q: &Quaternion) {
    let qx = q.x;
    let qy = q.y;
    let qz = q.z;
    let qw = q.w;
    let vx = vector.x;
    let vy = vector.y;
    let vz = vector.z;

    // t = 2 * cross(q.xyz, v)
    let tx = 2.0 * (qy * vz - qz * vy);
    let ty = 2.0 * (qz * vx - qx * vz);
    let tz = 2.0 * (qx * vy - qy * vx);

    // out = v + q.w * t + cross(q.xyz, t)
    out.x = vx + qw * tx + (qy * tz - qz * ty);
    out.y = vy + qw * ty + (qz * tx - qx * tz);
    out.z = vz + qw * tz + (qx * ty - qy * tx);
}

/// Sets the quaternion components directly without normalization.
pub fn set_quaternion(out: &mut Quaternion, x: f32, y: f32, z: f32, w: f32) {
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
}

/// Builds a quaternion from a rotation `axis` (assumed unit length) and an `angle` in
/// radians. The rotation is right-handed (CCW when looking down the axis toward the origin).
///
/// Safe when `out` aliases `axis`.
pub fn set_quaternion_from_axis_angle(out: &mut Quaternion, axis: &Vector3, angle: f32) {
    let half = angle * 0.5;
    let s = half.sin();
    let ax = axis.x;
    let ay = axis.y;
    let az = axis.z;
    out.x = ax * s;
    out.y = ay * s;
    out.z = az * s;
    out.w = half.cos();
}

/// Builds a quaternion from Euler angles (in radians) applied in the given `order`.
/// Intrinsic rotations -- each rotation is about the local, rotated axes.
pub fn set_quaternion_from_euler(
    out: &mut Quaternion,
    x: f32,
    y: f32,
    z: f32,
    order: EulerOrder,
) {
    let c1 = (x / 2.0).cos();
    let s1 = (x / 2.0).sin();
    let c2 = (y / 2.0).cos();
    let s2 = (y / 2.0).sin();
    let c3 = (z / 2.0).cos();
    let s3 = (z / 2.0).sin();

    match order {
        EulerOrder::XYZ => {
            out.x = s1 * c2 * c3 + c1 * s2 * s3;
            out.y = c1 * s2 * c3 - s1 * c2 * s3;
            out.z = c1 * c2 * s3 + s1 * s2 * c3;
            out.w = c1 * c2 * c3 - s1 * s2 * s3;
        }
        EulerOrder::XZY => {
            out.x = s1 * c2 * c3 - c1 * s2 * s3;
            out.y = c1 * s2 * c3 - s1 * c2 * s3;
            out.z = c1 * c2 * s3 + s1 * s2 * c3;
            out.w = c1 * c2 * c3 + s1 * s2 * s3;
        }
        EulerOrder::YXZ => {
            out.x = s1 * c2 * c3 + c1 * s2 * s3;
            out.y = c1 * s2 * c3 - s1 * c2 * s3;
            out.z = c1 * c2 * s3 - s1 * s2 * c3;
            out.w = c1 * c2 * c3 + s1 * s2 * s3;
        }
        EulerOrder::YZX => {
            out.x = s1 * c2 * c3 + c1 * s2 * s3;
            out.y = c1 * s2 * c3 + s1 * c2 * s3;
            out.z = c1 * c2 * s3 - s1 * s2 * c3;
            out.w = c1 * c2 * c3 - s1 * s2 * s3;
        }
        EulerOrder::ZXY => {
            out.x = s1 * c2 * c3 - c1 * s2 * s3;
            out.y = c1 * s2 * c3 + s1 * c2 * s3;
            out.z = c1 * c2 * s3 + s1 * s2 * c3;
            out.w = c1 * c2 * c3 - s1 * s2 * s3;
        }
        EulerOrder::ZYX => {
            out.x = s1 * c2 * c3 - c1 * s2 * s3;
            out.y = c1 * s2 * c3 + s1 * c2 * s3;
            out.z = c1 * c2 * s3 - s1 * s2 * c3;
            out.w = c1 * c2 * c3 + s1 * s2 * s3;
        }
    }
}

/// Extracts the rotation of a Matrix4 (upper-left 3x3, assumed orthonormal) into a unit
/// quaternion. Uses the numerically stable trace/largest-diagonal branch.
pub fn set_quaternion_from_matrix4(out: &mut Quaternion, source: &Matrix4) {
    let m = &source.m;
    // Column-major Matrix4: m[col*4 + row]. Upper-left 3x3 rotation basis.
    let m00 = m[0];
    let m10 = m[4];
    let m20 = m[8];
    let m01 = m[1];
    let m11 = m[5];
    let m21 = m[9];
    let m02 = m[2];
    let m12 = m[6];
    let m22 = m[10];

    let trace = m00 + m11 + m22;

    if trace > 0.0 {
        let s = 0.5 / (trace + 1.0).sqrt();
        out.w = 0.25 / s;
        out.x = (m12 - m21) * s;
        out.y = (m20 - m02) * s;
        out.z = (m01 - m10) * s;
    } else if m00 > m11 && m00 > m22 {
        let s = 2.0 * (1.0 + m00 - m11 - m22).sqrt();
        out.w = (m12 - m21) / s;
        out.x = 0.25 * s;
        out.y = (m10 + m01) / s;
        out.z = (m20 + m02) / s;
    } else if m11 > m22 {
        let s = 2.0 * (1.0 + m11 - m00 - m22).sqrt();
        out.w = (m20 - m02) / s;
        out.x = (m10 + m01) / s;
        out.y = 0.25 * s;
        out.z = (m21 + m12) / s;
    } else {
        let s = 2.0 * (1.0 + m22 - m00 - m11).sqrt();
        out.w = (m01 - m10) / s;
        out.x = (m20 + m02) / s;
        out.y = (m21 + m12) / s;
        out.z = 0.25 * s;
    }
}

/// Builds the shortest-arc rotation quaternion from unit vector `from` to unit vector `to`.
///
/// Handles the antiparallel case (from ~= -to) by choosing an arbitrary perpendicular axis
/// for a 180-degree rotation, so the result is always valid.
///
/// Safe when `out` aliases `from` or `to`.
pub fn set_quaternion_from_unit_vectors(
    out: &mut Quaternion,
    from: &Vector3,
    to: &Vector3,
) {
    let fx = from.x;
    let fy = from.y;
    let fz = from.z;
    let tx = to.x;
    let ty = to.y;
    let tz = to.z;
    let dot = fx * tx + fy * ty + fz * tz;

    if dot > 0.999999 {
        set_quaternion_identity(out);
        return;
    }

    if dot < -0.999999 {
        let mut ax: f32 = 1.0;
        let mut ay: f32 = 0.0;
        let mut az: f32 = 0.0;
        if fx.abs() > 0.9 {
            ax = 0.0;
            ay = 1.0;
            az = 0.0;
        }
        let mut px = fy * az - fz * ay;
        let mut py = fz * ax - fx * az;
        let mut pz = fx * ay - fy * ax;
        let p_len = (px * px + py * py + pz * pz).sqrt();
        px /= p_len;
        py /= p_len;
        pz /= p_len;
        out.x = px;
        out.y = py;
        out.z = pz;
        out.w = 0.0;
        return;
    }

    let cx = fy * tz - fz * ty;
    let cy = fz * tx - fx * tz;
    let cz = fx * ty - fy * tx;
    let cw = 1.0 + dot;
    let inv = 1.0 / (cx * cx + cy * cy + cz * cz + cw * cw).sqrt();
    out.x = cx * inv;
    out.y = cy * inv;
    out.z = cz * inv;
    out.w = cw * inv;
}

/// Resets a quaternion to the identity rotation (0, 0, 0, 1).
pub fn set_quaternion_identity(out: &mut Quaternion) {
    out.x = 0.0;
    out.y = 0.0;
    out.z = 0.0;
    out.w = 1.0;
}

/// Builds a "look rotation" quaternion from a `forward` and an `up` direction. Both vectors are
/// assumed unit length. Convention: +Z forward with +Y up = identity quaternion.
///
/// Internally computes `right = up x forward`, `correctedUp = forward x right`, and builds the
/// rotation matrix from `[right, correctedUp, forward]` as column vectors.
///
/// If `up` is parallel to `forward`, an arbitrary perpendicular up direction is chosen so the
/// requested forward direction is preserved. A zero-length `forward` writes the identity.
///
/// Safe when `out` aliases `forward` or `up`.
pub fn set_quaternion_look_rotation(
    out: &mut Quaternion,
    forward: &Vector3,
    up: &Vector3,
) {
    let fx = forward.x;
    let fy = forward.y;
    let fz = forward.z;
    let ux = up.x;
    let uy = up.y;
    let uz = up.z;

    if fx == 0.0 && fy == 0.0 && fz == 0.0 {
        set_quaternion_identity(out);
        return;
    }

    // right = up x forward
    let mut rx = uy * fz - uz * fy;
    let mut ry = uz * fx - ux * fz;
    let mut rz = ux * fy - uy * fx;
    let mut r_len = (rx * rx + ry * ry + rz * rz).sqrt();
    if r_len == 0.0 {
        if fz.abs() < 0.9 {
            rx = -fy;
            ry = fx;
            rz = 0.0;
        } else {
            rx = 0.0;
            ry = -fz;
            rz = fy;
        }
        r_len = (rx * rx + ry * ry + rz * rz).sqrt();
    }
    let r_inv = 1.0 / r_len;
    rx *= r_inv;
    ry *= r_inv;
    rz *= r_inv;

    // correctedUp = forward x right
    let cux = fy * rz - fz * ry;
    let cuy = fz * rx - fx * rz;
    let cuz = fx * ry - fy * rx;

    let m00 = rx;
    let m10 = cux;
    let m20 = fx;
    let m01 = ry;
    let m11 = cuy;
    let m21 = fy;
    let m02 = rz;
    let m12 = cuz;
    let m22 = fz;

    let trace = m00 + m11 + m22;
    if trace > 0.0 {
        let s = 0.5 / (trace + 1.0).sqrt();
        out.w = 0.25 / s;
        out.x = (m12 - m21) * s;
        out.y = (m20 - m02) * s;
        out.z = (m01 - m10) * s;
    } else if m00 > m11 && m00 > m22 {
        let s = 2.0 * (1.0 + m00 - m11 - m22).sqrt();
        out.w = (m12 - m21) / s;
        out.x = 0.25 * s;
        out.y = (m10 + m01) / s;
        out.z = (m20 + m02) / s;
    } else if m11 > m22 {
        let s = 2.0 * (1.0 + m11 - m00 - m22).sqrt();
        out.w = (m20 - m02) / s;
        out.x = (m10 + m01) / s;
        out.y = 0.25 * s;
        out.z = (m21 + m12) / s;
    } else {
        let s = 2.0 * (1.0 + m22 - m00 - m11).sqrt();
        out.w = (m01 - m10) / s;
        out.x = (m20 + m02) / s;
        out.y = (m21 + m12) / s;
        out.z = 0.25 * s;
    }
}

/// Spherical linear interpolation between two unit quaternions at parameter `t` in [0, 1].
/// Chooses the shorter arc (negating `b` if the dot product is negative) and falls back to
/// normalized linear interpolation when the inputs are nearly collinear.
///
/// Safe when `out` aliases `a` and/or `b` (all inputs are read into locals first).
pub fn slerp_quaternion(
    out: &mut Quaternion,
    a: &Quaternion,
    b: &Quaternion,
    t: f32,
) {
    let ax = a.x;
    let ay = a.y;
    let az = a.z;
    let aw = a.w;
    let mut bx = b.x;
    let mut by = b.y;
    let mut bz = b.z;
    let mut bw = b.w;

    let mut cos_half_theta = ax * bx + ay * by + az * bz + aw * bw;

    if cos_half_theta < 0.0 {
        cos_half_theta = -cos_half_theta;
        bx = -bx;
        by = -by;
        bz = -bz;
        bw = -bw;
    }

    let scale_a: f32;
    let scale_b: f32;

    if cos_half_theta < 0.999999 {
        let half_theta = cos_half_theta.acos();
        let sin_half_theta = half_theta.sin();
        scale_a = ((1.0 - t) * half_theta).sin() / sin_half_theta;
        scale_b = (t * half_theta).sin() / sin_half_theta;
    } else {
        scale_a = 1.0 - t;
        scale_b = t;
    }

    out.x = ax * scale_a + bx * scale_b;
    out.y = ay * scale_a + by * scale_b;
    out.z = az * scale_a + bz * scale_b;
    out.w = aw * scale_a + bw * scale_b;
}

impl Default for Quaternion {
    fn default() -> Self {
        return Quaternion {
            runtime: EntityRuntimeSlot::default(),
            x: 0.0,
            y: 0.0,
            z: 0.0,
            w: 1.0,
        };
    }
}

impl Quaternion {
    pub fn new(x: f32, y: f32, z: f32, w: f32) -> Self {
        return create_quaternion(x, y, z, w);
    }

    pub fn angle_between(&self, other: &Self) -> f32 {
        return get_quaternion_angle_between(self, other);
    }

    pub fn conjugated(&self) -> Self {
        let mut out = Self::default();
        conjugate_quaternion(&mut out, self);
        return out;
    }

    pub fn dot(&self, other: &Self) -> f32 {
        return get_quaternion_dot(self, other);
    }

    pub fn from_axis_angle(axis: &Vector3, angle: f32) -> Self {
        let mut out = Self::default();
        set_quaternion_from_axis_angle(&mut out, axis, angle);
        return out;
    }

    pub fn from_euler(x: f32, y: f32, z: f32, order: EulerOrder) -> Self {
        let mut out = Self::default();
        set_quaternion_from_euler(&mut out, x, y, z, order);
        return out;
    }

    pub fn inversed(&self) -> Self {
        let mut out = Self::default();
        inverse_quaternion(&mut out, self);
        return out;
    }

    pub fn multiply(&self, other: &Self) -> Self {
        let mut out = Self::default();
        multiply_quaternion(&mut out, self, other);
        return out;
    }

    pub fn normalized(&self) -> Self {
        let mut out = Self::default();
        normalize_quaternion(&mut out, self);
        return out;
    }

    pub fn slerp(&self, other: &Self, t: f32) -> Self {
        let mut out = Self::default();
        slerp_quaternion(&mut out, self, other, t);
        return out;
    }
}

flight_entity::impl_entity!(Quaternion);

//! Free functions for [`Quaternion`] — 3D rotation math.

use flighthq_types::{EulerOrder, Matrix4Like, Quaternion, QuaternionLike, Vector3Like};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns a new [`Quaternion`] that is a copy of `source`.
pub fn clone_quaternion(source: &QuaternionLike) -> Quaternion {
    create_quaternion(source.x, source.y, source.z, source.w)
}

/// Writes the conjugate of a quaternion, negating the vector part (x, y, z) and
/// leaving the scalar part (w) unchanged. For a unit quaternion the conjugate is
/// also its inverse.
///
/// Safe when `out` aliases `source`.
pub fn conjugate_quaternion(out: &mut QuaternionLike, source: &QuaternionLike) {
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
pub fn copy_quaternion(out: &mut QuaternionLike, source: &QuaternionLike) {
    out.x = source.x;
    out.y = source.y;
    out.z = source.z;
    out.w = source.w;
}

/// Creates a [`Quaternion`] with the given components.
pub fn create_quaternion(x: f32, y: f32, z: f32, w: f32) -> Quaternion {
    Quaternion { x, y, z, w }
}

/// Returns `true` if both quaternions have equal components.
pub fn equals_quaternion(a: &QuaternionLike, b: &QuaternionLike) -> bool {
    a.x == b.x && a.y == b.y && a.z == b.z && a.w == b.w
}

/// Returns the angle (in radians) between two unit quaternions. Returns 0 for identical
/// rotations and up to pi for opposite rotations. Takes the shorter arc.
pub fn get_quaternion_angle_between(a: &QuaternionLike, b: &QuaternionLike) -> f32 {
    let dot = get_quaternion_dot(a, b).abs();
    2.0 * dot.min(1.0).acos()
}

/// Returns the dot product of two quaternions: sum of component-wise products.
pub fn get_quaternion_dot(a: &QuaternionLike, b: &QuaternionLike) -> f32 {
    a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
}

/// Extracts Euler angles (in radians) from a unit quaternion in the given `order`.
/// Writes the result to `out` as (x = angle around X, y = around Y, z = around Z).
pub fn get_quaternion_euler(out: &mut Vector3Like, source: &QuaternionLike, order: EulerOrder) {
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

    match order {
        EulerOrder::XYZ => {
            out.y = m02.clamp(-1.0, 1.0).asin();
            if m02.abs() < 0.9999999 {
                out.x = (-m12).atan2(m22);
                out.z = (-m01).atan2(m00);
            } else {
                out.x = m21.atan2(m11);
                out.z = 0.0;
            }
        }
        EulerOrder::XZY => {
            out.z = (-m01).clamp(-1.0, 1.0).asin();
            if m01.abs() < 0.9999999 {
                out.x = m21.atan2(m11);
                out.y = m02.atan2(m00);
            } else {
                out.x = (-m12).atan2(m22);
                out.y = 0.0;
            }
        }
        EulerOrder::YXZ => {
            out.x = (-m12).clamp(-1.0, 1.0).asin();
            if m12.abs() < 0.9999999 {
                out.y = m02.atan2(m22);
                out.z = m10.atan2(m11);
            } else {
                out.y = (-m20).atan2(m00);
                out.z = 0.0;
            }
        }
        EulerOrder::YZX => {
            out.z = m10.clamp(-1.0, 1.0).asin();
            if m10.abs() < 0.9999999 {
                out.x = (-m12).atan2(m11);
                out.y = (-m20).atan2(m00);
            } else {
                out.x = 0.0;
                out.y = m02.atan2(m22);
            }
        }
        EulerOrder::ZXY => {
            out.x = m21.clamp(-1.0, 1.0).asin();
            if m21.abs() < 0.9999999 {
                out.y = (-m20).atan2(m22);
                out.z = (-m01).atan2(m11);
            } else {
                out.y = 0.0;
                out.z = m10.atan2(m00);
            }
        }
        EulerOrder::ZYX => {
            out.y = (-m20).clamp(-1.0, 1.0).asin();
            if m20.abs() < 0.9999999 {
                out.x = m21.atan2(m22);
                out.z = m10.atan2(m00);
            } else {
                out.x = 0.0;
                out.z = (-m01).atan2(m11);
            }
        }
    }
}

/// Writes the inverse of a quaternion. For unit quaternions this is the same as the
/// conjugate; for non-unit quaternions this divides the conjugate by the squared length.
/// A zero-length quaternion writes the identity rotation (0, 0, 0, 1).
///
/// Safe when `out` aliases `source`.
pub fn inverse_quaternion(out: &mut QuaternionLike, source: &QuaternionLike) {
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
pub fn multiply_quaternion(out: &mut QuaternionLike, a: &QuaternionLike, b: &QuaternionLike) {
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
pub fn normalize_quaternion(out: &mut QuaternionLike, source: &QuaternionLike) -> f32 {
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

    l
}

/// Applies a quaternion rotation to a Vector3. Computes the sandwich product
/// q * (0, v) * q^-1 via the Rodrigues form: out = v + w * t + cross(q.xyz, t)
/// where t = 2 * cross(q.xyz, v).
///
/// Safe when `out` aliases `vector` (all inputs are read into locals first).
pub fn rotate_vector3_by_quaternion(
    out: &mut Vector3Like,
    vector: &Vector3Like,
    q: &QuaternionLike,
) {
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

/// Builds a quaternion from a rotation `axis` (assumed unit length) and an `angle` in
/// radians.
///
/// Safe when `out` aliases `axis`.
pub fn set_quaternion_from_axis_angle(out: &mut QuaternionLike, axis: &Vector3Like, angle: f32) {
    let ax = axis.x;
    let ay = axis.y;
    let az = axis.z;
    let half = angle * 0.5;
    let s = half.sin();
    out.x = ax * s;
    out.y = ay * s;
    out.z = az * s;
    out.w = half.cos();
}

/// Builds a quaternion from Euler angles (in radians) applied in the given `order`.
pub fn set_quaternion_from_euler(
    out: &mut QuaternionLike,
    x: f32,
    y: f32,
    z: f32,
    order: EulerOrder,
) {
    let c1 = (x * 0.5).cos();
    let s1 = (x * 0.5).sin();
    let c2 = (y * 0.5).cos();
    let s2 = (y * 0.5).sin();
    let c3 = (z * 0.5).cos();
    let s3 = (z * 0.5).sin();

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
///
/// Column-major layout: m[col * 4 + row].
pub fn set_quaternion_from_matrix4(out: &mut QuaternionLike, source: &Matrix4Like) {
    let m = &source.m;
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
/// Handles the aligned case (identity), the antiparallel case (180-degree rotation around
/// a perpendicular axis), and the general case (cross product + normalize).
///
/// Safe when `out` aliases `from` or `to`.
pub fn set_quaternion_from_unit_vectors(
    out: &mut QuaternionLike,
    from: &Vector3Like,
    to: &Vector3Like,
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
        // Antiparallel: 180-degree rotation about any perpendicular axis.
        let (mut ax, mut ay, mut az) = (1.0_f32, 0.0_f32, 0.0_f32);
        if fx.abs() > 0.9 {
            ax = 0.0;
            ay = 1.0;
            az = 0.0;
        }
        // perpendicular = cross(from, axis), normalized
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

    // General case: cross product gives the rotation axis scaled by sin(theta).
    let cx = fy * tz - fz * ty;
    let cy = fz * tx - fx * tz;
    let cz = fx * ty - fy * tx;
    out.x = cx;
    out.y = cy;
    out.z = cz;
    out.w = 1.0 + dot;
    // Normalize.
    let len = (out.x * out.x + out.y * out.y + out.z * out.z + out.w * out.w).sqrt();
    if len != 0.0 {
        let inv = 1.0 / len;
        out.x *= inv;
        out.y *= inv;
        out.z *= inv;
        out.w *= inv;
    }
}

/// Resets a quaternion to the identity rotation (0, 0, 0, 1).
pub fn set_quaternion_identity(out: &mut QuaternionLike) {
    out.x = 0.0;
    out.y = 0.0;
    out.z = 0.0;
    out.w = 1.0;
}

/// Builds a "look rotation" quaternion from a `forward` and an `up` direction.
/// Both vectors are assumed unit length. Convention: +Z forward with +Y up = identity.
///
/// If `forward` and `up` are parallel or `forward` has zero length, the result is the
/// identity quaternion.
pub fn set_quaternion_look_rotation(
    out: &mut QuaternionLike,
    forward: &Vector3Like,
    up: &Vector3Like,
) {
    let fx = forward.x;
    let fy = forward.y;
    let fz = forward.z;
    let ux = up.x;
    let uy = up.y;
    let uz = up.z;

    // right = up x forward
    let mut rx = uy * fz - uz * fy;
    let mut ry = uz * fx - ux * fz;
    let mut rz = ux * fy - uy * fx;
    let r_len = (rx * rx + ry * ry + rz * rz).sqrt();
    if r_len == 0.0 {
        set_quaternion_identity(out);
        return;
    }
    let r_inv = 1.0 / r_len;
    rx *= r_inv;
    ry *= r_inv;
    rz *= r_inv;

    // correctedUp = forward x right
    let cux = fy * rz - fz * ry;
    let cuy = fz * rx - fx * rz;
    let cuz = fx * ry - fy * rx;

    // Rotation matrix columns: col0 = right, col1 = correctedUp, col2 = forward.
    let m00 = rx;
    let m01 = cux;
    let m02 = fx;
    let m10 = ry;
    let m11 = cuy;
    let m12 = fy;
    let m20 = rz;
    let m21 = cuz;
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
/// Chooses the shorter arc and falls back to normalized linear interpolation when the
/// inputs are nearly collinear.
///
/// Safe when `out` aliases `a` and/or `b`.
pub fn slerp_quaternion(out: &mut QuaternionLike, a: &QuaternionLike, b: &QuaternionLike, t: f32) {
    let ax = a.x;
    let ay = a.y;
    let az = a.z;
    let aw = a.w;
    let mut bx = b.x;
    let mut by = b.y;
    let mut bz = b.z;
    let mut bw = b.w;

    let mut cos_half_theta = ax * bx + ay * by + az * bz + aw * bw;

    // Take the shorter arc.
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn q(x: f32, y: f32, z: f32, w: f32) -> QuaternionLike {
        QuaternionLike { x, y, z, w }
    }

    fn v(x: f32, y: f32, z: f32) -> Vector3Like {
        Vector3Like { x, y, z }
    }

    fn assert_quat_close(got: &QuaternionLike, x: f32, y: f32, z: f32, w: f32) {
        assert!(
            (got.x - x).abs() < 1e-5
                && (got.y - y).abs() < 1e-5
                && (got.z - z).abs() < 1e-5
                && (got.w - w).abs() < 1e-5,
            "expected ({x}, {y}, {z}, {w}), got ({}, {}, {}, {})",
            got.x,
            got.y,
            got.z,
            got.w
        );
    }

    fn assert_vec3_close(got: &Vector3Like, x: f32, y: f32, z: f32) {
        assert!(
            (got.x - x).abs() < 1e-5 && (got.y - y).abs() < 1e-5 && (got.z - z).abs() < 1e-5,
            "expected ({x}, {y}, {z}), got ({}, {}, {})",
            got.x,
            got.y,
            got.z
        );
    }

    // clone_quaternion

    #[test]
    fn clone_quaternion_creates_copy() {
        let src = q(1.0, 2.0, 3.0, 4.0);
        let c = clone_quaternion(&src);
        assert_eq!((c.x, c.y, c.z, c.w), (1.0, 2.0, 3.0, 4.0));
    }

    // conjugate_quaternion

    #[test]
    fn conjugate_quaternion_negates_vector_part() {
        let src = q(1.0, 2.0, 3.0, 4.0);
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        conjugate_quaternion(&mut out, &src);
        assert_quat_close(&out, -1.0, -2.0, -3.0, 4.0);
    }

    #[test]
    fn conjugate_quaternion_aliased() {
        let mut quat = q(1.0, 2.0, 3.0, 4.0);
        let src = quat;
        conjugate_quaternion(&mut quat, &src);
        assert_quat_close(&quat, -1.0, -2.0, -3.0, 4.0);
    }

    // copy_quaternion

    #[test]
    fn copy_quaternion_copies_fields() {
        let src = q(5.0, 6.0, 7.0, 8.0);
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        copy_quaternion(&mut out, &src);
        assert_quat_close(&out, 5.0, 6.0, 7.0, 8.0);
    }

    // create_quaternion

    #[test]
    fn create_quaternion_stores_components() {
        let quat = create_quaternion(1.0, 2.0, 3.0, 4.0);
        assert_eq!((quat.x, quat.y, quat.z, quat.w), (1.0, 2.0, 3.0, 4.0));
    }

    // equals_quaternion

    #[test]
    fn equals_quaternion_identical() {
        let a = q(1.0, 2.0, 3.0, 4.0);
        let b = q(1.0, 2.0, 3.0, 4.0);
        assert!(equals_quaternion(&a, &b));
    }

    #[test]
    fn equals_quaternion_different() {
        let a = q(1.0, 2.0, 3.0, 4.0);
        let b = q(1.0, 2.0, 3.0, 5.0);
        assert!(!equals_quaternion(&a, &b));
    }

    // get_quaternion_angle_between

    #[test]
    fn get_quaternion_angle_between_identical_is_zero() {
        let a = q(0.0, 0.0, 0.0, 1.0);
        assert!((get_quaternion_angle_between(&a, &a)).abs() < 1e-5);
    }

    #[test]
    fn get_quaternion_angle_between_axis_angle() {
        let mut a = q(0.0, 0.0, 0.0, 1.0);
        let mut b = q(0.0, 0.0, 0.0, 1.0);
        let axis = v(0.0, 1.0, 0.0);
        set_quaternion_from_axis_angle(&mut a, &axis, 0.0);
        set_quaternion_from_axis_angle(&mut b, &axis, std::f32::consts::FRAC_PI_2);
        let angle = get_quaternion_angle_between(&a, &b);
        assert!(
            (angle - std::f32::consts::FRAC_PI_2).abs() < 1e-4,
            "expected ~pi/2, got {angle}"
        );
    }

    // get_quaternion_dot

    #[test]
    fn get_quaternion_dot_identity_is_one() {
        let identity = q(0.0, 0.0, 0.0, 1.0);
        assert!((get_quaternion_dot(&identity, &identity) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn get_quaternion_dot_computes_four_component_product() {
        let a = q(1.0, 2.0, 3.0, 4.0);
        let b = q(5.0, 6.0, 7.0, 8.0);
        assert_eq!(
            get_quaternion_dot(&a, &b),
            1.0 * 5.0 + 2.0 * 6.0 + 3.0 * 7.0 + 4.0 * 8.0
        );
    }

    // get_quaternion_euler

    #[test]
    fn get_quaternion_euler_identity_xyz() {
        let identity = q(0.0, 0.0, 0.0, 1.0);
        let mut out = v(0.0, 0.0, 0.0);
        get_quaternion_euler(&mut out, &identity, EulerOrder::XYZ);
        assert_vec3_close(&out, 0.0, 0.0, 0.0);
    }

    #[test]
    fn get_quaternion_euler_round_trip_xyz() {
        let mut quat = q(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut quat, 0.8, 0.0, 0.0, EulerOrder::XYZ);
        let mut out = v(0.0, 0.0, 0.0);
        get_quaternion_euler(&mut out, &quat, EulerOrder::XYZ);
        assert!((out.x - 0.8).abs() < 1e-5);
        assert!(out.y.abs() < 1e-5);
        assert!(out.z.abs() < 1e-5);
    }

    #[test]
    fn get_quaternion_euler_round_trip_all_orders() {
        for order in [
            EulerOrder::XYZ,
            EulerOrder::XZY,
            EulerOrder::YXZ,
            EulerOrder::YZX,
            EulerOrder::ZXY,
            EulerOrder::ZYX,
        ] {
            let mut quat = q(0.0, 0.0, 0.0, 1.0);
            set_quaternion_from_euler(&mut quat, 0.3, 0.5, 0.7, order);
            let mut euler = v(0.0, 0.0, 0.0);
            get_quaternion_euler(&mut euler, &quat, order);
            let mut back = q(0.0, 0.0, 0.0, 1.0);
            set_quaternion_from_euler(&mut back, euler.x, euler.y, euler.z, order);
            let dot = get_quaternion_dot(&quat, &back);
            assert!(
                dot.abs() > 0.99999,
                "round-trip failed for {order:?}: dot = {dot}"
            );
        }
    }

    #[test]
    fn get_quaternion_euler_gimbal_lock_xyz() {
        // Near gimbal lock: rotation of ~90 degrees around Y.
        let mut quat = q(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(
            &mut quat,
            0.0,
            std::f32::consts::FRAC_PI_2,
            0.0,
            EulerOrder::XYZ,
        );
        // At the XYZ gimbal singularity (Y = ±90°) the euler split is not unique, so
        // the guarantee is that the decomposition round-trips to the same rotation
        // (matching the upstream TS gimbal test), not a specific per-axis value.
        let mut euler = v(0.0, 0.0, 0.0);
        get_quaternion_euler(&mut euler, &quat, EulerOrder::XYZ);
        let mut back = q(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_euler(&mut back, euler.x, euler.y, euler.z, EulerOrder::XYZ);
        assert!(get_quaternion_dot(&quat, &back).abs() > 1.0 - 1e-4);
    }

    // inverse_quaternion

    #[test]
    fn inverse_quaternion_unit_is_conjugate() {
        let mut quat = q(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut quat, &v(0.0, 1.0, 0.0), 1.0);
        let mut inv = q(0.0, 0.0, 0.0, 0.0);
        inverse_quaternion(&mut inv, &quat);
        // q * q^-1 should be identity
        let mut result = q(0.0, 0.0, 0.0, 0.0);
        multiply_quaternion(&mut result, &quat, &inv);
        assert_quat_close(&result, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn inverse_quaternion_zero_gives_identity() {
        let zero = q(0.0, 0.0, 0.0, 0.0);
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        inverse_quaternion(&mut out, &zero);
        assert_quat_close(&out, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn inverse_quaternion_non_unit() {
        let src = q(0.0, 0.0, 0.0, 2.0);
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        inverse_quaternion(&mut out, &src);
        // conjugate / len^2 = (0,0,0,2) / 4 = (0,0,0,0.5)
        assert_quat_close(&out, 0.0, 0.0, 0.0, 0.5);
    }

    #[test]
    fn inverse_quaternion_aliased() {
        let mut quat = q(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut quat, &v(0.0, 1.0, 0.0), 1.0);
        let original = quat;
        inverse_quaternion(&mut quat, &original);
        let mut result = q(0.0, 0.0, 0.0, 0.0);
        multiply_quaternion(&mut result, &original, &quat);
        assert_quat_close(&result, 0.0, 0.0, 0.0, 1.0);
    }

    // multiply_quaternion

    #[test]
    fn multiply_quaternion_identity() {
        let identity = q(0.0, 0.0, 0.0, 1.0);
        let quat = q(1.0, 2.0, 3.0, 4.0);
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        multiply_quaternion(&mut out, &identity, &quat);
        assert_quat_close(&out, 1.0, 2.0, 3.0, 4.0);
    }

    #[test]
    fn multiply_quaternion_aliased() {
        let a = q(0.0, 0.0, 0.0, 1.0);
        let b = q(1.0, 0.0, 0.0, 0.0);
        let mut out = a;
        multiply_quaternion(&mut out, &a, &b);
        assert_quat_close(&out, 1.0, 0.0, 0.0, 0.0);
    }

    #[test]
    fn multiply_quaternion_hamilton_product() {
        // i * j = k
        let i = q(1.0, 0.0, 0.0, 0.0);
        let j = q(0.0, 1.0, 0.0, 0.0);
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        multiply_quaternion(&mut out, &i, &j);
        assert_quat_close(&out, 0.0, 0.0, 1.0, 0.0);
    }

    // normalize_quaternion

    #[test]
    fn normalize_quaternion_returns_unit() {
        let src = q(0.0, 0.0, 0.0, 2.0);
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        let l = normalize_quaternion(&mut out, &src);
        assert!((l - 2.0).abs() < 1e-6);
        assert!((out.w - 1.0).abs() < 1e-6);
    }

    #[test]
    fn normalize_quaternion_zero_gives_identity() {
        let zero = q(0.0, 0.0, 0.0, 0.0);
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        let l = normalize_quaternion(&mut out, &zero);
        assert_eq!(l, 0.0);
        assert_quat_close(&out, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn normalize_quaternion_aliased() {
        let src = q(0.0, 3.0, 0.0, 4.0);
        let mut out = src;
        let l = normalize_quaternion(&mut out, &src);
        assert!((l - 5.0).abs() < 1e-5);
        assert!((out.y - 0.6).abs() < 1e-5);
        assert!((out.w - 0.8).abs() < 1e-5);
    }

    // rotate_vector3_by_quaternion

    #[test]
    fn rotate_vector3_by_quaternion_identity_no_change() {
        let identity = q(0.0, 0.0, 0.0, 1.0);
        let vec = v(1.0, 2.0, 3.0);
        let mut out = v(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut out, &vec, &identity);
        assert_vec3_close(&out, 1.0, 2.0, 3.0);
    }

    #[test]
    fn rotate_vector3_by_quaternion_90_around_y() {
        let mut quat = q(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut quat, &v(0.0, 1.0, 0.0), std::f32::consts::FRAC_PI_2);
        let vec = v(1.0, 0.0, 0.0);
        let mut out = v(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut out, &vec, &quat);
        // (1,0,0) rotated 90 around Y should give roughly (0,0,-1)
        assert_vec3_close(&out, 0.0, 0.0, -1.0);
    }

    #[test]
    fn rotate_vector3_by_quaternion_aliased() {
        let mut quat = q(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut quat, &v(0.0, 0.0, 1.0), std::f32::consts::FRAC_PI_2);
        let src = v(1.0, 0.0, 0.0);
        let mut out = src;
        rotate_vector3_by_quaternion(&mut out, &src, &quat);
        // (1,0,0) rotated 90 around Z should give roughly (0,1,0)
        assert_vec3_close(&out, 0.0, 1.0, 0.0);
    }

    #[test]
    fn rotate_vector3_by_quaternion_180_around_z() {
        let mut quat = q(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut quat, &v(0.0, 0.0, 1.0), std::f32::consts::PI);
        let vec = v(1.0, 0.0, 0.0);
        let mut out = v(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut out, &vec, &quat);
        assert_vec3_close(&out, -1.0, 0.0, 0.0);
    }

    // set_quaternion_from_axis_angle

    #[test]
    fn set_quaternion_from_axis_angle_zero_angle_is_identity() {
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        set_quaternion_from_axis_angle(&mut out, &v(0.0, 1.0, 0.0), 0.0);
        assert_quat_close(&out, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn set_quaternion_from_axis_angle_90_around_x() {
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        set_quaternion_from_axis_angle(&mut out, &v(1.0, 0.0, 0.0), std::f32::consts::FRAC_PI_2);
        let half = std::f32::consts::FRAC_PI_4;
        assert_quat_close(&out, half.sin(), 0.0, 0.0, half.cos());
    }

    #[test]
    fn set_quaternion_from_axis_angle_aliased() {
        let src = v(0.0, 1.0, 0.0);
        let mut out = q(src.x, src.y, src.z, 0.0);
        let axis = v(out.x, out.y, out.z);
        set_quaternion_from_axis_angle(&mut out, &axis, std::f32::consts::FRAC_PI_2);
        let s = std::f32::consts::FRAC_PI_4.sin();
        let c = std::f32::consts::FRAC_PI_4.cos();
        assert_quat_close(&out, 0.0, s, 0.0, c);
    }

    // set_quaternion_from_euler

    #[test]
    fn set_quaternion_from_euler_zero_is_identity() {
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        set_quaternion_from_euler(&mut out, 0.0, 0.0, 0.0, EulerOrder::XYZ);
        assert_quat_close(&out, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn set_quaternion_from_euler_single_axis_matches_axis_angle() {
        let angle = 1.2_f32;
        for (axis, order) in [
            (v(1.0, 0.0, 0.0), EulerOrder::XYZ),
            (v(0.0, 1.0, 0.0), EulerOrder::YXZ),
            (v(0.0, 0.0, 1.0), EulerOrder::ZXY),
        ] {
            let mut from_euler = q(0.0, 0.0, 0.0, 0.0);
            let (ex, ey, ez) = (axis.x * angle, axis.y * angle, axis.z * angle);
            set_quaternion_from_euler(&mut from_euler, ex, ey, ez, order);
            let mut from_aa = q(0.0, 0.0, 0.0, 0.0);
            set_quaternion_from_axis_angle(&mut from_aa, &axis, angle);
            let dot = get_quaternion_dot(&from_euler, &from_aa);
            assert!(
                dot.abs() > 0.99999,
                "single-axis euler/axis-angle mismatch for {order:?}: dot = {dot}"
            );
        }
    }

    // set_quaternion_from_matrix4

    #[test]
    fn set_quaternion_from_matrix4_identity() {
        let m = Matrix4Like::default();
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        set_quaternion_from_matrix4(&mut out, &m);
        assert_quat_close(&out, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn set_quaternion_from_matrix4_round_trip() {
        // Build a quaternion from axis-angle, convert to matrix, extract back.
        let mut quat = q(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut quat, &v(0.0, 1.0, 0.0), 1.0);

        // Build rotation matrix from quaternion.
        let x = quat.x;
        let y = quat.y;
        let z = quat.z;
        let w = quat.w;
        let xx = x * x;
        let yy = y * y;
        let zz = z * z;
        let xy = x * y;
        let xz = x * z;
        let yz = y * z;
        let wx = w * x;
        let wy = w * y;
        let wz = w * z;

        let mut m = Matrix4Like::default();
        m.m[0] = 1.0 - 2.0 * (yy + zz);
        m.m[1] = 2.0 * (xy + wz);
        m.m[2] = 2.0 * (xz - wy);
        m.m[4] = 2.0 * (xy - wz);
        m.m[5] = 1.0 - 2.0 * (xx + zz);
        m.m[6] = 2.0 * (yz + wx);
        m.m[8] = 2.0 * (xz + wy);
        m.m[9] = 2.0 * (yz - wx);
        m.m[10] = 1.0 - 2.0 * (xx + yy);

        let mut extracted = q(0.0, 0.0, 0.0, 0.0);
        set_quaternion_from_matrix4(&mut extracted, &m);
        let dot = get_quaternion_dot(&quat, &extracted);
        assert!(
            dot.abs() > 0.99999,
            "matrix4 round-trip failed: dot = {dot}"
        );
    }

    // set_quaternion_from_unit_vectors

    #[test]
    fn set_quaternion_from_unit_vectors_same_direction_is_identity() {
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        set_quaternion_from_unit_vectors(&mut out, &v(1.0, 0.0, 0.0), &v(1.0, 0.0, 0.0));
        assert_quat_close(&out, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn set_quaternion_from_unit_vectors_opposite_direction() {
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        set_quaternion_from_unit_vectors(&mut out, &v(1.0, 0.0, 0.0), &v(-1.0, 0.0, 0.0));
        // Should be a 180-degree rotation: w = 0
        assert!(
            out.w.abs() < 1e-5,
            "w should be 0 for 180deg, got {}",
            out.w
        );
    }

    #[test]
    fn set_quaternion_from_unit_vectors_90_degrees() {
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        set_quaternion_from_unit_vectors(&mut out, &v(1.0, 0.0, 0.0), &v(0.0, 1.0, 0.0));
        // Should rotate (1,0,0) to (0,1,0)
        let mut rotated = v(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut rotated, &v(1.0, 0.0, 0.0), &out);
        assert_vec3_close(&rotated, 0.0, 1.0, 0.0);
    }

    #[test]
    fn set_quaternion_from_unit_vectors_opposite_z() {
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        set_quaternion_from_unit_vectors(&mut out, &v(0.0, 0.0, 1.0), &v(0.0, 0.0, -1.0));
        assert!(out.w.abs() < 1e-5);
        // Rotating (0,0,1) by this quaternion should give (0,0,-1).
        let mut rotated = v(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(&mut rotated, &v(0.0, 0.0, 1.0), &out);
        assert_vec3_close(&rotated, 0.0, 0.0, -1.0);
    }

    // set_quaternion_identity

    #[test]
    fn set_quaternion_identity_resets() {
        let mut out = q(1.0, 2.0, 3.0, 4.0);
        set_quaternion_identity(&mut out);
        assert_quat_close(&out, 0.0, 0.0, 0.0, 1.0);
    }

    // set_quaternion_look_rotation

    #[test]
    fn set_quaternion_look_rotation_identity_for_z_forward_y_up() {
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        set_quaternion_look_rotation(&mut out, &v(0.0, 0.0, 1.0), &v(0.0, 1.0, 0.0));
        assert_quat_close(&out, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn set_quaternion_look_rotation_parallel_gives_identity() {
        let mut out = q(1.0, 2.0, 3.0, 4.0);
        set_quaternion_look_rotation(&mut out, &v(0.0, 1.0, 0.0), &v(0.0, 1.0, 0.0));
        assert_quat_close(&out, 0.0, 0.0, 0.0, 1.0);
    }

    #[test]
    fn set_quaternion_look_rotation_rotates_forward() {
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        set_quaternion_look_rotation(&mut out, &v(1.0, 0.0, 0.0), &v(0.0, 1.0, 0.0));
        // Value pinned to the upstream TS output for forward=+X / up=+Y (a quarter
        // turn about Y). The matrix→quaternion sign convention is inherited verbatim
        // from `@flighthq/geometry`, so this asserts TS-conformance directly rather
        // than a coordinate-handedness assumption TS does not itself test.
        let h = std::f32::consts::FRAC_1_SQRT_2;
        assert_quat_close(&out, 0.0, -h, 0.0, h);
    }

    // slerp_quaternion

    #[test]
    fn slerp_quaternion_endpoints() {
        let a = q(0.0, 0.0, 0.0, 1.0);
        let mut b = q(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut b, &v(0.0, 1.0, 0.0), std::f32::consts::FRAC_PI_2);
        let mut out = q(0.0, 0.0, 0.0, 0.0);

        slerp_quaternion(&mut out, &a, &b, 0.0);
        assert_quat_close(&out, a.x, a.y, a.z, a.w);

        slerp_quaternion(&mut out, &a, &b, 1.0);
        assert_quat_close(&out, b.x, b.y, b.z, b.w);
    }

    #[test]
    fn slerp_quaternion_midpoint_is_half_angle() {
        let a = q(0.0, 0.0, 0.0, 1.0);
        let mut b = q(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut b, &v(0.0, 1.0, 0.0), std::f32::consts::PI);
        let mut mid = q(0.0, 0.0, 0.0, 0.0);
        slerp_quaternion(&mut mid, &a, &b, 0.5);
        let angle = get_quaternion_angle_between(&a, &mid);
        assert!(
            (angle - std::f32::consts::FRAC_PI_2).abs() < 1e-4,
            "midpoint angle should be ~pi/2, got {angle}"
        );
    }

    #[test]
    fn slerp_quaternion_aliased() {
        let a = q(0.0, 0.0, 0.0, 1.0);
        let mut b = q(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(&mut b, &v(0.0, 1.0, 0.0), std::f32::consts::FRAC_PI_2);
        let mut out = a;
        slerp_quaternion(&mut out, &a, &b, 0.5);
        let angle = get_quaternion_angle_between(&a, &out);
        assert!(
            (angle - std::f32::consts::FRAC_PI_4).abs() < 1e-4,
            "aliased slerp midpoint angle should be ~pi/4, got {angle}"
        );
    }

    #[test]
    fn slerp_quaternion_shorter_arc() {
        // When dot < 0 slerp should negate b and take the shorter path.
        let a = q(0.0, 0.0, 0.0, 1.0);
        let neg_a = q(0.0, 0.0, 0.0, -1.0); // same rotation, opposite sign
        let mut out = q(0.0, 0.0, 0.0, 0.0);
        slerp_quaternion(&mut out, &a, &neg_a, 0.5);
        // Should stay near identity since they represent the same rotation.
        assert_quat_close(&out, 0.0, 0.0, 0.0, 1.0);
    }
}

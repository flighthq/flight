//! Local-transform edits and reads for scene nodes.
//!
//! Ports the TS `@flighthq/scene` `sceneNodeTransform.ts`. Each function reads
//! or writes the node's `local_matrix` (a column-major 4×4). Setters mark the
//! cached `world_matrix` dirty. Getters are alias-safe: `out` is a distinct
//! value type, and inputs are read into locals before any write.
//!
//! TS↔Rust divergence: the TS quaternion functions take a `Quaternion` /
//! `QuaternionLike`. The geometry crate's `Quaternion` header type is not yet
//! compiled (its module is unwired), so the quaternion is carried as a
//! [`Vector4Like`] whose `(x, y, z, w)` fields are the quaternion components —
//! the same field layout a `QuaternionLike` would have. Compose/decompose math
//! is implemented locally here for the same reason (`compose_matrix4` /
//! `decompose_matrix4` are not yet compiled in `flighthq-geometry`).

use flighthq_node::NodeId;
use flighthq_types::{Vector3Like, Vector4Like};

use crate::scene_node::SceneArena;

/// Writes the translation component of the node's `local_matrix` into `out`.
pub fn get_scene_node_position(out: &mut Vector3Like, arena: &SceneArena, node: NodeId) {
    let m = &arena[node].local_matrix.m;
    out.x = m[12];
    out.y = m[13];
    out.z = m[14];
}

/// Writes the rotation quaternion of the node's `local_matrix` into `out`
/// (`out.x/y/z/w` are the quaternion components). Scale is divided out before
/// extraction, so a scaled node still yields a unit rotation.
pub fn get_scene_node_rotation_quaternion(out: &mut Vector4Like, arena: &SceneArena, node: NodeId) {
    let m = &arena[node].local_matrix.m;
    let (sx, sy, sz) = decompose_scale(m);
    let inv_sx = if sx != 0.0 { 1.0 / sx } else { 0.0 };
    let inv_sy = if sy != 0.0 { 1.0 / sy } else { 0.0 };
    let inv_sz = if sz != 0.0 { 1.0 / sz } else { 0.0 };
    // Normalized rotation basis (column-major: element row i col j = m[j*4 + i]).
    let r00 = m[0] * inv_sx;
    let r10 = m[1] * inv_sx;
    let r20 = m[2] * inv_sx;
    let r01 = m[4] * inv_sy;
    let r11 = m[5] * inv_sy;
    let r21 = m[6] * inv_sy;
    let r02 = m[8] * inv_sz;
    let r12 = m[9] * inv_sz;
    let r22 = m[10] * inv_sz;
    quaternion_from_rotation(out, r00, r10, r20, r01, r11, r21, r02, r12, r22);
}

/// Writes the scale component (per-axis basis-column lengths) of the node's
/// `local_matrix` into `out`.
pub fn get_scene_node_scale(out: &mut Vector3Like, arena: &SceneArena, node: NodeId) {
    let m = &arena[node].local_matrix.m;
    let (sx, sy, sz) = decompose_scale(m);
    out.x = sx;
    out.y = sy;
    out.z = sz;
}

/// Sets the node's `local_matrix` to a model-space look-at transform placing the
/// node at `eye`, oriented so its local -Z axis points toward `target`, with the
/// `up` hint. Unit scale, no shear. This is a **model** matrix (translation =
/// `eye`), not a view matrix.
pub fn set_scene_node_look_at(
    arena: &mut SceneArena,
    node: NodeId,
    eye: &Vector3Like,
    target: &Vector3Like,
    up: &Vector3Like,
) {
    let eye_x = eye.x;
    let eye_y = eye.y;
    let eye_z = eye.z;
    // Z axis = normalize(eye - target).
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
    // X axis = normalize(cross(up, z)).
    let mut xx = up.y * zz - up.z * zy;
    let mut xy = up.z * zx - up.x * zz;
    let mut xz = up.x * zy - up.y * zx;
    let xl = (xx * xx + xy * xy + xz * xz).sqrt();
    if xl != 0.0 {
        xx /= xl;
        xy /= xl;
        xz /= xl;
    }
    // Y axis = cross(z, x).
    let yx = zy * xz - zz * xy;
    let yy = zz * xx - zx * xz;
    let yz = zx * xy - zy * xx;
    let node = &mut arena[node];
    let m = &mut node.local_matrix.m;
    m[0] = xx;
    m[1] = xy;
    m[2] = xz;
    m[3] = 0.0;
    m[4] = yx;
    m[5] = yy;
    m[6] = yz;
    m[7] = 0.0;
    m[8] = zx;
    m[9] = zy;
    m[10] = zz;
    m[11] = 0.0;
    m[12] = eye_x;
    m[13] = eye_y;
    m[14] = eye_z;
    m[15] = 1.0;
    node.world_matrix = None;
}

/// Sets the translation component of the node's `local_matrix` (position only;
/// rotation and scale columns are preserved).
pub fn set_scene_node_position(arena: &mut SceneArena, node: NodeId, x: f32, y: f32, z: f32) {
    let node = &mut arena[node];
    let m = &mut node.local_matrix.m;
    m[12] = x;
    m[13] = y;
    m[14] = z;
    node.world_matrix = None;
}

/// Sets the rotation of the node's `local_matrix` by decompose–recompose,
/// preserving the existing position and scale.
pub fn set_scene_node_rotation_quaternion(arena: &mut SceneArena, node: NodeId, q: &Vector4Like) {
    let node = &mut arena[node];
    let m = &mut node.local_matrix.m;
    // Read position and scale before writing any matrix element.
    let px = m[12];
    let py = m[13];
    let pz = m[14];
    let (sx, sy, sz) = decompose_scale(m);
    compose_transform(m, px, py, pz, q.x, q.y, q.z, q.w, sx, sy, sz);
    node.world_matrix = None;
}

/// Sets the scale of the node's `local_matrix`, preserving the existing rotation
/// direction and position by rescaling each basis column to the new length.
pub fn set_scene_node_scale(arena: &mut SceneArena, node: NodeId, x: f32, y: f32, z: f32) {
    let node = &mut arena[node];
    let m = &mut node.local_matrix.m;
    rescale_column(m, 0, x);
    rescale_column(m, 1, y);
    rescale_column(m, 2, z);
    node.world_matrix = None;
}

/// Recomposes the node's `local_matrix` from separate position, rotation
/// quaternion, and scale. Alias-safe: every argument is read into a local before
/// any matrix element is written (so `position` and `scale` may reference the
/// same value).
pub fn set_scene_node_transform(
    arena: &mut SceneArena,
    node: NodeId,
    position: &Vector3Like,
    rotation: &Vector4Like,
    scale: &Vector3Like,
) {
    let px = position.x;
    let py = position.y;
    let pz = position.z;
    let qx = rotation.x;
    let qy = rotation.y;
    let qz = rotation.z;
    let qw = rotation.w;
    let sx = scale.x;
    let sy = scale.y;
    let sz = scale.z;
    let node = &mut arena[node];
    compose_transform(
        &mut node.local_matrix.m,
        px,
        py,
        pz,
        qx,
        qy,
        qz,
        qw,
        sx,
        sy,
        sz,
    );
    node.world_matrix = None;
}

// Per-axis basis-column lengths of a column-major 4×4.
fn decompose_scale(m: &[f32; 16]) -> (f32, f32, f32) {
    let sx = (m[0] * m[0] + m[1] * m[1] + m[2] * m[2]).sqrt();
    let sy = (m[4] * m[4] + m[5] * m[5] + m[6] * m[6]).sqrt();
    let sz = (m[8] * m[8] + m[9] * m[9] + m[10] * m[10]).sqrt();
    (sx, sy, sz)
}

// Composes a column-major TRS matrix from position, quaternion, and scale.
#[allow(clippy::too_many_arguments)]
fn compose_transform(
    m: &mut [f32; 16],
    px: f32,
    py: f32,
    pz: f32,
    qx: f32,
    qy: f32,
    qz: f32,
    qw: f32,
    sx: f32,
    sy: f32,
    sz: f32,
) {
    let x2 = qx + qx;
    let y2 = qy + qy;
    let z2 = qz + qz;
    let xx = qx * x2;
    let xy = qx * y2;
    let xz = qx * z2;
    let yy = qy * y2;
    let yz = qy * z2;
    let zz = qz * z2;
    let wx = qw * x2;
    let wy = qw * y2;
    let wz = qw * z2;
    m[0] = (1.0 - (yy + zz)) * sx;
    m[1] = (xy + wz) * sx;
    m[2] = (xz - wy) * sx;
    m[3] = 0.0;
    m[4] = (xy - wz) * sy;
    m[5] = (1.0 - (xx + zz)) * sy;
    m[6] = (yz + wx) * sy;
    m[7] = 0.0;
    m[8] = (xz + wy) * sz;
    m[9] = (yz - wx) * sz;
    m[10] = (1.0 - (xx + yy)) * sz;
    m[11] = 0.0;
    m[12] = px;
    m[13] = py;
    m[14] = pz;
    m[15] = 1.0;
}

// Extracts a unit quaternion from a normalized rotation basis (three.js
// `setFromRotationMatrix`). Arguments are `rIJ` = row I, column J.
#[allow(clippy::too_many_arguments)]
fn quaternion_from_rotation(
    out: &mut Vector4Like,
    r00: f32,
    r10: f32,
    r20: f32,
    r01: f32,
    r11: f32,
    r21: f32,
    r02: f32,
    r12: f32,
    r22: f32,
) {
    let trace = r00 + r11 + r22;
    if trace > 0.0 {
        let s = 0.5 / (trace + 1.0).sqrt();
        out.w = 0.25 / s;
        out.x = (r21 - r12) * s;
        out.y = (r02 - r20) * s;
        out.z = (r10 - r01) * s;
    } else if r00 > r11 && r00 > r22 {
        let s = 2.0 * (1.0 + r00 - r11 - r22).sqrt();
        out.w = (r21 - r12) / s;
        out.x = 0.25 * s;
        out.y = (r01 + r10) / s;
        out.z = (r02 + r20) / s;
    } else if r11 > r22 {
        let s = 2.0 * (1.0 + r11 - r00 - r22).sqrt();
        out.w = (r02 - r20) / s;
        out.x = (r01 + r10) / s;
        out.y = 0.25 * s;
        out.z = (r12 + r21) / s;
    } else {
        let s = 2.0 * (1.0 + r22 - r00 - r11).sqrt();
        out.w = (r10 - r01) / s;
        out.x = (r02 + r20) / s;
        out.y = (r12 + r21) / s;
        out.z = 0.25 * s;
    }
}

// Rescales basis column `col` (0, 1, or 2) of a column-major 4×4 to `target`
// length, keeping its direction. A zero-length column becomes axis-aligned.
fn rescale_column(m: &mut [f32; 16], col: usize, target: f32) {
    let base = col * 4;
    let len = (m[base] * m[base] + m[base + 1] * m[base + 1] + m[base + 2] * m[base + 2]).sqrt();
    if len > 1e-8 {
        let f = target / len;
        m[base] *= f;
        m[base + 1] *= f;
        m[base + 2] *= f;
    } else {
        m[base] = 0.0;
        m[base + 1] = 0.0;
        m[base + 2] = 0.0;
        m[base + col] = target;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene_node::create_scene_node;

    fn arena() -> SceneArena {
        SceneArena::new()
    }

    // get_scene_node_position

    #[test]
    fn get_scene_node_position_reads_translation() {
        let mut a = arena();
        let n = create_scene_node(&mut a, None);
        a[n].local_matrix.m[12] = 3.0;
        a[n].local_matrix.m[13] = 5.0;
        a[n].local_matrix.m[14] = 7.0;
        let mut out = Vector3Like::default();
        get_scene_node_position(&mut out, &a, n);
        assert!((out.x - 3.0).abs() < 1e-5);
        assert!((out.y - 5.0).abs() < 1e-5);
        assert!((out.z - 7.0).abs() < 1e-5);
    }

    // get_scene_node_rotation_quaternion

    #[test]
    fn get_scene_node_rotation_quaternion_identity() {
        let mut a = arena();
        let n = create_scene_node(&mut a, None);
        let mut out = Vector4Like::default();
        get_scene_node_rotation_quaternion(&mut out, &a, n);
        assert!(out.x.abs() < 1e-5);
        assert!(out.y.abs() < 1e-5);
        assert!(out.z.abs() < 1e-5);
        assert!((out.w - 1.0).abs() < 1e-5);
    }

    #[test]
    fn get_scene_node_rotation_quaternion_round_trips() {
        let mut a = arena();
        let n = create_scene_node(&mut a, None);
        let angle = std::f32::consts::FRAC_PI_4;
        let q = Vector4Like {
            x: (angle / 2.0).sin(),
            y: 0.0,
            z: 0.0,
            w: (angle / 2.0).cos(),
        };
        set_scene_node_rotation_quaternion(&mut a, n, &q);
        let mut out = Vector4Like::default();
        get_scene_node_rotation_quaternion(&mut out, &a, n);
        assert!((out.x - q.x).abs() < 1e-4, "x={} exp={}", out.x, q.x);
        assert!((out.w - q.w).abs() < 1e-4, "w={} exp={}", out.w, q.w);
    }

    // get_scene_node_scale

    #[test]
    fn get_scene_node_scale_identity_is_ones() {
        let mut a = arena();
        let n = create_scene_node(&mut a, None);
        let mut out = Vector3Like::default();
        get_scene_node_scale(&mut out, &a, n);
        assert!((out.x - 1.0).abs() < 1e-5);
        assert!((out.y - 1.0).abs() < 1e-5);
        assert!((out.z - 1.0).abs() < 1e-5);
    }

    #[test]
    fn get_scene_node_scale_round_trips() {
        let mut a = arena();
        let n = create_scene_node(&mut a, None);
        set_scene_node_scale(&mut a, n, 2.0, 3.0, 4.0);
        let mut out = Vector3Like::default();
        get_scene_node_scale(&mut out, &a, n);
        assert!((out.x - 2.0).abs() < 1e-5);
        assert!((out.y - 3.0).abs() < 1e-5);
        assert!((out.z - 4.0).abs() < 1e-5);
    }

    // set_scene_node_look_at

    #[test]
    fn set_scene_node_look_at_places_node_at_eye() {
        let mut a = arena();
        let n = create_scene_node(&mut a, None);
        set_scene_node_look_at(
            &mut a,
            n,
            &Vector3Like {
                x: 3.0,
                y: 4.0,
                z: 5.0,
            },
            &Vector3Like::default(),
            &Vector3Like {
                x: 0.0,
                y: 1.0,
                z: 0.0,
            },
        );
        let m = &a[n].local_matrix.m;
        assert!((m[12] - 3.0).abs() < 1e-5);
        assert!((m[13] - 4.0).abs() < 1e-5);
        assert!((m[14] - 5.0).abs() < 1e-5);
    }

    #[test]
    fn set_scene_node_look_at_z_axis_points_from_target_to_eye() {
        let mut a = arena();
        let n = create_scene_node(&mut a, None);
        set_scene_node_look_at(
            &mut a,
            n,
            &Vector3Like {
                x: 0.0,
                y: 0.0,
                z: 5.0,
            },
            &Vector3Like::default(),
            &Vector3Like {
                x: 0.0,
                y: 1.0,
                z: 0.0,
            },
        );
        let m = &a[n].local_matrix.m;
        assert!(m[8].abs() < 1e-5);
        assert!(m[9].abs() < 1e-5);
        assert!((m[10] - 1.0).abs() < 1e-5);
        assert_eq!(m[15], 1.0);
    }

    // set_scene_node_position

    #[test]
    fn set_scene_node_position_clears_world_matrix_cache() {
        let mut a = arena();
        let n = create_scene_node(&mut a, None);
        a[n].world_matrix = Some(Default::default());
        set_scene_node_position(&mut a, n, 1.0, 2.0, 3.0);
        assert!(a[n].world_matrix.is_none());
    }

    #[test]
    fn set_scene_node_position_preserves_rotation_and_scale() {
        let mut a = arena();
        let n = create_scene_node(&mut a, None);
        set_scene_node_scale(&mut a, n, 2.0, 3.0, 4.0);
        let m00 = a[n].local_matrix.m[0];
        let m05 = a[n].local_matrix.m[5];
        let m10 = a[n].local_matrix.m[10];
        set_scene_node_position(&mut a, n, 10.0, 20.0, 30.0);
        assert!((a[n].local_matrix.m[0] - m00).abs() < 1e-5);
        assert!((a[n].local_matrix.m[5] - m05).abs() < 1e-5);
        assert!((a[n].local_matrix.m[10] - m10).abs() < 1e-5);
        assert_eq!(a[n].local_matrix.m[12], 10.0);
    }

    // set_scene_node_rotation_quaternion

    #[test]
    fn set_scene_node_rotation_quaternion_preserves_translation() {
        let mut a = arena();
        let n = create_scene_node(&mut a, None);
        set_scene_node_position(&mut a, n, 5.0, 6.0, 7.0);
        set_scene_node_rotation_quaternion(
            &mut a,
            n,
            &Vector4Like {
                x: 0.0,
                y: 0.0,
                z: 0.0,
                w: 1.0,
            },
        );
        assert!((a[n].local_matrix.m[12] - 5.0).abs() < 1e-5);
        assert!((a[n].local_matrix.m[13] - 6.0).abs() < 1e-5);
        assert!((a[n].local_matrix.m[14] - 7.0).abs() < 1e-5);
        assert!(!a[n].local_matrix.m[0].is_nan());
    }

    // set_scene_node_scale

    #[test]
    fn set_scene_node_scale_preserves_position() {
        let mut a = arena();
        let n = create_scene_node(&mut a, None);
        set_scene_node_position(&mut a, n, 1.0, 2.0, 3.0);
        set_scene_node_scale(&mut a, n, 2.0, 2.0, 2.0);
        assert!((a[n].local_matrix.m[12] - 1.0).abs() < 1e-5);
        assert!((a[n].local_matrix.m[13] - 2.0).abs() < 1e-5);
        assert!((a[n].local_matrix.m[14] - 3.0).abs() < 1e-5);
    }

    // set_scene_node_transform

    #[test]
    fn set_scene_node_transform_sets_position_and_scale() {
        let mut a = arena();
        let n = create_scene_node(&mut a, None);
        let pos = Vector3Like {
            x: 1.0,
            y: 2.0,
            z: 3.0,
        };
        let rot = Vector4Like {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            w: 1.0,
        };
        let scale = Vector3Like {
            x: 2.0,
            y: 2.0,
            z: 2.0,
        };
        set_scene_node_transform(&mut a, n, &pos, &rot, &scale);
        let mut out_pos = Vector3Like::default();
        get_scene_node_position(&mut out_pos, &a, n);
        assert!((out_pos.x - 1.0).abs() < 1e-5);
        assert!((out_pos.z - 3.0).abs() < 1e-5);
        let mut out_scale = Vector3Like::default();
        get_scene_node_scale(&mut out_scale, &a, n);
        assert!((out_scale.x - 2.0).abs() < 1e-5);
        assert!((out_scale.z - 2.0).abs() < 1e-5);
    }

    #[test]
    fn set_scene_node_transform_is_alias_safe_when_position_and_scale_share_a_value() {
        let mut a = arena();
        let n = create_scene_node(&mut a, None);
        let v = Vector3Like {
            x: 3.0,
            y: 3.0,
            z: 3.0,
        };
        let q = Vector4Like {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            w: 1.0,
        };
        set_scene_node_transform(&mut a, n, &v, &q, &v);
        assert!(!a[n].local_matrix.m[0].is_nan());
    }
}

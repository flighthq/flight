use std::sync::Arc;

use crate::types::*;

#[cfg(test)]
#[path = "collision_face3d_internal_tests.rs"]
mod internal_tests;

// flight-lint: allow(f64) Principal c2e26ae9: private Collision3D face selection retains source-number precision
const CAPSULE_AXIS_ALIGNMENT_LIMIT: f64 = 0.94;
// flight-lint: allow(f64) Principal c2e26ae9: private Collision3D face predicate retains source-number precision
const FACE_EPSILON: f64 = 1e-12;
// flight-lint: allow(f64) Principal c2e26ae9: private Collision3D face predicate retains source-number precision
const FACE_PLANE_TOLERANCE: f64 = 1e-6;
const MAX_FACE_VERTICES: usize = 16;

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn get_collision_face_query3d<'a>(
    registry: &'a CollisionRegistry3D,
    kind: &str,
) -> Option<&'a CollisionFaceQuery3D> {
    return registry.face_queries.get(kind);
}

// flight-lint: allow(f64) Principal c2e26ae9: built-in face scratch narrows only at the unchanged public callback output
fn publish_built_in_face3d(face: Vec<f64>, out: &mut Vec<f32>) -> usize {
    out.clear();
    out.extend(face.iter().map(|value| *value as f32));
    let count = face.len() / 3;
    return count;
}

// flight-lint: allow(f64) Principal c2e26ae9: private Collision3D face transform scratch
fn push_vertex(out: &mut Vec<f64>, x: f64, y: f64, z: f64) {
    out.push(x);
    out.push(y);
    out.push(z);
}

pub fn query_collision_aabb_face3d(
    shape: &CollisionShape3D,
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    out: &mut Vec<f32>,
) -> usize {
    let CollisionShape3D::Aabb(aabb) = shape else {
        out.clear();
        return 0;
    };
    return write_collision_aabb_face3d(aabb, dir_x, dir_y, dir_z, out);
}

pub fn query_collision_box_face3d(
    shape: &CollisionShape3D,
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    out: &mut Vec<f32>,
) -> usize {
    let CollisionShape3D::Box(collision_box) = shape else {
        out.clear();
        return 0;
    };
    return write_collision_box_face3d(collision_box, dir_x, dir_y, dir_z, out);
}

// flight-lint: allow(f64) Principal c2e26ae9: public f32 capsule and direction are losslessly promoted for private face selection
pub fn query_collision_capsule_face3d(
    shape: &CollisionShape3D,
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    out: &mut Vec<f32>,
) -> usize {
    out.clear();
    let CollisionShape3D::Capsule(capsule) = shape else {
        return 0;
    };
    let axis_x = f64::from(capsule.x1) - f64::from(capsule.x0);
    let axis_y = f64::from(capsule.y1) - f64::from(capsule.y0);
    let axis_z = f64::from(capsule.z1) - f64::from(capsule.z0);
    let direction_x = f64::from(dir_x);
    let direction_y = f64::from(dir_y);
    let direction_z = f64::from(dir_z);
    let axis_length = (axis_x * axis_x + axis_y * axis_y + axis_z * axis_z).sqrt();
    let direction_length =
        (direction_x * direction_x + direction_y * direction_y + direction_z * direction_z).sqrt();
    if axis_length <= FACE_EPSILON || direction_length <= FACE_EPSILON {
        return 0;
    }
    let alignment = ((axis_x * direction_x + axis_y * direction_y + axis_z * direction_z)
        / (axis_length * direction_length))
        .abs();
    if alignment > CAPSULE_AXIS_ALIGNMENT_LIMIT {
        return 0;
    }
    let face = write_collision_capsule_face3d_f64(
        capsule,
        direction_x / direction_length,
        direction_y / direction_length,
        direction_z / direction_length,
    );
    return publish_built_in_face3d(face, out);
}

// flight-lint: allow(f64) Principal c2e26ae9: public f32 convex and direction are losslessly promoted for private face selection
pub fn query_collision_convex_face3d(
    shape: &CollisionShape3D,
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    out: &mut Vec<f32>,
) -> usize {
    out.clear();
    let CollisionShape3D::Convex(convex) = shape else {
        return 0;
    };
    let direction_x = f64::from(dir_x);
    let direction_y = f64::from(dir_y);
    let direction_z = f64::from(dir_z);
    let direction_length =
        (direction_x * direction_x + direction_y * direction_y + direction_z * direction_z).sqrt();
    if direction_length <= FACE_EPSILON {
        return 0;
    }
    let face = write_collision_convex_face3d_f64(
        convex,
        direction_x / direction_length,
        direction_y / direction_length,
        direction_z / direction_length,
    );
    return publish_built_in_face3d(face, out);
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn register_built_in_collision_face_queries3d(registry: &mut CollisionRegistry3D) {
    register_collision_face_query3d(registry, "aabb", Arc::new(query_collision_aabb_face3d));
    register_collision_face_query3d(registry, "box", Arc::new(query_collision_box_face3d));
    register_collision_face_query3d(
        registry,
        "capsule",
        Arc::new(query_collision_capsule_face3d),
    );
    register_collision_face_query3d(registry, "convex", Arc::new(query_collision_convex_face3d));
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn register_collision_face_query3d(
    registry: &mut CollisionRegistry3D,
    kind: &str,
    query: CollisionFaceQuery3D,
) {
    registry.face_queries.insert(kind.to_string(), query);
}

// flight-lint: allow(f64) Principal c2e26ae9: private Collision3D face transform scratch
fn rotate_by_conjugate(
    vx: f64,
    vy: f64,
    vz: f64,
    qx: f64,
    qy: f64,
    qz: f64,
    qw: f64,
    out: &mut [f64; 3],
) {
    let rx = -qx;
    let ry = -qy;
    let rz = -qz;
    let tx = ry * vz - rz * vy + qw * vx;
    let ty = rz * vx - rx * vz + qw * vy;
    let tz = rx * vy - ry * vx + qw * vz;
    out[0] = vx + 2.0 * (ry * tz - rz * ty);
    out[1] = vy + 2.0 * (rz * tx - rx * tz);
    out[2] = vz + 2.0 * (rx * ty - ry * tx);
}

// flight-lint: allow(f64) Principal c2e26ae9: private Collision3D face transform scratch
fn rotate_by_quat(
    vx: f64,
    vy: f64,
    vz: f64,
    qx: f64,
    qy: f64,
    qz: f64,
    qw: f64,
    out: &mut [f64; 3],
) {
    let tx = qy * vz - qz * vy + qw * vx;
    let ty = qz * vx - qx * vz + qw * vy;
    let tz = qx * vy - qy * vx + qw * vz;
    out[0] = vx + 2.0 * (qy * tz - qz * ty);
    out[1] = vy + 2.0 * (qz * tx - qx * tz);
    out[2] = vz + 2.0 * (qx * ty - qy * tx);
}

// flight-lint: allow(f64) Principal c2e26ae9: private Collision3D face generation and feature selection scratch
#[allow(clippy::too_many_arguments)]
fn write_box_face_corners(
    center_x: f64,
    center_y: f64,
    center_z: f64,
    half_x: f64,
    half_y: f64,
    half_z: f64,
    direction_x: f64,
    direction_y: f64,
    direction_z: f64,
    rotation_x: f64,
    rotation_y: f64,
    rotation_z: f64,
    rotation_w: f64,
) -> Vec<f64> {
    let mut out = Vec::new();
    let mut local_direction = [0.0_f64; 3];
    rotate_by_conjugate(
        direction_x,
        direction_y,
        direction_z,
        rotation_x,
        rotation_y,
        rotation_z,
        rotation_w,
        &mut local_direction,
    );
    let local_x = local_direction[0];
    let local_y = local_direction[1];
    let local_z = local_direction[2];
    let abs_x = local_x.abs();
    let abs_y = local_y.abs();
    let abs_z = local_z.abs();

    let axis = if abs_y >= abs_x && abs_y >= abs_z {
        1
    } else if abs_z >= abs_x && abs_z >= abs_y {
        2
    } else {
        0
    };
    let axis_direction = if axis == 0 {
        local_x
    } else if axis == 1 {
        local_y
    } else {
        local_z
    };
    let sign = if axis_direction >= 0.0 { 1.0 } else { -1.0 };

    for corner in 0..4 {
        let u_sign = if corner == 0 || corner == 3 {
            -1.0
        } else {
            1.0
        };
        let v_sign = if corner < 2 { -1.0 } else { 1.0 };
        let local_corner = if axis == 0 {
            [half_x * sign, half_y * u_sign, half_z * v_sign]
        } else if axis == 1 {
            [half_x * v_sign, half_y * sign, half_z * u_sign]
        } else {
            [half_x * u_sign, half_y * v_sign, half_z * sign]
        };
        let mut rotated_corner = [0.0_f64; 3];
        rotate_by_quat(
            local_corner[0],
            local_corner[1],
            local_corner[2],
            rotation_x,
            rotation_y,
            rotation_z,
            rotation_w,
            &mut rotated_corner,
        );
        push_vertex(
            &mut out,
            center_x + rotated_corner[0],
            center_y + rotated_corner[1],
            center_z + rotated_corner[2],
        );
    }
    return out;
}

/// Write the reference face vertices for an AABB given a face normal direction.
// flight-lint: allow(f64) Principal c2e26ae9: public f32 AABB is losslessly promoted for private face generation
pub(crate) fn write_collision_aabb_face3d(
    aabb: &CollisionAabb3D,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
    out: &mut Vec<f32>,
) -> usize {
    let min_x = f64::from(aabb.min_x);
    let min_y = f64::from(aabb.min_y);
    let min_z = f64::from(aabb.min_z);
    let max_x = f64::from(aabb.max_x);
    let max_y = f64::from(aabb.max_y);
    let max_z = f64::from(aabb.max_z);
    let face = write_box_face_corners(
        (min_x + max_x) / 2.0,
        (min_y + max_y) / 2.0,
        (min_z + max_z) / 2.0,
        (max_x - min_x) / 2.0,
        (max_y - min_y) / 2.0,
        (max_z - min_z) / 2.0,
        f64::from(normal_x),
        f64::from(normal_y),
        f64::from(normal_z),
        0.0,
        0.0,
        0.0,
        1.0,
    );
    return publish_built_in_face3d(face, out);
}

/// Write the reference face vertices for a Box given a face normal direction.
// flight-lint: allow(f64) Principal c2e26ae9: public f32 box is losslessly promoted for private face generation
pub(crate) fn write_collision_box_face3d(
    b: &CollisionBox3D,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
    out: &mut Vec<f32>,
) -> usize {
    let face = write_box_face_corners(
        f64::from(b.x),
        f64::from(b.y),
        f64::from(b.z),
        f64::from(b.half_x),
        f64::from(b.half_y),
        f64::from(b.half_z),
        f64::from(normal_x),
        f64::from(normal_y),
        f64::from(normal_z),
        f64::from(b.rotation_x),
        f64::from(b.rotation_y),
        f64::from(b.rotation_z),
        f64::from(b.rotation_w),
    );
    return publish_built_in_face3d(face, out);
}

/// Write the reference face for a capsule (two vertices along the axis, or hemisphere tangent circle).
// flight-lint: allow(f64) Principal c2e26ae9: test-only public-boundary wrapper narrows private face scratch
#[cfg(test)]
pub(crate) fn write_collision_capsule_face3d(
    capsule: &CollisionCapsule3D,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
    out: &mut Vec<f32>,
) -> usize {
    let face = write_collision_capsule_face3d_f64(
        capsule,
        f64::from(normal_x),
        f64::from(normal_y),
        f64::from(normal_z),
    );
    return publish_built_in_face3d(face, out);
}

// flight-lint: allow(f64) Principal c2e26ae9: public f32 capsule is losslessly promoted for private face generation
fn write_collision_capsule_face3d_f64(
    capsule: &CollisionCapsule3D,
    normal_x: f64,
    normal_y: f64,
    normal_z: f64,
) -> Vec<f64> {
    let mut out = Vec::new();
    let x0 = f64::from(capsule.x0);
    let y0 = f64::from(capsule.y0);
    let z0 = f64::from(capsule.z0);
    let x1 = f64::from(capsule.x1);
    let y1 = f64::from(capsule.y1);
    let z1 = f64::from(capsule.z1);
    let radius = f64::from(capsule.radius);
    let ax = x1 - x0;
    let ay = y1 - y0;
    let az = z1 - z0;
    let axis_len = (ax * ax + ay * ay + az * az).sqrt();

    if axis_len < FACE_EPSILON {
        push_vertex(
            &mut out,
            x0 + normal_x * radius,
            y0 + normal_y * radius,
            z0 + normal_z * radius,
        );
        return out;
    }

    let ux = ax / axis_len;
    let uy = ay / axis_len;
    let uz = az / axis_len;
    let dot = (normal_x * ux + normal_y * uy + normal_z * uz).abs();

    if dot < CAPSULE_AXIS_ALIGNMENT_LIMIT {
        push_vertex(
            &mut out,
            x0 + normal_x * radius,
            y0 + normal_y * radius,
            z0 + normal_z * radius,
        );
        push_vertex(
            &mut out,
            x1 + normal_x * radius,
            y1 + normal_y * radius,
            z1 + normal_z * radius,
        );
        return out;
    }

    let proj0 = x0 * normal_x + y0 * normal_y + z0 * normal_z;
    let proj1 = x1 * normal_x + y1 * normal_y + z1 * normal_z;
    if proj0 >= proj1 {
        push_vertex(
            &mut out,
            x0 + normal_x * radius,
            y0 + normal_y * radius,
            z0 + normal_z * radius,
        );
    } else {
        push_vertex(
            &mut out,
            x1 + normal_x * radius,
            y1 + normal_y * radius,
            z1 + normal_z * radius,
        );
    }
    return out;
}

/// Write the reference face for a convex hull given a normal.
/// Gathers vertices within a plane tolerance of the most-aligned face, then sorts by angle.
// flight-lint: allow(f64) Principal c2e26ae9: test-only public-boundary wrapper narrows private face scratch
#[cfg(test)]
pub(crate) fn write_collision_convex_face3d(
    convex: &CollisionConvex3D,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
    out: &mut Vec<f32>,
) -> usize {
    let face = write_collision_convex_face3d_f64(
        convex,
        f64::from(normal_x),
        f64::from(normal_y),
        f64::from(normal_z),
    );
    return publish_built_in_face3d(face, out);
}

// flight-lint: allow(f64) Principal c2e26ae9: public f32 convex vertices are losslessly promoted for private face selection and ordering
fn write_collision_convex_face3d_f64(
    convex: &CollisionConvex3D,
    normal_x: f64,
    normal_y: f64,
    normal_z: f64,
) -> Vec<f64> {
    let mut out = Vec::new();
    let count = convex.points.len() / 3;
    if count == 0 {
        return out;
    }

    let mut max_proj = f64::NEG_INFINITY;
    for i in 0..count {
        let proj = f64::from(convex.points[i * 3]) * normal_x
            + f64::from(convex.points[i * 3 + 1]) * normal_y
            + f64::from(convex.points[i * 3 + 2]) * normal_z;
        if proj > max_proj {
            max_proj = proj;
        }
    }

    let threshold = max_proj - FACE_PLANE_TOLERANCE;
    let mut face_indices = Vec::new();
    for i in 0..count {
        let proj = f64::from(convex.points[i * 3]) * normal_x
            + f64::from(convex.points[i * 3 + 1]) * normal_y
            + f64::from(convex.points[i * 3 + 2]) * normal_z;
        if proj >= threshold {
            face_indices.push(i);
            if face_indices.len() >= MAX_FACE_VERTICES {
                break;
            }
        }
    }

    if face_indices.len() <= 2 {
        for &idx in &face_indices {
            push_vertex(
                &mut out,
                f64::from(convex.points[idx * 3]),
                f64::from(convex.points[idx * 3 + 1]),
                f64::from(convex.points[idx * 3 + 2]),
            );
        }
        return out;
    }

    let mut cx = 0.0_f64;
    let mut cy = 0.0_f64;
    let mut cz = 0.0_f64;
    for &idx in &face_indices {
        cx += f64::from(convex.points[idx * 3]);
        cy += f64::from(convex.points[idx * 3 + 1]);
        cz += f64::from(convex.points[idx * 3 + 2]);
    }
    let inv = 1.0 / face_indices.len() as f64;
    cx *= inv;
    cy *= inv;
    cz *= inv;

    let first_idx = face_indices[0];
    let mut tan_x = f64::from(convex.points[first_idx * 3]) - cx;
    let mut tan_y = f64::from(convex.points[first_idx * 3 + 1]) - cy;
    let mut tan_z = f64::from(convex.points[first_idx * 3 + 2]) - cz;
    let tan_len = (tan_x * tan_x + tan_y * tan_y + tan_z * tan_z).sqrt();
    if tan_len > FACE_EPSILON {
        tan_x /= tan_len;
        tan_y /= tan_len;
        tan_z /= tan_len;
    }
    let bitan_x = normal_y * tan_z - normal_z * tan_y;
    let bitan_y = normal_z * tan_x - normal_x * tan_z;
    let bitan_z = normal_x * tan_y - normal_y * tan_x;

    let mut angles: Vec<(f64, usize)> = face_indices
        .iter()
        .map(|&idx| {
            let dx = f64::from(convex.points[idx * 3]) - cx;
            let dy = f64::from(convex.points[idx * 3 + 1]) - cy;
            let dz = f64::from(convex.points[idx * 3 + 2]) - cz;
            let u = dx * tan_x + dy * tan_y + dz * tan_z;
            let v = dx * bitan_x + dy * bitan_y + dz * bitan_z;
            (v.atan2(u), idx)
        })
        .collect();
    angles.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    for &(_, idx) in &angles {
        push_vertex(
            &mut out,
            f64::from(convex.points[idx * 3]),
            f64::from(convex.points[idx * 3 + 1]),
            f64::from(convex.points[idx * 3 + 2]),
        );
    }
    return out;
}

// flight-lint: allow(f64) Principal c2e26ae9: recomputes built-in private face scratch after the single unchanged f32 callback invocation
pub(crate) fn write_collision_shape_face3d_f64(
    shape: &CollisionShape3D,
    direction_x: f32,
    direction_y: f32,
    direction_z: f32,
) -> Option<Vec<f64>> {
    let dir_x = f64::from(direction_x);
    let dir_y = f64::from(direction_y);
    let dir_z = f64::from(direction_z);
    return match shape {
        CollisionShape3D::Aabb(aabb) => {
            let min_x = f64::from(aabb.min_x);
            let min_y = f64::from(aabb.min_y);
            let min_z = f64::from(aabb.min_z);
            let max_x = f64::from(aabb.max_x);
            let max_y = f64::from(aabb.max_y);
            let max_z = f64::from(aabb.max_z);
            Some(write_box_face_corners(
                (min_x + max_x) / 2.0,
                (min_y + max_y) / 2.0,
                (min_z + max_z) / 2.0,
                (max_x - min_x) / 2.0,
                (max_y - min_y) / 2.0,
                (max_z - min_z) / 2.0,
                dir_x,
                dir_y,
                dir_z,
                0.0,
                0.0,
                0.0,
                1.0,
            ))
        }
        CollisionShape3D::Box(collision_box) => Some(write_box_face_corners(
            f64::from(collision_box.x),
            f64::from(collision_box.y),
            f64::from(collision_box.z),
            f64::from(collision_box.half_x),
            f64::from(collision_box.half_y),
            f64::from(collision_box.half_z),
            dir_x,
            dir_y,
            dir_z,
            f64::from(collision_box.rotation_x),
            f64::from(collision_box.rotation_y),
            f64::from(collision_box.rotation_z),
            f64::from(collision_box.rotation_w),
        )),
        CollisionShape3D::Capsule(capsule) => {
            let axis_x = f64::from(capsule.x1) - f64::from(capsule.x0);
            let axis_y = f64::from(capsule.y1) - f64::from(capsule.y0);
            let axis_z = f64::from(capsule.z1) - f64::from(capsule.z0);
            let axis_length = (axis_x * axis_x + axis_y * axis_y + axis_z * axis_z).sqrt();
            let direction_length = (dir_x * dir_x + dir_y * dir_y + dir_z * dir_z).sqrt();
            if axis_length <= FACE_EPSILON || direction_length <= FACE_EPSILON {
                Some(Vec::new())
            } else {
                let alignment = ((axis_x * dir_x + axis_y * dir_y + axis_z * dir_z)
                    / (axis_length * direction_length))
                    .abs();
                if alignment > CAPSULE_AXIS_ALIGNMENT_LIMIT {
                    Some(Vec::new())
                } else {
                    Some(write_collision_capsule_face3d_f64(
                        capsule,
                        dir_x / direction_length,
                        dir_y / direction_length,
                        dir_z / direction_length,
                    ))
                }
            }
        }
        CollisionShape3D::Convex(convex) => {
            let direction_length = (dir_x * dir_x + dir_y * dir_y + dir_z * dir_z).sqrt();
            if direction_length <= FACE_EPSILON {
                Some(Vec::new())
            } else {
                Some(write_collision_convex_face3d_f64(
                    convex,
                    dir_x / direction_length,
                    dir_y / direction_length,
                    dir_z / direction_length,
                ))
            }
        }
        _ => None,
    };
}

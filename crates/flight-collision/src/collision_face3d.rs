use std::sync::Arc;

use crate::types::*;

#[cfg(test)]
#[path = "collision_face3d_internal_tests.rs"]
mod internal_tests;

const CAPSULE_AXIS_ALIGNMENT_LIMIT: f32 = 0.94;
const FACE_EPSILON: f32 = 1e-12;
const FACE_PLANE_TOLERANCE: f32 = 1e-6;
const MAX_FACE_VERTICES: usize = 16;

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn get_collision_face_query3d<'a>(
    registry: &'a CollisionRegistry3D,
    kind: &str,
) -> Option<&'a CollisionFaceQuery3D> {
    return registry.face_queries.get(kind);
}

fn push_vertex(out: &mut Vec<f32>, x: f32, y: f32, z: f32) {
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
    let axis_x = capsule.x1 - capsule.x0;
    let axis_y = capsule.y1 - capsule.y0;
    let axis_z = capsule.z1 - capsule.z0;
    let axis_length = (axis_x * axis_x + axis_y * axis_y + axis_z * axis_z).sqrt();
    let direction_length = (dir_x * dir_x + dir_y * dir_y + dir_z * dir_z).sqrt();
    if axis_length <= FACE_EPSILON || direction_length <= FACE_EPSILON {
        return 0;
    }
    let alignment = ((axis_x * dir_x + axis_y * dir_y + axis_z * dir_z)
        / (axis_length * direction_length))
        .abs();
    if alignment > CAPSULE_AXIS_ALIGNMENT_LIMIT {
        return 0;
    }
    return write_collision_capsule_face3d(
        capsule,
        dir_x / direction_length,
        dir_y / direction_length,
        dir_z / direction_length,
        out,
    );
}

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
    let direction_length = (dir_x * dir_x + dir_y * dir_y + dir_z * dir_z).sqrt();
    if direction_length <= FACE_EPSILON {
        return 0;
    }
    return write_collision_convex_face3d(
        convex,
        dir_x / direction_length,
        dir_y / direction_length,
        dir_z / direction_length,
        out,
    );
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

fn rotate_by_conjugate(
    vx: f32,
    vy: f32,
    vz: f32,
    qx: f32,
    qy: f32,
    qz: f32,
    qw: f32,
    out: &mut [f32; 3],
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

fn rotate_by_quat(
    vx: f32,
    vy: f32,
    vz: f32,
    qx: f32,
    qy: f32,
    qz: f32,
    qw: f32,
    out: &mut [f32; 3],
) {
    let tx = qy * vz - qz * vy + qw * vx;
    let ty = qz * vx - qx * vz + qw * vy;
    let tz = qx * vy - qy * vx + qw * vz;
    out[0] = vx + 2.0 * (qy * tz - qz * ty);
    out[1] = vy + 2.0 * (qz * tx - qx * tz);
    out[2] = vz + 2.0 * (qx * ty - qy * tx);
}

/// Write the reference face vertices for an AABB given a face normal direction.
pub(crate) fn write_collision_aabb_face3d(
    aabb: &CollisionAabb3D,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
    out: &mut Vec<f32>,
) -> usize {
    out.clear();
    let abs_nx = normal_x.abs();
    let abs_ny = normal_y.abs();
    let abs_nz = normal_z.abs();

    if abs_nx >= abs_ny && abs_nx >= abs_nz {
        let x = if normal_x >= 0.0 {
            aabb.max_x
        } else {
            aabb.min_x
        };
        push_vertex(out, x, aabb.min_y, aabb.min_z);
        push_vertex(out, x, aabb.max_y, aabb.min_z);
        push_vertex(out, x, aabb.max_y, aabb.max_z);
        push_vertex(out, x, aabb.min_y, aabb.max_z);
    } else if abs_ny >= abs_nx && abs_ny >= abs_nz {
        let y = if normal_y >= 0.0 {
            aabb.max_y
        } else {
            aabb.min_y
        };
        push_vertex(out, aabb.min_x, y, aabb.min_z);
        push_vertex(out, aabb.min_x, y, aabb.max_z);
        push_vertex(out, aabb.max_x, y, aabb.max_z);
        push_vertex(out, aabb.max_x, y, aabb.min_z);
    } else {
        let z = if normal_z >= 0.0 {
            aabb.max_z
        } else {
            aabb.min_z
        };
        push_vertex(out, aabb.min_x, aabb.min_y, z);
        push_vertex(out, aabb.max_x, aabb.min_y, z);
        push_vertex(out, aabb.max_x, aabb.max_y, z);
        push_vertex(out, aabb.min_x, aabb.max_y, z);
    }
    return 4;
}

/// Write the reference face vertices for a Box given a face normal direction.
pub(crate) fn write_collision_box_face3d(
    b: &CollisionBox3D,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
    out: &mut Vec<f32>,
) -> usize {
    out.clear();
    // Transform normal to local space
    let mut local_n = [0.0_f32; 3];
    rotate_by_conjugate(
        normal_x,
        normal_y,
        normal_z,
        b.rotation_x,
        b.rotation_y,
        b.rotation_z,
        b.rotation_w,
        &mut local_n,
    );

    let abs_lx = local_n[0].abs();
    let abs_ly = local_n[1].abs();
    let abs_lz = local_n[2].abs();

    // Build local face vertices then transform to world
    let mut local_verts = [[0.0_f32; 3]; 4];
    if abs_lx >= abs_ly && abs_lx >= abs_lz {
        let x = if local_n[0] >= 0.0 {
            b.half_x
        } else {
            -b.half_x
        };
        local_verts[0] = [x, -b.half_y, -b.half_z];
        local_verts[1] = [x, b.half_y, -b.half_z];
        local_verts[2] = [x, b.half_y, b.half_z];
        local_verts[3] = [x, -b.half_y, b.half_z];
    } else if abs_ly >= abs_lx && abs_ly >= abs_lz {
        let y = if local_n[1] >= 0.0 {
            b.half_y
        } else {
            -b.half_y
        };
        local_verts[0] = [-b.half_x, y, -b.half_z];
        local_verts[1] = [-b.half_x, y, b.half_z];
        local_verts[2] = [b.half_x, y, b.half_z];
        local_verts[3] = [b.half_x, y, -b.half_z];
    } else {
        let z = if local_n[2] >= 0.0 {
            b.half_z
        } else {
            -b.half_z
        };
        local_verts[0] = [-b.half_x, -b.half_y, z];
        local_verts[1] = [b.half_x, -b.half_y, z];
        local_verts[2] = [b.half_x, b.half_y, z];
        local_verts[3] = [-b.half_x, b.half_y, z];
    }

    for v in &local_verts {
        let mut world = [0.0_f32; 3];
        rotate_by_quat(
            v[0],
            v[1],
            v[2],
            b.rotation_x,
            b.rotation_y,
            b.rotation_z,
            b.rotation_w,
            &mut world,
        );
        push_vertex(out, world[0] + b.x, world[1] + b.y, world[2] + b.z);
    }
    return 4;
}

/// Write the reference face for a capsule (two vertices along the axis, or hemisphere tangent circle).
pub(crate) fn write_collision_capsule_face3d(
    capsule: &CollisionCapsule3D,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
    out: &mut Vec<f32>,
) -> usize {
    out.clear();
    let ax = capsule.x1 - capsule.x0;
    let ay = capsule.y1 - capsule.y0;
    let az = capsule.z1 - capsule.z0;
    let axis_len = (ax * ax + ay * ay + az * az).sqrt();

    if axis_len < FACE_EPSILON {
        // Degenerate capsule: single point
        push_vertex(
            out,
            capsule.x0 + normal_x * capsule.radius,
            capsule.y0 + normal_y * capsule.radius,
            capsule.z0 + normal_z * capsule.radius,
        );
        return 1;
    }

    let ux = ax / axis_len;
    let uy = ay / axis_len;
    let uz = az / axis_len;
    let dot = (normal_x * ux + normal_y * uy + normal_z * uz).abs();

    if dot < CAPSULE_AXIS_ALIGNMENT_LIMIT {
        // Face is the two endpoints offset by radius along normal
        push_vertex(
            out,
            capsule.x0 + normal_x * capsule.radius,
            capsule.y0 + normal_y * capsule.radius,
            capsule.z0 + normal_z * capsule.radius,
        );
        push_vertex(
            out,
            capsule.x1 + normal_x * capsule.radius,
            capsule.y1 + normal_y * capsule.radius,
            capsule.z1 + normal_z * capsule.radius,
        );
        return 2;
    }

    // Axis-aligned: single contact at the hemisphere tip
    let proj0 = capsule.x0 * normal_x + capsule.y0 * normal_y + capsule.z0 * normal_z;
    let proj1 = capsule.x1 * normal_x + capsule.y1 * normal_y + capsule.z1 * normal_z;
    if proj0 >= proj1 {
        push_vertex(
            out,
            capsule.x0 + normal_x * capsule.radius,
            capsule.y0 + normal_y * capsule.radius,
            capsule.z0 + normal_z * capsule.radius,
        );
    } else {
        push_vertex(
            out,
            capsule.x1 + normal_x * capsule.radius,
            capsule.y1 + normal_y * capsule.radius,
            capsule.z1 + normal_z * capsule.radius,
        );
    }
    return 1;
}

/// Write the reference face for a convex hull given a normal.
/// Gathers vertices within a plane tolerance of the most-aligned face, then sorts by angle.
pub(crate) fn write_collision_convex_face3d(
    convex: &CollisionConvex3D,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
    out: &mut Vec<f32>,
) -> usize {
    out.clear();
    let count = convex.points.len() / 3;
    if count == 0 {
        return 0;
    }

    // Find the support vertex in the normal direction
    let mut max_proj = f32::NEG_INFINITY;
    for i in 0..count {
        let proj = convex.points[i * 3] * normal_x
            + convex.points[i * 3 + 1] * normal_y
            + convex.points[i * 3 + 2] * normal_z;
        if proj > max_proj {
            max_proj = proj;
        }
    }

    // Gather all vertices within tolerance of the support plane
    let threshold = max_proj - FACE_PLANE_TOLERANCE;
    let mut face_indices = Vec::new();
    for i in 0..count {
        let proj = convex.points[i * 3] * normal_x
            + convex.points[i * 3 + 1] * normal_y
            + convex.points[i * 3 + 2] * normal_z;
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
                out,
                convex.points[idx * 3],
                convex.points[idx * 3 + 1],
                convex.points[idx * 3 + 2],
            );
        }
        return face_indices.len();
    }

    // Compute centroid of face vertices
    let mut cx = 0.0_f32;
    let mut cy = 0.0_f32;
    let mut cz = 0.0_f32;
    for &idx in &face_indices {
        cx += convex.points[idx * 3];
        cy += convex.points[idx * 3 + 1];
        cz += convex.points[idx * 3 + 2];
    }
    let inv = 1.0 / face_indices.len() as f32;
    cx *= inv;
    cy *= inv;
    cz *= inv;

    // Build tangent frame on the face plane
    let first_idx = face_indices[0];
    let mut tan_x = convex.points[first_idx * 3] - cx;
    let mut tan_y = convex.points[first_idx * 3 + 1] - cy;
    let mut tan_z = convex.points[first_idx * 3 + 2] - cz;
    let tan_len = (tan_x * tan_x + tan_y * tan_y + tan_z * tan_z).sqrt();
    if tan_len > FACE_EPSILON {
        tan_x /= tan_len;
        tan_y /= tan_len;
        tan_z /= tan_len;
    }
    let bitan_x = normal_y * tan_z - normal_z * tan_y;
    let bitan_y = normal_z * tan_x - normal_x * tan_z;
    let bitan_z = normal_x * tan_y - normal_y * tan_x;

    // Sort by angle around normal
    let mut angles: Vec<(f32, usize)> = face_indices
        .iter()
        .map(|&idx| {
            let dx = convex.points[idx * 3] - cx;
            let dy = convex.points[idx * 3 + 1] - cy;
            let dz = convex.points[idx * 3 + 2] - cz;
            let u = dx * tan_x + dy * tan_y + dz * tan_z;
            let v = dx * bitan_x + dy * bitan_y + dz * bitan_z;
            (v.atan2(u), idx)
        })
        .collect();
    angles.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    for &(_, idx) in &angles {
        push_vertex(
            out,
            convex.points[idx * 3],
            convex.points[idx * 3 + 1],
            convex.points[idx * 3 + 2],
        );
    }
    return angles.len();
}

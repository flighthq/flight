use std::sync::Arc;

use crate::types::*;

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn clear_collision_pair_tests3d(registry: &mut CollisionRegistry3D) {
    registry.pair_tests.clear();
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn clear_collision_supports3d(registry: &mut CollisionRegistry3D) {
    registry.supports.clear();
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn get_collision_pair_test3d<'a>(
    registry: &'a CollisionRegistry3D,
    kind_a: &str,
    kind_b: &str,
) -> Option<&'a CollisionPairTest3D> {
    return registry.pair_tests.get(&format!("{kind_a}\0{kind_b}"));
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn get_collision_support3d<'a>(
    registry: &'a CollisionRegistry3D,
    kind: &str,
) -> Option<&'a CollisionSupport3D> {
    return registry.supports.get(kind);
}

// flight-lint: allow(conform-extra) Rust lookup convenience for the caller-owned registry
pub fn has_collision_support3d(registry: &CollisionRegistry3D, kind: &str) -> bool {
    return registry.supports.contains_key(kind);
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn register_built_in_collision_supports3d(registry: &mut CollisionRegistry3D) {
    register_collision_support3d(
        registry,
        "aabb",
        Arc::new(|shape, dir_x, dir_y, dir_z, out| {
            if let CollisionShape3D::Aabb(shape) = shape {
                support_collision_aabb3d(shape, dir_x, dir_y, dir_z, out);
            }
        }),
    );
    register_collision_support3d(
        registry,
        "box",
        Arc::new(|shape, dir_x, dir_y, dir_z, out| {
            if let CollisionShape3D::Box(shape) = shape {
                support_collision_box3d(shape, dir_x, dir_y, dir_z, out);
            }
        }),
    );
    register_collision_support3d(
        registry,
        "capsule",
        Arc::new(|shape, dir_x, dir_y, dir_z, out| {
            if let CollisionShape3D::Capsule(shape) = shape {
                support_collision_capsule3d(shape, dir_x, dir_y, dir_z, out);
            }
        }),
    );
    register_collision_support3d(
        registry,
        "cone",
        Arc::new(|shape, dir_x, dir_y, dir_z, out| {
            if let CollisionShape3D::Cone(shape) = shape {
                support_collision_cone3d(shape, dir_x, dir_y, dir_z, out);
            }
        }),
    );
    register_collision_support3d(
        registry,
        "convex",
        Arc::new(|shape, dir_x, dir_y, dir_z, out| {
            if let CollisionShape3D::Convex(shape) = shape {
                support_collision_convex3d(shape, dir_x, dir_y, dir_z, out);
            }
        }),
    );
    register_collision_support3d(
        registry,
        "cylinder",
        Arc::new(|shape, dir_x, dir_y, dir_z, out| {
            if let CollisionShape3D::Cylinder(shape) = shape {
                support_collision_cylinder3d(shape, dir_x, dir_y, dir_z, out);
            }
        }),
    );
    register_collision_support3d(
        registry,
        "sphere",
        Arc::new(|shape, dir_x, dir_y, dir_z, out| {
            if let CollisionShape3D::Sphere(shape) = shape {
                support_collision_sphere3d(shape, dir_x, dir_y, dir_z, out);
            }
        }),
    );
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn register_collision_pair_test3d(
    registry: &mut CollisionRegistry3D,
    kind_a: &str,
    kind_b: &str,
    test: CollisionPairTest3D,
) {
    registry
        .pair_tests
        .insert(format!("{kind_a}\0{kind_b}"), test);
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn register_collision_support3d(
    registry: &mut CollisionRegistry3D,
    kind: &str,
    support: CollisionSupport3D,
) {
    registry.supports.insert(kind.to_string(), support);
}

fn rotate_vector_by_quaternion(
    vx: f32,
    vy: f32,
    vz: f32,
    qx: f32,
    qy: f32,
    qz: f32,
    qw: f32,
    conjugate: bool,
    out: &mut [f32; 3],
) {
    let sign = if conjugate { -1.0 } else { 1.0 };
    let rx = qx * sign;
    let ry = qy * sign;
    let rz = qz * sign;
    let temp_x = ry * vz - rz * vy + qw * vx;
    let temp_y = rz * vx - rx * vz + qw * vy;
    let temp_z = rx * vy - ry * vx + qw * vz;
    out[0] = vx + 2.0 * (ry * temp_z - rz * temp_y);
    out[1] = vy + 2.0 * (rz * temp_x - rx * temp_z);
    out[2] = vz + 2.0 * (rx * temp_y - ry * temp_x);
}

pub fn support_collision_aabb3d(
    shape: &CollisionAabb3D,
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    out: &mut [f32; 3],
) {
    out[0] = if dir_x >= 0.0 {
        shape.max_x
    } else {
        shape.min_x
    };
    out[1] = if dir_y >= 0.0 {
        shape.max_y
    } else {
        shape.min_y
    };
    out[2] = if dir_z >= 0.0 {
        shape.max_z
    } else {
        shape.min_z
    };
}

pub fn support_collision_box3d(
    shape: &CollisionBox3D,
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    out: &mut [f32; 3],
) {
    let mut local_dir = [0.0_f32; 3];
    rotate_vector_by_quaternion(
        dir_x,
        dir_y,
        dir_z,
        shape.rotation_x,
        shape.rotation_y,
        shape.rotation_z,
        shape.rotation_w,
        true,
        &mut local_dir,
    );
    let sx = if local_dir[0] >= 0.0 {
        shape.half_x
    } else {
        -shape.half_x
    };
    let sy = if local_dir[1] >= 0.0 {
        shape.half_y
    } else {
        -shape.half_y
    };
    let sz = if local_dir[2] >= 0.0 {
        shape.half_z
    } else {
        -shape.half_z
    };
    let mut world_corner = [0.0_f32; 3];
    rotate_vector_by_quaternion(
        sx,
        sy,
        sz,
        shape.rotation_x,
        shape.rotation_y,
        shape.rotation_z,
        shape.rotation_w,
        false,
        &mut world_corner,
    );
    out[0] = shape.x + world_corner[0];
    out[1] = shape.y + world_corner[1];
    out[2] = shape.z + world_corner[2];
}

pub fn support_collision_capsule3d(
    shape: &CollisionCapsule3D,
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    out: &mut [f32; 3],
) {
    let projection0 = shape.x0 * dir_x + shape.y0 * dir_y + shape.z0 * dir_z;
    let projection1 = shape.x1 * dir_x + shape.y1 * dir_y + shape.z1 * dir_z;
    let (base_x, base_y, base_z) = if projection1 > projection0 {
        (shape.x1, shape.y1, shape.z1)
    } else {
        (shape.x0, shape.y0, shape.z0)
    };
    let length = (dir_x * dir_x + dir_y * dir_y + dir_z * dir_z).sqrt();
    if length == 0.0 {
        out[0] = base_x;
        out[1] = base_y;
        out[2] = base_z;
        return;
    }
    let scale = shape.radius / length;
    out[0] = base_x + dir_x * scale;
    out[1] = base_y + dir_y * scale;
    out[2] = base_z + dir_z * scale;
}

pub fn support_collision_cone3d(
    shape: &CollisionCone3D,
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    out: &mut [f32; 3],
) {
    let ax = shape.x1 - shape.x0;
    let ay = shape.y1 - shape.y0;
    let az = shape.z1 - shape.z0;
    let axis_len = (ax * ax + ay * ay + az * az).sqrt();
    if axis_len <= 0.0 {
        out[0] = shape.x0;
        out[1] = shape.y0;
        out[2] = shape.z0;
        return;
    }
    let ux = ax / axis_len;
    let uy = ay / axis_len;
    let uz = az / axis_len;
    let dot = dir_x * ux + dir_y * uy + dir_z * uz;
    let sin_angle = shape.radius / (axis_len * axis_len + shape.radius * shape.radius).sqrt();
    let dir_len = (dir_x * dir_x + dir_y * dir_y + dir_z * dir_z).sqrt();
    if dir_len > 0.0 && dot / dir_len >= sin_angle {
        out[0] = shape.x1;
        out[1] = shape.y1;
        out[2] = shape.z1;
    } else {
        let mut radial = [0.0_f32; 3];
        write_radial_component3d(dir_x, dir_y, dir_z, ux, uy, uz, &mut radial);
        let radial_len =
            (radial[0] * radial[0] + radial[1] * radial[1] + radial[2] * radial[2]).sqrt();
        if radial_len > 0.0 {
            let inv = shape.radius / radial_len;
            out[0] = shape.x0 + radial[0] * inv;
            out[1] = shape.y0 + radial[1] * inv;
            out[2] = shape.z0 + radial[2] * inv;
        } else {
            out[0] = shape.x0 + shape.radius;
            out[1] = shape.y0;
            out[2] = shape.z0;
        }
    }
}

pub fn support_collision_convex3d(
    shape: &CollisionConvex3D,
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    out: &mut [f32; 3],
) {
    write_vertex_list_support3d(
        &shape.points,
        shape.points.len() / 3,
        dir_x,
        dir_y,
        dir_z,
        out,
    );
}

pub fn support_collision_cylinder3d(
    shape: &CollisionCylinder3D,
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    out: &mut [f32; 3],
) {
    let ax = shape.x1 - shape.x0;
    let ay = shape.y1 - shape.y0;
    let az = shape.z1 - shape.z0;
    let axis_len = (ax * ax + ay * ay + az * az).sqrt();
    if axis_len <= 0.0 {
        out[0] = shape.x0;
        out[1] = shape.y0;
        out[2] = shape.z0;
        return;
    }
    let ux = ax / axis_len;
    let uy = ay / axis_len;
    let uz = az / axis_len;
    let dot = dir_x * ux + dir_y * uy + dir_z * uz;
    let (base_x, base_y, base_z) = if dot >= 0.0 {
        (shape.x1, shape.y1, shape.z1)
    } else {
        (shape.x0, shape.y0, shape.z0)
    };
    let mut radial = [0.0_f32; 3];
    write_radial_component3d(dir_x, dir_y, dir_z, ux, uy, uz, &mut radial);
    let radial_len = (radial[0] * radial[0] + radial[1] * radial[1] + radial[2] * radial[2]).sqrt();
    if radial_len > 0.0 {
        let inv = shape.radius / radial_len;
        out[0] = base_x + radial[0] * inv;
        out[1] = base_y + radial[1] * inv;
        out[2] = base_z + radial[2] * inv;
    } else {
        out[0] = base_x;
        out[1] = base_y;
        out[2] = base_z;
    }
}

pub fn support_collision_sphere3d(
    shape: &CollisionSphere3D,
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    out: &mut [f32; 3],
) {
    let len = (dir_x * dir_x + dir_y * dir_y + dir_z * dir_z).sqrt();
    if len > 0.0 {
        let inv = shape.radius / len;
        out[0] = shape.x + dir_x * inv;
        out[1] = shape.y + dir_y * inv;
        out[2] = shape.z + dir_z * inv;
    } else {
        out[0] = shape.x;
        out[1] = shape.y;
        out[2] = shape.z;
    }
}

fn write_radial_component3d(
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    axis_x: f32,
    axis_y: f32,
    axis_z: f32,
    out: &mut [f32; 3],
) {
    let dot = dir_x * axis_x + dir_y * axis_y + dir_z * axis_z;
    out[0] = dir_x - dot * axis_x;
    out[1] = dir_y - dot * axis_y;
    out[2] = dir_z - dot * axis_z;
}

pub fn write_vertex_list_support3d(
    vertices: &[f32],
    count: usize,
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    out: &mut [f32; 3],
) {
    let mut best = f32::NEG_INFINITY;
    out[0] = 0.0;
    out[1] = 0.0;
    out[2] = 0.0;
    for i in 0..count {
        let x = vertices[i * 3];
        let y = vertices[i * 3 + 1];
        let z = vertices[i * 3 + 2];
        let projection = x * dir_x + y * dir_y + z * dir_z;
        if projection > best {
            best = projection;
            out[0] = x;
            out[1] = y;
            out[2] = z;
        }
    }
}

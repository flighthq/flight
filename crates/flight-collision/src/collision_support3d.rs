use crate::types::*;

pub fn get_collision_support3d(
    shape: &CollisionShape3D,
    direction_x: f64,
    direction_y: f64,
    direction_z: f64,
    out: &mut [f64; 3],
) -> bool {
    match shape {
        CollisionShape3D::Sphere(s) => {
            support_collision_sphere3d(s, direction_x, direction_y, direction_z, out);
            return true;
        }
        CollisionShape3D::Aabb(s) => {
            support_collision_aabb3d(s, direction_x, direction_y, direction_z, out);
            return true;
        }
        CollisionShape3D::Box(s) => {
            support_collision_box3d(s, direction_x, direction_y, direction_z, out);
            return true;
        }
        CollisionShape3D::Capsule(s) => {
            support_collision_capsule3d(s, direction_x, direction_y, direction_z, out);
            return true;
        }
        CollisionShape3D::Cylinder(s) => {
            support_collision_cylinder3d(s, direction_x, direction_y, direction_z, out);
            return true;
        }
        CollisionShape3D::Cone(s) => {
            support_collision_cone3d(s, direction_x, direction_y, direction_z, out);
            return true;
        }
        CollisionShape3D::Convex(s) => {
            support_collision_convex3d(s, direction_x, direction_y, direction_z, out);
            return true;
        }
    }
}

pub fn has_collision_support3d(kind: CollisionShapeKind3D) -> bool {
    match kind {
        CollisionShapeKind3D::Sphere
        | CollisionShapeKind3D::Aabb
        | CollisionShapeKind3D::Box
        | CollisionShapeKind3D::Capsule
        | CollisionShapeKind3D::Cylinder
        | CollisionShapeKind3D::Cone
        | CollisionShapeKind3D::Convex => true,
        _ => false,
    }
}

pub fn get_collision_pair_test3d(
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    out: &mut CollisionManifold3D,
) -> Option<bool> {
    use crate::shape_collision3d::*;
    match (a, b) {
        (CollisionShape3D::Sphere(a), CollisionShape3D::Sphere(b)) => {
            Some(test_sphere_sphere_collision3d(a, b, out))
        }
        (CollisionShape3D::Sphere(a), CollisionShape3D::Aabb(b)) => {
            Some(test_sphere_aabb_collision3d(a, b, out))
        }
        (CollisionShape3D::Sphere(a), CollisionShape3D::Box(b)) => {
            Some(test_sphere_box_collision3d(a, b, out))
        }
        (CollisionShape3D::Sphere(a), CollisionShape3D::Capsule(b)) => {
            Some(test_sphere_capsule_collision3d(a, b, out))
        }
        (CollisionShape3D::Aabb(a), CollisionShape3D::Aabb(b)) => {
            Some(test_aabb_aabb_collision3d(a, b, out))
        }
        (CollisionShape3D::Box(a), CollisionShape3D::Box(b)) => {
            Some(test_box_box_collision3d(a, b, out))
        }
        (CollisionShape3D::Capsule(a), CollisionShape3D::Capsule(b)) => {
            Some(test_capsule_capsule_collision3d(a, b, out))
        }
        _ => None,
    }
}

pub fn support_collision_sphere3d(
    shape: &CollisionSphere3D,
    dir_x: f64,
    dir_y: f64,
    dir_z: f64,
    out: &mut [f64; 3],
) {
    let len = (dir_x * dir_x + dir_y * dir_y + dir_z * dir_z).sqrt();
    if len > 0.0 {
        let inv = shape.radius / len;
        out[0] = shape.x + dir_x * inv;
        out[1] = shape.y + dir_y * inv;
        out[2] = shape.z + dir_z * inv;
    } else {
        out[0] = shape.x + shape.radius;
        out[1] = shape.y;
        out[2] = shape.z;
    }
}

pub fn support_collision_aabb3d(
    shape: &CollisionAabb3D,
    dir_x: f64,
    dir_y: f64,
    dir_z: f64,
    out: &mut [f64; 3],
) {
    out[0] = if dir_x >= 0.0 { shape.max_x } else { shape.min_x };
    out[1] = if dir_y >= 0.0 { shape.max_y } else { shape.min_y };
    out[2] = if dir_z >= 0.0 { shape.max_z } else { shape.min_z };
}

pub fn support_collision_box3d(
    shape: &CollisionBox3D,
    dir_x: f64,
    dir_y: f64,
    dir_z: f64,
    out: &mut [f64; 3],
) {
    let mut local_dir = [0.0_f64; 3];
    rotate_vector_by_quaternion(
        dir_x, dir_y, dir_z,
        shape.rotation_x, shape.rotation_y, shape.rotation_z, shape.rotation_w,
        true,
        &mut local_dir,
    );
    let sx = if local_dir[0] >= 0.0 { shape.half_x } else { -shape.half_x };
    let sy = if local_dir[1] >= 0.0 { shape.half_y } else { -shape.half_y };
    let sz = if local_dir[2] >= 0.0 { shape.half_z } else { -shape.half_z };
    let mut world_corner = [0.0_f64; 3];
    rotate_vector_by_quaternion(
        sx, sy, sz,
        shape.rotation_x, shape.rotation_y, shape.rotation_z, shape.rotation_w,
        false,
        &mut world_corner,
    );
    out[0] = shape.x + world_corner[0];
    out[1] = shape.y + world_corner[1];
    out[2] = shape.z + world_corner[2];
}

pub fn support_collision_capsule3d(
    shape: &CollisionCapsule3D,
    dir_x: f64,
    dir_y: f64,
    dir_z: f64,
    out: &mut [f64; 3],
) {
    let len = (dir_x * dir_x + dir_y * dir_y + dir_z * dir_z).sqrt();
    let (nx, ny, nz) = if len > 0.0 {
        (dir_x / len, dir_y / len, dir_z / len)
    } else {
        (1.0, 0.0, 0.0)
    };
    let proj0 = shape.x0 * dir_x + shape.y0 * dir_y + shape.z0 * dir_z;
    let proj1 = shape.x1 * dir_x + shape.y1 * dir_y + shape.z1 * dir_z;
    if proj0 >= proj1 {
        out[0] = shape.x0 + nx * shape.radius;
        out[1] = shape.y0 + ny * shape.radius;
        out[2] = shape.z0 + nz * shape.radius;
    } else {
        out[0] = shape.x1 + nx * shape.radius;
        out[1] = shape.y1 + ny * shape.radius;
        out[2] = shape.z1 + nz * shape.radius;
    }
}

pub fn support_collision_cylinder3d(
    shape: &CollisionCylinder3D,
    dir_x: f64,
    dir_y: f64,
    dir_z: f64,
    out: &mut [f64; 3],
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
    let mut radial = [0.0_f64; 3];
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

pub fn support_collision_cone3d(
    shape: &CollisionCone3D,
    dir_x: f64,
    dir_y: f64,
    dir_z: f64,
    out: &mut [f64; 3],
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
        let mut radial = [0.0_f64; 3];
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
    dir_x: f64,
    dir_y: f64,
    dir_z: f64,
    out: &mut [f64; 3],
) {
    let count = shape.points.len() / 3;
    let mut best = f64::NEG_INFINITY;
    out[0] = 0.0;
    out[1] = 0.0;
    out[2] = 0.0;
    for i in 0..count {
        let x = shape.points[i * 3];
        let y = shape.points[i * 3 + 1];
        let z = shape.points[i * 3 + 2];
        let projection = x * dir_x + y * dir_y + z * dir_z;
        if projection > best {
            best = projection;
            out[0] = x;
            out[1] = y;
            out[2] = z;
        }
    }
}

pub fn register_built_in_collision_supports3d() {
    // No-op: dispatch is static via match in Rust.
}

pub fn clear_collision_pair_tests3d() {
    // No-op: dispatch is static via match in Rust.
}

pub fn clear_collision_supports3d() {
    // No-op: dispatch is static via match in Rust.
}

pub fn register_collision_pair_test3d(
    _kind_a: CollisionShapeKind3D,
    _kind_b: CollisionShapeKind3D,
) {
    // No-op: dispatch is static via match in Rust.
}

pub fn register_collision_support3d(_kind: CollisionShapeKind3D) {
    // No-op: dispatch is static via match in Rust.
}

fn rotate_vector_by_quaternion(
    vx: f64,
    vy: f64,
    vz: f64,
    qx: f64,
    qy: f64,
    qz: f64,
    qw: f64,
    conjugate: bool,
    out: &mut [f64; 3],
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

fn write_radial_component3d(
    dir_x: f64,
    dir_y: f64,
    dir_z: f64,
    axis_x: f64,
    axis_y: f64,
    axis_z: f64,
    out: &mut [f64; 3],
) {
    let dot = dir_x * axis_x + dir_y * axis_y + dir_z * axis_z;
    out[0] = dir_x - dot * axis_x;
    out[1] = dir_y - dot * axis_y;
    out[2] = dir_z - dot * axis_z;
}

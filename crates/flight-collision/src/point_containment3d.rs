use crate::convex_hull3d::write_collision_convex_hull_faces3d;
use crate::types::*;

fn closest_point_on_segment(
    sx: f32,
    sy: f32,
    sz: f32,
    ex: f32,
    ey: f32,
    ez: f32,
    x: f32,
    y: f32,
    z: f32,
) -> (f32, f32, f32) {
    let dx = ex - sx;
    let dy = ey - sy;
    let dz = ez - sz;
    let len_sq = dx * dx + dy * dy + dz * dz;
    if len_sq <= 0.0 {
        return (sx, sy, sz);
    }
    let mut t = ((x - sx) * dx + (y - sy) * dy + (z - sz) * dz) / len_sq;
    if t < 0.0 {
        t = 0.0;
    }
    if t > 1.0 {
        t = 1.0;
    }
    return (sx + dx * t, sy + dy * t, sz + dz * t);
}

fn contains_aabb3d(a: &CollisionAabb3D, x: f32, y: f32, z: f32) -> bool {
    return x >= a.min_x
        && x <= a.max_x
        && y >= a.min_y
        && y <= a.max_y
        && z >= a.min_z
        && z <= a.max_z;
}

fn contains_box3d(b: &CollisionBox3D, x: f32, y: f32, z: f32) -> bool {
    let dx = x - b.x;
    let dy = y - b.y;
    let dz = z - b.z;
    let mut local = [0.0_f32; 3];
    rotate_by_conjugate(
        dx,
        dy,
        dz,
        b.rotation_x,
        b.rotation_y,
        b.rotation_z,
        b.rotation_w,
        &mut local,
    );
    return local[0].abs() <= b.half_x && local[1].abs() <= b.half_y && local[2].abs() <= b.half_z;
}

fn contains_capsule3d(c: &CollisionCapsule3D, x: f32, y: f32, z: f32) -> bool {
    let (cx, cy, cz) = closest_point_on_segment(c.x0, c.y0, c.z0, c.x1, c.y1, c.z1, x, y, z);
    let dx = x - cx;
    let dy = y - cy;
    let dz = z - cz;
    return dx * dx + dy * dy + dz * dz <= c.radius * c.radius;
}

fn contains_cone3d(c: &CollisionCone3D, x: f32, y: f32, z: f32) -> bool {
    let ax = c.x1 - c.x0;
    let ay = c.y1 - c.y0;
    let az = c.z1 - c.z0;
    let len_sq = ax * ax + ay * ay + az * az;
    if len_sq <= 0.0 {
        return false;
    }
    let dx = x - c.x0;
    let dy = y - c.y0;
    let dz = z - c.z0;
    let t = (dx * ax + dy * ay + dz * az) / len_sq;
    if t < 0.0 || t > 1.0 {
        return false;
    }
    let proj_x = c.x0 + ax * t;
    let proj_y = c.y0 + ay * t;
    let proj_z = c.z0 + az * t;
    let rx = x - proj_x;
    let ry = y - proj_y;
    let rz = z - proj_z;
    let cone_radius = c.radius * (1.0 - t);
    return rx * rx + ry * ry + rz * rz <= cone_radius * cone_radius;
}

fn contains_convex3d(c: &CollisionConvex3D, x: f32, y: f32, z: f32) -> bool {
    let mut faces = Vec::new();
    let triangle_count = write_collision_convex_hull_faces3d(&mut faces, &c.points);
    if triangle_count == 0 {
        return false;
    }
    for face in faces.chunks_exact(3).take(triangle_count) {
        let a = face[0] * 3;
        let b = face[1] * 3;
        let d = face[2] * 3;
        let ax = c.points[a];
        let ay = c.points[a + 1];
        let az = c.points[a + 2];
        let e1x = c.points[b] - ax;
        let e1y = c.points[b + 1] - ay;
        let e1z = c.points[b + 2] - az;
        let e2x = c.points[d] - ax;
        let e2y = c.points[d + 1] - ay;
        let e2z = c.points[d + 2] - az;
        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        if (x - ax) * nx + (y - ay) * ny + (z - az) * nz > 0.0 {
            return false;
        }
    }
    return true;
}

fn contains_cylinder3d(c: &CollisionCylinder3D, x: f32, y: f32, z: f32) -> bool {
    let ax = c.x1 - c.x0;
    let ay = c.y1 - c.y0;
    let az = c.z1 - c.z0;
    let len_sq = ax * ax + ay * ay + az * az;
    if len_sq <= 0.0 {
        return false;
    }
    let dx = x - c.x0;
    let dy = y - c.y0;
    let dz = z - c.z0;
    let t = (dx * ax + dy * ay + dz * az) / len_sq;
    if t < 0.0 || t > 1.0 {
        return false;
    }
    let proj_x = c.x0 + ax * t;
    let proj_y = c.y0 + ay * t;
    let proj_z = c.z0 + az * t;
    let rx = x - proj_x;
    let ry = y - proj_y;
    let rz = z - proj_z;
    return rx * rx + ry * ry + rz * rz <= c.radius * c.radius;
}

fn contains_sphere3d(s: &CollisionSphere3D, x: f32, y: f32, z: f32) -> bool {
    let dx = x - s.x;
    let dy = y - s.y;
    let dz = z - s.z;
    return dx * dx + dy * dy + dz * dz <= s.radius * s.radius;
}

pub fn get_collision_shape_contains_point3d(
    shape: &CollisionShape3D,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    match shape {
        CollisionShape3D::Sphere(s) => contains_sphere3d(s, x, y, z),
        CollisionShape3D::Aabb(a) => contains_aabb3d(a, x, y, z),
        CollisionShape3D::Box(b) => contains_box3d(b, x, y, z),
        CollisionShape3D::Capsule(c) => contains_capsule3d(c, x, y, z),
        CollisionShape3D::Cylinder(c) => contains_cylinder3d(c, x, y, z),
        CollisionShape3D::Cone(c) => contains_cone3d(c, x, y, z),
        CollisionShape3D::Convex(c) => contains_convex3d(c, x, y, z),
    }
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

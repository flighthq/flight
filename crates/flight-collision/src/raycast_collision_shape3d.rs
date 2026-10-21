use crate::types::*;

const EPSILON: f64 = 1e-12;

pub fn create_collision_raycast_hit3d() -> CollisionRaycastHit3D {
    let mut out: CollisionRaycastHit3D = flight_entity::allocate_entity();
    initialize_collision_raycast_hit3d(&mut out);
    return out;
}

pub fn initialize_collision_raycast_hit3d(out: &mut CollisionRaycastHit3D) {
    out.fraction = 0.0;
    out.x = 0.0;
    out.y = 0.0;
    out.z = 0.0;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
    out.normal_z = 0.0;
}

fn raycast_aabb3d(
    aabb: &CollisionAabb3D,
    ox: f64, oy: f64, oz: f64,
    dx: f64, dy: f64, dz: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit3D,
) -> bool {
    let mut t_min = 0.0_f64;
    let mut t_max = max_fraction;
    let mut normal = [0.0_f64; 3];

    let mins = [aabb.min_x, aabb.min_y, aabb.min_z];
    let maxs = [aabb.max_x, aabb.max_y, aabb.max_z];
    let origin = [ox, oy, oz];
    let dir = [dx, dy, dz];

    for i in 0..3 {
        if dir[i].abs() < EPSILON {
            if origin[i] < mins[i] || origin[i] > maxs[i] {
                return false;
            }
        } else {
            let inv = 1.0 / dir[i];
            let mut t1 = (mins[i] - origin[i]) * inv;
            let mut t2 = (maxs[i] - origin[i]) * inv;
            let mut n_sign = -1.0_f64;
            if t1 > t2 { let tmp = t1; t1 = t2; t2 = tmp; n_sign = 1.0; }
            if t1 > t_min {
                t_min = t1;
                normal = [0.0; 3];
                normal[i] = n_sign;
            }
            if t2 < t_max { t_max = t2; }
            if t_min > t_max { return false; }
        }
    }

    out.fraction = t_min;
    out.x = ox + dx * t_min;
    out.y = oy + dy * t_min;
    out.z = oz + dz * t_min;
    out.normal_x = normal[0];
    out.normal_y = normal[1];
    out.normal_z = normal[2];
    return true;
}

fn raycast_box3d(
    b: &CollisionBox3D,
    ox: f64, oy: f64, oz: f64,
    dx: f64, dy: f64, dz: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit3D,
) -> bool {
    let mut local_o = [0.0_f64; 3];
    let mut local_d = [0.0_f64; 3];
    rotate_by_conjugate(ox - b.x, oy - b.y, oz - b.z, b.rotation_x, b.rotation_y, b.rotation_z, b.rotation_w, &mut local_o);
    rotate_by_conjugate(dx, dy, dz, b.rotation_x, b.rotation_y, b.rotation_z, b.rotation_w, &mut local_d);

    let local_aabb = CollisionAabb3D {
        min_x: -b.half_x, min_y: -b.half_y, min_z: -b.half_z,
        max_x: b.half_x, max_y: b.half_y, max_z: b.half_z,
    };
    let mut local_hit = CollisionRaycastHit3D::default();
    if !raycast_aabb3d(&local_aabb, local_o[0], local_o[1], local_o[2], local_d[0], local_d[1], local_d[2], max_fraction, &mut local_hit) {
        return false;
    }

    let mut world_pt = [0.0_f64; 3];
    let mut world_n = [0.0_f64; 3];
    rotate_by_quat(local_hit.x, local_hit.y, local_hit.z, b.rotation_x, b.rotation_y, b.rotation_z, b.rotation_w, &mut world_pt);
    rotate_by_quat(local_hit.normal_x, local_hit.normal_y, local_hit.normal_z, b.rotation_x, b.rotation_y, b.rotation_z, b.rotation_w, &mut world_n);

    out.fraction = local_hit.fraction;
    out.x = world_pt[0] + b.x;
    out.y = world_pt[1] + b.y;
    out.z = world_pt[2] + b.z;
    out.normal_x = world_n[0];
    out.normal_y = world_n[1];
    out.normal_z = world_n[2];
    return true;
}

fn raycast_capsule3d(
    capsule: &CollisionCapsule3D,
    ox: f64, oy: f64, oz: f64,
    dx: f64, dy: f64, dz: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit3D,
) -> bool {
    // Ray vs infinite cylinder along capsule axis, then clamp + hemisphere check
    let ax = capsule.x1 - capsule.x0;
    let ay = capsule.y1 - capsule.y0;
    let az = capsule.z1 - capsule.z0;
    let axis_len_sq = ax * ax + ay * ay + az * az;

    // Degenerate capsule: just a sphere
    if axis_len_sq < EPSILON {
        let sphere = CollisionSphere3D { x: capsule.x0, y: capsule.y0, z: capsule.z0, radius: capsule.radius };
        return raycast_sphere3d(&sphere, ox, oy, oz, dx, dy, dz, max_fraction, out);
    }

    let axis_len = axis_len_sq.sqrt();
    let ux = ax / axis_len;
    let uy = ay / axis_len;
    let uz = az / axis_len;

    // Project ray onto plane perpendicular to capsule axis
    let d_dot_u = dx * ux + dy * uy + dz * uz;
    let dpx = dx - d_dot_u * ux;
    let dpy = dy - d_dot_u * uy;
    let dpz = dz - d_dot_u * uz;

    let fx = ox - capsule.x0;
    let fy = oy - capsule.y0;
    let fz = oz - capsule.z0;
    let f_dot_u = fx * ux + fy * uy + fz * uz;
    let fpx = fx - f_dot_u * ux;
    let fpy = fy - f_dot_u * uy;
    let fpz = fz - f_dot_u * uz;

    let a = dpx * dpx + dpy * dpy + dpz * dpz;
    let b = 2.0 * (fpx * dpx + fpy * dpy + fpz * dpz);
    let c = fpx * fpx + fpy * fpy + fpz * fpz - capsule.radius * capsule.radius;

    let mut best_t = max_fraction + 1.0;
    let mut hit = false;

    if a > EPSILON {
        let disc = b * b - 4.0 * a * c;
        if disc >= 0.0 {
            let sqrt_disc = disc.sqrt();
            let t = (-b - sqrt_disc) / (2.0 * a);
            if t >= 0.0 && t <= max_fraction {
                let hit_along = f_dot_u + d_dot_u * t;
                if hit_along >= 0.0 && hit_along <= axis_len && t < best_t {
                    let hx = ox + dx * t;
                    let hy = oy + dy * t;
                    let hz = oz + dz * t;
                    let proj_x = capsule.x0 + ux * hit_along;
                    let proj_y = capsule.y0 + uy * hit_along;
                    let proj_z = capsule.z0 + uz * hit_along;
                    let nx = hx - proj_x;
                    let ny = hy - proj_y;
                    let nz = hz - proj_z;
                    let nlen = (nx * nx + ny * ny + nz * nz).sqrt();
                    out.fraction = t;
                    out.x = hx;
                    out.y = hy;
                    out.z = hz;
                    if nlen > EPSILON {
                        out.normal_x = nx / nlen;
                        out.normal_y = ny / nlen;
                        out.normal_z = nz / nlen;
                    }
                    best_t = t;
                    hit = true;
                }
            }
        }
    }

    // Check hemisphere caps
    let s0 = CollisionSphere3D { x: capsule.x0, y: capsule.y0, z: capsule.z0, radius: capsule.radius };
    let s1 = CollisionSphere3D { x: capsule.x1, y: capsule.y1, z: capsule.z1, radius: capsule.radius };
    let mut temp = CollisionRaycastHit3D::default();
    if raycast_sphere3d(&s0, ox, oy, oz, dx, dy, dz, max_fraction, &mut temp) && temp.fraction < best_t {
        *out = temp.clone();
        best_t = temp.fraction;
        hit = true;
    }
    if raycast_sphere3d(&s1, ox, oy, oz, dx, dy, dz, max_fraction, &mut temp) && temp.fraction < best_t {
        *out = temp.clone();
        hit = true;
    }

    return hit;
}

// flight-lint: allow(conform-params) D9 requires caller-owned outputs first; max_fraction remains optional after source inputs
pub fn raycast_collision_shape3d(
    out: &mut CollisionRaycastHit3D,
    shape: &CollisionShape3D,
    origin_x: f64,
    origin_y: f64,
    origin_z: f64,
    direction_x: f64,
    direction_y: f64,
    direction_z: f64,
    max_fraction: Option<f64>,
) -> bool {
    let max_fraction = max_fraction.unwrap_or(f64::INFINITY);
    match shape {
        CollisionShape3D::Sphere(s) => {
            raycast_sphere3d(s, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, max_fraction, out)
        }
        CollisionShape3D::Aabb(a) => {
            raycast_aabb3d(a, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, max_fraction, out)
        }
        CollisionShape3D::Box(b) => {
            raycast_box3d(b, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, max_fraction, out)
        }
        CollisionShape3D::Capsule(c) => {
            raycast_capsule3d(c, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, max_fraction, out)
        }
        CollisionShape3D::Cylinder(c) => {
            raycast_cylinder3d(c, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, max_fraction, out)
        }
        CollisionShape3D::Cone(_) => {
            // Cone raycasting uses GJK-based approach; deferred to support-based raycast
            false
        }
        CollisionShape3D::Convex(_) => {
            // Convex raycasting uses GJK-based approach; deferred to support-based raycast
            false
        }
    }
}

fn raycast_cylinder3d(
    cyl: &CollisionCylinder3D,
    ox: f64, oy: f64, oz: f64,
    dx: f64, dy: f64, dz: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit3D,
) -> bool {
    let ax = cyl.x1 - cyl.x0;
    let ay = cyl.y1 - cyl.y0;
    let az = cyl.z1 - cyl.z0;
    let axis_len_sq = ax * ax + ay * ay + az * az;
    if axis_len_sq < EPSILON { return false; }

    let axis_len = axis_len_sq.sqrt();
    let ux = ax / axis_len;
    let uy = ay / axis_len;
    let uz = az / axis_len;

    let d_dot_u = dx * ux + dy * uy + dz * uz;
    let dpx = dx - d_dot_u * ux;
    let dpy = dy - d_dot_u * uy;
    let dpz = dz - d_dot_u * uz;

    let fx = ox - cyl.x0;
    let fy = oy - cyl.y0;
    let fz = oz - cyl.z0;
    let f_dot_u = fx * ux + fy * uy + fz * uz;
    let fpx = fx - f_dot_u * ux;
    let fpy = fy - f_dot_u * uy;
    let fpz = fz - f_dot_u * uz;

    let a = dpx * dpx + dpy * dpy + dpz * dpz;
    let b = 2.0 * (fpx * dpx + fpy * dpy + fpz * dpz);
    let c = fpx * fpx + fpy * fpy + fpz * fpz - cyl.radius * cyl.radius;

    let mut best_t = max_fraction + 1.0;
    let mut hit = false;

    if a > EPSILON {
        let disc = b * b - 4.0 * a * c;
        if disc >= 0.0 {
            let sqrt_disc = disc.sqrt();
            let t = (-b - sqrt_disc) / (2.0 * a);
            if t >= 0.0 && t <= max_fraction {
                let h = f_dot_u + d_dot_u * t;
                if h >= 0.0 && h <= axis_len && t < best_t {
                    let hx = ox + dx * t;
                    let hy = oy + dy * t;
                    let hz = oz + dz * t;
                    let proj_x = cyl.x0 + ux * h;
                    let proj_y = cyl.y0 + uy * h;
                    let proj_z = cyl.z0 + uz * h;
                    let nx = hx - proj_x;
                    let ny = hy - proj_y;
                    let nz = hz - proj_z;
                    let nlen = (nx * nx + ny * ny + nz * nz).sqrt();
                    out.fraction = t;
                    out.x = hx; out.y = hy; out.z = hz;
                    if nlen > EPSILON { out.normal_x = nx / nlen; out.normal_y = ny / nlen; out.normal_z = nz / nlen; }
                    best_t = t;
                    hit = true;
                }
            }
        }
    }

    // Check flat caps
    for cap in 0..2 {
        let (cx, cy, cz, sign) = if cap == 0 {
            (cyl.x0, cyl.y0, cyl.z0, -1.0)
        } else {
            (cyl.x1, cyl.y1, cyl.z1, 1.0)
        };
        let numer = (cx - ox) * (ux * sign) + (cy - oy) * (uy * sign) + (cz - oz) * (uz * sign);
        let denom = dx * ux * sign + dy * uy * sign + dz * uz * sign;
        if denom.abs() < EPSILON { continue; }
        let t = numer / denom;
        if t < 0.0 || t > max_fraction || t >= best_t { continue; }
        let hx = ox + dx * t - cx;
        let hy = oy + dy * t - cy;
        let hz = oz + dz * t - cz;
        let radial_sq = hx * hx + hy * hy + hz * hz - {
            let proj = hx * ux + hy * uy + hz * uz;
            proj * proj
        };
        if radial_sq <= cyl.radius * cyl.radius {
            out.fraction = t;
            out.x = ox + dx * t;
            out.y = oy + dy * t;
            out.z = oz + dz * t;
            out.normal_x = ux * sign;
            out.normal_y = uy * sign;
            out.normal_z = uz * sign;
            best_t = t;
            hit = true;
        }
    }

    return hit;
}

fn raycast_sphere3d(
    sphere: &CollisionSphere3D,
    ox: f64, oy: f64, oz: f64,
    dx: f64, dy: f64, dz: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit3D,
) -> bool {
    let fx = ox - sphere.x;
    let fy = oy - sphere.y;
    let fz = oz - sphere.z;
    let a = dx * dx + dy * dy + dz * dz;
    let b = 2.0 * (fx * dx + fy * dy + fz * dz);
    let c = fx * fx + fy * fy + fz * fz - sphere.radius * sphere.radius;

    if a < EPSILON { return false; }
    let disc = b * b - 4.0 * a * c;
    if disc < 0.0 { return false; }

    let sqrt_disc = disc.sqrt();
    let t = (-b - sqrt_disc) / (2.0 * a);
    if t < 0.0 || t > max_fraction { return false; }

    let hx = ox + dx * t;
    let hy = oy + dy * t;
    let hz = oz + dz * t;
    let nx = hx - sphere.x;
    let ny = hy - sphere.y;
    let nz = hz - sphere.z;
    let len = (nx * nx + ny * ny + nz * nz).sqrt();
    out.fraction = t;
    out.x = hx;
    out.y = hy;
    out.z = hz;
    if len > EPSILON {
        out.normal_x = nx / len;
        out.normal_y = ny / len;
        out.normal_z = nz / len;
    } else {
        out.normal_x = 0.0;
        out.normal_y = 0.0;
        out.normal_z = 1.0;
    }
    return true;
}

fn rotate_by_conjugate(
    vx: f64, vy: f64, vz: f64,
    qx: f64, qy: f64, qz: f64, qw: f64,
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

fn rotate_by_quat(
    vx: f64, vy: f64, vz: f64,
    qx: f64, qy: f64, qz: f64, qw: f64,
    out: &mut [f64; 3],
) {
    let tx = qy * vz - qz * vy + qw * vx;
    let ty = qz * vx - qx * vz + qw * vy;
    let tz = qx * vy - qy * vx + qw * vz;
    out[0] = vx + 2.0 * (qy * tz - qz * ty);
    out[1] = vy + 2.0 * (qz * tx - qx * tz);
    out[2] = vz + 2.0 * (qx * ty - qy * tx);
}

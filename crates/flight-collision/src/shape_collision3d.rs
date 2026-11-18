//! flight-compiler: rust-only

use crate::manifold3d::*;
use crate::types::*;

const RELATIVE_EPSILON: f64 = 1e-12;
const BOX_PARALLEL_AXIS_EPSILON: f64 = 1e-12;
const BOX_EDGE_BIAS: f64 = 5e-3;

// flight-lint: allow(fn-order) source validation helpers stay grouped before narrow-phase math helpers
fn clamp(value: f64, min: f64, max: f64) -> f64 {
    if value < min {
        min
    } else if value > max {
        max
    } else {
        value
    }
}

fn clamp01(value: f64) -> f64 {
    if value < 0.0 {
        0.0
    } else if value > 1.0 {
        1.0
    } else {
        value
    }
}

fn closest_point_on_segment3d(
    sx: f64,
    sy: f64,
    sz: f64,
    ex: f64,
    ey: f64,
    ez: f64,
    px: f64,
    py: f64,
    pz: f64,
) -> (f64, f64, f64) {
    let dx = ex - sx;
    let dy = ey - sy;
    let dz = ez - sz;
    let len_sq = dx * dx + dy * dy + dz * dz;
    if len_sq <= 0.0 {
        return (sx, sy, sz);
    }
    let mut t = ((px - sx) * dx + (py - sy) * dy + (pz - sz) * dz) / len_sq;
    if t < 0.0 {
        t = 0.0;
    }
    if t > 1.0 {
        t = 1.0;
    }
    return (sx + dx * t, sy + dy * t, sz + dz * t);
}

fn closest_points_between_segments3d(
    a0x: f64,
    a0y: f64,
    a0z: f64,
    a1x: f64,
    a1y: f64,
    a1z: f64,
    b0x: f64,
    b0y: f64,
    b0z: f64,
    b1x: f64,
    b1y: f64,
    b1z: f64,
) -> (f64, f64, f64, f64, f64, f64) {
    let dax = a1x - a0x;
    let day = a1y - a0y;
    let daz = a1z - a0z;
    let dbx = b1x - b0x;
    let dby = b1y - b0y;
    let dbz = b1z - b0z;
    let rx = a0x - b0x;
    let ry = a0y - b0y;
    let rz = a0z - b0z;
    let aa = dax * dax + day * day + daz * daz;
    let bb = dbx * dbx + dby * dby + dbz * dbz;
    let f = dbx * rx + dby * ry + dbz * rz;

    let epsilon = 1e-12;
    let mut s;
    let mut t;

    if aa <= epsilon && bb <= epsilon {
        return (a0x, a0y, a0z, b0x, b0y, b0z);
    }
    if aa <= epsilon {
        s = 0.0;
        t = clamp01(f / bb);
    } else {
        let c = dax * rx + day * ry + daz * rz;
        if bb <= epsilon {
            t = 0.0;
            s = clamp01(-c / aa);
        } else {
            let b_val = dax * dbx + day * dby + daz * dbz;
            let denom = aa * bb - b_val * b_val;
            s = if denom > epsilon {
                clamp01((b_val * f - c * bb) / denom)
            } else {
                0.0
            };
            t = (b_val * s + f) / bb;
            if t < 0.0 {
                t = 0.0;
                s = clamp01(-c / aa);
            } else if t > 1.0 {
                t = 1.0;
                s = clamp01((b_val - c) / aa);
            }
        }
    }
    return (
        a0x + dax * s,
        a0y + day * s,
        a0z + daz * s,
        b0x + dbx * t,
        b0y + dby * t,
        b0z + dbz * t,
    );
}

fn is_valid_aabb3d(shape: &CollisionAabb3D) -> bool {
    return shape.min_x.is_finite()
        && shape.min_y.is_finite()
        && shape.min_z.is_finite()
        && shape.max_x.is_finite()
        && shape.max_y.is_finite()
        && shape.max_z.is_finite()
        && shape.max_x > shape.min_x
        && shape.max_y > shape.min_y
        && shape.max_z > shape.min_z;
}

fn is_valid_box3d(shape: &CollisionBox3D) -> bool {
    return shape.x.is_finite()
        && shape.y.is_finite()
        && shape.z.is_finite()
        && shape.half_x.is_finite()
        && shape.half_y.is_finite()
        && shape.half_z.is_finite()
        && shape.half_x > 0.0
        && shape.half_y > 0.0
        && shape.half_z > 0.0
        && shape.rotation_x.is_finite()
        && shape.rotation_y.is_finite()
        && shape.rotation_z.is_finite()
        && shape.rotation_w.is_finite()
        && (shape.rotation_x != 0.0
            || shape.rotation_y != 0.0
            || shape.rotation_z != 0.0
            || shape.rotation_w != 0.0);
}

fn rotate_by_quaternion3d(
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
    let tx = ry * vz - rz * vy + qw * vx;
    let ty = rz * vx - rx * vz + qw * vy;
    let tz = rx * vy - ry * vx + qw * vz;
    out[0] = vx + 2.0 * (ry * tz - rz * ty);
    out[1] = vy + 2.0 * (rz * tx - rx * tz);
    out[2] = vz + 2.0 * (rx * ty - ry * tx);
}

#[allow(clippy::too_many_arguments)]
fn sphere_aabb_manifold_values3d(
    sphere_x: f64,
    sphere_y: f64,
    sphere_z: f64,
    radius: f64,
    min_x: f64,
    min_y: f64,
    min_z: f64,
    max_x: f64,
    max_y: f64,
    max_z: f64,
) -> Option<(f64, f64, f64, f64)> {
    let cx = clamp(sphere_x, min_x, max_x);
    let cy = clamp(sphere_y, min_y, max_y);
    let cz = clamp(sphere_z, min_z, max_z);
    let dx = sphere_x - cx;
    let dy = sphere_y - cy;
    let dz = sphere_z - cz;
    let dist_sq = dx * dx + dy * dy + dz * dz;

    if dist_sq > RELATIVE_EPSILON * RELATIVE_EPSILON {
        let dist = dist_sq.sqrt();
        if dist >= radius {
            return None;
        }
        let inv = 1.0 / dist;
        return Some((dx * inv, dy * inv, dz * inv, radius - dist));
    }

    let faces = [
        (sphere_x - min_x, -1.0, 0.0, 0.0),
        (max_x - sphere_x, 1.0, 0.0, 0.0),
        (sphere_y - min_y, 0.0, -1.0, 0.0),
        (max_y - sphere_y, 0.0, 1.0, 0.0),
        (sphere_z - min_z, 0.0, 0.0, -1.0),
        (max_z - sphere_z, 0.0, 0.0, 1.0),
    ];
    let mut min_dist = f64::INFINITY;
    let mut best_nx = 1.0_f64;
    let mut best_ny = 0.0_f64;
    let mut best_nz = 0.0_f64;
    for &(d, nx, ny, nz) in &faces {
        if d < min_dist {
            min_dist = d;
            best_nx = nx;
            best_ny = ny;
            best_nz = nz;
        }
    }
    return Some((best_nx, best_ny, best_nz, min_dist + radius));
}

pub fn test_aabb_aabb_collision3d(
    a: &CollisionAabb3D,
    b: &CollisionAabb3D,
    out: &mut CollisionManifold3D,
) -> bool {
    if !is_valid_aabb3d(a) || !is_valid_aabb3d(b) {
        clear_collision_manifold3d(out);
        return false;
    }
    let pen_axes = [
        (a.max_x - b.min_x, b.max_x - a.min_x, 1.0, 0.0, 0.0),
        (a.max_y - b.min_y, b.max_y - a.min_y, 0.0, 1.0, 0.0),
        (a.max_z - b.min_z, b.max_z - a.min_z, 0.0, 0.0, 1.0),
    ];

    let mut min_pen = f64::INFINITY;
    let mut best_nx = 0.0_f64;
    let mut best_ny = 0.0_f64;
    let mut best_nz = 0.0_f64;

    for &(pen_neg, pen_pos, nx, ny, nz) in &pen_axes {
        if pen_neg < 0.0 || pen_pos < 0.0 {
            clear_collision_manifold3d(out);
            return false;
        }
        if pen_neg < pen_pos {
            if pen_neg < min_pen {
                min_pen = pen_neg;
                best_nx = -nx;
                best_ny = -ny;
                best_nz = -nz;
            }
        } else {
            if pen_pos < min_pen {
                min_pen = pen_pos;
                best_nx = nx;
                best_ny = ny;
                best_nz = nz;
            }
        }
    }

    out.overlapping = true;
    out.normal_x = best_nx;
    out.normal_y = best_ny;
    out.normal_z = best_nz;
    out.depth = min_pen;
    return true;
}

fn test_box_axis(
    nx: f64,
    ny: f64,
    nz: f64,
    axes_a: &[f64; 9],
    halves_a: &[f64; 3],
    axes_b: &[f64; 9],
    halves_b: &[f64; 3],
    tx: f64,
    ty: f64,
    tz: f64,
    is_edge: bool,
    min_pen: &mut f64,
    best_nx: &mut f64,
    best_ny: &mut f64,
    best_nz: &mut f64,
    out: &mut CollisionManifold3D,
) -> bool {
    let mut extent_a = 0.0_f64;
    for i in 0..3 {
        let dot = (axes_a[i * 3] * nx + axes_a[i * 3 + 1] * ny + axes_a[i * 3 + 2] * nz).abs();
        extent_a += dot * halves_a[i];
    }
    let mut extent_b = 0.0_f64;
    for i in 0..3 {
        let dot = (axes_b[i * 3] * nx + axes_b[i * 3 + 1] * ny + axes_b[i * 3 + 2] * nz).abs();
        extent_b += dot * halves_b[i];
    }
    let center_dist = tx * nx + ty * ny + tz * nz;
    let pen = extent_a + extent_b - center_dist.abs();

    if pen < 0.0 {
        clear_collision_manifold3d(out);
        return false;
    }

    let biased = if is_edge {
        pen * (1.0 + BOX_EDGE_BIAS)
    } else {
        pen
    };
    if biased < *min_pen {
        *min_pen = pen;
        if center_dist >= 0.0 {
            *best_nx = nx;
            *best_ny = ny;
            *best_nz = nz;
        } else {
            *best_nx = -nx;
            *best_ny = -ny;
            *best_nz = -nz;
        }
    }
    return true;
}

pub fn test_box_box_collision3d(
    a: &CollisionBox3D,
    b: &CollisionBox3D,
    out: &mut CollisionManifold3D,
) -> bool {
    if !is_valid_box3d(a) || !is_valid_box3d(b) {
        clear_collision_manifold3d(out);
        return false;
    }
    let mut axes_a = [0.0_f64; 9];
    let mut axes_b = [0.0_f64; 9];
    write_box_axes3d(a, &mut axes_a);
    write_box_axes3d(b, &mut axes_b);

    let halves_a = [a.half_x, a.half_y, a.half_z];
    let halves_b = [b.half_x, b.half_y, b.half_z];
    let tx = a.x - b.x;
    let ty = a.y - b.y;
    let tz = a.z - b.z;

    let mut min_pen = f64::INFINITY;
    let mut best_nx = 0.0_f64;
    let mut best_ny = 0.0_f64;
    let mut best_nz = 0.0_f64;

    for i in 0..3 {
        let ax = axes_a[i * 3];
        let ay = axes_a[i * 3 + 1];
        let az = axes_a[i * 3 + 2];
        if !test_box_axis(
            ax,
            ay,
            az,
            &axes_a,
            &halves_a,
            &axes_b,
            &halves_b,
            tx,
            ty,
            tz,
            false,
            &mut min_pen,
            &mut best_nx,
            &mut best_ny,
            &mut best_nz,
            out,
        ) {
            return false;
        }
    }

    for i in 0..3 {
        let bax = axes_b[i * 3];
        let bay = axes_b[i * 3 + 1];
        let baz = axes_b[i * 3 + 2];
        if !test_box_axis(
            bax,
            bay,
            baz,
            &axes_a,
            &halves_a,
            &axes_b,
            &halves_b,
            tx,
            ty,
            tz,
            false,
            &mut min_pen,
            &mut best_nx,
            &mut best_ny,
            &mut best_nz,
            out,
        ) {
            return false;
        }
    }

    for i in 0..3 {
        for j in 0..3 {
            let axi = [axes_a[i * 3], axes_a[i * 3 + 1], axes_a[i * 3 + 2]];
            let axj = [axes_b[j * 3], axes_b[j * 3 + 1], axes_b[j * 3 + 2]];
            let cross_x = axi[1] * axj[2] - axi[2] * axj[1];
            let cross_y = axi[2] * axj[0] - axi[0] * axj[2];
            let cross_z = axi[0] * axj[1] - axi[1] * axj[0];
            let len = (cross_x * cross_x + cross_y * cross_y + cross_z * cross_z).sqrt();
            if len <= BOX_PARALLEL_AXIS_EPSILON {
                continue;
            }
            let nx = cross_x / len;
            let ny = cross_y / len;
            let nz = cross_z / len;
            if !test_box_axis(
                nx,
                ny,
                nz,
                &axes_a,
                &halves_a,
                &axes_b,
                &halves_b,
                tx,
                ty,
                tz,
                true,
                &mut min_pen,
                &mut best_nx,
                &mut best_ny,
                &mut best_nz,
                out,
            ) {
                return false;
            }
        }
    }

    out.overlapping = true;
    out.normal_x = best_nx;
    out.normal_y = best_ny;
    out.normal_z = best_nz;
    out.depth = min_pen;
    return true;
}

pub fn test_capsule_capsule_collision3d(
    a: &CollisionCapsule3D,
    b: &CollisionCapsule3D,
    out: &mut CollisionManifold3D,
) -> bool {
    let (ca_x, ca_y, ca_z, cb_x, cb_y, cb_z) = closest_points_between_segments3d(
        a.x0, a.y0, a.z0, a.x1, a.y1, a.z1, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1,
    );
    let dx = ca_x - cb_x;
    let dy = ca_y - cb_y;
    let dz = ca_z - cb_z;
    return write_radial_manifold3d(
        dx,
        dy,
        dz,
        a.radius + b.radius,
        a.x1 - a.x0,
        a.y1 - a.y0,
        a.z1 - a.z0,
        out,
    );
}

pub fn test_sphere_aabb_collision3d(
    a: &CollisionSphere3D,
    b: &CollisionAabb3D,
    out: &mut CollisionManifold3D,
) -> bool {
    let Some((normal_x, normal_y, normal_z, depth)) = sphere_aabb_manifold_values3d(
        a.x, a.y, a.z, a.radius, b.min_x, b.min_y, b.min_z, b.max_x, b.max_y, b.max_z,
    ) else {
        clear_collision_manifold3d(out);
        return false;
    };
    out.normal_x = normal_x;
    out.normal_y = normal_y;
    out.normal_z = normal_z;
    out.depth = depth;
    out.overlapping = true;
    return true;
}

pub fn test_sphere_box_collision3d(
    a: &CollisionSphere3D,
    b: &CollisionBox3D,
    out: &mut CollisionManifold3D,
) -> bool {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    let dz = a.z - b.z;
    let mut local = [0.0_f64; 3];
    rotate_by_quaternion3d(
        dx,
        dy,
        dz,
        b.rotation_x,
        b.rotation_y,
        b.rotation_z,
        b.rotation_w,
        true,
        &mut local,
    );

    let Some((local_nx, local_ny, local_nz, depth)) = sphere_aabb_manifold_values3d(
        local[0], local[1], local[2], a.radius, -b.half_x, -b.half_y, -b.half_z, b.half_x,
        b.half_y, b.half_z,
    ) else {
        clear_collision_manifold3d(out);
        return false;
    };

    let mut world_normal = [0.0_f64; 3];
    rotate_by_quaternion3d(
        local_nx,
        local_ny,
        local_nz,
        b.rotation_x,
        b.rotation_y,
        b.rotation_z,
        b.rotation_w,
        false,
        &mut world_normal,
    );
    out.normal_x = world_normal[0];
    out.normal_y = world_normal[1];
    out.normal_z = world_normal[2];
    out.depth = depth;
    out.overlapping = true;
    return true;
}

pub fn test_sphere_capsule_collision3d(
    a: &CollisionSphere3D,
    b: &CollisionCapsule3D,
    out: &mut CollisionManifold3D,
) -> bool {
    let (closest_x, closest_y, closest_z) =
        closest_point_on_segment3d(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, a.x, a.y, a.z);
    let dx = a.x - closest_x;
    let dy = a.y - closest_y;
    let dz = a.z - closest_z;
    return write_radial_manifold3d(
        dx,
        dy,
        dz,
        a.radius + b.radius,
        b.x1 - b.x0,
        b.y1 - b.y0,
        b.z1 - b.z0,
        out,
    );
}

pub fn test_sphere_sphere_collision3d(
    a: &CollisionSphere3D,
    b: &CollisionSphere3D,
    out: &mut CollisionManifold3D,
) -> bool {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    let dz = a.z - b.z;
    return write_radial_manifold3d(dx, dy, dz, a.radius + b.radius, 0.0, 0.0, 0.0, out);
}

fn write_box_axes3d(b: &CollisionBox3D, out: &mut [f64; 9]) {
    let mut axis = [0.0_f64; 3];
    rotate_by_quaternion3d(
        1.0,
        0.0,
        0.0,
        b.rotation_x,
        b.rotation_y,
        b.rotation_z,
        b.rotation_w,
        false,
        &mut axis,
    );
    out[0] = axis[0];
    out[1] = axis[1];
    out[2] = axis[2];
    rotate_by_quaternion3d(
        0.0,
        1.0,
        0.0,
        b.rotation_x,
        b.rotation_y,
        b.rotation_z,
        b.rotation_w,
        false,
        &mut axis,
    );
    out[3] = axis[0];
    out[4] = axis[1];
    out[5] = axis[2];
    rotate_by_quaternion3d(
        0.0,
        0.0,
        1.0,
        b.rotation_x,
        b.rotation_y,
        b.rotation_z,
        b.rotation_w,
        false,
        &mut axis,
    );
    out[6] = axis[0];
    out[7] = axis[1];
    out[8] = axis[2];
}

fn write_perpendicular_axis3d(x: f64, y: f64, z: f64) -> (f64, f64, f64) {
    if x == 0.0 && y == 0.0 && z == 0.0 {
        return (1.0, 0.0, 0.0);
    }

    let abs_x = x.abs();
    let abs_y = y.abs();
    let abs_z = z.abs();
    let (cx, cy, cz) = if abs_x <= abs_y && abs_x <= abs_z {
        (1.0, 0.0, 0.0)
    } else if abs_y <= abs_z {
        (0.0, 1.0, 0.0)
    } else {
        (0.0, 0.0, 1.0)
    };

    let px = y * cz - z * cy;
    let py = z * cx - x * cz;
    let pz = x * cy - y * cx;
    let length = (px * px + py * py + pz * pz).sqrt();
    if length > 0.0 {
        return (px / length, py / length, pz / length);
    }
    return (1.0, 0.0, 0.0);
}

fn write_radial_manifold3d(
    delta_x: f64,
    delta_y: f64,
    delta_z: f64,
    radius_sum: f64,
    fallback_axis_x: f64,
    fallback_axis_y: f64,
    fallback_axis_z: f64,
    out: &mut CollisionManifold3D,
) -> bool {
    let distance_squared = delta_x * delta_x + delta_y * delta_y + delta_z * delta_z;
    if distance_squared >= radius_sum * radius_sum {
        clear_collision_manifold3d(out);
        return false;
    }

    let distance = distance_squared.sqrt();
    if distance > radius_sum * RELATIVE_EPSILON {
        let inverse = 1.0 / distance;
        out.normal_x = delta_x * inverse;
        out.normal_y = delta_y * inverse;
        out.normal_z = delta_z * inverse;
        out.depth = radius_sum - distance;
    } else {
        let (normal_x, normal_y, normal_z) =
            write_perpendicular_axis3d(fallback_axis_x, fallback_axis_y, fallback_axis_z);
        out.normal_x = normal_x;
        out.normal_y = normal_y;
        out.normal_z = normal_z;
        out.depth = radius_sum;
    }
    out.overlapping = true;
    return true;
}

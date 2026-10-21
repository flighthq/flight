use crate::{Aabb, BoundingSphere, Ray3D, Vector3};
use flight_entity::{EntityRuntimeSlot, allocate_entity};

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Capsule {
    pub runtime: EntityRuntimeSlot,
    pub start_x: f32,
    pub start_y: f32,
    pub start_z: f32,
    pub end_x: f32,
    pub end_y: f32,
    pub end_z: f32,
    pub radius: f32,
}

/// Creates a capsule from a start point, end point, and radius. A negative radius conventionally
/// marks an empty capsule.
pub fn create_capsule(
    start_x: f32, start_y: f32, start_z: f32,
    end_x: f32, end_y: f32, end_z: f32,
    radius: f32,
) -> Capsule {
    let mut out: Capsule = allocate_entity();
    initialize_capsule(&mut out, start_x, start_y, start_z, end_x, end_y, end_z, radius);
    return out;
}

pub fn initialize_capsule(
    out: &mut Capsule,
    start_x: f32, start_y: f32, start_z: f32,
    end_x: f32, end_y: f32, end_z: f32,
    radius: f32,
) {
    out.start_x = start_x;
    out.start_y = start_y;
    out.start_z = start_z;
    out.end_x = end_x;
    out.end_y = end_y;
    out.end_z = end_z;
    out.radius = radius;
}

fn axis_perpendicular(abx: f32, aby: f32, abz: f32, ab_len2: f32) -> (f32, f32, f32) {
    if ab_len2 < 1e-20 { return (1.0, 0.0, 0.0); }

    let abs_x = abx.abs();
    let abs_y = aby.abs();
    let abs_z = abz.abs();
    let least_aligned_x: f32 = if abs_x <= abs_y && abs_x <= abs_z { 1.0 } else { 0.0 };
    let least_aligned_y: f32 = if least_aligned_x == 0.0 && abs_y <= abs_z { 1.0 } else { 0.0 };
    let least_aligned_z: f32 = if least_aligned_x == 0.0 && least_aligned_y == 0.0 { 1.0 } else { 0.0 };

    let px = aby * least_aligned_z - abz * least_aligned_y;
    let py = abz * least_aligned_x - abx * least_aligned_z;
    let pz = abx * least_aligned_y - aby * least_aligned_x;
    let length = (px * px + py * py + pz * pz).sqrt();
    return (px / length, py / length, pz / length);
}

/// Writes the point on the capsule surface closest to `point`. Projects `point` onto the capsule
/// axis segment, clamps the parameter to [0, 1], then offsets by `radius` toward `point`.
///
/// Safe when `out` aliases `point` (reads all inputs before writing).
pub fn get_closest_point_on_capsule(out: &mut Vector3, capsule: &Capsule, point: &Vector3) {
    let ax = capsule.start_x;
    let ay = capsule.start_y;
    let az = capsule.start_z;
    let bx = capsule.end_x;
    let by = capsule.end_y;
    let bz = capsule.end_z;
    let px = point.x;
    let py = point.y;
    let pz = point.z;
    let r = capsule.radius;

    let abx = bx - ax;
    let aby = by - ay;
    let abz = bz - az;
    let ab_len2 = abx * abx + aby * aby + abz * abz;

    let closest_x: f32;
    let closest_y: f32;
    let closest_z: f32;
    if ab_len2 < 1e-20 {
        closest_x = ax;
        closest_y = ay;
        closest_z = az;
    } else {
        let t = (((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / ab_len2).clamp(0.0, 1.0);
        closest_x = ax + t * abx;
        closest_y = ay + t * aby;
        closest_z = az + t * abz;
    }

    let dx = px - closest_x;
    let dy = py - closest_y;
    let dz = pz - closest_z;
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();

    if dist < 1e-10 {
        let (perp_x, perp_y, perp_z) = axis_perpendicular(abx, aby, abz, ab_len2);
        out.x = closest_x + r * perp_x;
        out.y = closest_y + r * perp_y;
        out.z = closest_z + r * perp_z;
    } else {
        let inv = r / dist;
        out.x = closest_x + dx * inv;
        out.y = closest_y + dy * inv;
        out.z = closest_z + dz * inv;
    }
}

/// Tests whether a ray intersects a capsule. Returns the entry parameter `t` (>= 0) on hit,
/// or `-1` on miss. A ray starting inside the capsule returns `t = 0`. An empty capsule
/// (negative radius) always returns `-1`.
pub fn intersect_ray3d_capsule(ray: &Ray3D, capsule: &Capsule) -> f32 {
    let ox = ray.origin.x;
    let oy = ray.origin.y;
    let oz = ray.origin.z;
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;
    let ax = capsule.start_x;
    let ay = capsule.start_y;
    let az = capsule.start_z;
    let bx = capsule.end_x;
    let by = capsule.end_y;
    let bz = capsule.end_z;
    let r = capsule.radius;
    if r < 0.0 { return -1.0; }
    let direction_length_sq = dx * dx + dy * dy + dz * dz;
    if direction_length_sq == 0.0 { return -1.0; }

    let abx = bx - ax;
    let aby = by - ay;
    let abz = bz - az;
    let ab_len2 = abx * abx + aby * aby + abz * abz;

    if ab_len2 < 1e-20 {
        return ray_sphere_hit(ox, oy, oz, dx, dy, dz, r, direction_length_sq, ax, ay, az);
    }

    let mut t_best: f32 = -1.0;

    let inv_ab2 = 1.0 / ab_len2;
    let aox = ox - ax;
    let aoy = oy - ay;
    let aoz = oz - az;
    let dab = dx * abx + dy * aby + dz * abz;
    let aoab = aox * abx + aoy * aby + aoz * abz;

    let dpx = dx - dab * inv_ab2 * abx;
    let dpy = dy - dab * inv_ab2 * aby;
    let dpz = dz - dab * inv_ab2 * abz;
    let apx = aox - aoab * inv_ab2 * abx;
    let apy = aoy - aoab * inv_ab2 * aby;
    let apz = aoz - aoab * inv_ab2 * abz;

    let qa = dpx * dpx + dpy * dpy + dpz * dpz;
    let qb = apx * dpx + apy * dpy + apz * dpz;
    let qc = apx * apx + apy * apy + apz * apz - r * r;

    if qa.sqrt() > 1e-10 * direction_length_sq.sqrt() {
        let disc = qb * qb - qa * qc;
        if disc >= 0.0 {
            let sqrt_d = disc.sqrt();
            let t1 = (-qb - sqrt_d) / qa;
            let s1 = (aoab + t1 * dab) * inv_ab2;
            if t1 >= 0.0 && s1 >= 0.0 && s1 <= 1.0 {
                t_best = t1;
            } else if t1 < 0.0 {
                let t2 = (-qb + sqrt_d) / qa;
                if t2 >= 0.0 {
                    let s0 = aoab * inv_ab2;
                    if s0 >= 0.0 && s0 <= 1.0 {
                        return 0.0;
                    }
                }
            }
        }
    }

    let t_a = ray_sphere_hit(ox, oy, oz, dx, dy, dz, r, direction_length_sq, ax, ay, az);
    if t_a >= 0.0 && (t_best < 0.0 || t_a < t_best) { t_best = t_a; }

    let t_b = ray_sphere_hit(ox, oy, oz, dx, dy, dz, r, direction_length_sq, bx, by, bz);
    if t_b >= 0.0 && (t_best < 0.0 || t_b < t_best) { t_best = t_b; }

    return t_best;
}

/// Returns whether a capsule overlaps an axis-aligned bounding box. An empty capsule (negative
/// radius) or empty AABB (min > max on any axis) does not intersect.
pub fn is_capsule_intersecting_aabb(capsule: &Capsule, aabb: &Aabb) -> bool {
    if capsule.radius < 0.0 { return false; }
    if aabb.min.x > aabb.max.x || aabb.min.y > aabb.max.y || aabb.min.z > aabb.max.z {
        return false;
    }
    let dist2 = segment_to_aabb_distance_sq(
        capsule.start_x, capsule.start_y, capsule.start_z,
        capsule.end_x, capsule.end_y, capsule.end_z,
        aabb.min.x, aabb.min.y, aabb.min.z,
        aabb.max.x, aabb.max.y, aabb.max.z,
    );
    return dist2 <= capsule.radius * capsule.radius;
}

/// Returns whether two capsules overlap. An empty capsule (negative radius) does not intersect.
pub fn is_capsule_intersecting_capsule(a: &Capsule, b: &Capsule) -> bool {
    if a.radius < 0.0 || b.radius < 0.0 { return false; }
    let dist = segment_to_segment_distance_sq(
        a.start_x, a.start_y, a.start_z,
        a.end_x, a.end_y, a.end_z,
        b.start_x, b.start_y, b.start_z,
        b.end_x, b.end_y, b.end_z,
    );
    let sum_r = a.radius + b.radius;
    return dist <= sum_r * sum_r;
}

/// Returns whether a capsule overlaps a bounding sphere. An empty capsule or empty sphere
/// (negative radius) does not intersect.
pub fn is_capsule_intersecting_sphere(capsule: &Capsule, sphere: &BoundingSphere) -> bool {
    if capsule.radius < 0.0 || sphere.radius < 0.0 { return false; }
    let dist2 = point_to_segment_distance_sq(
        sphere.center.x, sphere.center.y, sphere.center.z,
        capsule.start_x, capsule.start_y, capsule.start_z,
        capsule.end_x, capsule.end_y, capsule.end_z,
    );
    let sum_r = capsule.radius + sphere.radius;
    return dist2 <= sum_r * sum_r;
}

fn point_to_segment_distance_sq(
    px: f32, py: f32, pz: f32,
    ax: f32, ay: f32, az: f32,
    bx: f32, by: f32, bz: f32,
) -> f32 {
    let abx = bx - ax;
    let aby = by - ay;
    let abz = bz - az;
    let apx = px - ax;
    let apy = py - ay;
    let apz = pz - az;
    let len2 = abx * abx + aby * aby + abz * abz;
    let t = if len2 > 0.0 { ((apx * abx + apy * aby + apz * abz) / len2).clamp(0.0, 1.0) } else { 0.0 };
    let cx = ax + t * abx - px;
    let cy = ay + t * aby - py;
    let cz = az + t * abz - pz;
    return cx * cx + cy * cy + cz * cz;
}

fn ray_sphere_hit(
    ox: f32, oy: f32, oz: f32,
    dx: f32, dy: f32, dz: f32,
    r: f32, direction_length_sq: f32,
    cx: f32, cy: f32, cz: f32,
) -> f32 {
    let mx = ox - cx;
    let my = oy - cy;
    let mz = oz - cz;
    let b = mx * dx + my * dy + mz * dz;
    let c = mx * mx + my * my + mz * mz - r * r;
    let disc = b * b - direction_length_sq * c;
    if disc < 0.0 { return -1.0; }
    let sqrt_d = disc.sqrt();
    let t1 = (-b - sqrt_d) / direction_length_sq;
    if t1 >= 0.0 { return t1; }
    let t2 = (-b + sqrt_d) / direction_length_sq;
    if t2 >= 0.0 { return 0.0; }
    return -1.0;
}

fn segment_to_aabb_distance_sq(
    ax: f32, ay: f32, az: f32,
    bx: f32, by: f32, bz: f32,
    min_x: f32, min_y: f32, min_z: f32,
    max_x: f32, max_y: f32, max_z: f32,
) -> f32 {
    let dx = bx - ax;
    let dy = by - ay;
    let dz = bz - az;
    let len2 = dx * dx + dy * dy + dz * dz;
    if len2 < 1e-20 {
        let ex = (min_x - ax).max(0.0).max(ax - max_x);
        let ey = (min_y - ay).max(0.0).max(ay - max_y);
        let ez = (min_z - az).max(0.0).max(az - max_z);
        return ex * ex + ey * ey + ez * ez;
    }

    let mut best_dist2 = f32::INFINITY;
    let mut candidates = [0.0_f32; 8];
    let mut count: usize = 2;
    candidates[0] = 0.0;
    candidates[1] = 1.0;
    if dx.abs() > 1e-20 {
        candidates[count] = ((min_x - ax) / dx).clamp(0.0, 1.0);
        count += 1;
        candidates[count] = ((max_x - ax) / dx).clamp(0.0, 1.0);
        count += 1;
    }
    if dy.abs() > 1e-20 {
        candidates[count] = ((min_y - ay) / dy).clamp(0.0, 1.0);
        count += 1;
        candidates[count] = ((max_y - ay) / dy).clamp(0.0, 1.0);
        count += 1;
    }
    if dz.abs() > 1e-20 {
        candidates[count] = ((min_z - az) / dz).clamp(0.0, 1.0);
        count += 1;
        candidates[count] = ((max_z - az) / dz).clamp(0.0, 1.0);
        count += 1;
    }

    for i in 0..count {
        let t = candidates[i];
        let px = ax + t * dx;
        let py = ay + t * dy;
        let pz = az + t * dz;
        let ex = (min_x - px).max(0.0).max(px - max_x);
        let ey = (min_y - py).max(0.0).max(py - max_y);
        let ez = (min_z - pz).max(0.0).max(pz - max_z);
        let d2 = ex * ex + ey * ey + ez * ez;
        if d2 < best_dist2 { best_dist2 = d2; }
    }

    let center_x = (min_x + max_x) * 0.5;
    let center_y = (min_y + max_y) * 0.5;
    let center_z = (min_z + max_z) * 0.5;
    let t_center = (((center_x - ax) * dx + (center_y - ay) * dy + (center_z - az) * dz) / len2).clamp(0.0, 1.0);
    {
        let px = ax + t_center * dx;
        let py = ay + t_center * dy;
        let pz = az + t_center * dz;
        let ex = (min_x - px).max(0.0).max(px - max_x);
        let ey = (min_y - py).max(0.0).max(py - max_y);
        let ez = (min_z - pz).max(0.0).max(pz - max_z);
        let d2 = ex * ex + ey * ey + ez * ez;
        if d2 < best_dist2 { best_dist2 = d2; }
    }

    return best_dist2;
}

fn segment_to_segment_distance_sq(
    ax: f32, ay: f32, az: f32,
    bx: f32, by: f32, bz: f32,
    cx: f32, cy: f32, cz: f32,
    dx: f32, dy: f32, dz: f32,
) -> f32 {
    let d1x = bx - ax;
    let d1y = by - ay;
    let d1z = bz - az;
    let d2x = dx - cx;
    let d2y = dy - cy;
    let d2z = dz - cz;
    let rx = ax - cx;
    let ry = ay - cy;
    let rz = az - cz;

    let a = d1x * d1x + d1y * d1y + d1z * d1z;
    let e = d2x * d2x + d2y * d2y + d2z * d2z;
    let f = d2x * rx + d2y * ry + d2z * rz;

    let mut s: f32 = 0.0;
    let mut t: f32 = 0.0;

    if a < 1e-20 && e < 1e-20 {
        // both degenerate
    } else if a < 1e-20 {
        t = (f / e).clamp(0.0, 1.0);
    } else {
        let c = d1x * rx + d1y * ry + d1z * rz;
        if e < 1e-20 {
            s = (-c / a).clamp(0.0, 1.0);
        } else {
            let b = d1x * d2x + d1y * d2y + d1z * d2z;
            let denom = a * e - b * b;
            if denom > 1e-20 {
                s = ((b * f - c * e) / denom).clamp(0.0, 1.0);
            }
            t = (b * s + f) / e;
            if t < 0.0 {
                t = 0.0;
                s = (-c / a).clamp(0.0, 1.0);
            } else if t > 1.0 {
                t = 1.0;
                s = ((b - c) / a).clamp(0.0, 1.0);
            }
        }
    }

    let qx = ax + s * d1x - (cx + t * d2x);
    let qy = ay + s * d1y - (cy + t * d2y);
    let qz = az + s * d1z - (cz + t * d2z);
    return qx * qx + qy * qy + qz * qz;
}

/// Sets all fields of a capsule in place.
pub fn set_capsule(
    out: &mut Capsule,
    start_x: f32, start_y: f32, start_z: f32,
    end_x: f32, end_y: f32, end_z: f32,
    radius: f32,
) {
    out.start_x = start_x;
    out.start_y = start_y;
    out.start_z = start_z;
    out.end_x = end_x;
    out.end_y = end_y;
    out.end_z = end_z;
    out.radius = radius;
}

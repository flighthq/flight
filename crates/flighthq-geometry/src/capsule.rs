//! Free functions for [`Capsule`] — a capsule in 3D space.

use flighthq_types::{BoundingSphere, Capsule, CapsuleLike, Ray3D, Vector3Like};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Creates a capsule from a start point, end point, and radius.
pub fn create_capsule(
    start_x: f32,
    start_y: f32,
    start_z: f32,
    end_x: f32,
    end_y: f32,
    end_z: f32,
    radius: f32,
) -> Capsule {
    Capsule {
        start_x,
        start_y,
        start_z,
        end_x,
        end_y,
        end_z,
        radius,
    }
}

/// Writes the point on the capsule surface closest to `point`.
///
/// Safe when `out` aliases `point`.
pub fn get_closest_point_on_capsule(
    out: &mut Vector3Like,
    capsule: &CapsuleLike,
    point: &Vector3Like,
) {
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

    let (closest_x, closest_y, closest_z);
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
        out.x = closest_x + r;
        out.y = closest_y;
        out.z = closest_z;
    } else {
        let inv = r / dist;
        out.x = closest_x + dx * inv;
        out.y = closest_y + dy * inv;
        out.z = closest_z + dz * inv;
    }
}

/// Tests whether a ray intersects a capsule.
///
/// Returns the entry parameter `t` (>= 0) on hit, or `-1` on miss.
pub fn intersect_ray3d_capsule(ray: &Ray3D, capsule: &CapsuleLike) -> f32 {
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

    let abx = bx - ax;
    let aby = by - ay;
    let abz = bz - az;
    let ab_len2 = abx * abx + aby * aby + abz * abz;

    let sphere_hit = |cx: f32, cy: f32, cz: f32| -> f32 {
        let mx = ox - cx;
        let my = oy - cy;
        let mz = oz - cz;
        let len_d2 = dx * dx + dy * dy + dz * dz;
        if len_d2 == 0.0 {
            return -1.0;
        }
        let b = mx * dx + my * dy + mz * dz;
        let c = mx * mx + my * my + mz * mz - r * r;
        let disc = b * b - len_d2 * c;
        if disc < 0.0 {
            return -1.0;
        }
        let sqrt_d = disc.sqrt();
        let t1 = (-b - sqrt_d) / len_d2;
        if t1 >= 0.0 {
            return t1;
        }
        let t2 = (-b + sqrt_d) / len_d2;
        if t2 >= 0.0 { 0.0 } else { -1.0 }
    };

    if ab_len2 < 1e-20 {
        return sphere_hit(ax, ay, az);
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

    if qa > 1e-20 {
        let disc = qb * qb - qa * qc;
        if disc >= 0.0 {
            let sqrt_d = disc.sqrt();
            let t1 = (-qb - sqrt_d) / qa;
            let s1 = (aoab + t1 * dab) * inv_ab2;
            if t1 >= 0.0 && (0.0..=1.0).contains(&s1) {
                t_best = t1;
            } else if t1 < 0.0 {
                let t2 = (-qb + sqrt_d) / qa;
                if t2 >= 0.0 {
                    let s0 = aoab * inv_ab2;
                    if (0.0..=1.0).contains(&s0) {
                        return 0.0;
                    }
                }
            }
        }
    }

    let t_a = sphere_hit(ax, ay, az);
    if t_a >= 0.0 && (t_best < 0.0 || t_a < t_best) {
        t_best = t_a;
    }

    let t_b = sphere_hit(bx, by, bz);
    if t_b >= 0.0 && (t_best < 0.0 || t_b < t_best) {
        t_best = t_b;
    }

    t_best
}

/// Returns whether two capsules overlap.
pub fn is_capsule_intersecting_capsule(a: &CapsuleLike, b: &CapsuleLike) -> bool {
    if a.radius < 0.0 || b.radius < 0.0 {
        return false;
    }
    let dist = segment_to_segment_distance_sq(
        a.start_x, a.start_y, a.start_z, a.end_x, a.end_y, a.end_z, b.start_x, b.start_y,
        b.start_z, b.end_x, b.end_y, b.end_z,
    );
    let sum_r = a.radius + b.radius;
    dist <= sum_r * sum_r
}

/// Returns whether a capsule overlaps a bounding sphere.
pub fn is_capsule_intersecting_sphere(capsule: &CapsuleLike, sphere: &BoundingSphere) -> bool {
    if capsule.radius < 0.0 || sphere.radius < 0.0 {
        return false;
    }
    let dist2 = point_to_segment_distance_sq(
        sphere.center.x,
        sphere.center.y,
        sphere.center.z,
        capsule.start_x,
        capsule.start_y,
        capsule.start_z,
        capsule.end_x,
        capsule.end_y,
        capsule.end_z,
    );
    let sum_r = capsule.radius + sphere.radius;
    dist2 <= sum_r * sum_r
}

/// Sets all fields of a capsule in place.
pub fn set_capsule(
    out: &mut CapsuleLike,
    start_x: f32,
    start_y: f32,
    start_z: f32,
    end_x: f32,
    end_y: f32,
    end_z: f32,
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn point_to_segment_distance_sq(
    px: f32,
    py: f32,
    pz: f32,
    ax: f32,
    ay: f32,
    az: f32,
    bx: f32,
    by: f32,
    bz: f32,
) -> f32 {
    let abx = bx - ax;
    let aby = by - ay;
    let abz = bz - az;
    let apx = px - ax;
    let apy = py - ay;
    let apz = pz - az;
    let len2 = abx * abx + aby * aby + abz * abz;
    let t = if len2 > 0.0 {
        ((apx * abx + apy * aby + apz * abz) / len2).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let cx = ax + t * abx - px;
    let cy = ay + t * aby - py;
    let cz = az + t * abz - pz;
    cx * cx + cy * cy + cz * cz
}

#[allow(clippy::too_many_arguments)]
fn segment_to_segment_distance_sq(
    ax: f32,
    ay: f32,
    az: f32,
    bx: f32,
    by: f32,
    bz: f32,
    cx: f32,
    cy: f32,
    cz: f32,
    ddx: f32,
    ddy: f32,
    ddz: f32,
) -> f32 {
    let d1x = bx - ax;
    let d1y = by - ay;
    let d1z = bz - az;
    let d2x = ddx - cx;
    let d2y = ddy - cy;
    let d2z = ddz - cz;
    let rx = ax - cx;
    let ry = ay - cy;
    let rz = az - cz;

    let a = d1x * d1x + d1y * d1y + d1z * d1z;
    let e = d2x * d2x + d2y * d2y + d2z * d2z;
    let f = d2x * rx + d2y * ry + d2z * rz;

    let s: f32;
    let t: f32;

    if a < 1e-20 && e < 1e-20 {
        s = 0.0;
        t = 0.0;
    } else if a < 1e-20 {
        s = 0.0;
        t = (f / e).clamp(0.0, 1.0);
    } else {
        let c_val = d1x * rx + d1y * ry + d1z * rz;
        if e < 1e-20 {
            t = 0.0;
            s = (-c_val / a).clamp(0.0, 1.0);
        } else {
            let b_val = d1x * d2x + d1y * d2y + d1z * d2z;
            let denom = a * e - b_val * b_val;
            let s_raw = if denom > 1e-20 {
                ((b_val * f - c_val * e) / denom).clamp(0.0, 1.0)
            } else {
                0.0
            };
            let t_raw = (b_val * s_raw + f) / e;
            if t_raw < 0.0 {
                t = 0.0;
                s = (-c_val / a).clamp(0.0, 1.0);
            } else if t_raw > 1.0 {
                t = 1.0;
                s = ((b_val - c_val) / a).clamp(0.0, 1.0);
            } else {
                t = t_raw;
                s = s_raw;
            }
        }
    }

    let qx = ax + s * d1x - (cx + t * d2x);
    let qy = ay + s * d1y - (cy + t * d2y);
    let qz = az + s * d1z - (cz + t * d2z);
    qx * qx + qy * qy + qz * qz
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::Vector3;

    fn pt(x: f32, y: f32, z: f32) -> Vector3Like {
        Vector3Like { x, y, z }
    }

    fn cap(sx: f32, sy: f32, sz: f32, ex: f32, ey: f32, ez: f32, r: f32) -> CapsuleLike {
        CapsuleLike {
            start_x: sx,
            start_y: sy,
            start_z: sz,
            end_x: ex,
            end_y: ey,
            end_z: ez,
            radius: r,
        }
    }

    // create_capsule
    #[test]
    fn create_capsule_stores_values() {
        let c = create_capsule(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        assert_eq!(c.start_x, 1.0);
        assert_eq!(c.end_z, 6.0);
        assert_eq!(c.radius, 7.0);
    }

    // get_closest_point_on_capsule
    #[test]
    fn get_closest_point_on_capsule_along_axis() {
        let c = cap(0.0, 0.0, 0.0, 0.0, 10.0, 0.0, 1.0);
        let mut out = pt(0.0, 0.0, 0.0);
        get_closest_point_on_capsule(&mut out, &c, &pt(5.0, 5.0, 0.0));
        assert!((out.x - 1.0).abs() < 1e-4);
        assert!((out.y - 5.0).abs() < 1e-4);
    }

    // is_capsule_intersecting_capsule
    #[test]
    fn is_capsule_intersecting_capsule_overlap() {
        let a = cap(0.0, 0.0, 0.0, 0.0, 10.0, 0.0, 1.0);
        let b = cap(1.5, 0.0, 0.0, 1.5, 10.0, 0.0, 1.0);
        assert!(is_capsule_intersecting_capsule(&a, &b));
    }

    #[test]
    fn is_capsule_intersecting_capsule_no_overlap() {
        let a = cap(0.0, 0.0, 0.0, 0.0, 10.0, 0.0, 0.5);
        let b = cap(5.0, 0.0, 0.0, 5.0, 10.0, 0.0, 0.5);
        assert!(!is_capsule_intersecting_capsule(&a, &b));
    }

    // is_capsule_intersecting_sphere
    #[test]
    fn is_capsule_intersecting_sphere_overlap() {
        let c = cap(0.0, 0.0, 0.0, 0.0, 10.0, 0.0, 1.0);
        let s = BoundingSphere {
            center: Vector3 {
                x: 1.5,
                y: 5.0,
                z: 0.0,
            },
            radius: 1.0,
        };
        assert!(is_capsule_intersecting_sphere(&c, &s));
    }

    #[test]
    fn is_capsule_intersecting_sphere_no_overlap() {
        let c = cap(0.0, 0.0, 0.0, 0.0, 10.0, 0.0, 0.5);
        let s = BoundingSphere {
            center: Vector3 {
                x: 5.0,
                y: 5.0,
                z: 0.0,
            },
            radius: 0.5,
        };
        assert!(!is_capsule_intersecting_sphere(&c, &s));
    }

    // set_capsule
    #[test]
    fn set_capsule_assigns() {
        let mut out = cap(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        set_capsule(&mut out, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        assert_eq!(out.start_x, 1.0);
        assert_eq!(out.end_z, 6.0);
        assert_eq!(out.radius, 7.0);
    }

    // intersect_ray3d_capsule
    #[test]
    fn intersect_ray3d_capsule_hits() {
        let c = cap(0.0, 0.0, 0.0, 0.0, 10.0, 0.0, 1.0);
        let ray = Ray3D {
            origin: Vector3 {
                x: -5.0,
                y: 5.0,
                z: 0.0,
            },
            direction: Vector3 {
                x: 1.0,
                y: 0.0,
                z: 0.0,
            },
        };
        let t = intersect_ray3d_capsule(&ray, &c);
        assert!(t >= 0.0, "expected hit, got {t}");
    }

    #[test]
    fn intersect_ray3d_capsule_misses() {
        let c = cap(0.0, 0.0, 0.0, 0.0, 10.0, 0.0, 1.0);
        let ray = Ray3D {
            origin: Vector3 {
                x: 5.0,
                y: 5.0,
                z: 0.0,
            },
            direction: Vector3 {
                x: 1.0,
                y: 0.0,
                z: 0.0,
            },
        };
        assert_eq!(intersect_ray3d_capsule(&ray, &c), -1.0);
    }
}

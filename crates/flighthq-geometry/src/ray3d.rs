//! Free functions for [`Ray3D`] — a half-line in 3D space.

use flighthq_types::{Aabb, BoundingSphere, Plane, Ray3D, Vector3, Vector3Like};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Creates a [`Ray3D`] with an explicit origin and normalized direction. With no arguments the
/// ray sits at the origin pointing in +Z.
pub fn create_ray3d(
    origin_x: Option<f32>,
    origin_y: Option<f32>,
    origin_z: Option<f32>,
    direction_x: Option<f32>,
    direction_y: Option<f32>,
    direction_z: Option<f32>,
) -> Ray3D {
    Ray3D {
        origin: Vector3 {
            x: origin_x.unwrap_or(0.0),
            y: origin_y.unwrap_or(0.0),
            z: origin_z.unwrap_or(0.0),
        },
        direction: Vector3 {
            x: direction_x.unwrap_or(0.0),
            y: direction_y.unwrap_or(0.0),
            z: direction_z.unwrap_or(1.0),
        },
    }
}

/// Writes the closest pair of points between two rays: `out_a` receives the point on ray `a`
/// closest to ray `b`, and `out_b` the point on ray `b` closest to ray `a`. Both parameters are
/// clamped to `t >= 0` so the result respects ray (half-line) semantics rather than infinite
/// lines. Parallel rays fall back to projecting `b`'s origin onto ray `a`.
///
/// Directions need not be normalized. Reads all inputs into locals before writing, so it is safe
/// when `out_a`/`out_b` alias the ray vectors.
pub fn get_closest_point_between_ray3ds(
    out_a: &mut Vector3Like,
    out_b: &mut Vector3Like,
    a: &Ray3D,
    b: &Ray3D,
) {
    let aox = a.origin.x;
    let aoy = a.origin.y;
    let aoz = a.origin.z;
    let adx = a.direction.x;
    let ady = a.direction.y;
    let adz = a.direction.z;
    let box_ = b.origin.x;
    let boy = b.origin.y;
    let boz = b.origin.z;
    let bdx = b.direction.x;
    let bdy = b.direction.y;
    let bdz = b.direction.z;

    // Standard line-line closest-point parameters (Ericson, Real-Time Collision Detection):
    // r = aOrigin - bOrigin, then solve the 2×2 system.
    let aa = adx * adx + ady * ady + adz * adz; // |dirA|^2
    let bb = bdx * bdx + bdy * bdy + bdz * bdz; // |dirB|^2
    let ab = adx * bdx + ady * bdy + adz * bdz; // dirA · dirB
    let rx = aox - box_;
    let ry = aoy - boy;
    let rz = aoz - boz;
    let ar = adx * rx + ady * ry + adz * rz; // dirA · r
    let br = bdx * rx + bdy * ry + bdz * rz; // dirB · r

    let denom = aa * bb - ab * ab;
    let mut ta: f32;
    if denom != 0.0 {
        ta = (ab * br - bb * ar) / denom;
    } else {
        // Parallel: anchor on ray a's origin.
        ta = 0.0;
    }
    if ta < 0.0 {
        ta = 0.0;
    }

    // Recompute tb from the chosen ta, then clamp and re-derive ta if tb was clamped.
    let mut tb = if bb != 0.0 { (ab * ta + br) / bb } else { 0.0 };
    if tb < 0.0 {
        tb = 0.0;
        ta = if aa != 0.0 { -ar / aa } else { 0.0 };
        if ta < 0.0 {
            ta = 0.0;
        }
    }

    out_a.x = aox + adx * ta;
    out_a.y = aoy + ady * ta;
    out_a.z = aoz + adz * ta;
    out_b.x = box_ + bdx * tb;
    out_b.y = boy + bdy * tb;
    out_b.z = boz + bdz * tb;
}

/// Writes the point on a ray closest to `point`: `point` projected onto the ray and clamped to
/// `t >= 0` so it stays in front of the origin. When `point` projects behind the origin the ray
/// origin is written. Direction need not be normalized.
///
/// Reads all inputs into locals before writing, so it is safe when `out` aliases `point` or a
/// ray vector.
pub fn get_closest_point_on_ray3d(out: &mut Vector3Like, ray: &Ray3D, point: &Vector3Like) {
    let ox = ray.origin.x;
    let oy = ray.origin.y;
    let oz = ray.origin.z;
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;
    let px = point.x;
    let py = point.y;
    let pz = point.z;

    let len_sq = dx * dx + dy * dy + dz * dz;
    let mut t = if len_sq != 0.0 {
        ((px - ox) * dx + (py - oy) * dy + (pz - oz) * dz) / len_sq
    } else {
        0.0
    };
    if t < 0.0 {
        t = 0.0;
    }

    out.x = ox + dx * t;
    out.y = oy + dy * t;
    out.z = oz + dz * t;
}

/// Returns the point on a ray at parameter `t`: `origin + t * direction`. Writes the result to
/// `out`. `t` should be >= 0 for points in front of the origin. There is no bounds check on `t`.
///
/// Safe when `out` aliases `ray.origin` or `ray.direction`.
pub fn get_ray3d_point_at(out: &mut Vector3Like, ray: &Ray3D, t: f32) {
    let ox = ray.origin.x;
    let oy = ray.origin.y;
    let oz = ray.origin.z;
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;
    out.x = ox + dx * t;
    out.y = oy + dy * t;
    out.z = oz + dz * t;
}

/// Tests whether a ray intersects an axis-aligned bounding box (slab method).
///
/// Returns the entry parameter `t` (>= 0) on hit, or `-1` on miss. A ray that starts inside the
/// box returns `t = 0`. Direction components need not be normalized; the test works for any
/// non-zero direction. A zero-component direction is handled (the ray is parallel to that slab —
/// outside that slab returns -1, inside continues).
pub fn intersect_ray3d_aabb(ray: &Ray3D, aabb: &Aabb) -> f32 {
    let ox = ray.origin.x;
    let oy = ray.origin.y;
    let oz = ray.origin.z;
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;

    let mut t_min: f32 = 0.0;
    let mut t_max: f32 = f32::INFINITY;

    // X slab
    if dx != 0.0 {
        let inv_dx = 1.0 / dx;
        let mut t1 = (aabb.min.x - ox) * inv_dx;
        let mut t2 = (aabb.max.x - ox) * inv_dx;
        if t1 > t2 {
            std::mem::swap(&mut t1, &mut t2);
        }
        t_min = t_min.max(t1);
        t_max = t_max.min(t2);
        if t_min > t_max {
            return -1.0;
        }
    } else if ox < aabb.min.x || ox > aabb.max.x {
        return -1.0;
    }

    // Y slab
    if dy != 0.0 {
        let inv_dy = 1.0 / dy;
        let mut t1 = (aabb.min.y - oy) * inv_dy;
        let mut t2 = (aabb.max.y - oy) * inv_dy;
        if t1 > t2 {
            std::mem::swap(&mut t1, &mut t2);
        }
        t_min = t_min.max(t1);
        t_max = t_max.min(t2);
        if t_min > t_max {
            return -1.0;
        }
    } else if oy < aabb.min.y || oy > aabb.max.y {
        return -1.0;
    }

    // Z slab
    if dz != 0.0 {
        let inv_dz = 1.0 / dz;
        let mut t1 = (aabb.min.z - oz) * inv_dz;
        let mut t2 = (aabb.max.z - oz) * inv_dz;
        if t1 > t2 {
            std::mem::swap(&mut t1, &mut t2);
        }
        t_min = t_min.max(t1);
        t_max = t_max.min(t2);
        if t_min > t_max {
            return -1.0;
        }
    } else if oz < aabb.min.z || oz > aabb.max.z {
        return -1.0;
    }

    t_min
}

/// Tests whether a ray intersects a plane.
///
/// Returns the parameter `t` (>= 0) such that `origin + t * direction` lies on the plane, or
/// `-1` if the ray is parallel to the plane (no intersection) or intersects behind the origin.
/// The plane is given in the form `ax + by + cz + d = 0` with a (not necessarily unit) normal.
///
/// Direction need not be normalized; `t` is in the same units as `direction`.
pub fn intersect_ray3d_plane(ray: &Ray3D, plane: &Plane) -> f32 {
    let denom = plane.a * ray.direction.x + plane.b * ray.direction.y + plane.c * ray.direction.z;
    if denom.abs() < 1e-10 {
        return -1.0; // parallel
    }
    let t = -(plane.a * ray.origin.x + plane.b * ray.origin.y + plane.c * ray.origin.z + plane.d)
        / denom;
    if t >= 0.0 { t } else { -1.0 }
}

/// Tests whether a ray intersects a bounding sphere.
///
/// Returns the parameter `t` of the nearer intersection (>= 0), or `-1` on miss. An empty
/// sphere (radius < 0) always returns `-1`. A ray that starts inside the sphere returns `t = 0`
/// at the entry point (the near intersection is behind the origin; we clamp to `0`).
///
/// Direction need not be normalized; `t` is in direction units.
pub fn intersect_ray3d_sphere(ray: &Ray3D, sphere: &BoundingSphere) -> f32 {
    if sphere.radius < 0.0 {
        return -1.0;
    }
    let ox = ray.origin.x - sphere.center.x;
    let oy = ray.origin.y - sphere.center.y;
    let oz = ray.origin.z - sphere.center.z;
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;

    // Quadratic: |d|^2 t^2 + 2(o·d) t + (|o|^2 - r^2) = 0
    let a = dx * dx + dy * dy + dz * dz;
    if a == 0.0 {
        return -1.0; // zero-length direction
    }
    let b = ox * dx + oy * dy + oz * dz;
    let c = ox * ox + oy * oy + oz * oz - sphere.radius * sphere.radius;
    let disc = b * b - a * c;
    if disc < 0.0 {
        return -1.0;
    }
    let sqrt_disc = disc.sqrt();
    let t = (-b - sqrt_disc) / a;
    if t >= 0.0 {
        return t;
    }
    // Near intersection was behind origin; try far intersection.
    let t2 = (-b + sqrt_disc) / a;
    if t2 >= 0.0 { 0.0 } else { -1.0 } // inside sphere: return t=0
}

/// Tests whether a ray intersects a triangle using the Möller–Trumbore algorithm.
///
/// Returns the parameter `t` (>= 0) such that `origin + t * direction` is the hit point, or
/// `-1` on miss (back-face culling is off — both sides are tested). The direction need not be
/// normalized; `t` is in direction units.
///
/// Also returns `-1` for degenerate triangles (area ≈ 0).
pub fn intersect_ray3d_triangle(
    ray: &Ray3D,
    a: &Vector3Like,
    b: &Vector3Like,
    c: &Vector3Like,
) -> f32 {
    // Edge vectors
    let e1x = b.x - a.x;
    let e1y = b.y - a.y;
    let e1z = b.z - a.z;
    let e2x = c.x - a.x;
    let e2y = c.y - a.y;
    let e2z = c.z - a.z;

    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;

    // h = direction × e2
    let hx = dy * e2z - dz * e2y;
    let hy = dz * e2x - dx * e2z;
    let hz = dx * e2y - dy * e2x;

    let det = e1x * hx + e1y * hy + e1z * hz;
    if det.abs() < 1e-10 {
        return -1.0; // parallel or degenerate
    }

    let inv_det = 1.0 / det;

    // s = origin - a
    let sx = ray.origin.x - a.x;
    let sy = ray.origin.y - a.y;
    let sz = ray.origin.z - a.z;

    // u = (s · h) * invDet
    let u = (sx * hx + sy * hy + sz * hz) * inv_det;
    if !(0.0..=1.0).contains(&u) {
        return -1.0;
    }

    // q = s × e1
    let qx = sy * e1z - sz * e1y;
    let qy = sz * e1x - sx * e1z;
    let qz = sx * e1y - sy * e1x;

    // v = (direction · q) * invDet
    let v = (dx * qx + dy * qy + dz * qz) * inv_det;
    if v < 0.0 || u + v > 1.0 {
        return -1.0;
    }

    // t = (e2 · q) * invDet
    let t = (e2x * qx + e2y * qy + e2z * qz) * inv_det;
    if t >= 0.0 { t } else { -1.0 }
}

/// Writes origin and direction into an existing [`Ray3D`] in place.
///
/// Safe when `out` aliases an input vector (all inputs are read before writing).
pub fn set_ray3d(out: &mut Ray3D, origin: &Vector3Like, direction: &Vector3Like) {
    let ox = origin.x;
    let oy = origin.y;
    let oz = origin.z;
    let dx = direction.x;
    let dy = direction.y;
    let dz = direction.z;
    out.origin.x = ox;
    out.origin.y = oy;
    out.origin.z = oz;
    out.direction.x = dx;
    out.direction.y = dy;
    out.direction.z = dz;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::Aabb;

    fn ray(ox: f32, oy: f32, oz: f32, dx: f32, dy: f32, dz: f32) -> Ray3D {
        Ray3D {
            origin: Vector3 {
                x: ox,
                y: oy,
                z: oz,
            },
            direction: Vector3 {
                x: dx,
                y: dy,
                z: dz,
            },
        }
    }

    fn pt(x: f32, y: f32, z: f32) -> Vector3Like {
        Vector3Like { x, y, z }
    }

    fn aabb(min_x: f32, min_y: f32, min_z: f32, max_x: f32, max_y: f32, max_z: f32) -> Aabb {
        Aabb {
            min: Vector3 {
                x: min_x,
                y: min_y,
                z: min_z,
            },
            max: Vector3 {
                x: max_x,
                y: max_y,
                z: max_z,
            },
        }
    }

    // create_ray3d
    #[test]
    fn create_ray3d_defaults_to_origin_plus_z() {
        let r = create_ray3d(None, None, None, None, None, None);
        assert_eq!((r.origin.x, r.origin.y, r.origin.z), (0.0, 0.0, 0.0));
        assert_eq!(
            (r.direction.x, r.direction.y, r.direction.z),
            (0.0, 0.0, 1.0)
        );
    }

    #[test]
    fn create_ray3d_explicit_values() {
        let r = create_ray3d(
            Some(1.0),
            Some(2.0),
            Some(3.0),
            Some(0.0),
            Some(1.0),
            Some(0.0),
        );
        assert_eq!((r.origin.x, r.origin.y, r.origin.z), (1.0, 2.0, 3.0));
        assert_eq!(
            (r.direction.x, r.direction.y, r.direction.z),
            (0.0, 1.0, 0.0)
        );
    }

    // get_closest_point_between_ray3ds
    #[test]
    fn get_closest_point_between_ray3ds_parallel() {
        // Parallel rays: a along +X from origin, b along +X from (0,1,0).
        let a = ray(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let b = ray(0.0, 1.0, 0.0, 1.0, 0.0, 0.0);
        let mut pa = pt(0.0, 0.0, 0.0);
        let mut pb = pt(0.0, 0.0, 0.0);
        get_closest_point_between_ray3ds(&mut pa, &mut pb, &a, &b);
        // Both clamp to their origins (ta=0, tb=0).
        assert!((pa.x).abs() < 1e-5 && (pa.y).abs() < 1e-5);
        assert!((pb.y - 1.0).abs() < 1e-5);
    }

    #[test]
    fn get_closest_point_between_ray3ds_skew() {
        // Ray a along +X from origin, ray b along +Y from (0,0,1).
        // Closest points: (0,0,0) and (0,0,1).
        let a = ray(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let b = ray(0.0, 0.0, 1.0, 0.0, 1.0, 0.0);
        let mut pa = pt(0.0, 0.0, 0.0);
        let mut pb = pt(0.0, 0.0, 0.0);
        get_closest_point_between_ray3ds(&mut pa, &mut pb, &a, &b);
        assert!((pa.x).abs() < 1e-4 && (pa.z).abs() < 1e-4);
        assert!((pb.z - 1.0).abs() < 1e-4 && (pb.y).abs() < 1e-4);
    }

    // get_closest_point_on_ray3d
    #[test]
    fn get_closest_point_on_ray3d_projects_point() {
        let r = ray(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut out = pt(0.0, 0.0, 0.0);
        get_closest_point_on_ray3d(&mut out, &r, &pt(3.0, 5.0, 0.0));
        assert!((out.x - 3.0).abs() < 1e-5);
        assert!((out.y).abs() < 1e-5);
    }

    #[test]
    fn get_closest_point_on_ray3d_clamps_behind_origin() {
        let r = ray(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut out = pt(0.0, 0.0, 0.0);
        get_closest_point_on_ray3d(&mut out, &r, &pt(-5.0, 0.0, 0.0));
        // Should clamp to origin.
        assert!((out.x).abs() < 1e-5);
    }

    // get_ray3d_point_at
    #[test]
    fn get_ray3d_point_at_computes_position() {
        let r = ray(1.0, 0.0, 0.0, 0.0, 1.0, 0.0);
        let mut out = pt(0.0, 0.0, 0.0);
        get_ray3d_point_at(&mut out, &r, 3.0);
        assert_eq!((out.x, out.y, out.z), (1.0, 3.0, 0.0));
    }

    // intersect_ray3d_aabb
    #[test]
    fn intersect_ray3d_aabb_hits() {
        let r = ray(0.0, 0.0, -5.0, 0.0, 0.0, 1.0);
        let b = aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        let t = intersect_ray3d_aabb(&r, &b);
        assert!(t >= 0.0, "expected hit, got {t}");
        assert!((t - 4.0).abs() < 1e-5);
    }

    #[test]
    fn intersect_ray3d_aabb_misses() {
        let r = ray(5.0, 0.0, -5.0, 0.0, 0.0, 1.0);
        let b = aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert_eq!(intersect_ray3d_aabb(&r, &b), -1.0);
    }

    #[test]
    fn intersect_ray3d_aabb_starts_inside() {
        let r = ray(0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        let b = aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        let t = intersect_ray3d_aabb(&r, &b);
        assert_eq!(t, 0.0);
    }

    // intersect_ray3d_plane
    #[test]
    fn intersect_ray3d_plane_hits_xy_plane() {
        // Plane z = 0 → a=0, b=0, c=1, d=0.
        let plane = Plane {
            a: 0.0,
            b: 0.0,
            c: 1.0,
            d: 0.0,
        };
        let r = ray(0.0, 0.0, 5.0, 0.0, 0.0, -1.0);
        let t = intersect_ray3d_plane(&r, &plane);
        assert!((t - 5.0).abs() < 1e-5, "expected t=5, got {t}");
    }

    #[test]
    fn intersect_ray3d_plane_parallel_misses() {
        let plane = Plane {
            a: 0.0,
            b: 0.0,
            c: 1.0,
            d: -5.0,
        };
        let r = ray(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert_eq!(intersect_ray3d_plane(&r, &plane), -1.0);
    }

    #[test]
    fn intersect_ray3d_plane_behind_origin_misses() {
        let plane = Plane {
            a: 0.0,
            b: 0.0,
            c: 1.0,
            d: 0.0,
        };
        // Ray at z=5 pointing away from z=0.
        let r = ray(0.0, 0.0, 5.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_plane(&r, &plane), -1.0);
    }

    // intersect_ray3d_sphere
    #[test]
    fn intersect_ray3d_sphere_hits() {
        let sphere = BoundingSphere {
            center: Vector3 {
                x: 0.0,
                y: 0.0,
                z: 5.0,
            },
            radius: 1.0,
        };
        let r = ray(0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        let t = intersect_ray3d_sphere(&r, &sphere);
        assert!((t - 4.0).abs() < 1e-5, "expected t≈4, got {t}");
    }

    #[test]
    fn intersect_ray3d_sphere_misses() {
        let sphere = BoundingSphere {
            center: Vector3 {
                x: 10.0,
                y: 0.0,
                z: 0.0,
            },
            radius: 1.0,
        };
        let r = ray(0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_sphere(&r, &sphere), -1.0);
    }

    #[test]
    fn intersect_ray3d_sphere_inside_returns_zero() {
        let sphere = BoundingSphere {
            center: Vector3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            radius: 10.0,
        };
        let r = ray(0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_sphere(&r, &sphere), 0.0);
    }

    #[test]
    fn intersect_ray3d_sphere_empty_sphere_misses() {
        let sphere = BoundingSphere {
            center: Vector3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            radius: -1.0,
        };
        let r = ray(0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_sphere(&r, &sphere), -1.0);
    }

    // intersect_ray3d_triangle
    #[test]
    fn intersect_ray3d_triangle_front_face_hit() {
        // Triangle in the XY plane at z=5.
        let a = pt(-1.0, 0.0, 5.0);
        let b = pt(1.0, 0.0, 5.0);
        let c = pt(0.0, 1.0, 5.0);
        let r = ray(0.0, 0.3, 0.0, 0.0, 0.0, 1.0);
        let t = intersect_ray3d_triangle(&r, &a, &b, &c);
        assert!((t - 5.0).abs() < 1e-4, "expected t≈5, got {t}");
    }

    #[test]
    fn intersect_ray3d_triangle_miss() {
        let a = pt(-1.0, 0.0, 5.0);
        let b = pt(1.0, 0.0, 5.0);
        let c = pt(0.0, 1.0, 5.0);
        let r = ray(5.0, 5.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_triangle(&r, &a, &b, &c), -1.0);
    }

    #[test]
    fn intersect_ray3d_triangle_back_face_also_hits() {
        // No back-face culling: ray pointing in +Z hits from behind.
        let a = pt(-1.0, 0.0, 5.0);
        let b = pt(0.0, 1.0, 5.0); // reversed winding vs front-face test
        let c = pt(1.0, 0.0, 5.0);
        let r = ray(0.0, 0.3, 0.0, 0.0, 0.0, 1.0);
        let t = intersect_ray3d_triangle(&r, &a, &b, &c);
        assert!(t >= 0.0, "back-face should also hit, got {t}");
    }

    // set_ray3d
    #[test]
    fn set_ray3d_writes_components() {
        let mut r = create_ray3d(None, None, None, None, None, None);
        let origin = pt(1.0, 2.0, 3.0);
        let dir = pt(0.0, 1.0, 0.0);
        set_ray3d(&mut r, &origin, &dir);
        assert_eq!((r.origin.x, r.origin.y, r.origin.z), (1.0, 2.0, 3.0));
        assert_eq!(
            (r.direction.x, r.direction.y, r.direction.z),
            (0.0, 1.0, 0.0)
        );
    }
}

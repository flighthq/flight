//! Free functions for [`BoundingSphere`] — bounding sphere in 3D.

use flighthq_types::{Aabb, BoundingSphere, Matrix4Like, Vector3, Vector3Like};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns a new [`BoundingSphere`] that is a copy of `source`.
pub fn clone_bounding_sphere(source: &BoundingSphere) -> BoundingSphere {
    create_bounding_sphere(
        Some(source.center.x),
        Some(source.center.y),
        Some(source.center.z),
        Some(source.radius),
    )
}

/// Copies the center and radius of a bounding sphere.
///
/// Safe when `out` aliases `source`.
pub fn copy_bounding_sphere(out: &mut BoundingSphere, source: &BoundingSphere) {
    let cx = source.center.x;
    let cy = source.center.y;
    let cz = source.center.z;
    let r = source.radius;
    out.center.x = cx;
    out.center.y = cy;
    out.center.z = cz;
    out.radius = r;
}

/// Creates a bounding sphere from an explicit center and radius. With no arguments the sphere
/// is empty (center at the origin, radius -1).
pub fn create_bounding_sphere(
    center_x: Option<f32>,
    center_y: Option<f32>,
    center_z: Option<f32>,
    radius: Option<f32>,
) -> BoundingSphere {
    BoundingSphere {
        center: Vector3 {
            x: center_x.unwrap_or(0.0),
            y: center_y.unwrap_or(0.0),
            z: center_z.unwrap_or(0.0),
        },
        radius: radius.unwrap_or(-1.0),
    }
}

/// Returns whether a point lies inside (or on the surface of) a bounding sphere. An empty
/// sphere (negative radius) contains no points.
pub fn get_bounding_sphere_contains_point(sphere: &BoundingSphere, point: &Vector3Like) -> bool {
    if sphere.radius < 0.0 {
        return false;
    }
    let dx = point.x - sphere.center.x;
    let dy = point.y - sphere.center.y;
    let dz = point.z - sphere.center.z;
    dx * dx + dy * dy + dz * dz <= sphere.radius * sphere.radius
}

/// Writes the point on the surface of a bounding sphere closest to `point`.
///
/// Safe when `out` aliases `point`.
pub fn get_closest_point_on_bounding_sphere(
    out: &mut Vector3Like,
    sphere: &BoundingSphere,
    point: &Vector3Like,
) {
    let cx = sphere.center.x;
    let cy = sphere.center.y;
    let cz = sphere.center.z;
    let r = sphere.radius;
    if r < 0.0 {
        out.x = cx;
        out.y = cy;
        out.z = cz;
        return;
    }
    let dx = point.x - cx;
    let dy = point.y - cy;
    let dz = point.z - cz;
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();
    if dist == 0.0 {
        out.x = cx + r;
        out.y = cy;
        out.z = cz;
        return;
    }
    let scale = r / dist;
    out.x = cx + dx * scale;
    out.y = cy + dy * scale;
    out.z = cz + dz * scale;
}

/// Returns whether two bounding spheres overlap. An empty sphere (negative radius) does not
/// intersect anything.
pub fn is_bounding_sphere_intersecting_bounding_sphere(
    a: &BoundingSphere,
    b: &BoundingSphere,
) -> bool {
    if a.radius < 0.0 || b.radius < 0.0 {
        return false;
    }
    let dx = a.center.x - b.center.x;
    let dy = a.center.y - b.center.y;
    let dz = a.center.z - b.center.z;
    let dist_sq = dx * dx + dy * dy + dz * dz;
    let sum_r = a.radius + b.radius;
    dist_sq <= sum_r * sum_r
}

/// Writes the smallest sphere that encloses both `a` and `b`.
///
/// Safe when `out` aliases `a` or `b`.
pub fn merge_bounding_sphere(out: &mut BoundingSphere, a: &BoundingSphere, b: &BoundingSphere) {
    if a.radius < 0.0 {
        let cx = b.center.x;
        let cy = b.center.y;
        let cz = b.center.z;
        let r = b.radius;
        out.center.x = cx;
        out.center.y = cy;
        out.center.z = cz;
        out.radius = r;
        return;
    }
    if b.radius < 0.0 {
        let cx = a.center.x;
        let cy = a.center.y;
        let cz = a.center.z;
        let r = a.radius;
        out.center.x = cx;
        out.center.y = cy;
        out.center.z = cz;
        out.radius = r;
        return;
    }

    let acx = a.center.x;
    let acy = a.center.y;
    let acz = a.center.z;
    let ar = a.radius;
    let bcx = b.center.x;
    let bcy = b.center.y;
    let bcz = b.center.z;
    let br = b.radius;

    let dx = bcx - acx;
    let dy = bcy - acy;
    let dz = bcz - acz;
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();

    if dist + br <= ar {
        out.center.x = acx;
        out.center.y = acy;
        out.center.z = acz;
        out.radius = ar;
        return;
    }
    if dist + ar <= br {
        out.center.x = bcx;
        out.center.y = bcy;
        out.center.z = bcz;
        out.radius = br;
        return;
    }

    let new_radius = (dist + ar + br) * 0.5;
    let t = if dist != 0.0 {
        (new_radius - ar) / dist
    } else {
        0.0
    };
    out.center.x = acx + dx * t;
    out.center.y = acy + dy * t;
    out.center.z = acz + dz * t;
    out.radius = new_radius;
}

/// Sets the center and radius of a bounding sphere.
pub fn set_bounding_sphere(
    out: &mut BoundingSphere,
    center_x: f32,
    center_y: f32,
    center_z: f32,
    radius: f32,
) {
    out.center.x = center_x;
    out.center.y = center_y;
    out.center.z = center_z;
    out.radius = radius;
}

/// Writes the bounding sphere that tightly encloses an axis-aligned bounding box.
pub fn set_bounding_sphere_from_aabb(out: &mut BoundingSphere, aabb: &Aabb) {
    let min_x = aabb.min.x;
    let min_y = aabb.min.y;
    let min_z = aabb.min.z;
    let max_x = aabb.max.x;
    let max_y = aabb.max.y;
    let max_z = aabb.max.z;

    if min_x > max_x || min_y > max_y || min_z > max_z {
        out.center.x = 0.0;
        out.center.y = 0.0;
        out.center.z = 0.0;
        out.radius = -1.0;
        return;
    }

    let cx = (min_x + max_x) * 0.5;
    let cy = (min_y + max_y) * 0.5;
    let cz = (min_z + max_z) * 0.5;
    let ex = (max_x - min_x) * 0.5;
    let ey = (max_y - min_y) * 0.5;
    let ez = (max_z - min_z) * 0.5;

    out.center.x = cx;
    out.center.y = cy;
    out.center.z = cz;
    out.radius = (ex * ex + ey * ey + ez * ez).sqrt();
}

/// Transforms a bounding sphere by a Matrix4.
///
/// Safe when `out` aliases `sphere`.
pub fn transform_bounding_sphere_by_matrix4(
    out: &mut BoundingSphere,
    sphere: &BoundingSphere,
    m: &Matrix4Like,
) {
    let cx = sphere.center.x;
    let cy = sphere.center.y;
    let cz = sphere.center.z;
    let radius = sphere.radius;

    let mm = &m.m;
    let tcx = mm[0] * cx + mm[4] * cy + mm[8] * cz + mm[12];
    let tcy = mm[1] * cx + mm[5] * cy + mm[9] * cz + mm[13];
    let tcz = mm[2] * cx + mm[6] * cy + mm[10] * cz + mm[14];

    let sx = (mm[0] * mm[0] + mm[1] * mm[1] + mm[2] * mm[2]).sqrt();
    let sy = (mm[4] * mm[4] + mm[5] * mm[5] + mm[6] * mm[6]).sqrt();
    let sz = (mm[8] * mm[8] + mm[9] * mm[9] + mm[10] * mm[10]).sqrt();
    let max_scale = sx.max(sy).max(sz);

    out.center.x = tcx;
    out.center.y = tcy;
    out.center.z = tcz;
    out.radius = if radius < 0.0 {
        radius
    } else {
        radius * max_scale
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn sphere(cx: f32, cy: f32, cz: f32, r: f32) -> BoundingSphere {
        BoundingSphere {
            center: Vector3 {
                x: cx,
                y: cy,
                z: cz,
            },
            radius: r,
        }
    }

    fn pt(x: f32, y: f32, z: f32) -> Vector3Like {
        Vector3Like { x, y, z }
    }

    // clone_bounding_sphere
    #[test]
    fn clone_bounding_sphere_copies() {
        let s = sphere(1.0, 2.0, 3.0, 4.0);
        let c = clone_bounding_sphere(&s);
        assert_eq!((c.center.x, c.center.y, c.center.z), (1.0, 2.0, 3.0));
        assert_eq!(c.radius, 4.0);
    }

    // copy_bounding_sphere
    #[test]
    fn copy_bounding_sphere_copies_fields() {
        let src = sphere(1.0, 2.0, 3.0, 5.0);
        let mut out = sphere(0.0, 0.0, 0.0, 0.0);
        copy_bounding_sphere(&mut out, &src);
        assert_eq!((out.center.x, out.center.y, out.center.z), (1.0, 2.0, 3.0));
        assert_eq!(out.radius, 5.0);
    }

    // create_bounding_sphere
    #[test]
    fn create_bounding_sphere_defaults_to_empty() {
        let s = create_bounding_sphere(None, None, None, None);
        assert_eq!(s.radius, -1.0);
    }

    #[test]
    fn create_bounding_sphere_explicit() {
        let s = create_bounding_sphere(Some(1.0), Some(2.0), Some(3.0), Some(4.0));
        assert_eq!((s.center.x, s.center.y, s.center.z), (1.0, 2.0, 3.0));
        assert_eq!(s.radius, 4.0);
    }

    // get_bounding_sphere_contains_point
    #[test]
    fn get_bounding_sphere_contains_point_inside() {
        let s = sphere(0.0, 0.0, 0.0, 2.0);
        assert!(get_bounding_sphere_contains_point(&s, &pt(1.0, 0.0, 0.0)));
    }

    #[test]
    fn get_bounding_sphere_contains_point_outside() {
        let s = sphere(0.0, 0.0, 0.0, 1.0);
        assert!(!get_bounding_sphere_contains_point(&s, &pt(2.0, 0.0, 0.0)));
    }

    #[test]
    fn get_bounding_sphere_contains_point_empty() {
        let s = sphere(0.0, 0.0, 0.0, -1.0);
        assert!(!get_bounding_sphere_contains_point(&s, &pt(0.0, 0.0, 0.0)));
    }

    // is_bounding_sphere_intersecting_bounding_sphere
    #[test]
    fn is_bounding_sphere_intersecting_bounding_sphere_overlap() {
        let a = sphere(0.0, 0.0, 0.0, 2.0);
        let b = sphere(3.0, 0.0, 0.0, 2.0);
        assert!(is_bounding_sphere_intersecting_bounding_sphere(&a, &b));
    }

    #[test]
    fn is_bounding_sphere_intersecting_bounding_sphere_no_overlap() {
        let a = sphere(0.0, 0.0, 0.0, 1.0);
        let b = sphere(5.0, 0.0, 0.0, 1.0);
        assert!(!is_bounding_sphere_intersecting_bounding_sphere(&a, &b));
    }

    #[test]
    fn is_bounding_sphere_intersecting_bounding_sphere_empty() {
        let a = sphere(0.0, 0.0, 0.0, -1.0);
        let b = sphere(0.0, 0.0, 0.0, 1.0);
        assert!(!is_bounding_sphere_intersecting_bounding_sphere(&a, &b));
    }

    // merge_bounding_sphere
    #[test]
    fn merge_bounding_sphere_with_empty() {
        let a = sphere(0.0, 0.0, 0.0, -1.0);
        let b = sphere(1.0, 0.0, 0.0, 2.0);
        let mut out = sphere(0.0, 0.0, 0.0, 0.0);
        merge_bounding_sphere(&mut out, &a, &b);
        assert_eq!(out.center.x, 1.0);
        assert_eq!(out.radius, 2.0);
    }

    #[test]
    fn merge_bounding_sphere_contained() {
        let a = sphere(0.0, 0.0, 0.0, 5.0);
        let b = sphere(0.0, 0.0, 0.0, 1.0);
        let mut out = sphere(0.0, 0.0, 0.0, 0.0);
        merge_bounding_sphere(&mut out, &a, &b);
        assert_eq!(out.radius, 5.0);
    }

    // set_bounding_sphere
    #[test]
    fn set_bounding_sphere_assigns() {
        let mut out = sphere(0.0, 0.0, 0.0, 0.0);
        set_bounding_sphere(&mut out, 1.0, 2.0, 3.0, 4.0);
        assert_eq!((out.center.x, out.center.y, out.center.z), (1.0, 2.0, 3.0));
        assert_eq!(out.radius, 4.0);
    }

    // set_bounding_sphere_from_aabb
    #[test]
    fn set_bounding_sphere_from_aabb_encloses() {
        let aabb = Aabb {
            min: Vector3 {
                x: -1.0,
                y: -1.0,
                z: -1.0,
            },
            max: Vector3 {
                x: 1.0,
                y: 1.0,
                z: 1.0,
            },
        };
        let mut out = sphere(0.0, 0.0, 0.0, 0.0);
        set_bounding_sphere_from_aabb(&mut out, &aabb);
        assert!((out.center.x).abs() < 1e-5);
        assert!((out.radius - 3.0_f32.sqrt()).abs() < 1e-5);
    }

    #[test]
    fn set_bounding_sphere_from_aabb_empty() {
        let aabb = Aabb {
            min: Vector3 {
                x: f32::INFINITY,
                y: f32::INFINITY,
                z: f32::INFINITY,
            },
            max: Vector3 {
                x: f32::NEG_INFINITY,
                y: f32::NEG_INFINITY,
                z: f32::NEG_INFINITY,
            },
        };
        let mut out = sphere(0.0, 0.0, 0.0, 0.0);
        set_bounding_sphere_from_aabb(&mut out, &aabb);
        assert_eq!(out.radius, -1.0);
    }

    // transform_bounding_sphere_by_matrix4
    #[test]
    fn transform_bounding_sphere_by_matrix4_identity() {
        let s = sphere(1.0, 2.0, 3.0, 4.0);
        let m = Matrix4Like::default();
        let mut out = sphere(0.0, 0.0, 0.0, 0.0);
        transform_bounding_sphere_by_matrix4(&mut out, &s, &m);
        assert!((out.center.x - 1.0).abs() < 1e-5);
        assert!((out.radius - 4.0).abs() < 1e-5);
    }
}

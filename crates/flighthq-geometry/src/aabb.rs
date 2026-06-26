//! Free functions for [`Aabb`] — axis-aligned bounding box in 3D.

use flighthq_types::{Aabb, BoundingSphere, Matrix4Like, Vector3, Vector3Like};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns a new [`Aabb`] that is a copy of `source`.
pub fn clone_aabb(source: &Aabb) -> Aabb {
    create_aabb(
        Some(source.min.x),
        Some(source.min.y),
        Some(source.min.z),
        Some(source.max.x),
        Some(source.max.y),
        Some(source.max.z),
    )
}

/// Copies the min and max corners of an axis-aligned bounding box.
///
/// Safe when `out` aliases `source`.
pub fn copy_aabb(out: &mut Aabb, source: &Aabb) {
    let min_x = source.min.x;
    let min_y = source.min.y;
    let min_z = source.min.z;
    let max_x = source.max.x;
    let max_y = source.max.y;
    let max_z = source.max.z;
    out.min.x = min_x;
    out.min.y = min_y;
    out.min.z = min_z;
    out.max.x = max_x;
    out.max.y = max_y;
    out.max.z = max_z;
}

/// Creates an axis-aligned bounding box from explicit min/max corner components. With no
/// arguments the box is empty (min = +Infinity, max = -Infinity) so the first point expanded
/// into it sets both corners.
pub fn create_aabb(
    min_x: Option<f32>,
    min_y: Option<f32>,
    min_z: Option<f32>,
    max_x: Option<f32>,
    max_y: Option<f32>,
    max_z: Option<f32>,
) -> Aabb {
    Aabb {
        min: Vector3 {
            x: min_x.unwrap_or(f32::INFINITY),
            y: min_y.unwrap_or(f32::INFINITY),
            z: min_z.unwrap_or(f32::INFINITY),
        },
        max: Vector3 {
            x: max_x.unwrap_or(f32::NEG_INFINITY),
            y: max_y.unwrap_or(f32::NEG_INFINITY),
            z: max_z.unwrap_or(f32::NEG_INFINITY),
        },
    }
}

/// Grows an axis-aligned bounding box to include a point, writing the result to `out`. When
/// `aabb` is empty (min > max) the first point sets both corners exactly.
///
/// Safe when `out` aliases `aabb`.
pub fn expand_aabb_by_point(out: &mut Aabb, aabb: &Aabb, point: &Vector3Like) {
    let px = point.x;
    let py = point.y;
    let pz = point.z;
    let min_x = aabb.min.x.min(px);
    let min_y = aabb.min.y.min(py);
    let min_z = aabb.min.z.min(pz);
    let max_x = aabb.max.x.max(px);
    let max_y = aabb.max.y.max(py);
    let max_z = aabb.max.z.max(pz);
    out.min.x = min_x;
    out.min.y = min_y;
    out.min.z = min_z;
    out.max.x = max_x;
    out.max.y = max_y;
    out.max.z = max_z;
}

/// Grows an axis-aligned bounding box to include a bounding sphere. The sphere is expanded to
/// its AABB first, then unioned with the existing box. An empty sphere (radius < 0) is skipped.
///
/// Safe when `out` aliases `aabb`.
pub fn expand_aabb_by_sphere(out: &mut Aabb, aabb: &Aabb, sphere: &BoundingSphere) {
    if sphere.radius < 0.0 {
        // Empty sphere — copy aabb to out unchanged.
        let min_x = aabb.min.x;
        let min_y = aabb.min.y;
        let min_z = aabb.min.z;
        let max_x = aabb.max.x;
        let max_y = aabb.max.y;
        let max_z = aabb.max.z;
        out.min.x = min_x;
        out.min.y = min_y;
        out.min.z = min_z;
        out.max.x = max_x;
        out.max.y = max_y;
        out.max.z = max_z;
        return;
    }
    let cx = sphere.center.x;
    let cy = sphere.center.y;
    let cz = sphere.center.z;
    let r = sphere.radius;
    let min_x = aabb.min.x.min(cx - r);
    let min_y = aabb.min.y.min(cy - r);
    let min_z = aabb.min.z.min(cz - r);
    let max_x = aabb.max.x.max(cx + r);
    let max_y = aabb.max.y.max(cy + r);
    let max_z = aabb.max.z.max(cz + r);
    out.min.x = min_x;
    out.min.y = min_y;
    out.min.z = min_z;
    out.max.x = max_x;
    out.max.y = max_y;
    out.max.z = max_z;
}

/// Writes the center point of an axis-aligned bounding box (the midpoint of its corners).
pub fn get_aabb_center(out: &mut Vector3Like, aabb: &Aabb) {
    out.x = (aabb.min.x + aabb.max.x) * 0.5;
    out.y = (aabb.min.y + aabb.max.y) * 0.5;
    out.z = (aabb.min.z + aabb.max.z) * 0.5;
}

/// Returns whether a point lies inside (or on the boundary of) an axis-aligned bounding box.
pub fn get_aabb_contains_point(aabb: &Aabb, point: &Vector3Like) -> bool {
    point.x >= aabb.min.x
        && point.x <= aabb.max.x
        && point.y >= aabb.min.y
        && point.y <= aabb.max.y
        && point.z >= aabb.min.z
        && point.z <= aabb.max.z
}

/// Writes the half-extents (half the size along each axis) of an axis-aligned bounding box.
pub fn get_aabb_extents(out: &mut Vector3Like, aabb: &Aabb) {
    out.x = (aabb.max.x - aabb.min.x) * 0.5;
    out.y = (aabb.max.y - aabb.min.y) * 0.5;
    out.z = (aabb.max.z - aabb.min.z) * 0.5;
}

/// Writes the full size (extent along each axis) of an axis-aligned bounding box.
pub fn get_aabb_size(out: &mut Vector3Like, aabb: &Aabb) {
    out.x = aabb.max.x - aabb.min.x;
    out.y = aabb.max.y - aabb.min.y;
    out.z = aabb.max.z - aabb.min.z;
}

/// Writes the point on (or inside) an axis-aligned bounding box closest to `point` — each
/// coordinate is clamped to the box's range on that axis. When `point` is already inside the box
/// the result equals `point`. An empty box (min > max) yields a degenerate result; callers should
/// guard empties.
///
/// Safe when `out` aliases `point`.
pub fn get_closest_point_on_aabb(out: &mut Vector3Like, aabb: &Aabb, point: &Vector3Like) {
    let px = point.x;
    let py = point.y;
    let pz = point.z;
    out.x = px.max(aabb.min.x).min(aabb.max.x);
    out.y = py.max(aabb.min.y).min(aabb.max.y);
    out.z = pz.max(aabb.min.z).min(aabb.max.z);
}

/// Writes the intersection (overlap region) of two axis-aligned bounding boxes to `out`.
/// If the boxes do not overlap, `out` is set to an empty box (min > max).
///
/// Reads all inputs into locals before writing, so it is safe when `out` aliases `a` or `b`.
pub fn intersect_aabb(out: &mut Aabb, a: &Aabb, b: &Aabb) {
    let a_min_x = a.min.x;
    let a_min_y = a.min.y;
    let a_min_z = a.min.z;
    let a_max_x = a.max.x;
    let a_max_y = a.max.y;
    let a_max_z = a.max.z;
    let b_min_x = b.min.x;
    let b_min_y = b.min.y;
    let b_min_z = b.min.z;
    let b_max_x = b.max.x;
    let b_max_y = b.max.y;
    let b_max_z = b.max.z;
    out.min.x = a_min_x.max(b_min_x);
    out.min.y = a_min_y.max(b_min_y);
    out.min.z = a_min_z.max(b_min_z);
    out.max.x = a_max_x.min(b_max_x);
    out.max.y = a_max_y.min(b_max_y);
    out.max.z = a_max_z.min(b_max_z);
}

/// Returns whether two axis-aligned bounding boxes overlap (share any interior or surface point).
pub fn intersects_aabb(a: &Aabb, b: &Aabb) -> bool {
    a.min.x <= b.max.x
        && a.max.x >= b.min.x
        && a.min.y <= b.max.y
        && a.max.y >= b.min.y
        && a.min.z <= b.max.z
        && a.max.z >= b.min.z
}

/// Sets the min and max corners of an axis-aligned bounding box from explicit components.
pub fn set_aabb(
    out: &mut Aabb,
    min_x: f32,
    min_y: f32,
    min_z: f32,
    max_x: f32,
    max_y: f32,
    max_z: f32,
) {
    out.min.x = min_x;
    out.min.y = min_y;
    out.min.z = min_z;
    out.max.x = max_x;
    out.max.y = max_y;
    out.max.z = max_z;
}

/// Computes the tight axis-aligned bounding box of a set of points. An empty slice yields an
/// empty box (min = +Infinity, max = -Infinity).
pub fn set_aabb_from_points(out: &mut Aabb, points: &[Vector3Like]) {
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut min_z = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let mut max_z = f32::NEG_INFINITY;
    for p in points {
        if p.x < min_x {
            min_x = p.x;
        }
        if p.y < min_y {
            min_y = p.y;
        }
        if p.z < min_z {
            min_z = p.z;
        }
        if p.x > max_x {
            max_x = p.x;
        }
        if p.y > max_y {
            max_y = p.y;
        }
        if p.z > max_z {
            max_z = p.z;
        }
    }
    out.min.x = min_x;
    out.min.y = min_y;
    out.min.z = min_z;
    out.max.x = max_x;
    out.max.y = max_y;
    out.max.z = max_z;
}

/// Transforms an axis-aligned bounding box by a Matrix4 and writes the tight AABB of the
/// transformed box. Uses the center/extent absolute-value method so the result stays
/// axis-aligned in the destination space.
///
/// Reads all of `aabb` into locals before writing, so it is safe when `out` aliases `aabb`.
pub fn transform_aabb_by_matrix4(out: &mut Aabb, aabb: &Aabb, m: &Matrix4Like) {
    let min_x = aabb.min.x;
    let min_y = aabb.min.y;
    let min_z = aabb.min.z;
    let max_x = aabb.max.x;
    let max_y = aabb.max.y;
    let max_z = aabb.max.z;

    let cx = (min_x + max_x) * 0.5;
    let cy = (min_y + max_y) * 0.5;
    let cz = (min_z + max_z) * 0.5;
    let ex = (max_x - min_x) * 0.5;
    let ey = (max_y - min_y) * 0.5;
    let ez = (max_z - min_z) * 0.5;

    // Column-major Matrix4 — same layout as the TS m[] array.
    let mm = &m.m;
    // Transformed center (includes translation at m[12..14]).
    let tcx = mm[0] * cx + mm[4] * cy + mm[8] * cz + mm[12];
    let tcy = mm[1] * cx + mm[5] * cy + mm[9] * cz + mm[13];
    let tcz = mm[2] * cx + mm[6] * cy + mm[10] * cz + mm[14];

    // Transformed extent via |M| · extent (absolute values of the linear part).
    let tex = mm[0].abs() * ex + mm[4].abs() * ey + mm[8].abs() * ez;
    let tey = mm[1].abs() * ex + mm[5].abs() * ey + mm[9].abs() * ez;
    let tez = mm[2].abs() * ex + mm[6].abs() * ey + mm[10].abs() * ez;

    out.min.x = tcx - tex;
    out.min.y = tcy - tey;
    out.min.z = tcz - tez;
    out.max.x = tcx + tex;
    out.max.y = tcy + tey;
    out.max.z = tcz + tez;
}

/// Writes the union of two axis-aligned bounding boxes — the smallest box enclosing both.
///
/// Reads both inputs into locals before writing, so it is safe when `out` aliases `a` or `b`.
pub fn union_aabb(out: &mut Aabb, a: &Aabb, b: &Aabb) {
    let a_min_x = a.min.x;
    let a_min_y = a.min.y;
    let a_min_z = a.min.z;
    let a_max_x = a.max.x;
    let a_max_y = a.max.y;
    let a_max_z = a.max.z;
    let b_min_x = b.min.x;
    let b_min_y = b.min.y;
    let b_min_z = b.min.z;
    let b_max_x = b.max.x;
    let b_max_y = b.max.y;
    let b_max_z = b.max.z;
    out.min.x = a_min_x.min(b_min_x);
    out.min.y = a_min_y.min(b_min_y);
    out.min.z = a_min_z.min(b_min_z);
    out.max.x = a_max_x.max(b_max_x);
    out.max.y = a_max_y.max(b_max_y);
    out.max.z = a_max_z.max(b_max_z);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

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

    fn pt(x: f32, y: f32, z: f32) -> Vector3Like {
        Vector3Like { x, y, z }
    }

    // clone_aabb
    #[test]
    fn clone_aabb_copies_corners() {
        let src = aabb(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        let c = clone_aabb(&src);
        assert_eq!((c.min.x, c.min.y, c.min.z), (1.0, 2.0, 3.0));
        assert_eq!((c.max.x, c.max.y, c.max.z), (4.0, 5.0, 6.0));
    }

    // copy_aabb
    #[test]
    fn copy_aabb_writes_fields() {
        let src = aabb(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        let mut out = aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        copy_aabb(&mut out, &src);
        assert_eq!((out.min.x, out.min.y, out.min.z), (1.0, 2.0, 3.0));
        assert_eq!((out.max.x, out.max.y, out.max.z), (4.0, 5.0, 6.0));
    }

    // create_aabb
    #[test]
    fn create_aabb_empty_when_no_args() {
        let b = create_aabb(None, None, None, None, None, None);
        assert!(b.min.x.is_infinite() && b.min.x > 0.0);
        assert!(b.max.x.is_infinite() && b.max.x < 0.0);
    }

    #[test]
    fn create_aabb_explicit_values() {
        let b = create_aabb(
            Some(1.0),
            Some(2.0),
            Some(3.0),
            Some(4.0),
            Some(5.0),
            Some(6.0),
        );
        assert_eq!((b.min.x, b.min.y, b.min.z), (1.0, 2.0, 3.0));
        assert_eq!((b.max.x, b.max.y, b.max.z), (4.0, 5.0, 6.0));
    }

    // expand_aabb_by_point
    #[test]
    fn expand_aabb_by_point_grows_box() {
        let b = aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let mut out = b;
        expand_aabb_by_point(&mut out, &b, &pt(2.0, -1.0, 3.0));
        assert_eq!((out.min.x, out.min.y, out.min.z), (0.0, -1.0, 0.0));
        assert_eq!((out.max.x, out.max.y, out.max.z), (2.0, 1.0, 3.0));
    }

    #[test]
    fn expand_aabb_by_point_from_empty() {
        let empty = create_aabb(None, None, None, None, None, None);
        let mut out = create_aabb(None, None, None, None, None, None);
        expand_aabb_by_point(&mut out, &empty, &pt(3.0, 4.0, 5.0));
        assert_eq!((out.min.x, out.min.y, out.min.z), (3.0, 4.0, 5.0));
        assert_eq!((out.max.x, out.max.y, out.max.z), (3.0, 4.0, 5.0));
    }

    // expand_aabb_by_sphere
    #[test]
    fn expand_aabb_by_sphere_grows_by_radius() {
        let b = aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let sphere = BoundingSphere {
            center: Vector3 {
                x: 5.0,
                y: 5.0,
                z: 5.0,
            },
            radius: 1.0,
        };
        let mut out = b;
        expand_aabb_by_sphere(&mut out, &b, &sphere);
        assert_eq!((out.min.x, out.min.y, out.min.z), (0.0, 0.0, 0.0));
        assert_eq!((out.max.x, out.max.y, out.max.z), (6.0, 6.0, 6.0));
    }

    #[test]
    fn expand_aabb_by_sphere_skips_empty_sphere() {
        let b = aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let sphere = BoundingSphere {
            center: Vector3 {
                x: 5.0,
                y: 5.0,
                z: 5.0,
            },
            radius: -1.0,
        };
        let mut out = b;
        expand_aabb_by_sphere(&mut out, &b, &sphere);
        assert_eq!((out.max.x, out.max.y, out.max.z), (1.0, 1.0, 1.0));
    }

    // get_aabb_center
    #[test]
    fn get_aabb_center_midpoint() {
        let b = aabb(0.0, 0.0, 0.0, 4.0, 6.0, 8.0);
        let mut out = pt(0.0, 0.0, 0.0);
        get_aabb_center(&mut out, &b);
        assert_eq!((out.x, out.y, out.z), (2.0, 3.0, 4.0));
    }

    // get_aabb_contains_point
    #[test]
    fn get_aabb_contains_point_inside() {
        let b = aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        assert!(get_aabb_contains_point(&b, &pt(1.0, 1.0, 1.0)));
    }

    #[test]
    fn get_aabb_contains_point_outside() {
        let b = aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        assert!(!get_aabb_contains_point(&b, &pt(3.0, 1.0, 1.0)));
    }

    #[test]
    fn get_aabb_contains_point_on_boundary() {
        let b = aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        assert!(get_aabb_contains_point(&b, &pt(0.0, 0.0, 0.0)));
        assert!(get_aabb_contains_point(&b, &pt(2.0, 2.0, 2.0)));
    }

    // get_aabb_extents
    #[test]
    fn get_aabb_extents_half_size() {
        let b = aabb(0.0, 0.0, 0.0, 4.0, 6.0, 8.0);
        let mut out = pt(0.0, 0.0, 0.0);
        get_aabb_extents(&mut out, &b);
        assert_eq!((out.x, out.y, out.z), (2.0, 3.0, 4.0));
    }

    // get_aabb_size
    #[test]
    fn get_aabb_size_full_span() {
        let b = aabb(1.0, 2.0, 3.0, 5.0, 8.0, 11.0);
        let mut out = pt(0.0, 0.0, 0.0);
        get_aabb_size(&mut out, &b);
        assert_eq!((out.x, out.y, out.z), (4.0, 6.0, 8.0));
    }

    // get_closest_point_on_aabb
    #[test]
    fn get_closest_point_on_aabb_outside_clamps() {
        let b = aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        let mut out = pt(0.0, 0.0, 0.0);
        get_closest_point_on_aabb(&mut out, &b, &pt(5.0, -1.0, 1.0));
        assert_eq!((out.x, out.y, out.z), (2.0, 0.0, 1.0));
    }

    #[test]
    fn get_closest_point_on_aabb_inside_returns_point() {
        let b = aabb(0.0, 0.0, 0.0, 4.0, 4.0, 4.0);
        let mut out = pt(0.0, 0.0, 0.0);
        get_closest_point_on_aabb(&mut out, &b, &pt(2.0, 2.0, 2.0));
        assert_eq!((out.x, out.y, out.z), (2.0, 2.0, 2.0));
    }

    // intersect_aabb
    #[test]
    fn intersect_aabb_overlap_region() {
        let a = aabb(0.0, 0.0, 0.0, 3.0, 3.0, 3.0);
        let b = aabb(1.0, 1.0, 1.0, 4.0, 4.0, 4.0);
        let mut out = aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        intersect_aabb(&mut out, &a, &b);
        assert_eq!((out.min.x, out.min.y, out.min.z), (1.0, 1.0, 1.0));
        assert_eq!((out.max.x, out.max.y, out.max.z), (3.0, 3.0, 3.0));
    }

    #[test]
    fn intersect_aabb_no_overlap_empty_result() {
        let a = aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let b = aabb(2.0, 2.0, 2.0, 3.0, 3.0, 3.0);
        let mut out = aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        intersect_aabb(&mut out, &a, &b);
        // min > max means empty
        assert!(out.min.x > out.max.x);
    }

    // intersects_aabb
    #[test]
    fn intersects_aabb_overlapping() {
        let a = aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        let b = aabb(1.0, 1.0, 1.0, 3.0, 3.0, 3.0);
        assert!(intersects_aabb(&a, &b));
    }

    #[test]
    fn intersects_aabb_disjoint() {
        let a = aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let b = aabb(2.0, 2.0, 2.0, 3.0, 3.0, 3.0);
        assert!(!intersects_aabb(&a, &b));
    }

    #[test]
    fn intersects_aabb_touching_surface() {
        let a = aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let b = aabb(1.0, 0.0, 0.0, 2.0, 1.0, 1.0);
        assert!(intersects_aabb(&a, &b));
    }

    // set_aabb
    #[test]
    fn set_aabb_assigns_corners() {
        let mut out = aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        set_aabb(&mut out, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        assert_eq!((out.min.x, out.min.y, out.min.z), (1.0, 2.0, 3.0));
        assert_eq!((out.max.x, out.max.y, out.max.z), (4.0, 5.0, 6.0));
    }

    // set_aabb_from_points
    #[test]
    fn set_aabb_from_points_tight_fit() {
        let points = vec![pt(-1.0, 2.0, 0.0), pt(3.0, -1.0, 4.0), pt(0.0, 0.0, -2.0)];
        let mut out = aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        set_aabb_from_points(&mut out, &points);
        assert_eq!((out.min.x, out.min.y, out.min.z), (-1.0, -1.0, -2.0));
        assert_eq!((out.max.x, out.max.y, out.max.z), (3.0, 2.0, 4.0));
    }

    #[test]
    fn set_aabb_from_points_empty_slice_yields_empty_box() {
        let mut out = aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        set_aabb_from_points(&mut out, &[]);
        assert!(out.min.x.is_infinite() && out.min.x > 0.0);
        assert!(out.max.x.is_infinite() && out.max.x < 0.0);
    }

    // transform_aabb_by_matrix4
    #[test]
    fn transform_aabb_by_matrix4_identity_unchanged() {
        // Identity matrix in column-major order.
        let identity = Matrix4Like {
            m: [
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
            ],
        };
        let b = aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        let mut out = aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        transform_aabb_by_matrix4(&mut out, &b, &identity);
        assert!((out.min.x - (-1.0)).abs() < 1e-5);
        assert!((out.max.x - 1.0).abs() < 1e-5);
    }

    #[test]
    fn transform_aabb_by_matrix4_translation() {
        // Translation by (10, 0, 0). Box [0..2]^3 → center (1,1,1) → (11,1,1), extent (1,1,1)
        // gives output x in [10, 12].
        let mut m = [0.0f32; 16];
        m[0] = 1.0;
        m[5] = 1.0;
        m[10] = 1.0;
        m[15] = 1.0;
        m[12] = 10.0;
        let mat = Matrix4Like { m };
        let b = aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        let mut out = aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        transform_aabb_by_matrix4(&mut out, &b, &mat);
        assert!((out.min.x - 10.0).abs() < 1e-5);
        assert!((out.max.x - 12.0).abs() < 1e-5);
    }

    // union_aabb
    #[test]
    fn union_aabb_encompasses_both() {
        let a = aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        let b = aabb(-1.0, 1.0, -1.0, 3.0, 3.0, 3.0);
        let mut out = aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        union_aabb(&mut out, &a, &b);
        assert_eq!((out.min.x, out.min.y, out.min.z), (-1.0, 0.0, -1.0));
        assert_eq!((out.max.x, out.max.y, out.max.z), (3.0, 3.0, 3.0));
    }
}

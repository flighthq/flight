//! Free functions for [`Plane`] — a plane in 3D space.

use flighthq_types::{Plane, Vector3Like};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns a new [`Plane`] that is a copy of `source`.
pub fn clone_plane(source: &Plane) -> Plane {
    create_plane(
        Some(source.a),
        Some(source.b),
        Some(source.c),
        Some(source.d),
    )
}

/// Copies the coefficients of a plane (a, b, c, d).
///
/// Safe when `out` aliases `source`.
pub fn copy_plane(out: &mut Plane, source: &Plane) {
    out.a = source.a;
    out.b = source.b;
    out.c = source.c;
    out.d = source.d;
}

/// Creates a plane in the form a*x + b*y + c*z + d = 0. Defaults to all zeros.
pub fn create_plane(a: Option<f32>, b: Option<f32>, c: Option<f32>, d: Option<f32>) -> Plane {
    Plane {
        a: a.unwrap_or(0.0),
        b: b.unwrap_or(0.0),
        c: c.unwrap_or(0.0),
        d: d.unwrap_or(0.0),
    }
}

/// Writes the point on a plane closest to `point`. Requires unit-length normal.
///
/// Safe when `out` aliases `point`.
pub fn get_closest_point_on_plane(out: &mut Vector3Like, plane: &Plane, point: &Vector3Like) {
    let px = point.x;
    let py = point.y;
    let pz = point.z;
    let dist = plane.a * px + plane.b * py + plane.c * pz + plane.d;
    out.x = px - dist * plane.a;
    out.y = py - dist * plane.b;
    out.z = pz - dist * plane.c;
}

/// Writes the coplanar point on the plane closest to the origin.
/// Requires unit-length normal.
pub fn get_plane_coplanar_point(out: &mut Vector3Like, plane: &Plane) {
    out.x = -plane.a * plane.d;
    out.y = -plane.b * plane.d;
    out.z = -plane.c * plane.d;
}

/// Returns the signed distance from a point to a plane. Assumes unit-length normal.
pub fn get_plane_signed_distance_to_point(plane: &Plane, point: &Vector3Like) -> f32 {
    plane.a * point.x + plane.b * point.y + plane.c * point.z + plane.d
}

/// Normalizes a plane so its normal has unit length.
///
/// Safe when `out` aliases `source`.
pub fn normalize_plane(out: &mut Plane, source: &Plane) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let len = (a * a + b * b + c * c).sqrt();
    if len == 0.0 {
        out.a = a;
        out.b = b;
        out.c = c;
        out.d = d;
        return;
    }
    let inv = 1.0 / len;
    out.a = a * inv;
    out.b = b * inv;
    out.c = c * inv;
    out.d = d * inv;
}

/// Projects a point onto a plane, writing the closest point on the plane to `out`.
/// Requires unit-length normal. Equivalent to [`get_closest_point_on_plane`] with swapped
/// `point` and `plane` parameter order.
///
/// Safe when `out` aliases `point`.
pub fn project_vector3_onto_plane(out: &mut Vector3Like, point: &Vector3Like, plane: &Plane) {
    let px = point.x;
    let py = point.y;
    let pz = point.z;
    let dist = plane.a * px + plane.b * py + plane.c * pz + plane.d;
    out.x = px - dist * plane.a;
    out.y = py - dist * plane.b;
    out.z = pz - dist * plane.c;
}

/// Sets the coefficients of a plane.
pub fn set_plane(out: &mut Plane, a: f32, b: f32, c: f32, d: f32) {
    out.a = a;
    out.b = b;
    out.c = c;
    out.d = d;
}

/// Builds a plane from a unit normal and a point on the plane.
pub fn set_plane_from_normal_and_point(out: &mut Plane, normal: &Vector3Like, point: &Vector3Like) {
    out.a = normal.x;
    out.b = normal.y;
    out.c = normal.z;
    out.d = -(normal.x * point.x + normal.y * point.y + normal.z * point.z);
}

/// Builds a plane from three non-collinear points. Normal follows the right-hand rule.
pub fn set_plane_from_points(out: &mut Plane, a: &Vector3Like, b: &Vector3Like, c: &Vector3Like) {
    let e1x = b.x - a.x;
    let e1y = b.y - a.y;
    let e1z = b.z - a.z;
    let e2x = c.x - a.x;
    let e2y = c.y - a.y;
    let e2z = c.z - a.z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    let len = (nx * nx + ny * ny + nz * nz).sqrt();
    if len == 0.0 {
        out.a = nx;
        out.b = ny;
        out.c = nz;
        out.d = 0.0;
        return;
    }
    let inv = 1.0 / len;
    out.a = nx * inv;
    out.b = ny * inv;
    out.c = nz * inv;
    out.d = -(out.a * a.x + out.b * a.y + out.c * a.z);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn pt(x: f32, y: f32, z: f32) -> Vector3Like {
        Vector3Like { x, y, z }
    }

    // clone_plane
    #[test]
    fn clone_plane_copies() {
        let p = Plane {
            a: 0.0,
            b: 0.0,
            c: 1.0,
            d: -5.0,
        };
        let c = clone_plane(&p);
        assert_eq!((c.a, c.b, c.c, c.d), (0.0, 0.0, 1.0, -5.0));
    }

    // copy_plane
    #[test]
    fn copy_plane_copies_fields() {
        let src = Plane {
            a: 1.0,
            b: 2.0,
            c: 3.0,
            d: 4.0,
        };
        let mut out = Plane::default();
        copy_plane(&mut out, &src);
        assert_eq!((out.a, out.b, out.c, out.d), (1.0, 2.0, 3.0, 4.0));
    }

    // create_plane
    #[test]
    fn create_plane_defaults_to_zero() {
        let p = create_plane(None, None, None, None);
        assert_eq!((p.a, p.b, p.c, p.d), (0.0, 0.0, 0.0, 0.0));
    }

    // get_closest_point_on_plane
    #[test]
    fn get_closest_point_on_plane_projects() {
        // z=0 plane: a=0, b=0, c=1, d=0
        let plane = Plane {
            a: 0.0,
            b: 0.0,
            c: 1.0,
            d: 0.0,
        };
        let mut out = pt(0.0, 0.0, 0.0);
        get_closest_point_on_plane(&mut out, &plane, &pt(1.0, 2.0, 5.0));
        assert!((out.x - 1.0).abs() < 1e-5);
        assert!((out.y - 2.0).abs() < 1e-5);
        assert!(out.z.abs() < 1e-5);
    }

    // get_plane_coplanar_point
    #[test]
    fn get_plane_coplanar_point_z5() {
        let plane = Plane {
            a: 0.0,
            b: 0.0,
            c: 1.0,
            d: -5.0,
        };
        let mut out = pt(0.0, 0.0, 0.0);
        get_plane_coplanar_point(&mut out, &plane);
        assert!(out.x.abs() < 1e-5);
        assert!(out.y.abs() < 1e-5);
        assert!((out.z - 5.0).abs() < 1e-5);
    }

    // get_plane_signed_distance_to_point
    #[test]
    fn get_plane_signed_distance_to_point_positive() {
        let plane = Plane {
            a: 0.0,
            b: 0.0,
            c: 1.0,
            d: 0.0,
        };
        let d = get_plane_signed_distance_to_point(&plane, &pt(0.0, 0.0, 3.0));
        assert!((d - 3.0).abs() < 1e-5);
    }

    // normalize_plane
    #[test]
    fn normalize_plane_scales_normal() {
        let src = Plane {
            a: 0.0,
            b: 0.0,
            c: 2.0,
            d: -4.0,
        };
        let mut out = Plane::default();
        normalize_plane(&mut out, &src);
        assert!((out.c - 1.0).abs() < 1e-5);
        assert!((out.d - (-2.0)).abs() < 1e-5);
    }

    // project_vector3_onto_plane
    #[test]
    fn project_vector3_onto_plane_projects() {
        // z=0 plane: a=0, b=0, c=1, d=0
        let plane = Plane {
            a: 0.0,
            b: 0.0,
            c: 1.0,
            d: 0.0,
        };
        let mut out = pt(0.0, 0.0, 0.0);
        project_vector3_onto_plane(&mut out, &pt(1.0, 2.0, 5.0), &plane);
        assert!((out.x - 1.0).abs() < 1e-5);
        assert!((out.y - 2.0).abs() < 1e-5);
        assert!(out.z.abs() < 1e-5);
    }

    // set_plane
    #[test]
    fn set_plane_assigns() {
        let mut out = Plane::default();
        set_plane(&mut out, 1.0, 2.0, 3.0, 4.0);
        assert_eq!((out.a, out.b, out.c, out.d), (1.0, 2.0, 3.0, 4.0));
    }

    // set_plane_from_normal_and_point
    #[test]
    fn set_plane_from_normal_and_point_z5() {
        let mut out = Plane::default();
        set_plane_from_normal_and_point(&mut out, &pt(0.0, 0.0, 1.0), &pt(0.0, 0.0, 5.0));
        assert!((out.c - 1.0).abs() < 1e-5);
        assert!((out.d - (-5.0)).abs() < 1e-5);
    }

    // set_plane_from_points
    #[test]
    fn set_plane_from_points_xy_plane() {
        let mut out = Plane::default();
        set_plane_from_points(
            &mut out,
            &pt(0.0, 0.0, 0.0),
            &pt(1.0, 0.0, 0.0),
            &pt(0.0, 1.0, 0.0),
        );
        assert!(out.a.abs() < 1e-5);
        assert!(out.b.abs() < 1e-5);
        assert!((out.c - 1.0).abs() < 1e-5);
        assert!(out.d.abs() < 1e-5);
    }
}

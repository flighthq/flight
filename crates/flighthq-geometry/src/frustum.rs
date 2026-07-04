//! Free functions for [`Frustum`] — a view frustum as six bounding planes.

use flighthq_types::{Aabb, BoundingSphere, Frustum, FrustumLike, Matrix4Like, Plane, Vector3Like};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Creates a frustum with all six planes at zero (a degenerate frustum).
/// Populate with [`set_frustum_from_matrix4`].
pub fn create_frustum() -> Frustum {
    Frustum {
        left: Plane::default(),
        right: Plane::default(),
        bottom: Plane::default(),
        top: Plane::default(),
        near: Plane::default(),
        far: Plane::default(),
    }
}

/// Computes the 8 world-space corner points of the frustum from the inverse
/// view-projection matrix. NDC corners (all +/-1 combinations in clip space)
/// are unprojected via `inverse_view_projection`.
///
/// Writes exactly 8 [`Vector3Like`] values to `out` in the order:
///   0: near-left-bottom  1: near-right-bottom  2: near-right-top  3: near-left-top
///   4: far-left-bottom   5: far-right-bottom   6: far-right-top   7: far-left-top
///
/// If `out` has fewer than 8 elements, only as many as available are written.
pub fn get_frustum_corners(out: &mut [Vector3Like], inverse_view_projection: &Matrix4Like) {
    let m = &inverse_view_projection.m;
    #[rustfmt::skip]
    const NDC_CORNERS: [[f32; 3]; 8] = [
        [-1.0, -1.0, -1.0],
        [ 1.0, -1.0, -1.0],
        [ 1.0,  1.0, -1.0],
        [-1.0,  1.0, -1.0],
        [-1.0, -1.0,  1.0],
        [ 1.0, -1.0,  1.0],
        [ 1.0,  1.0,  1.0],
        [-1.0,  1.0,  1.0],
    ];
    let len = out.len().min(NDC_CORNERS.len());
    for i in 0..len {
        let [nx, ny, nz] = NDC_CORNERS[i];
        let x = m[0] * nx + m[4] * ny + m[8] * nz + m[12];
        let y = m[1] * nx + m[5] * ny + m[9] * nz + m[13];
        let z = m[2] * nx + m[6] * ny + m[10] * nz + m[14];
        let w = m[3] * nx + m[7] * ny + m[11] * nz + m[15];
        let inv_w = if w != 0.0 { 1.0 / w } else { 1.0 };
        out[i].x = x * inv_w;
        out[i].y = y * inv_w;
        out[i].z = z * inv_w;
    }
}

/// Returns whether a point lies inside the frustum. A point is inside when its
/// signed distance to every plane is non-negative (each normal points inward).
pub fn is_frustum_containing_point(frustum: &FrustumLike, point: &Vector3Like) -> bool {
    plane_signed_distance_xyz(&frustum.left, point.x, point.y, point.z) >= 0.0
        && plane_signed_distance_xyz(&frustum.right, point.x, point.y, point.z) >= 0.0
        && plane_signed_distance_xyz(&frustum.bottom, point.x, point.y, point.z) >= 0.0
        && plane_signed_distance_xyz(&frustum.top, point.x, point.y, point.z) >= 0.0
        && plane_signed_distance_xyz(&frustum.near, point.x, point.y, point.z) >= 0.0
        && plane_signed_distance_xyz(&frustum.far, point.x, point.y, point.z) >= 0.0
}

/// Returns whether an axis-aligned bounding box intersects (or is contained by)
/// the frustum. Uses the conservative positive-vertex test: the box is rejected
/// only when it lies entirely on the outside (negative) side of any single plane.
pub fn is_frustum_intersecting_aabb(frustum: &FrustumLike, aabb: &Aabb) -> bool {
    plane_intersects_aabb(&frustum.left, aabb)
        && plane_intersects_aabb(&frustum.right, aabb)
        && plane_intersects_aabb(&frustum.bottom, aabb)
        && plane_intersects_aabb(&frustum.top, aabb)
        && plane_intersects_aabb(&frustum.near, aabb)
        && plane_intersects_aabb(&frustum.far, aabb)
}

/// Returns whether a bounding sphere intersects (or is contained by) the
/// frustum. A sphere is rejected only when its signed distance to some plane
/// is less than `-radius`. An empty sphere (negative radius) always returns
/// false.
pub fn is_frustum_intersecting_sphere(frustum: &FrustumLike, sphere: &BoundingSphere) -> bool {
    if sphere.radius < 0.0 {
        return false;
    }
    let r = sphere.radius;
    let cx = sphere.center.x;
    let cy = sphere.center.y;
    let cz = sphere.center.z;
    plane_signed_distance_xyz(&frustum.left, cx, cy, cz) >= -r
        && plane_signed_distance_xyz(&frustum.right, cx, cy, cz) >= -r
        && plane_signed_distance_xyz(&frustum.bottom, cx, cy, cz) >= -r
        && plane_signed_distance_xyz(&frustum.top, cx, cy, cz) >= -r
        && plane_signed_distance_xyz(&frustum.near, cx, cy, cz) >= -r
        && plane_signed_distance_xyz(&frustum.far, cx, cy, cz) >= -r
}

/// Extracts the six frustum planes from a view-projection Matrix4
/// (Gribb-Hartmann), each normalized and oriented with an inward-pointing
/// normal.
pub fn set_frustum_from_matrix4(out: &mut FrustumLike, view_projection: &Matrix4Like) {
    let m = &view_projection.m;
    let r00 = m[0];
    let r01 = m[4];
    let r02 = m[8];
    let r03 = m[12];
    let r10 = m[1];
    let r11 = m[5];
    let r12 = m[9];
    let r13 = m[13];
    let r20 = m[2];
    let r21 = m[6];
    let r22 = m[10];
    let r23 = m[14];
    let r30 = m[3];
    let r31 = m[7];
    let r32 = m[11];
    let r33 = m[15];

    set_plane_normalized(&mut out.left, r30 + r00, r31 + r01, r32 + r02, r33 + r03);
    set_plane_normalized(&mut out.right, r30 - r00, r31 - r01, r32 - r02, r33 - r03);
    set_plane_normalized(&mut out.bottom, r30 + r10, r31 + r11, r32 + r12, r33 + r13);
    set_plane_normalized(&mut out.top, r30 - r10, r31 - r11, r32 - r12, r33 - r13);
    set_plane_normalized(&mut out.near, r30 + r20, r31 + r21, r32 + r22, r33 + r23);
    set_plane_normalized(&mut out.far, r30 - r20, r31 - r21, r32 - r22, r33 - r23);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Positive-vertex test: returns `true` if the AABB is not entirely outside
/// the negative half-space of the plane.
fn plane_intersects_aabb(plane: &Plane, aabb: &Aabb) -> bool {
    let px = if plane.a >= 0.0 {
        aabb.max.x
    } else {
        aabb.min.x
    };
    let py = if plane.b >= 0.0 {
        aabb.max.y
    } else {
        aabb.min.y
    };
    let pz = if plane.c >= 0.0 {
        aabb.max.z
    } else {
        aabb.min.z
    };
    plane.a * px + plane.b * py + plane.c * pz + plane.d >= 0.0
}

fn plane_signed_distance_xyz(plane: &Plane, x: f32, y: f32, z: f32) -> f32 {
    plane.a * x + plane.b * y + plane.c * z + plane.d
}

fn set_plane_normalized(out: &mut Plane, a: f32, b: f32, c: f32, d: f32) {
    let l = (a * a + b * b + c * c).sqrt();
    if l != 0.0 {
        let inv = 1.0 / l;
        out.a = a * inv;
        out.b = b * inv;
        out.c = c * inv;
        out.d = d * inv;
    } else {
        out.a = a;
        out.b = b;
        out.c = c;
        out.d = d;
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{Aabb, BoundingSphere, Vector3};

    fn pt(x: f32, y: f32, z: f32) -> Vector3Like {
        Vector3Like { x, y, z }
    }

    fn perspective_vp() -> Matrix4Like {
        // Simple perspective-like view-projection matrix (identity view, symmetric perspective).
        let fov = std::f32::consts::FRAC_PI_4;
        let aspect = 1.0_f32;
        let near = 0.1_f32;
        let far = 100.0_f32;
        let f = 1.0 / (fov / 2.0).tan();
        #[rustfmt::skip]
        let m = [
            f / aspect, 0.0, 0.0, 0.0,
            0.0, f, 0.0, 0.0,
            0.0, 0.0, (far + near) / (near - far), -1.0,
            0.0, 0.0, (2.0 * far * near) / (near - far), 0.0,
        ];
        Matrix4Like { m }
    }

    // create_frustum
    #[test]
    fn create_frustum_is_zero() {
        let f = create_frustum();
        assert_eq!(f.left.a, 0.0);
        assert_eq!(f.far.d, 0.0);
    }

    // get_frustum_corners
    #[test]
    fn get_frustum_corners_identity_inverse() {
        // Identity inverse VP maps NDC directly to world space.
        let inv = Matrix4Like::default();
        let mut corners = [Vector3Like::default(); 8];
        get_frustum_corners(&mut corners, &inv);
        // Corner 0: near-left-bottom = (-1, -1, -1)
        assert!((corners[0].x - (-1.0)).abs() < 1e-5);
        assert!((corners[0].y - (-1.0)).abs() < 1e-5);
        assert!((corners[0].z - (-1.0)).abs() < 1e-5);
        // Corner 6: far-right-top = (1, 1, 1)
        assert!((corners[6].x - 1.0).abs() < 1e-5);
        assert!((corners[6].y - 1.0).abs() < 1e-5);
        assert!((corners[6].z - 1.0).abs() < 1e-5);
    }

    #[test]
    fn get_frustum_corners_partial_output() {
        let inv = Matrix4Like::default();
        let mut corners = [Vector3Like::default(); 3];
        get_frustum_corners(&mut corners, &inv);
        // Should write only 3 corners, not panic.
        assert!((corners[2].x - 1.0).abs() < 1e-5);
    }

    // is_frustum_containing_point
    #[test]
    fn is_frustum_containing_point_inside() {
        let vp = perspective_vp();
        let mut f = FrustumLike::default();
        set_frustum_from_matrix4(&mut f, &vp);
        // Origin-ish point, slightly in front of the camera.
        assert!(is_frustum_containing_point(&f, &pt(0.0, 0.0, -1.0)));
    }

    #[test]
    fn is_frustum_containing_point_outside() {
        let vp = perspective_vp();
        let mut f = FrustumLike::default();
        set_frustum_from_matrix4(&mut f, &vp);
        // Way behind the camera.
        assert!(!is_frustum_containing_point(&f, &pt(0.0, 0.0, 10.0)));
    }

    // is_frustum_intersecting_aabb
    #[test]
    fn is_frustum_intersecting_aabb_inside() {
        let vp = perspective_vp();
        let mut f = FrustumLike::default();
        set_frustum_from_matrix4(&mut f, &vp);
        let aabb = Aabb {
            min: Vector3 {
                x: -0.5,
                y: -0.5,
                z: -2.0,
            },
            max: Vector3 {
                x: 0.5,
                y: 0.5,
                z: -1.0,
            },
        };
        assert!(is_frustum_intersecting_aabb(&f, &aabb));
    }

    #[test]
    fn is_frustum_intersecting_aabb_outside() {
        let vp = perspective_vp();
        let mut f = FrustumLike::default();
        set_frustum_from_matrix4(&mut f, &vp);
        let aabb = Aabb {
            min: Vector3 {
                x: 200.0,
                y: 200.0,
                z: 200.0,
            },
            max: Vector3 {
                x: 201.0,
                y: 201.0,
                z: 201.0,
            },
        };
        assert!(!is_frustum_intersecting_aabb(&f, &aabb));
    }

    // is_frustum_intersecting_sphere
    #[test]
    fn is_frustum_intersecting_sphere_inside() {
        let vp = perspective_vp();
        let mut f = FrustumLike::default();
        set_frustum_from_matrix4(&mut f, &vp);
        let sphere = BoundingSphere {
            center: Vector3 {
                x: 0.0,
                y: 0.0,
                z: -1.0,
            },
            radius: 0.5,
        };
        assert!(is_frustum_intersecting_sphere(&f, &sphere));
    }

    #[test]
    fn is_frustum_intersecting_sphere_empty() {
        let vp = perspective_vp();
        let mut f = FrustumLike::default();
        set_frustum_from_matrix4(&mut f, &vp);
        let sphere = BoundingSphere {
            center: Vector3 {
                x: 0.0,
                y: 0.0,
                z: -1.0,
            },
            radius: -1.0,
        };
        assert!(!is_frustum_intersecting_sphere(&f, &sphere));
    }

    // set_frustum_from_matrix4
    #[test]
    fn set_frustum_from_matrix4_normalizes_planes() {
        let vp = perspective_vp();
        let mut f = FrustumLike::default();
        set_frustum_from_matrix4(&mut f, &vp);
        // Each plane normal should be unit length.
        let check = |p: &Plane| {
            let len = (p.a * p.a + p.b * p.b + p.c * p.c).sqrt();
            assert!((len - 1.0).abs() < 1e-5, "plane normal length = {len}");
        };
        check(&f.left);
        check(&f.right);
        check(&f.bottom);
        check(&f.top);
        check(&f.near);
        check(&f.far);
    }
}

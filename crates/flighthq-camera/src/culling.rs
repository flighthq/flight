//! Frustum culling helpers: frustum extraction and containment/intersection
//! tests against the camera's view frustum.
//!
//! Since `flighthq-types` does not yet define a `Frustum` struct in Rust, a
//! local `Frustum` (six [`Plane`] values) is used. The Gribb-Hartmann plane
//! extraction and the containment/intersection tests are implemented inline,
//! matching the TS `@flighthq/geometry` frustum module.

use flighthq_types::{Aabb, BoundingSphere, Camera, Matrix4Like, Plane, Vector3Like};

use crate::camera::get_camera_view_projection_matrix4;

/// Six clip planes of a view frustum, each oriented with an inward-pointing
/// normal. A point is inside the frustum when its signed distance to every
/// plane is non-negative.
#[derive(Clone, Debug, Default)]
pub struct Frustum {
    pub bottom: Plane,
    pub far: Plane,
    pub left: Plane,
    pub near: Plane,
    pub right: Plane,
    pub top: Plane,
}

/// Extracts the six clip planes of the camera's view frustum into `out`. The
/// planes are normalized with inward-pointing normals. `aspect` is viewport
/// width / height.
pub fn get_camera_frustum(out: &mut Frustum, camera: &Camera, aspect: f32) {
    let mut vp = Matrix4Like::default();
    get_camera_view_projection_matrix4(&mut vp, camera, aspect);
    set_frustum_from_matrix4(out, &vp);
}

/// Returns `true` when an axis-aligned bounding box intersects or is contained
/// by the camera frustum. A box outside any frustum plane is rejected. `aspect`
/// is viewport width / height.
///
/// Uses the conservative positive-vertex test: may report false positives for
/// boxes straddling a frustum corner, never false negatives.
pub fn is_box_in_camera_frustum(camera: &Camera, aabb: &Aabb, aspect: f32) -> bool {
    let mut frustum = Frustum::default();
    get_camera_frustum(&mut frustum, camera, aspect);
    is_frustum_intersecting_aabb(&frustum, aabb)
}

/// Returns `true` when a world-space point lies inside the camera frustum.
/// `aspect` is viewport width / height.
pub fn is_point_in_camera_frustum(camera: &Camera, point: &Vector3Like, aspect: f32) -> bool {
    let mut frustum = Frustum::default();
    get_camera_frustum(&mut frustum, camera, aspect);
    is_frustum_containing_point(&frustum, point)
}

/// Returns `true` when a bounding sphere intersects or is contained by the
/// camera frustum. An empty sphere (negative radius) always returns `false`.
/// `aspect` is viewport width / height.
pub fn is_sphere_in_camera_frustum(camera: &Camera, sphere: &BoundingSphere, aspect: f32) -> bool {
    let mut frustum = Frustum::default();
    get_camera_frustum(&mut frustum, camera, aspect);
    is_frustum_intersecting_sphere(&frustum, sphere)
}

// ---------------------------------------------------------------------------
// Internal frustum helpers (matching TS @flighthq/geometry frustum module)
// ---------------------------------------------------------------------------

/// Extracts the six frustum planes from a view-projection matrix using the
/// Gribb-Hartmann method, each normalized with inward-pointing normals.
fn set_frustum_from_matrix4(out: &mut Frustum, vp: &Matrix4Like) {
    let m = &vp.m;
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

    set_plane(&mut out.left, r30 + r00, r31 + r01, r32 + r02, r33 + r03);
    set_plane(&mut out.right, r30 - r00, r31 - r01, r32 - r02, r33 - r03);
    set_plane(&mut out.bottom, r30 + r10, r31 + r11, r32 + r12, r33 + r13);
    set_plane(&mut out.top, r30 - r10, r31 - r11, r32 - r12, r33 - r13);
    set_plane(&mut out.near, r30 + r20, r31 + r21, r32 + r22, r33 + r23);
    set_plane(&mut out.far, r30 - r20, r31 - r21, r32 - r22, r33 - r23);
}

fn set_plane(out: &mut Plane, a: f32, b: f32, c: f32, d: f32) {
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

fn plane_signed_distance(plane: &Plane, point: &Vector3Like) -> f32 {
    plane.a * point.x + plane.b * point.y + plane.c * point.z + plane.d
}

fn is_frustum_containing_point(frustum: &Frustum, point: &Vector3Like) -> bool {
    plane_signed_distance(&frustum.left, point) >= 0.0
        && plane_signed_distance(&frustum.right, point) >= 0.0
        && plane_signed_distance(&frustum.bottom, point) >= 0.0
        && plane_signed_distance(&frustum.top, point) >= 0.0
        && plane_signed_distance(&frustum.near, point) >= 0.0
        && plane_signed_distance(&frustum.far, point) >= 0.0
}

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

fn is_frustum_intersecting_aabb(frustum: &Frustum, aabb: &Aabb) -> bool {
    plane_intersects_aabb(&frustum.left, aabb)
        && plane_intersects_aabb(&frustum.right, aabb)
        && plane_intersects_aabb(&frustum.bottom, aabb)
        && plane_intersects_aabb(&frustum.top, aabb)
        && plane_intersects_aabb(&frustum.near, aabb)
        && plane_intersects_aabb(&frustum.far, aabb)
}

fn is_frustum_intersecting_sphere(frustum: &Frustum, sphere: &BoundingSphere) -> bool {
    if sphere.radius < 0.0 {
        return false;
    }
    let r = sphere.radius;
    let center = Vector3Like {
        x: sphere.center.x,
        y: sphere.center.y,
        z: sphere.center.z,
    };
    plane_signed_distance(&frustum.left, &center) >= -r
        && plane_signed_distance(&frustum.right, &center) >= -r
        && plane_signed_distance(&frustum.bottom, &center) >= -r
        && plane_signed_distance(&frustum.top, &center) >= -r
        && plane_signed_distance(&frustum.near, &center) >= -r
        && plane_signed_distance(&frustum.far, &center) >= -r
}

#[cfg(test)]
mod tests {
    use flighthq_geometry::create_vector3;
    use flighthq_types::{Aabb, BoundingSphere, Vector3, Vector3Like};

    use super::*;
    use crate::camera::{create_camera, set_camera_view_matrix4_from_look_at};
    use crate::projection::create_perspective_projection;

    fn make_camera() -> Camera {
        let projection = create_perspective_projection(std::f32::consts::FRAC_PI_2, 1.0);
        let mut camera = create_camera(1.0, 100.0, projection);
        set_camera_view_matrix4_from_look_at(
            &mut camera,
            &create_vector3(0.0, 0.0, 10.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        camera
    }

    mod get_camera_frustum {
        use super::*;

        #[test]
        fn writes_the_six_frustum_planes() {
            let camera = make_camera();
            let mut frustum = Frustum::default();
            get_camera_frustum(&mut frustum, &camera, 1.0);
            // Near plane normal should be unit length.
            let len = (frustum.near.a * frustum.near.a
                + frustum.near.b * frustum.near.b
                + frustum.near.c * frustum.near.c)
                .sqrt();
            assert!(
                (len - 1.0).abs() < 1e-3,
                "near plane normal should be unit length, got {len}"
            );
        }
    }

    mod is_box_in_camera_frustum {
        use super::*;

        #[test]
        fn returns_true_for_a_box_in_front_of_the_camera() {
            let camera = make_camera();
            let aabb = Aabb {
                min: Vector3 {
                    x: -1.0,
                    y: -1.0,
                    z: 2.0,
                },
                max: Vector3 {
                    x: 1.0,
                    y: 1.0,
                    z: 5.0,
                },
            };
            assert!(is_box_in_camera_frustum(&camera, &aabb, 1.0));
        }

        #[test]
        fn returns_false_for_a_box_entirely_behind_the_camera() {
            let camera = make_camera();
            let aabb = Aabb {
                min: Vector3 {
                    x: -1.0,
                    y: -1.0,
                    z: 15.0,
                },
                max: Vector3 {
                    x: 1.0,
                    y: 1.0,
                    z: 20.0,
                },
            };
            assert!(!is_box_in_camera_frustum(&camera, &aabb, 1.0));
        }
    }

    mod is_point_in_camera_frustum {
        use super::*;

        #[test]
        fn returns_true_for_a_point_in_the_frustum() {
            let camera = make_camera();
            let point = Vector3Like {
                x: 0.0,
                y: 0.0,
                z: 5.0,
            };
            assert!(is_point_in_camera_frustum(&camera, &point, 1.0));
        }

        #[test]
        fn returns_false_for_a_point_behind_the_camera() {
            let camera = make_camera();
            let point = Vector3Like {
                x: 0.0,
                y: 0.0,
                z: 15.0,
            };
            assert!(!is_point_in_camera_frustum(&camera, &point, 1.0));
        }
    }

    mod is_sphere_in_camera_frustum {
        use super::*;

        #[test]
        fn returns_true_for_a_sphere_in_front_of_the_camera() {
            let camera = make_camera();
            let sphere = BoundingSphere {
                center: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 5.0,
                },
                radius: 1.0,
            };
            assert!(is_sphere_in_camera_frustum(&camera, &sphere, 1.0));
        }

        #[test]
        fn returns_false_for_a_sphere_entirely_behind_the_camera() {
            let camera = make_camera();
            let sphere = BoundingSphere {
                center: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 20.0,
                },
                radius: 1.0,
            };
            assert!(!is_sphere_in_camera_frustum(&camera, &sphere, 1.0));
        }

        #[test]
        fn returns_false_for_an_empty_sphere() {
            let camera = make_camera();
            let sphere = BoundingSphere {
                center: Vector3 {
                    x: 0.0,
                    y: 0.0,
                    z: 5.0,
                },
                radius: -1.0,
            };
            assert!(!is_sphere_in_camera_frustum(&camera, &sphere, 1.0));
        }
    }
}

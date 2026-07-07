//! Frustum culling helpers: frustum extraction and containment/intersection
//! tests against the camera's view frustum.
//!
//! The frustum plane extraction and the containment/intersection tests live in
//! `flighthq-geometry`; this module only projects the camera's view-projection
//! into a [`FrustumLike`] and forwards to those helpers, matching the TS
//! `@flighthq/camera` culling module.

use flighthq_geometry::{
    is_frustum_containing_point, is_frustum_intersecting_aabb, is_frustum_intersecting_sphere,
    set_frustum_from_matrix4,
};
use flighthq_types::{Aabb, BoundingSphere, Camera, FrustumLike, Matrix4Like, Vector3Like};

use crate::camera::get_camera_view_projection_matrix4;

/// Extracts the six clip planes of the camera's view frustum into `out`. The
/// planes are normalized with inward-pointing normals (the convention used by
/// geometry's `is_frustum_containing_point` / `is_frustum_intersecting_aabb` /
/// `is_frustum_intersecting_sphere`). `aspect` is viewport width / height.
///
/// Use this when you need the raw planes (e.g. to cache the frustum for a
/// frame). For one-shot culling queries prefer the `is_box_in_camera_frustum` /
/// `is_sphere_in_camera_frustum` / `is_point_in_camera_frustum` helpers.
pub fn get_camera_frustum(out: &mut FrustumLike, camera: &Camera, aspect: f32) {
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
    let mut frustum = FrustumLike::default();
    get_camera_frustum(&mut frustum, camera, aspect);
    is_frustum_intersecting_aabb(&frustum, aabb)
}

/// Returns `true` when a world-space point lies inside the camera frustum.
/// `aspect` is viewport width / height.
pub fn is_point_in_camera_frustum(camera: &Camera, point: &Vector3Like, aspect: f32) -> bool {
    let mut frustum = FrustumLike::default();
    get_camera_frustum(&mut frustum, camera, aspect);
    is_frustum_containing_point(&frustum, point)
}

/// Returns `true` when a bounding sphere intersects or is contained by the
/// camera frustum. An empty sphere (negative radius) always returns `false`.
/// `aspect` is viewport width / height.
pub fn is_sphere_in_camera_frustum(camera: &Camera, sphere: &BoundingSphere, aspect: f32) -> bool {
    let mut frustum = FrustumLike::default();
    get_camera_frustum(&mut frustum, camera, aspect);
    is_frustum_intersecting_sphere(&frustum, sphere)
}

#[cfg(test)]
mod tests {
    use flighthq_geometry::create_vector3;
    use flighthq_types::{Aabb, BoundingSphere, FrustumLike, Vector3, Vector3Like};

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
            let mut frustum = FrustumLike::default();
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

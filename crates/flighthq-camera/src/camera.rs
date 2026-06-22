//! `Camera` constructor and view/view-projection matrix helpers.

use flighthq_geometry::{inverse_matrix4, multiply_matrix4};
use flighthq_types::{Camera, Matrix4Like, Projection, Vector2, Vector3};

use crate::projection::set_projection_matrix4;

/// Allocates a 3D camera. The camera stores its projection descriptor, a
/// world->view [`Matrix4`](flighthq_types::Matrix4) (`view`, initialized to
/// identity), the clip-plane distances `near`/`far`, the per-frame sub-pixel NDC
/// `jitter` (consumed by TAA, initialized to zero), and a cached
/// `inverse_view_projection` (consumed by TAA / velocity / fog / depth-of-field,
/// initialized to identity). The view matrix is canonical: the camera has no
/// separate Transform3D — a Matrix4 is the only world->view representation.
pub fn create_camera(near: f32, far: f32, projection: Projection) -> Camera {
    Camera {
        far,
        inverse_view_projection: flighthq_types::Matrix4::default(),
        jitter: Vector2 { x: 0.0, y: 0.0 },
        near,
        projection,
        view: flighthq_types::Matrix4::default(),
    }
}

/// Writes the inverse of the camera's view-projection matrix into `out` and
/// returns `true`, or returns `false` (leaving `out` untouched) when the
/// view-projection is non-invertible. `aspect` is the viewport
/// `width / height`. This is the matrix the TAA / velocity / fog /
/// depth-of-field effects consume to reconstruct world position from NDC.
///
/// Reads camera fields into a scratch matrix before writing `out`, so it is safe
/// even if `out` aliases the camera's own `inverse_view_projection` or `view`.
pub fn get_camera_inverse_view_projection_matrix4(
    out: &mut Matrix4Like,
    camera: &Camera,
    aspect: f32,
) -> bool {
    let mut scratch_view_projection = Matrix4Like::default();
    get_camera_view_projection_matrix4(&mut scratch_view_projection, camera, aspect);
    inverse_matrix4(out, &scratch_view_projection)
}

/// Writes the camera's view-projection matrix (`projection × view`) into `out`.
/// `aspect` is the viewport `width / height`, applied to a perspective
/// projection. `near`/`far` are taken from the camera.
///
/// Reads camera fields into a scratch matrix before writing `out`, so it is safe
/// even if `out` aliases the camera's own `view`.
pub fn get_camera_view_projection_matrix4(out: &mut Matrix4Like, camera: &Camera, aspect: f32) {
    let mut scratch_projection = Matrix4Like::default();
    set_projection_matrix4(
        &mut scratch_projection,
        &camera.projection,
        aspect,
        camera.near,
        camera.far,
    );
    let view = Matrix4Like { m: camera.view.m };
    multiply_matrix4(out, &scratch_projection, &view);
}

/// Sets the camera's per-frame sub-pixel jitter offset (in NDC), in place. TAA
/// reads this when building the jittered projection matrix.
pub fn set_camera_jitter(camera: &mut Camera, x: f32, y: f32) {
    camera.jitter.x = x;
    camera.jitter.y = y;
}

/// Builds the camera's world->view matrix in place from an eye position, a
/// look-at target, and an up vector (right-handed look-at). This is the common
/// path for positioning a camera without an explicit world transform.
///
/// Reads all vector inputs before writing, so it is safe when the vectors alias
/// one another.
pub fn set_camera_view_matrix4_from_look_at(
    camera: &mut Camera,
    eye: &Vector3,
    target: &Vector3,
    up: &Vector3,
) {
    let mut view = Matrix4Like { m: camera.view.m };
    set_matrix4_look_at(&mut view, eye, target, up);
    camera.view.m = view.m;
}

/// Copies a precomputed world->view matrix into the camera in place. Use this
/// when the view matrix is derived elsewhere (for example, the inverse of a
/// scene node's world transform).
pub fn set_camera_view_matrix4_from_matrix4(camera: &mut Camera, view: &Matrix4Like) {
    camera.view.m = view.m;
}

// Right-handed look-at, ported field-for-field from geometry's setMatrix4LookAt
// (TS `@flighthq/geometry`). Local because the Rust `flighthq-geometry` crate
// does not yet expose `set_matrix4_look_at`; see the crate report.
//
// Reads all vector inputs into locals before writing `out`, so it is alias-safe.
fn set_matrix4_look_at(out: &mut Matrix4Like, eye: &Vector3, target: &Vector3, up: &Vector3) {
    let eye_x = eye.x;
    let eye_y = eye.y;
    let eye_z = eye.z;

    // z axis = normalize(eye - target) (points from target back toward the eye, RH).
    let mut zx = eye_x - target.x;
    let mut zy = eye_y - target.y;
    let mut zz = eye_z - target.z;
    let mut zl = (zx * zx + zy * zy + zz * zz).sqrt();
    if zl == 0.0 {
        zz = 1.0;
        zl = 1.0;
    }
    zx /= zl;
    zy /= zl;
    zz /= zl;

    // x axis = normalize(cross(up, z)).
    let mut xx = up.y * zz - up.z * zy;
    let mut xy = up.z * zx - up.x * zz;
    let mut xz = up.x * zy - up.y * zx;
    let xl = (xx * xx + xy * xy + xz * xz).sqrt();
    if xl == 0.0 {
        xx = 0.0;
        xy = 0.0;
        xz = 0.0;
    } else {
        xx /= xl;
        xy /= xl;
        xz /= xl;
    }

    // y axis = cross(z, x) (already orthonormal).
    let yx = zy * xz - zz * xy;
    let yy = zz * xx - zx * xz;
    let yz = zx * xy - zy * xx;

    let m = &mut out.m;
    m[0] = xx;
    m[1] = yx;
    m[2] = zx;
    m[3] = 0.0;

    m[4] = xy;
    m[5] = yy;
    m[6] = zy;
    m[7] = 0.0;

    m[8] = xz;
    m[9] = yz;
    m[10] = zz;
    m[11] = 0.0;

    m[12] = -(xx * eye_x + xy * eye_y + xz * eye_z);
    m[13] = -(yx * eye_x + yy * eye_y + yz * eye_z);
    m[14] = -(zx * eye_x + zy * eye_y + zz * eye_z);
    m[15] = 1.0;
}

#[cfg(test)]
mod tests {
    use flighthq_geometry::{create_vector3, inverse_matrix4, multiply_matrix4};
    use flighthq_types::Matrix4Like;

    use super::*;
    use crate::projection::{create_perspective_projection, set_projection_matrix4};

    fn close(a: f32, b: f32) {
        assert!((a - b).abs() < 1e-4, "{a} not close to {b}");
    }

    mod create_camera {
        use super::*;

        #[test]
        fn stores_projection_near_far_and_identity_view_inverse_with_zero_jitter() {
            let projection = create_perspective_projection(1.0, 1.0);
            let camera = create_camera(0.1, 100.0, projection);

            assert_eq!(camera.projection, projection);
            assert_eq!(camera.near, 0.1);
            assert_eq!(camera.far, 100.0);
            assert_eq!(camera.jitter.x, 0.0);
            assert_eq!(camera.jitter.y, 0.0);
            assert_eq!(camera.view.m[0], 1.0);
            assert_eq!(camera.view.m[5], 1.0);
            assert_eq!(camera.inverse_view_projection.m[10], 1.0);
        }
    }

    mod get_camera_inverse_view_projection_matrix4 {
        use super::*;

        #[test]
        fn writes_the_inverse_of_the_view_projection_into_a_distinct_out() {
            let projection = create_perspective_projection(1.0, 1.0);
            let mut camera = create_camera(0.1, 100.0, projection);
            set_camera_view_matrix4_from_look_at(
                &mut camera,
                &create_vector3(0.0, 0.0, 5.0),
                &create_vector3(0.0, 0.0, 0.0),
                &create_vector3(0.0, 1.0, 0.0),
            );

            let mut view_projection = Matrix4Like::default();
            get_camera_view_projection_matrix4(&mut view_projection, &camera, 1.5);

            let mut expected = Matrix4Like::default();
            inverse_matrix4(&mut expected, &view_projection);

            let mut out = Matrix4Like::default();
            assert!(get_camera_inverse_view_projection_matrix4(
                &mut out, &camera, 1.5
            ));
            for i in 0..16 {
                close(out.m[i], expected.m[i]);
            }
        }

        #[test]
        fn is_safe_when_out_aliases_the_camera_inverse_view_projection() {
            let projection = create_perspective_projection(1.0, 1.0);
            let mut camera = create_camera(0.1, 100.0, projection);
            set_camera_view_matrix4_from_look_at(
                &mut camera,
                &create_vector3(2.0, 1.0, 5.0),
                &create_vector3(0.0, 0.0, 0.0),
                &create_vector3(0.0, 1.0, 0.0),
            );

            let mut view_projection = Matrix4Like::default();
            get_camera_view_projection_matrix4(&mut view_projection, &camera, 1.3);
            let mut expected = Matrix4Like::default();
            inverse_matrix4(&mut expected, &view_projection);

            // Alias the camera's own inverse_view_projection as the out target.
            let mut out = Matrix4Like {
                m: camera.inverse_view_projection.m,
            };
            assert!(get_camera_inverse_view_projection_matrix4(
                &mut out, &camera, 1.3
            ));
            camera.inverse_view_projection.m = out.m;
            for i in 0..16 {
                close(camera.inverse_view_projection.m[i], expected.m[i]);
            }
        }
    }

    mod get_camera_view_projection_matrix4 {
        use super::*;

        #[test]
        fn writes_projection_times_view_into_a_distinct_out() {
            let projection = create_perspective_projection(1.0, 1.0);
            let mut camera = create_camera(0.1, 100.0, projection);
            set_camera_view_matrix4_from_look_at(
                &mut camera,
                &create_vector3(0.0, 0.0, 5.0),
                &create_vector3(0.0, 0.0, 0.0),
                &create_vector3(0.0, 1.0, 0.0),
            );

            let mut out = Matrix4Like::default();
            get_camera_view_projection_matrix4(&mut out, &camera, 2.0);

            let mut projection_matrix = Matrix4Like::default();
            set_projection_matrix4(
                &mut projection_matrix,
                &projection,
                2.0,
                camera.near,
                camera.far,
            );
            let mut expected = Matrix4Like::default();
            let view = Matrix4Like { m: camera.view.m };
            multiply_matrix4(&mut expected, &projection_matrix, &view);

            for i in 0..16 {
                close(out.m[i], expected.m[i]);
            }
        }

        #[test]
        fn is_safe_when_out_aliases_the_camera_view() {
            let projection = create_perspective_projection(1.0, 1.0);
            let mut camera = create_camera(0.1, 100.0, projection);
            set_camera_view_matrix4_from_look_at(
                &mut camera,
                &create_vector3(1.0, 2.0, 4.0),
                &create_vector3(0.0, 0.0, 0.0),
                &create_vector3(0.0, 1.0, 0.0),
            );

            let mut projection_matrix = Matrix4Like::default();
            set_projection_matrix4(
                &mut projection_matrix,
                &projection,
                1.7,
                camera.near,
                camera.far,
            );
            let mut expected = Matrix4Like::default();
            let view = Matrix4Like { m: camera.view.m };
            multiply_matrix4(&mut expected, &projection_matrix, &view);

            // Alias the camera's own view matrix as the out target.
            let mut out = Matrix4Like { m: camera.view.m };
            get_camera_view_projection_matrix4(&mut out, &camera, 1.7);
            camera.view.m = out.m;
            for i in 0..16 {
                close(camera.view.m[i], expected.m[i]);
            }
        }
    }

    mod set_camera_jitter {
        use super::*;

        #[test]
        fn sets_the_jitter_offset_in_place() {
            let mut camera = create_camera(0.1, 100.0, create_perspective_projection(1.0, 1.0));
            set_camera_jitter(&mut camera, 0.25, -0.5);
            assert_eq!(camera.jitter.x, 0.25);
            assert_eq!(camera.jitter.y, -0.5);
        }
    }

    mod set_camera_view_matrix4_from_look_at {
        use super::*;

        #[test]
        fn builds_the_view_matrix_from_eye_target_up() {
            let mut camera = create_camera(0.1, 100.0, create_perspective_projection(1.0, 1.0));
            let eye = create_vector3(0.0, 0.0, 10.0);
            let target = create_vector3(0.0, 0.0, 0.0);
            let up = create_vector3(0.0, 1.0, 0.0);
            set_camera_view_matrix4_from_look_at(&mut camera, &eye, &target, &up);

            let mut expected = Matrix4Like::default();
            super::super::set_matrix4_look_at(&mut expected, &eye, &target, &up);
            for i in 0..16 {
                close(camera.view.m[i], expected.m[i]);
            }
        }
    }

    mod set_camera_view_matrix4_from_matrix4 {
        use super::*;

        #[test]
        fn copies_a_precomputed_view_matrix_into_the_camera() {
            let mut camera = create_camera(0.1, 100.0, create_perspective_projection(1.0, 1.0));
            let mut view = Matrix4Like::default();
            super::super::set_matrix4_look_at(
                &mut view,
                &create_vector3(3.0, 3.0, 3.0),
                &create_vector3(0.0, 0.0, 0.0),
                &create_vector3(0.0, 1.0, 0.0),
            );

            set_camera_view_matrix4_from_matrix4(&mut camera, &view);
            for i in 0..16 {
                close(camera.view.m[i], view.m[i]);
            }
        }
    }
}

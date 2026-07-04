//! Camera basis vector extraction from the view matrix.

use flighthq_types::{Camera, Vector3Like};

/// Extracts the camera's world-space forward direction (-Z of the camera frame)
/// from the view matrix and writes it into `out`. In a right-handed camera
/// frame the forward vector points from the eye toward the target; it is the
/// negated third row of the view matrix.
///
/// Safe when `out` aliases any field of the camera.
pub fn get_camera_forward(out: &mut Vector3Like, camera: &Camera) {
    let m = &camera.view.m;
    out.x = -m[2];
    out.y = -m[6];
    out.z = -m[10];
}

/// Extracts the camera's world-space eye position from the view matrix and
/// writes it into `out`. For an orthonormal view matrix (rotation +
/// translation), the eye position is computed as the inverse translation
/// without a full matrix inversion: `eye = -(R^T * t)` where R is the
/// upper-3x3 and t is `m[12..14]` of the view.
///
/// Safe when `out` aliases any field of the camera.
pub fn get_camera_position(out: &mut Vector3Like, camera: &Camera) {
    let m = &camera.view.m;
    let m00 = m[0];
    let m01 = m[1];
    let m02 = m[2];
    let m10 = m[4];
    let m11 = m[5];
    let m12 = m[6];
    let m20 = m[8];
    let m21 = m[9];
    let m22 = m[10];
    let tx = m[12];
    let ty = m[13];
    let tz = m[14];
    out.x = -(m00 * tx + m01 * ty + m02 * tz);
    out.y = -(m10 * tx + m11 * ty + m12 * tz);
    out.z = -(m20 * tx + m21 * ty + m22 * tz);
}

/// Extracts the camera's world-space right direction (+X of the camera frame)
/// from the view matrix and writes it into `out`. It is the first row of the
/// view matrix.
///
/// Safe when `out` aliases any field of the camera.
pub fn get_camera_right(out: &mut Vector3Like, camera: &Camera) {
    let m = &camera.view.m;
    out.x = m[0];
    out.y = m[4];
    out.z = m[8];
}

/// Extracts the camera's world-space up direction (+Y of the camera frame) from
/// the view matrix and writes it into `out`. It is the second row of the view
/// matrix.
///
/// Safe when `out` aliases any field of the camera.
pub fn get_camera_up(out: &mut Vector3Like, camera: &Camera) {
    let m = &camera.view.m;
    out.x = m[1];
    out.y = m[5];
    out.z = m[9];
}

#[cfg(test)]
mod tests {
    use flighthq_geometry::create_vector3;
    use flighthq_types::Vector3Like;

    use super::*;
    use crate::camera::{create_camera, set_camera_view_matrix4_from_look_at};
    use crate::projection::create_perspective_projection;

    fn close(a: f32, b: f32) {
        assert!((a - b).abs() < 1e-4, "{a} not close to {b}");
    }

    fn make_camera() -> Camera {
        let projection = create_perspective_projection(1.0, 1.0);
        create_camera(0.1, 100.0, projection)
    }

    mod get_camera_forward {
        use super::*;

        #[test]
        fn returns_the_eye_to_target_direction_for_a_look_at_camera() {
            let mut camera = make_camera();
            set_camera_view_matrix4_from_look_at(
                &mut camera,
                &create_vector3(0.0, 0.0, 5.0),
                &create_vector3(0.0, 0.0, 0.0),
                &create_vector3(0.0, 1.0, 0.0),
            );
            let mut out = Vector3Like::default();
            get_camera_forward(&mut out, &camera);
            close(out.x, 0.0);
            close(out.y, 0.0);
            close(out.z, -1.0);
        }
    }

    mod get_camera_position {
        use super::*;

        #[test]
        fn returns_the_eye_position_for_a_look_at_camera() {
            let mut camera = make_camera();
            set_camera_view_matrix4_from_look_at(
                &mut camera,
                &create_vector3(3.0, 4.0, 5.0),
                &create_vector3(0.0, 0.0, 0.0),
                &create_vector3(0.0, 1.0, 0.0),
            );
            let mut out = Vector3Like::default();
            get_camera_position(&mut out, &camera);
            close(out.x, 3.0);
            close(out.y, 4.0);
            close(out.z, 5.0);
        }

        #[test]
        fn returns_the_origin_for_an_identity_view() {
            let camera = make_camera();
            let mut out = Vector3Like {
                x: 9.0,
                y: 9.0,
                z: 9.0,
            };
            get_camera_position(&mut out, &camera);
            close(out.x, 0.0);
            close(out.y, 0.0);
            close(out.z, 0.0);
        }
    }

    mod get_camera_right {
        use super::*;

        #[test]
        fn returns_the_world_space_right_direction_for_a_look_at_camera() {
            let mut camera = make_camera();
            set_camera_view_matrix4_from_look_at(
                &mut camera,
                &create_vector3(0.0, 0.0, 5.0),
                &create_vector3(0.0, 0.0, 0.0),
                &create_vector3(0.0, 1.0, 0.0),
            );
            let mut out = Vector3Like::default();
            get_camera_right(&mut out, &camera);
            close(out.x, 1.0);
            close(out.y, 0.0);
            close(out.z, 0.0);
        }
    }

    mod get_camera_up {
        use super::*;

        #[test]
        fn returns_the_world_space_up_direction_for_a_look_at_camera() {
            let mut camera = make_camera();
            set_camera_view_matrix4_from_look_at(
                &mut camera,
                &create_vector3(0.0, 0.0, 5.0),
                &create_vector3(0.0, 0.0, 0.0),
                &create_vector3(0.0, 1.0, 0.0),
            );
            let mut out = Vector3Like::default();
            get_camera_up(&mut out, &camera);
            close(out.x, 0.0);
            close(out.y, 1.0);
            close(out.z, 0.0);
        }
    }
}

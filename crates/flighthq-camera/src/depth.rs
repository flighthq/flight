//! NDC depth to linear depth conversion.

use flighthq_types::Camera;

/// Converts a raw NDC depth value (`ndc_z` in `[-1, 1]`) from the camera's
/// projection back to a linear view-space Z value (distance from the camera
/// along its -Z axis). Returns a negative value for a point in front of the
/// camera (standard right-handed convention where the camera looks toward -Z).
///
/// For perspective projection the NDC depth is non-linear; this undoes that
/// non-linearity using the camera's near/far clip planes. For orthographic
/// projection the depth is already linear, so the same formula still applies
/// but the result is a simple remap.
///
/// Returns `0.0` when `near` equals `far` (degenerate clip range).
pub fn get_camera_linear_depth(camera: &Camera, ndc_z: f32) -> f32 {
    let near = camera.near;
    let far = camera.far;
    let range = far - near;
    if range == 0.0 {
        return 0.0;
    }
    let denominator = ndc_z * range - (far + near);
    if denominator == 0.0 {
        return 0.0;
    }
    (2.0 * far * near) / denominator
}

/// Converts a raw NDC depth value (`ndc_z` in `[-1, 1]`) to a positive linear
/// depth in `[near, far]` -- the distance along the camera's view axis. This
/// is the unsigned version of [`get_camera_linear_depth`], useful for fog and
/// SSAO where a positive scalar distance is needed rather than a signed Z.
///
/// Returns `0.0` when `near` equals `far` (degenerate clip range).
pub fn get_camera_view_space_z(camera: &Camera, ndc_z: f32) -> f32 {
    -get_camera_linear_depth(camera, ndc_z)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::camera::create_camera;
    use crate::projection::create_perspective_projection;

    fn close(a: f32, b: f32) {
        assert!((a - b).abs() < 1e-2, "{a} not close to {b}");
    }

    fn make_camera(near: f32, far: f32) -> Camera {
        let projection = create_perspective_projection(std::f32::consts::FRAC_PI_2, 1.0);
        create_camera(near, far, projection)
    }

    mod get_camera_linear_depth {
        use super::*;

        #[test]
        fn returns_a_negative_value_for_the_near_plane() {
            let camera = make_camera(1.0, 100.0);
            let depth = get_camera_linear_depth(&camera, -1.0);
            close(depth, -1.0);
        }

        #[test]
        fn returns_a_negative_value_for_the_far_plane() {
            let camera = make_camera(1.0, 100.0);
            let depth = get_camera_linear_depth(&camera, 1.0);
            close(depth, -100.0);
        }

        #[test]
        fn returns_zero_when_near_equals_far() {
            let camera = make_camera(10.0, 10.0);
            assert_eq!(get_camera_linear_depth(&camera, 0.0), 0.0);
        }

        #[test]
        fn returns_a_value_between_near_and_far_for_a_midpoint_ndc_z() {
            let camera = make_camera(1.0, 100.0);
            let depth = get_camera_linear_depth(&camera, 0.0);
            assert!(depth < -1.0);
            assert!(depth > -100.0);
        }
    }

    mod get_camera_view_space_z {
        use super::*;

        #[test]
        fn returns_a_positive_value_for_the_near_plane() {
            let camera = make_camera(1.0, 100.0);
            let z = get_camera_view_space_z(&camera, -1.0);
            close(z, 1.0);
        }

        #[test]
        fn returns_a_positive_value_for_the_far_plane() {
            let camera = make_camera(1.0, 100.0);
            let z = get_camera_view_space_z(&camera, 1.0);
            close(z, 100.0);
        }

        #[test]
        fn is_the_negation_of_get_camera_linear_depth() {
            let camera = make_camera(0.1, 50.0);
            let ndc_z = 0.5;
            let view_z = get_camera_view_space_z(&camera, ndc_z);
            let linear = get_camera_linear_depth(&camera, ndc_z);
            close(view_z, -linear);
        }

        #[test]
        fn returns_zero_for_degenerate_clip_range() {
            let camera = make_camera(5.0, 5.0);
            close(get_camera_view_space_z(&camera, 0.0), 0.0);
        }
    }
}

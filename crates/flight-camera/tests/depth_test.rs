use flight_camera::contract::*;

use crate::test_support::*;

fn orthographic_camera(near: f32, far: f32) -> Camera3D {
    return create_camera_3d(&Camera3DOptions {
        far,
        near,
        near_clip_plane: None,
        projection: Projection::Orthographic(create_orthographic_projection(
            &OrthographicProjectionOptions {
                half_height: 1.0,
                half_width: 1.0,
            },
        )),
    });
}

mod get_camera_3d_linear_depth {
    use super::*;

    #[test]
    fn returns_a_negative_value_for_the_near_plane() {
        let camera = camera_3d(1.0, 100.0, std::f32::consts::FRAC_PI_2);
        assert_close(get_camera_3d_linear_depth(&camera, -1.0), -1.0);
    }

    #[test]
    fn returns_a_negative_value_for_the_far_plane() {
        let camera = camera_3d(1.0, 100.0, std::f32::consts::FRAC_PI_2);
        assert_close(get_camera_3d_linear_depth(&camera, 1.0) / -100.0, 1.0);
    }

    #[test]
    fn returns_zero_when_near_equals_far() {
        let camera = camera_3d(10.0, 10.0, std::f32::consts::FRAC_PI_2);
        assert_eq!(get_camera_3d_linear_depth(&camera, 0.0), 0.0);
    }

    #[test]
    fn returns_a_value_between_the_planes_for_a_midpoint_ndc_z() {
        let camera = camera_3d(1.0, 100.0, std::f32::consts::FRAC_PI_2);
        let depth = get_camera_3d_linear_depth(&camera, 0.0);
        assert!(depth < -1.0);
        assert!(depth > -100.0);
    }

    #[test]
    fn linearly_maps_orthographic_ndc_depth_to_the_clip_range() {
        let camera = orthographic_camera(1.0, 101.0);
        assert_close(get_camera_3d_linear_depth(&camera, -1.0), -1.0);
        assert_close(get_camera_3d_linear_depth(&camera, 0.0), -51.0);
        assert_close(get_camera_3d_linear_depth(&camera, 1.0), -101.0);
    }
}

mod get_camera_3d_view_space_z {
    use super::*;

    #[test]
    fn returns_a_positive_value_for_the_near_plane() {
        let camera = camera_3d(1.0, 100.0, std::f32::consts::FRAC_PI_2);
        assert_close(get_camera_3d_view_space_z(&camera, -1.0), 1.0);
    }

    #[test]
    fn returns_a_positive_value_for_the_far_plane() {
        let camera = camera_3d(1.0, 100.0, std::f32::consts::FRAC_PI_2);
        assert_close(get_camera_3d_view_space_z(&camera, 1.0), 100.0);
    }

    #[test]
    fn is_the_negation_of_get_camera_3d_linear_depth() {
        let camera = camera_3d(0.1, 50.0, std::f32::consts::FRAC_PI_2);
        assert_eq!(
            get_camera_3d_view_space_z(&camera, 0.5),
            -get_camera_3d_linear_depth(&camera, 0.5)
        );
    }

    #[test]
    fn returns_zero_for_a_degenerate_clip_range() {
        let camera = camera_3d(5.0, 5.0, std::f32::consts::FRAC_PI_2);
        assert_eq!(get_camera_3d_view_space_z(&camera, 0.0), 0.0);
    }
}

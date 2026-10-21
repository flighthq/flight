use flight_camera::contract::*;
use flight_geometry::{create_matrix, matrix_transform_point_xy};

use crate::test_support::*;

mod get_camera_2d_view_matrix {
    use super::*;

    fn project(camera: &Camera2D, x: f32, y: f32) -> (f32, f32) {
        let mut view = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        get_camera_2d_view_matrix(camera, 800.0, 600.0, &mut view);
        let mut out = zero2();
        matrix_transform_point_xy(&mut out, &view, x, y);
        return (out.x, out.y);
    }

    #[test]
    fn maps_the_camera_center_world_point_to_the_viewport_center() {
        assert_vec2_close_bare(project(&camera_2d(None), 0.0, 0.0), (400.0, 300.0));
    }

    #[test]
    fn projects_a_right_of_center_world_point_at_zoom_1() {
        assert_vec2_close_bare(project(&camera_2d(None), 100.0, 0.0), (500.0, 300.0));
    }

    #[test]
    fn magnifies_about_the_center_at_zoom_2() {
        let options = Camera2DOptions {
            rotation: None,
            x: None,
            y: None,
            zoom: Some(2.0),
        };
        assert_vec2_close_bare(
            project(&camera_2d(Some(&options)), 100.0, 0.0),
            (600.0, 300.0),
        );
    }

    #[test]
    fn rotates_the_view_opposite_the_camera_rotation() {
        let options = Camera2DOptions {
            rotation: Some(std::f32::consts::FRAC_PI_2),
            x: None,
            y: None,
            zoom: None,
        };
        assert_vec2_close_bare(
            project(&camera_2d(Some(&options)), 100.0, 0.0),
            (400.0, 200.0),
        );
    }

    fn assert_vec2_close_bare(actual: (f32, f32), expected: (f32, f32)) {
        assert_close_within(actual.0, expected.0, 1e-2);
        assert_close_within(actual.1, expected.1, 1e-2);
    }
}

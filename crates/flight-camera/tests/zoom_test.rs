use flight_camera::contract::*;

use crate::test_support::*;

mod zoom_camera_2d_at_screen_point {
    use super::*;

    #[test]
    fn keeps_the_world_point_under_a_screen_corner_fixed_while_zooming() {
        let mut camera = camera_2d(None);
        let mut before = zero2();
        unproject_camera_2d_point(&camera, 800.0, 600.0, 0.0, 0.0, &mut before);
        zoom_camera_2d_at_screen_point(&mut camera, 800.0, 600.0, 0.0, 0.0, 2.0);
        let mut after = zero2();
        unproject_camera_2d_point(&camera, 800.0, 600.0, 0.0, 0.0, &mut after);
        assert_eq!(camera.zoom, 2.0);
        assert_vec2_close(&after, (before.x, before.y));
        assert_vec2_close(&after, (-400.0, -300.0));
    }

    #[test]
    fn keeps_an_arbitrary_screen_point_fixed_under_a_rotated_camera() {
        let options = Camera2DOptions {
            rotation: Some(std::f32::consts::PI / 5.0),
            x: Some(30.0),
            y: Some(-20.0),
            zoom: Some(1.5),
        };
        let mut camera = camera_2d(Some(&options));
        let mut before = zero2();
        unproject_camera_2d_point(&camera, 800.0, 600.0, 250.0, 175.0, &mut before);
        zoom_camera_2d_at_screen_point(&mut camera, 800.0, 600.0, 250.0, 175.0, 3.0);
        let mut after = zero2();
        unproject_camera_2d_point(&camera, 800.0, 600.0, 250.0, 175.0, &mut after);
        assert_eq!(camera.zoom, 3.0);
        assert_vec2_close(&after, (before.x, before.y));
    }
}

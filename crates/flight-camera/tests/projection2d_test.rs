use flight_camera::contract::*;

use crate::test_support::*;

fn options(
    x: Option<f32>,
    y: Option<f32>,
    zoom: Option<f32>,
    rotation: Option<f32>,
) -> Camera2DOptions {
    return Camera2DOptions {
        rotation,
        x,
        y,
        zoom,
    };
}

mod project_camera_2d_point {
    use super::*;

    #[test]
    fn projects_the_camera_center_to_the_viewport_center() {
        let camera = camera_2d(None);
        let mut out = zero2();
        project_camera_2d_point(&camera, 800.0, 600.0, 0.0, 0.0, &mut out);
        assert_vec2_close(&out, (400.0, 300.0));
    }

    #[test]
    fn accounts_for_zoom() {
        let camera = camera_2d(Some(&options(None, None, Some(2.0), None)));
        let mut out = zero2();
        project_camera_2d_point(&camera, 800.0, 600.0, 100.0, 0.0, &mut out);
        assert_vec2_close(&out, (600.0, 300.0));
    }
}

mod unproject_camera_2d_point {
    use super::*;

    #[test]
    fn unprojects_the_viewport_center_to_the_camera_position() {
        let camera = camera_2d(Some(&options(Some(25.0), Some(40.0), None, None)));
        let mut out = zero2();
        unproject_camera_2d_point(&camera, 800.0, 600.0, 400.0, 300.0, &mut out);
        assert_vec2_close(&out, (25.0, 40.0));
    }

    #[test]
    fn round_trips_project_then_unproject_across_zooms_and_rotations() {
        let cameras = [
            camera_2d(None),
            camera_2d(Some(&options(Some(120.0), Some(-80.0), Some(2.0), None))),
            camera_2d(Some(&options(
                Some(-50.0),
                Some(200.0),
                Some(0.5),
                Some(std::f32::consts::FRAC_PI_3),
            ))),
            camera_2d(Some(&options(
                Some(10.0),
                Some(10.0),
                Some(1.5),
                Some(-std::f32::consts::FRAC_PI_6),
            ))),
        ];
        let viewports = [
            (800.0, 600.0),
            (800.0, 600.0),
            (1024.0, 768.0),
            (640.0, 480.0),
        ];
        let points = [(0.0, 0.0), (100.0, 0.0), (-250.0, 175.0), (512.0, -333.0)];
        let mut index = 0;
        while index < cameras.len() {
            let camera = &cameras[index];
            let (viewport_width, viewport_height) = viewports[index];
            for point in points {
                let mut screen = zero2();
                project_camera_2d_point(
                    camera,
                    viewport_width,
                    viewport_height,
                    point.0,
                    point.1,
                    &mut screen,
                );
                let mut world = zero2();
                unproject_camera_2d_point(
                    camera,
                    viewport_width,
                    viewport_height,
                    screen.x,
                    screen.y,
                    &mut world,
                );
                assert_vec2_close(&world, point);
            }
            index += 1;
        }
    }
}

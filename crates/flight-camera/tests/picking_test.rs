use flight_camera::contract::*;
use flight_geometry::{create_ray3d, create_vector3};

use crate::test_support::*;

fn make_camera() -> Camera3D {
    return camera_3d(0.1, 100.0, std::f32::consts::FRAC_PI_2);
}

mod get_camera_3d_screen_to_world_ray {
    use super::*;

    #[test]
    fn returns_a_ray_pointing_from_near_toward_far_for_center_ndc() {
        let mut camera = make_camera();
        look_at(&mut camera, (0.0, 0.0, 5.0), (0.0, 0.0, 0.0));
        let mut ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(get_camera_3d_screen_to_world_ray(
            &mut ray, &camera, 0.0, 0.0, 1.0
        ));
        assert_vec3_close(&ray.direction, (0.0, 0.0, -1.0));
    }

    #[test]
    fn returns_false_when_the_view_projection_is_non_invertible() {
        let mut camera = make_camera();
        camera.near = 1.0;
        camera.far = 1.0;
        let mut ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(!get_camera_3d_screen_to_world_ray(
            &mut ray, &camera, 0.0, 0.0, 1.0
        ));
    }

    #[test]
    fn round_trips_with_world_to_screen_at_the_center_point() {
        let mut camera = make_camera();
        look_at(&mut camera, (0.0, 0.0, 5.0), (0.0, 0.0, 0.0));
        let world_point = create_vector3(0.0, 0.0, 2.0);
        let mut ndc = zero3();
        assert!(get_camera_3d_world_to_screen(
            &mut ndc,
            &camera,
            &world_point,
            1.0
        ));
        let mut ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(get_camera_3d_screen_to_world_ray(
            &mut ray, &camera, ndc.x, ndc.y, 1.0
        ));
        assert_vec3_close(&ray.direction, (0.0, 0.0, -1.0));
    }
}

mod get_camera_3d_world_to_screen {
    use super::*;

    #[test]
    fn maps_a_point_in_front_of_the_camera_to_ndc_within_the_unit_square() {
        let mut camera = make_camera();
        look_at(&mut camera, (0.0, 0.0, 5.0), (0.0, 0.0, 0.0));
        let mut ndc = zero3();
        let point = create_vector3(0.0, 0.0, 2.0);
        assert!(get_camera_3d_world_to_screen(
            &mut ndc, &camera, &point, 1.0
        ));
        assert!(ndc.x.abs() <= 1.0);
        assert!(ndc.y.abs() <= 1.0);
    }

    #[test]
    fn maps_the_origin_to_zero_ndc_for_a_camera_looking_along_negative_z() {
        let mut camera = make_camera();
        look_at(&mut camera, (0.0, 0.0, 5.0), (0.0, 0.0, 0.0));
        let mut ndc = zero3();
        let origin = create_vector3(0.0, 0.0, 0.0);
        get_camera_3d_world_to_screen(&mut ndc, &camera, &origin, 1.0);
        assert_vec3_close(&ndc, (0.0, 0.0, ndc.z));
    }

    #[test]
    fn is_safe_when_out_aliases_world_point() {
        let mut camera = make_camera();
        look_at(&mut camera, (0.0, 0.0, 5.0), (0.0, 0.0, 0.0));
        let mut point = create_vector3(0.0, 0.0, 2.0);
        let source = point.clone();
        assert!(get_camera_3d_world_to_screen(
            &mut point, &camera, &source, 1.0
        ));
        assert!(point.x.abs() <= 1.0);
        assert!(point.y.abs() <= 1.0);
    }

    #[test]
    fn returns_false_for_a_point_behind_the_camera() {
        let mut camera = make_camera();
        look_at(&mut camera, (0.0, 0.0, 5.0), (0.0, 0.0, 0.0));
        let mut ndc = zero3();
        let behind = create_vector3(0.0, 0.0, 10.0);
        assert!(!get_camera_3d_world_to_screen(
            &mut ndc, &camera, &behind, 1.0
        ));
    }
}

use flight_camera::contract::*;
use flight_geometry::{create_bounding_sphere, create_plane, create_ray3d, create_vector3};

use crate::test_support::*;

fn make_camera() -> Camera3D {
    let mut camera = camera_3d(0.1, 100.0, std::f32::consts::FRAC_PI_2);
    look_at(&mut camera, (0.0, 0.0, 10.0), (0.0, 0.0, 0.0));
    return camera;
}

mod get_camera_3d_ray_through_bounding_sphere {
    use super::*;

    #[test]
    fn returns_true_for_a_sphere_in_front_of_the_camera() {
        let camera = make_camera();
        let sphere = create_bounding_sphere(0.0, 0.0, 5.0, 1.0);
        let mut ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(get_camera_3d_ray_through_bounding_sphere(
            &mut ray, &camera, &sphere, 1.0
        ));
    }

    #[test]
    fn returns_a_ray_pointing_from_the_camera_toward_the_sphere_center() {
        let camera = make_camera();
        let sphere = create_bounding_sphere(0.0, 0.0, 0.0, 1.0);
        let mut ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(get_camera_3d_ray_through_bounding_sphere(
            &mut ray, &camera, &sphere, 1.0
        ));
        assert_vec3_close(&ray.direction, (0.0, 0.0, -1.0));
    }

    #[test]
    fn returns_false_for_an_empty_sphere() {
        let camera = make_camera();
        let sphere = create_bounding_sphere(0.0, 0.0, 5.0, -1.0);
        let mut ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(!get_camera_3d_ray_through_bounding_sphere(
            &mut ray, &camera, &sphere, 1.0
        ));
    }

    #[test]
    fn returns_false_when_the_sphere_center_is_behind_the_camera() {
        let camera = make_camera();
        let sphere = create_bounding_sphere(0.0, 0.0, 15.0, 1.0);
        let mut ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert!(!get_camera_3d_ray_through_bounding_sphere(
            &mut ray, &camera, &sphere, 1.0
        ));
    }
}

mod intersect_camera_3d_ray_with_plane {
    use super::*;

    #[test]
    fn returns_the_hit_point_for_a_ray_pointing_straight_down() {
        let ray = create_ray3d(0.0, 5.0, 0.0, 0.0, -1.0, 0.0);
        let plane = create_plane(0.0, 1.0, 0.0, 0.0);
        let mut hit = zero3();
        assert!(intersect_camera_3d_ray_with_plane(&mut hit, &ray, &plane));
        assert_vec3_close(&hit, (0.0, 0.0, 0.0));
    }

    #[test]
    fn returns_false_when_the_ray_is_parallel_to_the_plane() {
        let ray = create_ray3d(0.0, 1.0, 0.0, 1.0, 0.0, 0.0);
        let plane = create_plane(0.0, 1.0, 0.0, -1.0);
        let mut hit = zero3();
        assert!(!intersect_camera_3d_ray_with_plane(&mut hit, &ray, &plane));
    }

    #[test]
    fn returns_false_when_the_intersection_is_behind_the_ray_origin() {
        let ray = create_ray3d(0.0, -5.0, 0.0, 0.0, 1.0, 0.0);
        let plane = create_plane(0.0, 1.0, 0.0, 10.0);
        let mut hit = zero3();
        assert!(!intersect_camera_3d_ray_with_plane(&mut hit, &ray, &plane));
    }

    #[test]
    fn computes_the_hit_point_for_a_diagonal_ray_against_a_diagonal_plane() {
        let ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 1.0, 0.0);
        let plane = create_plane(1.0, 1.0, 0.0, -4.0);
        let mut hit = create_vector3(0.0, 0.0, 0.0);
        assert!(intersect_camera_3d_ray_with_plane(&mut hit, &ray, &plane));
        assert_vec3_close(&hit, (2.0, 2.0, 0.0));
    }
}

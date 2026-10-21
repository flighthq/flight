use flight_camera::contract::*;
use flight_geometry::{create_aabb, create_bounding_sphere, create_frustum, create_vector3};

use crate::test_support::*;

fn make_camera() -> Camera3D {
    let mut camera = create_camera_3d();
    camera.far = 100.0;
    camera.near = 1.0;
    camera.projection = perspective_projection(std::f32::consts::FRAC_PI_2, Some(1.0));
    look_at(&mut camera, (0.0, 0.0, 10.0), (0.0, 0.0, 0.0));
    return camera;
}

mod get_camera_3d_frustum {
    use super::*;

    #[test]
    fn writes_the_six_frustum_planes_into_the_out_frustum() {
        let camera = make_camera();
        let mut frustum = create_frustum();
        get_camera_3d_frustum(&mut frustum, &camera, 1.0);
        let near = &frustum.near;
        let length = (near.a * near.a + near.b * near.b + near.c * near.c).sqrt();
        assert_close(length, 1.0);
    }
}

mod is_box_in_camera_3d_frustum {
    use super::*;

    #[test]
    fn returns_true_for_a_box_in_front_of_the_camera() {
        let camera = make_camera();
        let aabb = create_aabb(-1.0, -1.0, 2.0, 1.0, 1.0, 5.0);
        assert!(is_box_in_camera_3d_frustum(&camera, &aabb, 1.0));
    }

    #[test]
    fn returns_false_for_a_box_entirely_behind_the_camera() {
        let camera = make_camera();
        let aabb = create_aabb(-1.0, -1.0, 15.0, 1.0, 1.0, 20.0);
        assert!(!is_box_in_camera_3d_frustum(&camera, &aabb, 1.0));
    }
}

mod is_point_in_camera_3d_frustum {
    use super::*;

    #[test]
    fn returns_true_for_a_point_in_the_frustum() {
        let camera = make_camera();
        let point = create_vector3(0.0, 0.0, 5.0);
        assert!(is_point_in_camera_3d_frustum(&camera, &point, 1.0));
    }

    #[test]
    fn returns_false_for_a_point_behind_the_camera() {
        let camera = make_camera();
        let point = create_vector3(0.0, 0.0, 15.0);
        assert!(!is_point_in_camera_3d_frustum(&camera, &point, 1.0));
    }
}

mod is_sphere_in_camera_3d_frustum {
    use super::*;

    #[test]
    fn returns_true_for_a_sphere_in_front_of_the_camera() {
        let camera = make_camera();
        let sphere = create_bounding_sphere(0.0, 0.0, 5.0, 1.0);
        assert!(is_sphere_in_camera_3d_frustum(&camera, &sphere, 1.0));
    }

    #[test]
    fn returns_false_for_a_sphere_entirely_behind_the_camera() {
        let camera = make_camera();
        let sphere = create_bounding_sphere(0.0, 0.0, 20.0, 1.0);
        assert!(!is_sphere_in_camera_3d_frustum(&camera, &sphere, 1.0));
    }

    #[test]
    fn returns_false_for_an_empty_sphere() {
        let camera = make_camera();
        let sphere = create_bounding_sphere(0.0, 0.0, 5.0, -1.0);
        assert!(!is_sphere_in_camera_3d_frustum(&camera, &sphere, 1.0));
    }
}

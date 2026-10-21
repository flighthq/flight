use flight_camera::contract::*;
use flight_geometry::{Vector3, create_vector3};

use crate::test_support::*;

fn make_camera() -> Camera3D {
    let mut camera = create_camera_3d(&Camera3DOptions {
        far: 100.0,
        near: 1.0,
        near_clip_plane: None,
        projection: perspective_projection(std::f32::consts::FRAC_PI_2, Some(1.0)),
    });
    look_at(&mut camera, (0.0, 0.0, 10.0), (0.0, 0.0, 0.0));
    return camera;
}

fn zero_corners() -> [Vector3; 8] {
    return std::array::from_fn(|_| create_vector3(0.0, 0.0, 0.0));
}

mod get_camera_3d_frustum_corners {
    use super::*;

    #[test]
    fn writes_eight_world_space_corners_and_returns_true() {
        let camera = make_camera();
        let mut corners = zero_corners();
        assert!(get_camera_3d_frustum_corners(&mut corners, &camera, 1.0));
        let mut index = 0;
        while index < 4 {
            assert!(corners[index].z > corners[index + 4].z);
            index += 1;
        }
    }

    #[test]
    fn returns_false_when_the_view_projection_is_non_invertible() {
        let mut camera = make_camera();
        camera.near = 1.0;
        camera.far = 1.0;
        let mut corners = zero_corners();
        assert!(!get_camera_3d_frustum_corners(&mut corners, &camera, 1.0));
    }

    #[test]
    fn near_and_far_corners_have_opposite_symmetry_in_xy() {
        let camera = make_camera();
        let mut corners = zero_corners();
        assert!(get_camera_3d_frustum_corners(&mut corners, &camera, 1.0));
        assert_close_within(corners[0].x, -corners[1].x, 1e-3);
        assert_close_within(corners[0].y, -corners[2].y, 1e-3);
        assert_close_within(corners[3].x, -corners[2].x, 1e-3);
    }
}

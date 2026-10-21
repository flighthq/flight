use flight_camera::contract::*;
use flight_geometry::create_vector3;

use crate::test_support::*;

fn make_camera() -> Camera3D {
    return camera_3d(0.1, 1000.0, 1.0);
}

fn forward(camera: &Camera3D) -> (f32, f32, f32) {
    let m = camera.view.read().unwrap().m;
    return (-m[2], -m[6], -m[10]);
}

mod get_cube_capture_face_camera_3d {
    use super::*;

    #[test]
    fn sets_a_ninety_degree_fov_square_perspective_projection() {
        let mut camera = make_camera();
        let origin = create_vector3(0.0, 0.0, 0.0);
        get_cube_capture_face_camera_3d(&mut camera, &origin, 0);
        match &camera.projection {
            Projection::Perspective(projection) => {
                let borrowed = projection.read().unwrap();
                assert_close(borrowed.fov_y, std::f32::consts::FRAC_PI_2);
                assert_close(borrowed.aspect, 1.0);
            }
            _ => panic!("expected a perspective projection"),
        }
    }

    #[test]
    fn preserves_near_and_far() {
        let mut camera = make_camera();
        let origin = create_vector3(0.0, 0.0, 0.0);
        get_cube_capture_face_camera_3d(&mut camera, &origin, 0);
        assert_eq!(camera.near, 0.1);
        assert_eq!(camera.far, 1000.0);
    }

    #[test]
    fn positions_the_camera_at_the_given_point_for_every_face() {
        let mut camera = make_camera();
        let origin = create_vector3(3.0, -2.0, 7.0);
        let mut face = 0;
        while face < 6 {
            get_cube_capture_face_camera_3d(&mut camera, &origin, face);
            let mut position = zero3();
            get_camera_3d_position(&mut position, &camera);
            assert_vec3_close(&position, (3.0, -2.0, 7.0));
            face += 1;
        }
    }

    #[test]
    fn produces_six_distinct_view_matrices() {
        let mut camera = make_camera();
        let origin = create_vector3(0.0, 0.0, 0.0);
        let mut views: Vec<[f32; 16]> = Vec::new();
        let mut face = 0;
        while face < 6 {
            get_cube_capture_face_camera_3d(&mut camera, &origin, face);
            views.push(camera.view.read().unwrap().m);
            face += 1;
        }
        let mut i = 0;
        while i < 6 {
            let mut j = i + 1;
            while j < 6 {
                let same = (0..16).all(|k| (views[i][k] - views[j][k]).abs() < 1e-6);
                assert!(!same);
                j += 1;
            }
            i += 1;
        }
    }

    #[test]
    fn looks_along_the_correct_axis_for_each_face() {
        let mut camera = make_camera();
        let origin = create_vector3(0.0, 0.0, 0.0);
        let expected = [
            (1.0, 0.0, 0.0),
            (-1.0, 0.0, 0.0),
            (0.0, 1.0, 0.0),
            (0.0, -1.0, 0.0),
            (0.0, 0.0, 1.0),
            (0.0, 0.0, -1.0),
        ];
        let mut face = 0;
        while face < 6 {
            get_cube_capture_face_camera_3d(&mut camera, &origin, face);
            assert_vec3_close(
                &create_vector3(forward(&camera).0, forward(&camera).1, forward(&camera).2),
                expected[face as usize],
            );
            face += 1;
        }
    }
}

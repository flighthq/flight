use flight_camera::contract::*;

use crate::test_support::*;

mod get_camera_3d_forward {
    use super::*;

    #[test]
    fn returns_the_eye_to_target_direction_for_a_look_at_camera() {
        let mut camera = camera_3d(0.1, 100.0, 1.0);
        look_at(&mut camera, (0.0, 0.0, 5.0), (0.0, 0.0, 0.0));
        let mut out = zero3();
        get_camera_3d_forward(&mut out, &camera);
        assert_vec3_close(&out, (0.0, 0.0, -1.0));
    }

    #[test]
    fn is_safe_when_out_aliases_a_camera_view_field_component() {
        let mut camera = camera_3d(0.1, 100.0, 1.0);
        look_at(&mut camera, (0.0, 0.0, 5.0), (0.0, 0.0, 0.0));
        let mut out = zero3();
        get_camera_3d_forward(&mut out, &camera);
        assert_close(out.z, -1.0);
    }
}

mod get_camera_3d_position {
    use super::*;

    #[test]
    fn returns_the_eye_position_for_a_look_at_camera() {
        let mut camera = camera_3d(0.1, 100.0, 1.0);
        look_at(&mut camera, (3.0, 4.0, 5.0), (0.0, 0.0, 0.0));
        let mut out = zero3();
        get_camera_3d_position(&mut out, &camera);
        assert_vec3_close(&out, (3.0, 4.0, 5.0));
    }

    #[test]
    fn returns_the_origin_for_an_identity_view() {
        let camera = camera_3d(0.1, 100.0, 1.0);
        let mut out = zero3();
        get_camera_3d_position(&mut out, &camera);
        assert_vec3_close(&out, (0.0, 0.0, 0.0));
    }
}

mod get_camera_3d_right {
    use super::*;

    #[test]
    fn returns_the_world_space_right_direction() {
        let mut camera = camera_3d(0.1, 100.0, 1.0);
        look_at(&mut camera, (0.0, 0.0, 5.0), (0.0, 0.0, 0.0));
        let mut out = zero3();
        get_camera_3d_right(&mut out, &camera);
        assert_vec3_close(&out, (1.0, 0.0, 0.0));
    }
}

mod get_camera_3d_up {
    use super::*;

    #[test]
    fn returns_the_world_space_up_direction() {
        let mut camera = camera_3d(0.1, 100.0, 1.0);
        look_at(&mut camera, (0.0, 0.0, 5.0), (0.0, 0.0, 0.0));
        let mut out = zero3();
        get_camera_3d_up(&mut out, &camera);
        assert_vec3_close(&out, (0.0, 1.0, 0.0));
    }
}

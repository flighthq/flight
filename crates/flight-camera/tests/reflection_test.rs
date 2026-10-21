use flight_camera::contract::*;
use flight_geometry::{create_matrix4, create_plane};

use crate::test_support::*;

fn perspective_camera() -> Camera3D {
    let mut camera = camera_3d(0.1, 100.0, std::f32::consts::FRAC_PI_3);
    look_at(&mut camera, (0.0, 0.0, 5.0), (0.0, 0.0, 0.0));
    return camera;
}

fn elevated_camera() -> Camera3D {
    let mut camera = camera_3d(0.1, 100.0, std::f32::consts::FRAC_PI_3);
    look_at(&mut camera, (2.0, 5.0, 3.0), (0.0, 0.0, 0.0));
    return camera;
}

fn empty_camera() -> Camera3D {
    return camera_3d(0.1, 100.0, std::f32::consts::FRAC_PI_3);
}

mod apply_oblique_near_clip_plane {
    use super::*;

    #[test]
    fn replaces_the_near_plane_row_of_a_perspective_projection() {
        let camera = perspective_camera();
        let mut projection = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        set_projection_matrix4(
            &mut projection,
            &camera.projection,
            1.0,
            camera.near,
            camera.far,
        );
        let m0 = projection.m[0];
        let m5 = projection.m[5];
        let m10 = projection.m[10];
        let m14 = projection.m[14];
        apply_oblique_near_clip_plane(&mut projection, &create_plane(0.0, 0.0, -1.0, -1.0));
        assert_eq!(projection.m[0], m0);
        assert_eq!(projection.m[5], m5);
        assert_ne!(projection.m[10], m10);
        assert_ne!(projection.m[14], m14);
    }

    #[test]
    fn clips_at_the_given_view_space_plane() {
        let camera = perspective_camera();
        let mut projection = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        set_projection_matrix4(
            &mut projection,
            &camera.projection,
            1.0,
            camera.near,
            camera.far,
        );
        apply_oblique_near_clip_plane(&mut projection, &create_plane(0.0, 0.0, -1.0, -2.0));
        let m = projection.m;
        let clip_z = m[10] * -2.0 + m[14];
        let clip_w = m[11] * -2.0 + m[15];
        assert_close_within(clip_z / clip_w, -1.0, 1e-3);
    }
}

mod reflect_camera_3d_by_plane {
    use super::*;

    #[test]
    fn reflects_a_camera_through_a_horizontal_plane_at_the_origin() {
        let camera = elevated_camera();
        let mut out = empty_camera();
        reflect_camera_3d_by_plane(&mut out, &camera, &create_plane(0.0, 1.0, 0.0, 0.0));
        let mut position = zero3();
        get_camera_3d_position(&mut position, &out);
        assert_vec3_close(&position, (2.0, -5.0, 3.0));
    }

    #[test]
    fn preserves_near_and_far() {
        let mut camera = create_camera_3d(&Camera3DOptions {
            far: 50.0,
            near: 0.5,
            near_clip_plane: None,
            projection: perspective_projection(std::f32::consts::FRAC_PI_4, Some(16.0 / 9.0)),
        });
        look_at(&mut camera, (3.0, 2.0, 0.0), (0.0, 0.0, 0.0));
        let mut out = empty_camera();
        reflect_camera_3d_by_plane(&mut out, &camera, &create_plane(0.0, 1.0, 0.0, 0.0));
        assert_eq!(out.near, 0.5);
        assert_eq!(out.far, 50.0);
    }

    #[test]
    fn reflects_through_an_offset_plane() {
        let camera = elevated_camera();
        let mut out = empty_camera();
        reflect_camera_3d_by_plane(&mut out, &camera, &create_plane(0.0, 1.0, 0.0, -2.0));
        let mut position = zero3();
        get_camera_3d_position(&mut position, &out);
        assert_vec3_close(&position, (2.0, -1.0, 3.0));
    }

    #[test]
    fn is_alias_safe_when_out_equals_camera() {
        let source = elevated_camera();
        let mut out = copy_of_camera(&source);
        reflect_camera_3d_by_plane(&mut out, &source, &create_plane(0.0, 1.0, 0.0, 0.0));
        let mut position = zero3();
        get_camera_3d_position(&mut position, &out);
        assert_close(position.y, -5.0);
    }

    #[test]
    fn preserves_view_direction_symmetry_for_an_identity_reflection() {
        let camera = perspective_camera();
        let mut out = empty_camera();
        reflect_camera_3d_by_plane(&mut out, &camera, &create_plane(0.0, 0.0, 1.0, 0.0));
        let mut forward = zero3();
        get_camera_3d_forward(&mut forward, &out);
        assert_close(forward.x, 0.0);
        assert_close(forward.y, 0.0);
    }

    #[test]
    fn double_reflection_is_identity() {
        let camera = elevated_camera();
        let plane = create_plane(0.0, 1.0, 0.0, 0.0);
        let mut temporary = empty_camera();
        let mut out = empty_camera();
        reflect_camera_3d_by_plane(&mut temporary, &camera, &plane);
        reflect_camera_3d_by_plane(&mut out, &temporary, &plane);
        assert_mat4_close(&out.view.read().unwrap(), &camera.view.read().unwrap());
    }
}

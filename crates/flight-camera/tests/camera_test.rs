use std::sync::Arc;

use flight_camera::contract::*;
use flight_geometry::{
    create_matrix4, create_plane, create_vector3, inverse_matrix4, multiply_matrix4,
    set_matrix4_look_at, set_perspective_matrix4,
};

use crate::test_support::*;

fn fixed_projection() -> Arc<std::sync::RwLock<PerspectiveProjection>> {
    return create_perspective_projection(&PerspectiveProjectionOptions {
        aspect: Some(1.0),
        fov_y: 1.0,
    });
}

fn camera_with(projection: Projection, near: f32, far: f32) -> Camera3D {
    return create_camera_3d(&Camera3DOptions {
        far,
        near,
        near_clip_plane: None,
        projection,
    });
}

mod create_camera_3d {
    use super::*;

    #[test]
    fn stores_projection_near_far_and_identity_view_with_zero_jitter() {
        let projection = fixed_projection();
        let camera = camera_with(Projection::Perspective(projection.clone()), 0.1, 100.0);
        match &camera.projection {
            Projection::Perspective(stored) => assert!(Arc::ptr_eq(stored, &projection)),
            _ => panic!("expected a perspective projection"),
        }
        assert_eq!(camera.near, 0.1);
        assert_eq!(camera.far, 100.0);
        assert_eq!(camera.jitter.read().unwrap().x, 0.0);
        assert_eq!(camera.jitter.read().unwrap().y, 0.0);
        assert!(camera.near_clip_plane.is_none());
        assert_eq!(camera.view.read().unwrap().m[0], 1.0);
        assert_eq!(camera.view.read().unwrap().m[5], 1.0);
        assert_eq!(camera.inverse_view_projection.read().unwrap().m[10], 1.0);
    }

    #[test]
    fn accepts_an_optional_near_clip_plane() {
        let plane = Arc::new(std::sync::RwLock::new(create_plane(0.0, 1.0, 0.0, -2.0)));
        let camera = create_camera_3d(&Camera3DOptions {
            far: 100.0,
            near: 0.1,
            near_clip_plane: Some(plane.clone()),
            projection: Projection::Perspective(fixed_projection()),
        });
        let stored = camera.near_clip_plane.as_ref().expect("plane is stored");
        assert!(Arc::ptr_eq(stored, &plane));
    }
}

mod get_camera_3d_inverse_view_projection_matrix4 {
    use super::*;

    #[test]
    fn writes_the_inverse_of_the_view_projection_into_a_distinct_out() {
        let mut camera = camera_with(Projection::Perspective(fixed_projection()), 0.1, 100.0);
        look_at(&mut camera, (0.0, 0.0, 5.0), (0.0, 0.0, 0.0));
        let mut view_projection = create_matrix4();
        get_camera_3d_view_projection_matrix4(&mut view_projection, &camera, 1.5);
        let mut expected = create_matrix4();
        inverse_matrix4(&mut expected, &view_projection);
        let mut out = create_matrix4();
        assert!(get_camera_3d_inverse_view_projection_matrix4(
            &mut out, &camera, 1.5
        ));
        assert_mat4_close(&out, &expected);
    }
}

mod get_camera_3d_view_projection_matrix4 {
    use super::*;

    #[test]
    fn writes_projection_times_view_into_a_distinct_out() {
        let projection = fixed_projection();
        let mut camera = camera_with(Projection::Perspective(projection.clone()), 0.1, 100.0);
        look_at(&mut camera, (0.0, 0.0, 5.0), (0.0, 0.0, 0.0));
        let mut out = create_matrix4();
        get_camera_3d_view_projection_matrix4(&mut out, &camera, 2.0);
        let mut projection_matrix = create_matrix4();
        set_projection_matrix4(
            &mut projection_matrix,
            &camera.projection,
            2.0,
            camera.near,
            camera.far,
        );
        let view = camera.view.read().unwrap();
        let mut expected = create_matrix4();
        multiply_matrix4(&mut expected, &projection_matrix, &view);
        assert_mat4_close(&out, &expected);
    }

    #[test]
    fn applies_the_camera_jitter_as_an_ndc_projection_offset() {
        let mut camera = camera_with(Projection::Perspective(fixed_projection()), 0.1, 100.0);
        let mut base = create_matrix4();
        get_camera_3d_view_projection_matrix4(&mut base, &camera, 1.0);
        set_camera_3d_jitter(&mut camera, 0.25, -0.5);
        let mut jittered = create_matrix4();
        get_camera_3d_view_projection_matrix4(&mut jittered, &camera, 1.0);
        assert_close_within(jittered.m[8], base.m[8] - 0.25, 1e-4);
        assert_close_within(jittered.m[9], base.m[9] + 0.5, 1e-4);
    }

    #[test]
    fn applies_the_oblique_near_clip_plane_when_present() {
        let camera_projection = perspective_projection(std::f32::consts::FRAC_PI_3, Some(1.5));
        let mut camera = camera_with(camera_projection, 0.1, 100.0);
        let mut without_clip = create_matrix4();
        get_camera_3d_view_projection_matrix4(&mut without_clip, &camera, 1.5);
        camera.near_clip_plane = Some(Arc::new(std::sync::RwLock::new(create_plane(
            0.0, 1.0, 0.0, -1.0,
        ))));
        let mut with_clip = create_matrix4();
        get_camera_3d_view_projection_matrix4(&mut with_clip, &camera, 1.5);
        assert!((0..16).any(|index| with_clip.m[index] != without_clip.m[index]));
        let mut projection_matrix = create_matrix4();
        set_projection_matrix4(
            &mut projection_matrix,
            &camera.projection,
            1.5,
            camera.near,
            camera.far,
        );
        let plane = create_plane(0.0, 1.0, 0.0, -1.0);
        apply_oblique_near_clip_plane(&mut projection_matrix, &plane);
        let view = camera.view.read().unwrap();
        let mut expected = create_matrix4();
        multiply_matrix4(&mut expected, &projection_matrix, &view);
        assert_mat4_close(&with_clip, &expected);
    }
}

mod initialize_camera_3d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_camera_3d() {
        let mut camera = flight_entity::allocate_entity::<Camera3D>();
        initialize_camera_3d(
            &mut camera,
            &Camera3DOptions {
                far: 10.0,
                near: 1.0,
                near_clip_plane: None,
                projection: Projection::Perspective(fixed_projection()),
            },
        );
        assert_eq!(camera.far, 10.0);
        assert_eq!(camera.near, 1.0);
    }
}

mod set_camera_3d_aspect {
    use super::*;

    #[test]
    fn writes_the_aspect_on_a_perspective_projection_in_place() {
        let projection = fixed_projection();
        let mut camera = camera_with(Projection::Perspective(projection.clone()), 0.1, 100.0);
        set_camera_3d_aspect(&mut camera, 16.0 / 9.0);
        assert_close(projection.read().unwrap().aspect, 16.0 / 9.0);
        match &camera.projection {
            Projection::Perspective(stored) => assert!(Arc::ptr_eq(stored, &projection)),
            _ => panic!("expected a perspective projection"),
        }
    }

    #[test]
    fn widens_an_orthographic_view_volume_preserving_half_height() {
        let projection = create_orthographic_projection(&OrthographicProjectionOptions {
            half_height: 5.0,
            half_width: 5.0,
        });
        let mut camera = camera_with(Projection::Orthographic(projection.clone()), 0.1, 100.0);
        set_camera_3d_aspect(&mut camera, 2.0);
        assert_eq!(projection.read().unwrap().half_height, 5.0);
        assert_eq!(projection.read().unwrap().half_width, 10.0);
    }

    #[test]
    fn is_a_no_op_for_a_raw_projection() {
        let mut source = create_matrix4();
        set_perspective_matrix4(&mut source, 1.0, 1.5, 0.1, 100.0);
        let projection = create_raw_projection(&RawProjectionOptions {
            matrix: source.clone(),
        });
        let mut camera = camera_with(Projection::Raw(projection.clone()), 0.1, 100.0);
        set_camera_3d_aspect(&mut camera, 999.0);
        let stored = projection.read().unwrap();
        let matrix = stored.matrix.read().unwrap();
        assert_mat4_close(&matrix, &source);
    }
}

mod set_camera_3d_jitter {
    use super::*;

    #[test]
    fn sets_the_jitter_offset_in_place_retaining_the_vector() {
        let mut camera = camera_with(Projection::Perspective(fixed_projection()), 0.1, 100.0);
        let jitter = camera.jitter.clone();
        set_camera_3d_jitter(&mut camera, 0.25, -0.5);
        assert!(Arc::ptr_eq(&camera.jitter, &jitter));
        assert_eq!(camera.jitter.read().unwrap().x, 0.25);
        assert_eq!(camera.jitter.read().unwrap().y, -0.5);
    }
}

mod set_camera_3d_view_guard {
    use super::*;

    #[test]
    fn is_notified_whenever_a_view_matrix_is_assigned_and_not_otherwise() {
        let guard = guard_state();
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let recorder = seen.clone();
        let hook: Camera3DViewGuard = Arc::new(move |camera: &Camera3D| {
            recorder
                .lock()
                .unwrap()
                .push(camera.view.read().unwrap().m[0]);
        });
        set_camera_3d_view_guard(&guard, Some(hook));
        let mut camera = camera_with(Projection::Perspective(fixed_projection()), 0.1, 100.0);
        assert!(seen.lock().unwrap().is_empty());
        set_camera_3d_view_matrix4_from_matrix4(
            &guard,
            &mut camera,
            &create_matrix4_from_values(
                4.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
            ),
        );
        assert_eq!(*seen.lock().unwrap(), vec![4.0]);
        set_camera_3d_view_guard(&guard, None);
    }
}

fn create_matrix4_from_values(
    m00: f32,
    m01: f32,
    m02: f32,
    m03: f32,
    m10: f32,
    m11: f32,
    m12: f32,
    m13: f32,
    m20: f32,
    m21: f32,
    m22: f32,
    m23: f32,
    m30: f32,
    m31: f32,
    m32: f32,
    m33: f32,
) -> flight_geometry::Matrix4 {
    let mut out = create_matrix4();
    flight_geometry::set_matrix4(
        &mut out, m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33,
    );
    return out;
}

mod set_camera_3d_view_matrix4_from_look_at {
    use super::*;

    #[test]
    fn builds_the_view_matrix_from_eye_target_up() {
        let mut camera = camera_with(Projection::Perspective(fixed_projection()), 0.1, 100.0);
        let eye = create_vector3(0.0, 0.0, 10.0);
        let target = create_vector3(0.0, 0.0, 0.0);
        let up = create_vector3(0.0, 1.0, 0.0);
        set_camera_3d_view_matrix4_from_look_at(&mut camera, &eye, &target, &up);
        let mut expected = create_matrix4();
        set_matrix4_look_at(&mut expected, &eye, &target, &up);
        assert_mat4_close(&camera.view.read().unwrap(), &expected);
    }
}

mod set_camera_3d_view_matrix4_from_matrix4 {
    use super::*;

    #[test]
    fn copies_a_precomputed_view_matrix_into_the_camera_retaining_the_view_handle() {
        let guard = guard_state();
        let mut camera = camera_with(Projection::Perspective(fixed_projection()), 0.1, 100.0);
        let mut view = create_matrix4();
        let eye = create_vector3(3.0, 3.0, 3.0);
        let target = create_vector3(0.0, 0.0, 0.0);
        let up = create_vector3(0.0, 1.0, 0.0);
        set_matrix4_look_at(&mut view, &eye, &target, &up);
        let retained = camera.view.clone();
        set_camera_3d_view_matrix4_from_matrix4(&guard, &mut camera, &view);
        assert!(Arc::ptr_eq(&camera.view, &retained));
        assert_mat4_close(&camera.view.read().unwrap(), &view);
    }
}

mod update_camera_3d_inverse_view_projection {
    use super::*;

    #[test]
    fn refreshes_the_cache_from_the_jittered_projection() {
        let mut camera = camera_with(Projection::Perspective(fixed_projection()), 0.1, 100.0);
        set_camera_3d_jitter(&mut camera, 0.25, -0.5);
        assert!(update_camera_3d_inverse_view_projection(&camera, 1.5));
        let mut view_projection = create_matrix4();
        get_camera_3d_view_projection_matrix4(&mut view_projection, &camera, 1.5);
        let mut expected = create_matrix4();
        inverse_matrix4(&mut expected, &view_projection);
        let cached = camera.inverse_view_projection.read().unwrap();
        assert_mat4_close(&cached, &expected);
    }

    #[test]
    fn leaves_the_last_valid_cache_untouched_for_a_non_invertible_projection() {
        let mut camera = camera_with(Projection::Perspective(fixed_projection()), 0.1, 100.0);
        camera.inverse_view_projection.write().unwrap().m[0] = 42.0;
        camera.near = 1.0;
        camera.far = 1.0;
        assert!(!update_camera_3d_inverse_view_projection(&camera, 1.0));
        assert_eq!(camera.inverse_view_projection.read().unwrap().m[0], 42.0);
    }
}

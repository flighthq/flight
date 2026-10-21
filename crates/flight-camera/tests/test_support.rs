#![allow(dead_code)]

use std::sync::{Arc, RwLock};

use flight_camera::contract::*;
use flight_geometry::{Matrix4, Vector2, Vector3, create_matrix4, create_vector2, create_vector3};

pub(crate) fn guard_state() -> CameraGuardStateRef {
    return Arc::new(RwLock::new(CameraGuardState {
        enabled: false,
        view_guard: None,
        visible_bounds_guard: None,
    }));
}

pub(crate) fn perspective_projection(fov_y: f32, aspect: Option<f32>) -> Projection {
    return Projection::Perspective(create_perspective_projection(
        &PerspectiveProjectionOptions { aspect, fov_y },
    ));
}

pub(crate) fn camera_3d(near: f32, far: f32, fov_y: f32) -> Camera3D {
    return create_camera_3d(&Camera3DOptions {
        far,
        near,
        near_clip_plane: None,
        projection: perspective_projection(fov_y, Some(1.0)),
    });
}

pub(crate) fn camera_2d(options: Option<&Camera2DOptions>) -> Camera2D {
    return create_camera_2d(options);
}

pub(crate) fn look_at(camera: &mut Camera3D, eye: (f32, f32, f32), target: (f32, f32, f32)) {
    let eye = create_vector3(eye.0, eye.1, eye.2);
    let target = create_vector3(target.0, target.1, target.2);
    let up = create_vector3(0.0, 1.0, 0.0);
    set_camera_3d_view_matrix4_from_look_at(camera, &eye, &target, &up);
}

pub(crate) fn zero3() -> Vector3 {
    return create_vector3(0.0, 0.0, 0.0);
}

pub(crate) fn zero2() -> Vector2 {
    return create_vector2(0.0, 0.0);
}

pub(crate) fn identity4() -> Matrix4 {
    return create_matrix4();
}

pub(crate) fn assert_close(actual: f32, expected: f32) {
    assert!(
        (actual - expected).abs() <= 1e-4,
        "expected {expected}, got {actual}"
    );
}

pub(crate) fn assert_close_within(actual: f32, expected: f32, tolerance: f32) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "expected {expected} +/- {tolerance}, got {actual}"
    );
}

pub(crate) fn assert_vec3_close(actual: &Vector3, expected: (f32, f32, f32)) {
    assert_close(actual.x, expected.0);
    assert_close(actual.y, expected.1);
    assert_close(actual.z, expected.2);
}

pub(crate) fn assert_vec2_close(actual: &Vector2, expected: (f32, f32)) {
    assert_close_within(actual.x, expected.0, 1e-3);
    assert_close_within(actual.y, expected.1, 1e-3);
}

pub(crate) fn assert_mat4_close(actual: &Matrix4, expected: &Matrix4) {
    let mut index = 0;
    while index < 16 {
        assert_close_within(actual.m[index], expected.m[index], 1e-4);
        index += 1;
    }
}

pub(crate) fn projection_aspect(projection: &Projection) -> f32 {
    return match projection {
        Projection::Perspective(perspective) => perspective.read().unwrap().aspect,
        _ => -1.0,
    };
}

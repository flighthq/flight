#![allow(dead_code)]

use std::sync::{Arc, RwLock};

use flight_camera::contract::{
    Camera3D, CameraGuardState, CameraGuardStateRef, Projection, create_camera_3d,
    create_perspective_projection,
};
use flight_geometry::Matrix4;

pub(crate) fn guard_state() -> CameraGuardStateRef {
    return Arc::new(RwLock::new(CameraGuardState {
        enabled: false,
        view_guard: None,
        visible_bounds_guard: None,
    }));
}

pub(crate) fn test_camera() -> Camera3D {
    let mut camera = create_camera_3d();
    camera.far = 100.0;
    camera.near = 0.1;
    let projection = create_perspective_projection();
    projection.write().unwrap().fov_y = 1.0;
    camera.projection = Projection::Perspective(projection);
    return camera;
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

pub(crate) fn assert_mat4_close(actual: &Matrix4, expected: &Matrix4) {
    let mut index = 0;
    while index < 16 {
        assert_close_within(actual.m[index], expected.m[index], 1e-4);
        index += 1;
    }
}

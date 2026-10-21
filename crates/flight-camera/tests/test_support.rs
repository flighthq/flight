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
    let projection = create_perspective_projection();
    {
        let mut projection = projection.write().unwrap();
        projection.aspect = aspect.unwrap_or(1.0);
        projection.fov_y = fov_y;
    }
    return Projection::Perspective(projection);
}

pub(crate) fn camera_3d(near: f32, far: f32, fov_y: f32) -> Camera3D {
    let mut camera = create_camera_3d();
    camera.far = far;
    camera.near = near;
    camera.projection = perspective_projection(fov_y, Some(1.0));
    return camera;
}

pub(crate) fn camera_2d(options: Option<&Camera2DOptions>) -> Camera2D {
    let mut camera = create_camera_2d();
    if let Some(values) = options {
        camera.rotation = values.rotation.unwrap_or(0.0);
        camera.x = values.x.unwrap_or(0.0);
        camera.y = values.y.unwrap_or(0.0);
        camera.zoom = values.zoom.unwrap_or(1.0);
    }
    return camera;
}

pub(crate) fn look_at(camera: &mut Camera3D, eye: (f32, f32, f32), target: (f32, f32, f32)) {
    let eye = create_vector3(eye.0, eye.1, eye.2);
    let target = create_vector3(target.0, target.1, target.2);
    let up = create_vector3(0.0, 1.0, 0.0);
    set_camera_3d_view_matrix4_from_look_at(camera, &eye, &target, &up);
}

/// Builds an independent camera with the same observable value state as `source` (the geometry
/// alias-test form: `out` is the original, `source` is this equal-valued snapshot).
pub(crate) fn copy_of_camera(source: &Camera3D) -> Camera3D {
    let mut out = create_camera_3d();
    out.far = source.far;
    out.near = source.near;
    out.near_clip_plane = source.near_clip_plane.clone();
    out.projection = source.projection.clone();
    out.view.write().unwrap().m = source.view.read().unwrap().m;
    let (jitter_x, jitter_y) = {
        let jitter = source.jitter.read().unwrap();
        (jitter.x, jitter.y)
    };
    {
        let mut jitter = out.jitter.write().unwrap();
        jitter.x = jitter_x;
        jitter.y = jitter_y;
    }
    return out;
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

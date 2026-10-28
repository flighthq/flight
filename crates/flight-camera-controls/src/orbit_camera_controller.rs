//! Stateful orbit / arcball camera controller (TS `orbitCameraController.ts`).

use flight_camera::contract::{Camera3D, set_camera_3d_view_matrix4_from_look_at};
use flight_entity::allocate_entity;
use flight_geometry::contract::{create_vector3, initialize_vector3};
use flight_math::{clamp, damp, delta_angle};

use crate::types::*;

/// Allocates an orbit controller (TS `createOrbitCameraController`). Target defaults to the origin,
/// distance to 10, angles to 0, polar limits just inside ±90°, and `smooth_time` to 0 (snap).
// D23: KEEP the optional source seed; construction derives synchronized goals and an owned vector.
pub fn create_orbit_camera_controller(
    options: Option<&OrbitCameraControllerOptions>,
) -> OrbitCameraController {
    let mut out: OrbitCameraController = allocate_entity();
    initialize_orbit_camera_controller(&mut out, options);
    return out;
}

/// Builds an orbit controller under construction; current and goal coordinates start equal (TS
/// `initializeOrbitCameraController`).
pub fn initialize_orbit_camera_controller(
    out: &mut OrbitCameraController,
    options: Option<&OrbitCameraControllerOptions>,
) {
    let azimuth = options.and_then(|values| values.azimuth).unwrap_or(0.0);
    let polar = options.and_then(|values| values.polar).unwrap_or(0.0);
    let distance = options.and_then(|values| values.distance).unwrap_or(10.0);
    let target = options.and_then(|values| values.target.as_ref());
    out.azimuth = azimuth;
    out.distance = distance;
    out.goal_azimuth = azimuth;
    out.goal_distance = distance;
    out.goal_polar = polar;
    out.max_distance = options
        .and_then(|values| values.max_distance)
        .unwrap_or(f32::INFINITY);
    out.max_polar = options
        .and_then(|values| values.max_polar)
        .unwrap_or(DEFAULT_MAX_POLAR);
    out.min_distance = options
        .and_then(|values| values.min_distance)
        .unwrap_or(DEFAULT_MIN_DISTANCE);
    out.min_polar = options
        .and_then(|values| values.min_polar)
        .unwrap_or(DEFAULT_MIN_POLAR);
    out.polar = polar;
    out.smooth_time = options.and_then(|values| values.smooth_time).unwrap_or(0.0);
    initialize_vector3(
        &mut out.target.write().unwrap(),
        target.map(|value| value.x).unwrap_or(0.0),
        target.map(|value| value.y).unwrap_or(0.0),
        target.map(|value| value.z).unwrap_or(0.0),
    );
}

/// Allocates an independent controller with the same value state (TS `cloneOrbitCameraController`).
pub fn clone_orbit_camera_controller(source: &OrbitCameraController) -> OrbitCameraController {
    let mut clone = create_orbit_camera_controller(None);
    copy_orbit_camera_controller(&mut clone, source);
    return clone;
}

/// Copies all controller value state without sharing the target vector (TS
/// `copyOrbitCameraController`). Entity runtime state on `out` is left untouched.
pub fn copy_orbit_camera_controller(
    out: &mut OrbitCameraController,
    source: &OrbitCameraController,
) {
    let (target_x, target_y, target_z) = {
        let target = source.target.read().unwrap();
        (target.x, target.y, target.z)
    };
    out.azimuth = source.azimuth;
    out.distance = source.distance;
    out.goal_azimuth = source.goal_azimuth;
    out.goal_distance = source.goal_distance;
    out.goal_polar = source.goal_polar;
    out.max_distance = source.max_distance;
    out.max_polar = source.max_polar;
    out.min_distance = source.min_distance;
    out.min_polar = source.min_polar;
    out.polar = source.polar;
    out.smooth_time = source.smooth_time;
    {
        let mut target = out.target.write().unwrap();
        target.x = target_x;
        target.y = target_y;
        target.z = target_z;
    }
}

/// Moves the goal distance by `delta_distance`, clamped to the configured range (TS
/// `dollyOrbitCameraController`). Negative moves the eye toward the target.
pub fn dolly_orbit_camera_controller(controller: &mut OrbitCameraController, delta_distance: f32) {
    controller.goal_distance = clamp(
        controller.goal_distance + delta_distance,
        controller.min_distance,
        controller.max_distance,
    );
}

/// Slides the orbit target in a world-up plane at the current goal azimuth (TS
/// `panOrbitCameraController`). All inputs are read before any write.
pub fn pan_orbit_camera_controller(
    controller: &mut OrbitCameraController,
    delta_right: f32,
    delta_up: f32,
) {
    let cos_azimuth = controller.goal_azimuth.cos();
    let sin_azimuth = controller.goal_azimuth.sin();
    let mut target = controller.target.write().unwrap();
    target.x += cos_azimuth * delta_right;
    target.y += delta_up;
    target.z += -sin_azimuth * delta_right;
}

/// Slides the orbit target in the actual view plane, following screen-up at the goal polar angle (TS
/// `panOrbitCameraControllerInViewPlane`).
pub fn pan_orbit_camera_controller_in_view_plane(
    controller: &mut OrbitCameraController,
    delta_right: f32,
    delta_up: f32,
) {
    let cos_azimuth = controller.goal_azimuth.cos();
    let sin_azimuth = controller.goal_azimuth.sin();
    let cos_polar = controller.goal_polar.cos();
    let sin_polar = controller.goal_polar.sin();
    let mut target = controller.target.write().unwrap();
    target.x += cos_azimuth * delta_right - sin_azimuth * sin_polar * delta_up;
    target.y += cos_polar * delta_up;
    target.z += -sin_azimuth * delta_right - cos_azimuth * sin_polar * delta_up;
}

/// Restores constructor defaults or the supplied seed, synchronizing current and goal spherical
/// coordinates (TS `resetOrbitCameraController`). The existing target vector is retained.
pub fn reset_orbit_camera_controller(
    controller: &mut OrbitCameraController,
    options: Option<&OrbitCameraControllerOptions>,
) {
    let azimuth = options.and_then(|values| values.azimuth).unwrap_or(0.0);
    let polar = options.and_then(|values| values.polar).unwrap_or(0.0);
    let distance = options.and_then(|values| values.distance).unwrap_or(10.0);
    let target = options.and_then(|values| values.target.as_ref());
    controller.azimuth = azimuth;
    controller.distance = distance;
    controller.goal_azimuth = azimuth;
    controller.goal_distance = distance;
    controller.goal_polar = polar;
    controller.max_distance = options
        .and_then(|values| values.max_distance)
        .unwrap_or(f32::INFINITY);
    controller.max_polar = options
        .and_then(|values| values.max_polar)
        .unwrap_or(DEFAULT_MAX_POLAR);
    controller.min_distance = options
        .and_then(|values| values.min_distance)
        .unwrap_or(DEFAULT_MIN_DISTANCE);
    controller.min_polar = options
        .and_then(|values| values.min_polar)
        .unwrap_or(DEFAULT_MIN_POLAR);
    controller.polar = polar;
    controller.smooth_time = options.and_then(|values| values.smooth_time).unwrap_or(0.0);
    {
        let mut target_value = controller.target.write().unwrap();
        target_value.x = target.map(|value| value.x).unwrap_or(0.0);
        target_value.y = target.map(|value| value.y).unwrap_or(0.0);
        target_value.z = target.map(|value| value.z).unwrap_or(0.0);
    }
}

/// Moves the goal orbit angles: azimuth is unbounded, polar is clamped to the configured limits (TS
/// `rotateOrbitCameraController`).
pub fn rotate_orbit_camera_controller(
    controller: &mut OrbitCameraController,
    delta_azimuth: f32,
    delta_polar: f32,
) {
    controller.goal_azimuth += delta_azimuth;
    controller.goal_polar = clamp(
        controller.goal_polar + delta_polar,
        controller.min_polar,
        controller.max_polar,
    );
}

/// Snaps current spherical state to the clamped goal without writing a camera (TS
/// `snapOrbitCameraController`).
pub fn snap_orbit_camera_controller(controller: &mut OrbitCameraController) {
    controller.azimuth = controller.goal_azimuth;
    controller.distance = clamp(
        controller.goal_distance,
        controller.min_distance,
        controller.max_distance,
    );
    controller.polar = clamp(
        controller.goal_polar,
        controller.min_polar,
        controller.max_polar,
    );
}

/// Advances the controller one step and writes the resulting look-at view into `camera` (TS
/// `updateOrbitCameraController`). `smoothTime` <= 0 or `deltaTime` <= 0 snaps.
pub fn update_orbit_camera_controller(
    controller: &mut OrbitCameraController,
    camera: &mut Camera3D,
    delta_time: f32,
) {
    let goal_polar = clamp(
        controller.goal_polar,
        controller.min_polar,
        controller.max_polar,
    );
    let goal_distance = clamp(
        controller.goal_distance,
        controller.min_distance,
        controller.max_distance,
    );
    if controller.smooth_time > 0.0 && delta_time > 0.0 {
        let lambda = 1.0 / controller.smooth_time;
        let nearest_goal_azimuth =
            controller.azimuth + delta_angle(controller.azimuth, controller.goal_azimuth);
        controller.azimuth = damp(controller.azimuth, nearest_goal_azimuth, lambda, delta_time);
        controller.polar = damp(controller.polar, goal_polar, lambda, delta_time);
        controller.distance = damp(controller.distance, goal_distance, lambda, delta_time);
    } else {
        controller.azimuth = controller.goal_azimuth;
        controller.polar = goal_polar;
        controller.distance = goal_distance;
    }
    let cos_polar = controller.polar.cos();
    let sin_polar = controller.polar.sin();
    let cos_azimuth = controller.azimuth.cos();
    let sin_azimuth = controller.azimuth.sin();
    let target = controller.target.read().unwrap();
    let eye = create_vector3(
        target.x + controller.distance * sin_azimuth * cos_polar,
        target.y + controller.distance * sin_polar,
        target.z + controller.distance * cos_azimuth * cos_polar,
    );
    let world_up = create_vector3(0.0, 1.0, 0.0);
    set_camera_3d_view_matrix4_from_look_at(camera, &eye, &target, &world_up);
}

const DEFAULT_MAX_POLAR: f32 = std::f32::consts::FRAC_PI_2 - 0.01;
const DEFAULT_MIN_DISTANCE: f32 = 0.01;
const DEFAULT_MIN_POLAR: f32 = -std::f32::consts::FRAC_PI_2 + 0.01;

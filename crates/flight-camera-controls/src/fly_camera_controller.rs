//! Stateful fly / first-person camera controller (TS `flyCameraController.ts`).

use flight_camera::contract::{Camera3D, set_camera_3d_view_matrix4_from_look_at};
use flight_entity::allocate_entity;
use flight_geometry::{create_vector3, initialize_vector3};
use flight_math::{clamp, damp, delta_angle};

use crate::types::*;

/// Allocates a fly controller (TS `createFlyCameraController`). `position` defaults to the origin,
/// angles to 0 (looking down -Z), pitch limits just inside ±90°, and `smooth_time` to 0 (snap).
// D23: KEEP the optional source seed; construction derives synchronized goals and an owned vector.
pub fn create_fly_camera_controller(
    options: Option<&FlyCameraControllerOptions>,
) -> FlyCameraController {
    let mut out: FlyCameraController = allocate_entity();
    initialize_fly_camera_controller(&mut out, options);
    return out;
}

/// Builds a fly controller under construction; current and goal angles start equal (TS
/// `initializeFlyCameraController`).
pub fn initialize_fly_camera_controller(
    out: &mut FlyCameraController,
    options: Option<&FlyCameraControllerOptions>,
) {
    let yaw = options.and_then(|values| values.yaw).unwrap_or(0.0);
    let pitch = options.and_then(|values| values.pitch).unwrap_or(0.0);
    let position = options.and_then(|values| values.position.as_ref());
    out.goal_pitch = pitch;
    out.goal_yaw = yaw;
    out.max_pitch = options
        .and_then(|values| values.max_pitch)
        .unwrap_or(DEFAULT_MAX_PITCH);
    out.min_pitch = options
        .and_then(|values| values.min_pitch)
        .unwrap_or(DEFAULT_MIN_PITCH);
    out.pitch = pitch;
    initialize_vector3(
        &mut out.position.write().unwrap(),
        position.map(|value| value.x).unwrap_or(0.0),
        position.map(|value| value.y).unwrap_or(0.0),
        position.map(|value| value.z).unwrap_or(0.0),
    );
    out.smooth_time = options.and_then(|values| values.smooth_time).unwrap_or(0.0);
    out.yaw = yaw;
}

/// Allocates an independent controller with the same value state (TS `cloneFlyCameraController`).
pub fn clone_fly_camera_controller(source: &FlyCameraController) -> FlyCameraController {
    let mut clone = create_fly_camera_controller(None);
    copy_fly_camera_controller(&mut clone, source);
    return clone;
}

/// Copies all controller value state without sharing the position vector (TS
/// `copyFlyCameraController`). Entity runtime state on `out` is left untouched.
pub fn copy_fly_camera_controller(out: &mut FlyCameraController, source: &FlyCameraController) {
    let (position_x, position_y, position_z) = {
        let position = source.position.read().unwrap();
        (position.x, position.y, position.z)
    };
    out.goal_pitch = source.goal_pitch;
    out.goal_yaw = source.goal_yaw;
    out.max_pitch = source.max_pitch;
    out.min_pitch = source.min_pitch;
    out.pitch = source.pitch;
    {
        let mut position = out.position.write().unwrap();
        position.x = position_x;
        position.y = position_y;
        position.z = position_z;
    }
    out.smooth_time = source.smooth_time;
    out.yaw = source.yaw;
}

/// Moves the goal look angles: yaw is unbounded, pitch is clamped to the controller limits (TS
/// `lookFlyCameraController`).
pub fn look_fly_camera_controller(
    controller: &mut FlyCameraController,
    delta_yaw: f32,
    delta_pitch: f32,
) {
    controller.goal_yaw += delta_yaw;
    controller.goal_pitch = clamp(
        controller.goal_pitch + delta_pitch,
        controller.min_pitch,
        controller.max_pitch,
    );
}

/// Translates `position` along the horizontal heading at the current yaw (TS
/// `moveFlyCameraController`). All inputs are read before any write.
pub fn move_fly_camera_controller(
    controller: &mut FlyCameraController,
    forward: f32,
    right: f32,
    up: f32,
) {
    let sin_yaw = controller.yaw.sin();
    let cos_yaw = controller.yaw.cos();
    let mut position = controller.position.write().unwrap();
    position.x += sin_yaw * forward + cos_yaw * right;
    position.y += up;
    position.z += -cos_yaw * forward + sin_yaw * right;
}

/// Restores constructor defaults or the supplied seed, synchronizing current and goal angles (TS
/// `resetFlyCameraController`). The existing position vector is retained.
pub fn reset_fly_camera_controller(
    controller: &mut FlyCameraController,
    options: Option<&FlyCameraControllerOptions>,
) {
    let yaw = options.and_then(|values| values.yaw).unwrap_or(0.0);
    let pitch = options.and_then(|values| values.pitch).unwrap_or(0.0);
    let position = options.and_then(|values| values.position.as_ref());
    controller.goal_pitch = pitch;
    controller.goal_yaw = yaw;
    controller.max_pitch = options
        .and_then(|values| values.max_pitch)
        .unwrap_or(DEFAULT_MAX_PITCH);
    controller.min_pitch = options
        .and_then(|values| values.min_pitch)
        .unwrap_or(DEFAULT_MIN_PITCH);
    controller.pitch = pitch;
    {
        let mut target = controller.position.write().unwrap();
        target.x = position.map(|value| value.x).unwrap_or(0.0);
        target.y = position.map(|value| value.y).unwrap_or(0.0);
        target.z = position.map(|value| value.z).unwrap_or(0.0);
    }
    controller.smooth_time = options.and_then(|values| values.smooth_time).unwrap_or(0.0);
    controller.yaw = yaw;
}

/// Snaps current look state to the clamped goal without writing a camera (TS
/// `snapFlyCameraController`).
pub fn snap_fly_camera_controller(controller: &mut FlyCameraController) {
    controller.pitch = clamp(
        controller.goal_pitch,
        controller.min_pitch,
        controller.max_pitch,
    );
    controller.yaw = controller.goal_yaw;
}

/// Advances the controller one step and writes the resulting look-at view into `camera` (TS
/// `updateFlyCameraController`). `smoothTime` <= 0 or `deltaTime` <= 0 snaps.
pub fn update_fly_camera_controller(
    controller: &mut FlyCameraController,
    camera: &mut Camera3D,
    delta_time: f32,
) {
    let goal_pitch = clamp(
        controller.goal_pitch,
        controller.min_pitch,
        controller.max_pitch,
    );
    if controller.smooth_time > 0.0 && delta_time > 0.0 {
        let lambda = 1.0 / controller.smooth_time;
        let nearest_goal_yaw = controller.yaw + delta_angle(controller.yaw, controller.goal_yaw);
        controller.yaw = damp(controller.yaw, nearest_goal_yaw, lambda, delta_time);
        controller.pitch = damp(controller.pitch, goal_pitch, lambda, delta_time);
    } else {
        controller.yaw = controller.goal_yaw;
        controller.pitch = goal_pitch;
    }
    let cos_pitch = controller.pitch.cos();
    let sin_pitch = controller.pitch.sin();
    let cos_yaw = controller.yaw.cos();
    let sin_yaw = controller.yaw.sin();
    let position = controller.position.read().unwrap();
    let target = create_vector3(
        position.x + sin_yaw * cos_pitch,
        position.y + sin_pitch,
        position.z - cos_yaw * cos_pitch,
    );
    let world_up = create_vector3(0.0, 1.0, 0.0);
    set_camera_3d_view_matrix4_from_look_at(camera, &position, &target, &world_up);
}

const DEFAULT_MAX_PITCH: f32 = std::f32::consts::FRAC_PI_2 - 0.01;
const DEFAULT_MIN_PITCH: f32 = -std::f32::consts::FRAC_PI_2 + 0.01;

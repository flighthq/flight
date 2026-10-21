//! 2D camera target following with a deadzone, damping and world-bounds clamping (TS `follow.ts`).

use flight_camera::contract::{
    Camera2D, Camera2DFollowOptions, CameraGuardStateRef, get_camera_2d_visible_bounds,
};
use flight_geometry::create_rectangle;
use flight_math::{clamp, damp};

/// Moves the camera toward a follow target for one step, mutating `camera` in place (TS
/// `updateCamera2DFollow`): a deadzone box yields the goal, `smoothTime` damps toward it, and
/// `world_bounds` clamps the visible rectangle inside the level (centering on any axis where the
/// level is smaller than the view). Camera inputs are read before any write.
// flight-lint: allow(conform-params) D5: caller-owned CameraGuardState is threaded to the camera visible-bounds query, which reports through that explicit state
pub fn update_camera_2d_follow(
    guard_state: &CameraGuardStateRef,
    camera: &mut Camera2D,
    viewport_width: f32,
    viewport_height: f32,
    target_x: f32,
    target_y: f32,
    delta_time: f32,
    options: Option<&Camera2DFollowOptions>,
) {
    let camera_x = camera.x;
    let camera_y = camera.y;
    let deadzone_half_width = options
        .and_then(|values| values.deadzone_half_width)
        .unwrap_or(0.0);
    let deadzone_half_height = options
        .and_then(|values| values.deadzone_half_height)
        .unwrap_or(0.0);
    let smooth_time = options.and_then(|values| values.smooth_time).unwrap_or(0.0);
    let world_bounds = options.and_then(|values| values.world_bounds.clone());

    let dx = target_x - camera_x;
    let mut goal_x = camera_x;
    if dx > deadzone_half_width {
        goal_x = target_x - deadzone_half_width;
    } else if dx < -deadzone_half_width {
        goal_x = target_x + deadzone_half_width;
    }
    let dy = target_y - camera_y;
    let mut goal_y = camera_y;
    if dy > deadzone_half_height {
        goal_y = target_y - deadzone_half_height;
    } else if dy < -deadzone_half_height {
        goal_y = target_y + deadzone_half_height;
    }

    let mut next_x;
    let mut next_y;
    if smooth_time > 0.0 && delta_time > 0.0 {
        let lambda = 1.0 / smooth_time;
        next_x = damp(camera_x, goal_x, lambda, delta_time);
        next_y = damp(camera_y, goal_y, lambda, delta_time);
    } else {
        next_x = goal_x;
        next_y = goal_y;
    }

    if let Some(bounds_handle) = world_bounds {
        let bounds = bounds_handle.read().unwrap();
        let mut visible = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_camera_2d_visible_bounds(
            guard_state,
            camera,
            viewport_width,
            viewport_height,
            &mut visible,
        );
        let half_visible_width = visible.width * 0.5;
        let half_visible_height = visible.height * 0.5;
        if bounds.width <= visible.width {
            next_x = bounds.x + bounds.width * 0.5;
        } else {
            next_x = clamp(
                next_x,
                bounds.x + half_visible_width,
                bounds.x + bounds.width - half_visible_width,
            );
        }
        if bounds.height <= visible.height {
            next_y = bounds.y + bounds.height * 0.5;
        } else {
            next_y = clamp(
                next_y,
                bounds.y + half_visible_height,
                bounds.y + bounds.height - half_visible_height,
            );
        }
    }

    camera.x = next_x;
    camera.y = next_y;
}

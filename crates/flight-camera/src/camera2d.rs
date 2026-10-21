//! The plain-data 2D camera lifecycle (TS `camera2d.ts`).

use flight_entity::allocate_entity;

use crate::types::*;

/// Allocates a 2D camera centered on the world origin at zoom 1 with no rotation (TS
/// `createCamera2D`); `options` overrides any of `x`, `y`, `zoom`, `rotation`.
pub fn create_camera_2d(options: Option<&Camera2DOptions>) -> Camera2D {
    let mut out: Camera2D = allocate_entity();
    initialize_camera_2d(&mut out, options);
    return out;
}

/// Builds a 2D camera under construction, applying the source's identity defaults (TS
/// `initializeCamera2D`).
// flight-lint: allow(conform-extra) D12: Camera2D extends Entity; the pinned TS index.ts exports no initializeCamera2D
pub fn initialize_camera_2d(out: &mut Camera2D, options: Option<&Camera2DOptions>) {
    out.rotation = options.and_then(|values| values.rotation).unwrap_or(0.0);
    out.x = options.and_then(|values| values.x).unwrap_or(0.0);
    out.y = options.and_then(|values| values.y).unwrap_or(0.0);
    out.zoom = options.and_then(|values| values.zoom).unwrap_or(1.0);
}

/// Centers the camera on a world position (TS `setCamera2DLookAt`).
pub fn set_camera_2d_look_at(camera: &mut Camera2D, x: f32, y: f32) {
    camera.x = x;
    camera.y = y;
}

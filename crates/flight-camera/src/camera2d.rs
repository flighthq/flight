//! The plain-data 2D camera lifecycle (TS `camera2d.ts`).

use flight_entity::allocate_entity;

use crate::types::*;

/// Allocates a 2D camera centered on the world origin at zoom 1 with no rotation (TS
/// `createCamera2D`). Assign non-default fields after construction.
// flight-lint: allow(conform-params) D23 (B) zero-field create: assign camera fields after create
pub fn create_camera_2d() -> Camera2D {
    let mut out: Camera2D = allocate_entity();
    initialize_camera_2d(&mut out);
    return out;
}

/// Builds a 2D camera under construction, applying the source's identity defaults (TS
/// `initializeCamera2D`).
// flight-lint: allow(conform-extra, conform-params) D12/D23: Entity initializer is receiver-only; pinned TS index omits it
pub fn initialize_camera_2d(out: &mut Camera2D) {
    out.rotation = 0.0;
    out.x = 0.0;
    out.y = 0.0;
    out.zoom = 1.0;
}

/// Centers the camera on a world position (TS `setCamera2DLookAt`).
pub fn set_camera_2d_look_at(camera: &mut Camera2D, x: f32, y: f32) {
    camera.x = x;
    camera.y = y;
}

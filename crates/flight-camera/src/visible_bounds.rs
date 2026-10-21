//! The 2D camera's visible world rectangle and its degenerate-zoom guard (TS `visibleBounds.ts`).

use flight_geometry::{Rectangle, create_matrix, inverse_matrix, matrix_transform_bounds};

use crate::types::*;
use crate::view_matrix::get_camera_2d_view_matrix;

/// Finite extremes rather than infinities: with an infinite origin and extent, `x + width` is NaN.
const UNBOUNDED_EXTENT: f32 = f32::MAX;
const UNBOUNDED_ORIGIN: f32 = -f32::MAX / 2.0;

/// Writes the axis-aligned world rectangle the viewport currently covers into `out` (TS
/// `getCamera2DVisibleBounds`). A zero zoom makes the view matrix singular; the failure is handled
/// here by reporting an unbounded rectangle (fail toward drawing) and invoking the caller-owned
/// guard hook when installed.
// flight-lint: allow(conform-params) D5: caller-owned CameraGuardState replaces the source module-level guard hook
pub fn get_camera_2d_visible_bounds(
    guard_state: &CameraGuardStateRef,
    camera: &Camera2D,
    viewport_width: f32,
    viewport_height: f32,
    out: &mut Rectangle,
) {
    let mut matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    get_camera_2d_view_matrix(camera, viewport_width, viewport_height, &mut matrix);
    let mut inverse = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    if !inverse_matrix(&mut inverse, &matrix) {
        out.x = UNBOUNDED_ORIGIN;
        out.y = UNBOUNDED_ORIGIN;
        out.width = UNBOUNDED_EXTENT;
        out.height = UNBOUNDED_EXTENT;
        let guard = {
            let current = guard_state.read().unwrap();
            current.visible_bounds_guard.clone()
        };
        if let Some(guard) = guard {
            guard(camera);
        }
        return;
    }
    matrix_transform_bounds(out, &inverse, 0.0, 0.0, viewport_width, viewport_height);
}

/// Installs or removes the caller-owned degenerate-visible-bounds hook (TS
/// `setCamera2DVisibleBoundsGuard`).
// flight-lint: allow(conform-params) D5: caller-owned CameraGuardState replaces the source module-level guard hook
pub fn set_camera_2d_visible_bounds_guard(
    guard_state: &CameraGuardStateRef,
    guard: Option<Camera2DVisibleBoundsGuard>,
) {
    guard_state.write().unwrap().visible_bounds_guard = guard;
}

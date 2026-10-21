//! Zoom-to-cursor for the 2D camera (TS `zoom.ts`).

use flight_geometry::create_vector2;

use crate::projection2d::unproject_camera_2d_point;
use crate::types::*;

/// Sets the camera's `zoom` while keeping the world point currently under `(screen_x, screen_y)`
/// fixed on screen (TS `zoomCamera2DAtScreenPoint`).
pub fn zoom_camera_2d_at_screen_point(
    camera: &mut Camera2D,
    viewport_width: f32,
    viewport_height: f32,
    screen_x: f32,
    screen_y: f32,
    zoom: f32,
) {
    let mut before = create_vector2(0.0, 0.0);
    unproject_camera_2d_point(
        camera,
        viewport_width,
        viewport_height,
        screen_x,
        screen_y,
        &mut before,
    );
    camera.zoom = zoom;
    let mut after = create_vector2(0.0, 0.0);
    unproject_camera_2d_point(
        camera,
        viewport_width,
        viewport_height,
        screen_x,
        screen_y,
        &mut after,
    );
    camera.x += before.x - after.x;
    camera.y += before.y - after.y;
}

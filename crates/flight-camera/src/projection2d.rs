//! 2D camera point projection and unprojection (TS `projection2d.ts`).

use flight_geometry::{
    Vector2, create_matrix, inverse_matrix_transform_point_xy, matrix_transform_point_xy,
};

use crate::types::*;
use crate::view_matrix::get_camera_2d_view_matrix;

/// Projects a world point to its screen position through the camera's view matrix and writes the
/// result to `out` (TS `projectCamera2DPoint`). The inverse is `unproject_camera_2d_point`.
pub fn project_camera_2d_point(
    camera: &Camera2D,
    viewport_width: f32,
    viewport_height: f32,
    world_x: f32,
    world_y: f32,
    out: &mut Vector2,
) {
    let mut matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    get_camera_2d_view_matrix(camera, viewport_width, viewport_height, &mut matrix);
    matrix_transform_point_xy(out, &matrix, world_x, world_y);
}

/// Unprojects a screen point back to the world point that renders there and writes it to `out`
/// (TS `unprojectCamera2DPoint`). Uses the exact inverse of `project_camera_2d_point`.
pub fn unproject_camera_2d_point(
    camera: &Camera2D,
    viewport_width: f32,
    viewport_height: f32,
    screen_x: f32,
    screen_y: f32,
    out: &mut Vector2,
) {
    let mut matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    get_camera_2d_view_matrix(camera, viewport_width, viewport_height, &mut matrix);
    inverse_matrix_transform_point_xy(out, &matrix, screen_x, screen_y);
}

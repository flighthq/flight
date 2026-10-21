//! 2D parallax-layer scroll offsets (TS `parallax.ts`).

use flight_geometry::{Vector2, create_matrix};

use crate::types::*;
use crate::view_matrix::get_camera_2d_view_matrix;

/// Writes the screen-space scroll offset for a parallax layer at depth `factor` into `out` (TS
/// `getCamera2DParallaxPoint`). Factor 0 is screen-locked; factor 1 moves exactly like the world.
pub fn get_camera_2d_parallax_point(
    camera: &Camera2D,
    viewport_width: f32,
    viewport_height: f32,
    factor: f32,
    out: &mut Vector2,
) {
    let mut matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    get_camera_2d_view_matrix(camera, viewport_width, viewport_height, &mut matrix);
    out.x = (matrix.tx - viewport_width * 0.5) * factor;
    out.y = (matrix.ty - viewport_height * 0.5) * factor;
}

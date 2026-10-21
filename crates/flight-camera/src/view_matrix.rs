//! The 2D camera world-to-screen affine (TS `viewMatrix.ts`).

use flight_geometry::{Matrix, set_transform_matrix, translate_matrix_by_vector_xy};

use crate::types::*;

/// Writes the camera's world-to-screen affine into `out` (TS `getCamera2DViewMatrix`):
///
///   screen = translate(viewportCenter) * rotate(-rotation) * scale(zoom) * translate(-x, -y) * world
///
/// Alias-safe: `out` may be any matrix, including one used as scratch elsewhere.
pub fn get_camera_2d_view_matrix(
    camera: &Camera2D,
    viewport_width: f32,
    viewport_height: f32,
    out: &mut Matrix,
) {
    set_transform_matrix(
        out,
        camera.zoom,
        camera.zoom,
        -camera.rotation,
        viewport_width * 0.5,
        viewport_height * 0.5,
    );
    let mut linear = flight_geometry::create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    linear.a = out.a;
    linear.b = out.b;
    linear.c = out.c;
    linear.d = out.d;
    linear.tx = out.tx;
    linear.ty = out.ty;
    translate_matrix_by_vector_xy(out, &linear, -camera.x, -camera.y);
}

//! GL color-transform material — per-node color-transform material renderer.

use crate::sprite_batch::submit_gl_node_atlas_quad;
use flighthq_render_gl::GlRenderState;

/// Draws a render proxy that carries a `ColorTransformMaterial`, submitting it
/// into the sprite batch under its color-transform material so the instanced
/// color-transform shader (registered via `register_gl_color_transform_shader`)
/// tints each node independently.
pub fn draw_gl_color_transform_material(state: &mut GlRenderState, render_proxy_id: u64) {
    submit_gl_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

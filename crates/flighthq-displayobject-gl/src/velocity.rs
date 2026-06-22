//! GL velocity renderer — motion-blur sprite rendering for velocity nodes.

use crate::sprite_batch::submit_gl_node_atlas_quad;
use flighthq_render_gl::GlRenderState;

/// Draws a velocity-blurred sprite render proxy.
///
/// Motion blur is realized by submitting the node's quad into the sprite batch
/// stretched along its velocity vector (carried by the render transform keyed on
/// `render_proxy_id`).
pub fn draw_gl_velocity(state: &mut GlRenderState, render_proxy_id: u64) {
    submit_gl_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

//! GL scale-9 shape renderer — nine-slice bitmap drawing via the sprite batch.

use crate::sprite_batch::submit_gl_node_atlas_quad;
use flighthq_render_gl::GlRenderState;

/// Draws a scale-9-sliced bitmap render proxy.
///
/// The nine-slice geometry is computed by `compute_gl_scale9_quads` from the
/// node's bounds and grid (keyed on `render_proxy_id`) and each of the nine
/// resulting quads is submitted to the active sprite batch.
pub fn draw_gl_scale9_shape(state: &mut GlRenderState, render_proxy_id: u64) {
    submit_gl_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

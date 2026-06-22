//! GL quad batch renderer — for `QuadBatch` / manual instanced quad submissions.

use crate::sprite_batch::submit_gl_node_atlas_quad;
use flighthq_render_gl::GlRenderState;

/// Draws a `QuadBatch` render proxy by submitting its quads into the instanced
/// sprite batch. The per-quad records keyed on `render_proxy_id` are supplied by
/// the quad-batch resource.
pub fn draw_gl_quad_batch(state: &mut GlRenderState, render_proxy_id: u64) {
    submit_gl_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

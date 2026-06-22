//! GL sprite node helper — thin wrapper called by the sprite renderer.

use crate::sprite_batch::submit_gl_node_atlas_quad;
use flighthq_render_gl::GlRenderState;

/// Submits a single `Sprite` atlas-quad instance into the active sprite batch.
pub fn submit_gl_sprite(state: &mut GlRenderState, render_proxy_id: u64) {
    submit_gl_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

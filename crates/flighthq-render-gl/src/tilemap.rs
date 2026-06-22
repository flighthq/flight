//! GL tilemap renderer — renders `Tilemap` nodes via the sprite batch.

use crate::render_state::GlRenderState;
use crate::sprite_batch::submit_gl_node_atlas_quad;

/// Draws a `Tilemap` render proxy: each tile is submitted as an instanced quad
/// into the active sprite batch. The tile decomposition (one instance per tile)
/// is driven by the tilemap resource keyed on `render_proxy_id`.
pub fn draw_gl_tilemap(state: &mut GlRenderState, render_proxy_id: u64) {
    submit_gl_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

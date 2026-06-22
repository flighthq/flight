//! wgpu quad batch renderer — for `QuadBatch` / manual instanced quad submissions.

use crate::render_state::WgpuRenderState;
use crate::sprite_batch::submit_wgpu_node_atlas_quad;

/// Default wgpu renderer for `QuadBatch` nodes. Submits all quads into the
/// instanced sprite batch.
pub struct DefaultWgpuQuadBatchRenderer;

/// Draws a `QuadBatch` render proxy by submitting all quads into the instanced
/// sprite batch. The per-quad records keyed on `render_proxy_id` are supplied by
/// the quad-batch resource.
pub fn draw_wgpu_quad_batch(state: &mut WgpuRenderState, render_proxy_id: u64) {
    submit_wgpu_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

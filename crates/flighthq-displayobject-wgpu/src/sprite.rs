//! wgpu sprite node helper — thin wrapper called by the sprite renderer.

use crate::sprite_batch::submit_wgpu_node_atlas_quad;
use flighthq_render_wgpu::WgpuRenderState;

/// Submits a single `Sprite` atlas-quad instance into the active sprite batch.
pub fn render_wgpu_sprite(state: &mut WgpuRenderState, render_proxy_id: u64) {
    submit_wgpu_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

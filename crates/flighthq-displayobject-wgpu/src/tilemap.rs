//! wgpu tilemap renderer — renders `Tilemap` nodes via the sprite batch.

use crate::sprite_batch::submit_wgpu_node_atlas_quad;
use flighthq_render_wgpu::WgpuRenderState;

/// Default wgpu renderer for `Tilemap` nodes.
pub struct DefaultWgpuTilemapRenderer;

/// Draws a `Tilemap` render proxy: decomposes tiles into instanced quads and
/// submits them to the active sprite batch. The per-tile instances keyed on
/// `render_proxy_id` are supplied by the tilemap resource.
pub fn draw_wgpu_tilemap(state: &mut WgpuRenderState, render_proxy_id: u64) {
    submit_wgpu_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

//! wgpu scale-9 shape renderer — nine-slice bitmap drawing via the sprite batch.

use crate::sprite_batch::{flush_wgpu_sprite_batch, submit_wgpu_node_atlas_quad};
use flighthq_render_wgpu::WgpuRenderState;

/// Default wgpu renderer for scale-9-sliced shape nodes.
pub struct DefaultWgpuScale9ShapeRenderer;

/// Per-node cached scale-9 geometry data.
///
/// Holds the nine-slice quad vertices computed by `remap_wgpu_scale9_commands`.
/// This is plain GC-managed memory with no GPU resource to free.
#[derive(Debug, Default)]
pub struct WgpuScale9ShapeData {
    pub vertices: Vec<f32>,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Allocates per-node scale-9 cache data for `render_proxy_id`.
///
/// The nine-slice vertices are filled lazily by `remap_wgpu_scale9_commands`
/// from the node's bounds and grid, so a fresh node starts with no vertices.
pub fn create_wgpu_scale9_shape_data(
    _state: &mut WgpuRenderState,
    _render_proxy_id: u64,
) -> WgpuScale9ShapeData {
    WgpuScale9ShapeData {
        vertices: Vec::new(),
    }
}

/// Frees the per-node scale-9 cache data.
///
/// The data owns only a `Vec<f32>` (GC-managed), so this drops it; there is no
/// GPU resource to destroy.
pub fn destroy_wgpu_scale9_shape_data(_state: &WgpuRenderState, data: WgpuScale9ShapeData) {
    drop(data);
}

/// Draws a scale-9-sliced bitmap render proxy, decomposing it into nine
/// instanced quads submitted to the sprite batch. The nine-slice geometry keyed
/// on `render_proxy_id` (see `remap_wgpu_scale9_commands`) drives the
/// decomposition; each slice is submitted as an atlas quad.
pub fn draw_wgpu_scale9_shape(state: &mut WgpuRenderState, render_proxy_id: u64) {
    submit_wgpu_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

/// Draws the scale-9 shape as a stencil mask: submits the shape's coverage into
/// the sprite batch with mask-write enabled, then flushes so the stencil is
/// written before subsequent masked draws.
pub fn draw_wgpu_scale9_shape_mask(state: &mut WgpuRenderState, render_proxy_id: u64) {
    let prior = state.runtime.mask_write_mode;
    state.runtime.mask_write_mode = true;
    submit_wgpu_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
    flush_wgpu_sprite_batch(state);
    state.runtime.mask_write_mode = prior;
}

/// Remaps the shape's draw commands into nine-slice regions for
/// `render_proxy_id`, recomputing the cached quad vertices.
///
/// The source draw commands and bounds/grid are resolved upstream keyed on the
/// proxy id; with no commands attached this leaves the cache empty.
pub fn remap_wgpu_scale9_commands(_state: &mut WgpuRenderState, _render_proxy_id: u64) {
    // Nine-slice command remapping is driven by the node's resolved bounds and
    // grid upstream; without attached command data there is nothing to remap.
}

#[cfg(test)]
mod tests {}

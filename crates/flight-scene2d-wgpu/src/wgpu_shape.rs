// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over render-wgpu state
//! The hybrid shape strategy (TS `wgpuShape.ts`): tessellates what it can and rasterizes the rest.
//! The GPU mesh path is tried first; a shape with a fill that has no tessellated form falls through
//! to the canvas replay. Both halves cache into the same per-node renderer data.

use flight_render::{BatchFormat, NodeRenderer, RenderProxy2D};
use flight_render_wgpu::WgpuRenderState;

use crate::wgpu_mesh_shape_renderer::draw_wgpu_mesh_shape;
use crate::wgpu_raster_shape_renderer::draw_wgpu_raster_shape;
use crate::wgpu_shape_data::{create_wgpu_shape_data, destroy_wgpu_shape_data};

/// The general-purpose shape strategy (TS `wgpuShapeRenderer`), the right default for an app that
/// does not want to reason about which fills tessellate. Register the mesh or raster renderer
/// instead to pin the strategy.
pub static WGPU_SHAPE_RENDERER: NodeRenderer<WgpuRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_wgpu_shape_data,
    destroy_data: Some(destroy_wgpu_shape_data),
    is_dirty: None,
    submit: draw_wgpu_shape,
};

/// MorphShape owns a distinct kind while sharing Shape's mesh/raster renderer and cache lifecycle
/// (TS `wgpuMorphShapeRenderer`).
pub static WGPU_MORPH_SHAPE_RENDERER: &NodeRenderer<WgpuRenderState> = &WGPU_SHAPE_RENDERER;

/// Draws a shape through the mesh path, falling through to the raster path for fills with no
/// tessellated form (TS `drawWgpuShape`).
pub fn draw_wgpu_shape(state: &mut WgpuRenderState, render_proxy: &RenderProxy2D<WgpuRenderState>) {
    if draw_wgpu_mesh_shape(state, render_proxy) {
        return;
    }
    draw_wgpu_raster_shape(state, render_proxy);
}

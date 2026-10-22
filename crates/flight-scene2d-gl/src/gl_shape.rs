// flight-lint: allow-file(contract-vocabulary) D17 node renderers are backend-typed dispatch tables over thread-bound render-gl state

use flight_render::{BatchFormat, NodeRenderer, RenderProxy2D};
use flight_render_gl::GlRenderState;

use crate::gl_mesh_shape_renderer::draw_gl_mesh_shape;
use crate::gl_raster_shape_renderer::draw_gl_raster_shape;
use crate::gl_shape_data::{create_gl_shape_data, destroy_gl_shape_data};

// The general-purpose shape strategy, and the right default for an app that does not want to reason
// about which fills tessellate. Register GL_MESH_SHAPE_RENDERER or GL_RASTER_SHAPE_RENDERER instead
// to pin the strategy — each pays for only its own path.
pub static GL_SHAPE_RENDERER: NodeRenderer<GlRenderState> = NodeRenderer {
    format: Some(BatchFormat::Quad),
    create_data: create_gl_shape_data,
    destroy_data: Some(destroy_gl_shape_data),
    is_dirty: None,
    submit: draw_gl_shape,
};

// MorphShape owns a distinct kind while sharing Shape's mesh/raster renderer and cache lifecycle (TS
// `glMorphShapeRenderer = glShapeRenderer`).
pub static GL_MORPH_SHAPE_RENDERER: &NodeRenderer<GlRenderState> = &GL_SHAPE_RENDERER;

// Tessellates what it can and rasterizes the rest: the GPU mesh path is tried first, and a shape
// with a fill that has no tessellated form — a gradient, a texture fill, a closed stroke — falls
// through to the canvas replay. Both halves cache into the same per-node renderer data.
pub fn draw_gl_shape(state: &mut GlRenderState, render_proxy: &RenderProxy2D<GlRenderState>) {
    if draw_gl_mesh_shape(state, render_proxy) {
        return;
    }
    draw_gl_raster_shape(state, render_proxy);
}

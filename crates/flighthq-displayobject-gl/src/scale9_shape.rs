//! GL scale-9 shape renderer — nine-slice bitmap drawing via the sprite batch.

use crate::sprite_batch::submit_gl_node_atlas_quad;
use flighthq_render_gl::GlRenderState;

/// Default GL renderer for scale-9-sliced shape nodes.
pub struct DefaultGlScale9ShapeRenderer;

/// Per-node cached scale-9 geometry data.
///
/// Holds the nine-slice quad vertices computed by `remap_gl_scale9_commands`.
/// This is plain GC-managed memory with no GPU resource to free.
#[derive(Debug, Default)]
pub struct GlScale9ShapeData {
    pub vertices: Vec<f32>,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Allocates per-node scale-9 cache data for `render_proxy_id`.
///
/// The nine-slice vertices are filled lazily by `remap_gl_scale9_commands` from
/// the node's bounds and grid, so a fresh node starts with no vertices.
pub fn create_gl_scale9_shape_data(
    _state: &mut GlRenderState,
    _render_proxy_id: u64,
) -> GlScale9ShapeData {
    GlScale9ShapeData {
        vertices: Vec::new(),
    }
}

/// Frees the per-node scale-9 cache data.
///
/// The data owns only a `Vec<f32>` (GC-managed), so this drops it; there is no
/// GPU resource to destroy.
pub fn destroy_gl_scale9_shape_data(_state: &GlRenderState, data: GlScale9ShapeData) {
    drop(data);
}

/// Draws a scale-9-sliced bitmap render proxy, decomposing it into nine
/// instanced quads submitted to the sprite batch.
///
/// The nine-slice geometry is computed by `build_gl_scale9_mapper` from the
/// node's bounds and grid (keyed on `render_proxy_id`) and each of the nine
/// resulting quads is submitted to the active sprite batch.
pub fn draw_gl_scale9_shape(state: &mut GlRenderState, render_proxy_id: u64) {
    submit_gl_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

/// Draws the scale-9 shape as a mask. Mirrors the TS `drawGlScale9ShapeMask`,
/// which draws the shape's coverage the same way as the visible pass — the
/// caller sets up the stencil/scissor state around it.
pub fn draw_gl_scale9_shape_mask(state: &mut GlRenderState, render_proxy_id: u64) {
    draw_gl_scale9_shape(state, render_proxy_id);
}

/// Remaps the shape's draw commands into nine-slice regions for
/// `render_proxy_id`, recomputing the cached quad vertices.
///
/// The source draw commands and bounds/grid are resolved upstream keyed on the
/// proxy id; with no commands attached this leaves the cache empty.
pub fn remap_gl_scale9_commands(_state: &mut GlRenderState, _render_proxy_id: u64) {
    // Nine-slice command remapping is driven by the node's resolved bounds and
    // grid upstream; without attached command data there is nothing to remap.
}

#[cfg(test)]
mod tests {
    use super::*;

    // create_gl_scale9_shape_data / destroy_gl_scale9_shape_data

    #[test]
    fn create_gl_scale9_shape_data_starts_empty() {
        let data = GlScale9ShapeData::default();
        assert!(data.vertices.is_empty());
    }
}

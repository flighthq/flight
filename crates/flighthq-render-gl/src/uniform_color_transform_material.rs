//! GL uniform color-transform material — static color-transform applied uniformly.

use crate::render_state::GlRenderState;
use crate::sprite_batch::submit_gl_node_atlas_quad;

/// Draws a render proxy that carries a `UniformColorTransformMaterial`.
///
/// Unlike the per-instance color-transform material, every node in the batch
/// shares one color transform set as a program uniform, so the proxy is
/// submitted as a plain atlas quad and the uniform is bound at flush time.
pub fn draw_gl_uniform_color_transform_material(state: &mut GlRenderState, render_proxy_id: u64) {
    submit_gl_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

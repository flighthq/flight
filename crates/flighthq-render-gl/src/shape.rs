//! GL shape renderer — vector shape mesh drawing via canvas-backed textures.
//!
//! Shapes are rasterised to a Canvas 2D offscreen texture and then composited
//! via the standard GL quad pipeline. This matches the TS source, which
//! delegates shape commands to the Canvas backend.

use crate::draw::composite_gl_cached_texture;
use crate::render_state::GlRenderState;

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Draws a shape `render_proxy_id` using its rasterised canvas texture,
/// compositing it through the standard bitmap quad pipeline.
pub fn draw_gl_shape(state: &mut GlRenderState, render_proxy_id: u64) {
    composite_gl_cached_texture(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

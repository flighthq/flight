//! GL text input renderer — renders `TextInput` display objects via canvas texture.

use crate::draw::composite_gl_cached_texture;
use crate::render_state::GlRenderState;

/// Draws a `TextInput` render proxy by compositing its canvas-rasterised
/// texture as a GL quad.
pub fn draw_gl_text_input(state: &mut GlRenderState, render_proxy_id: u64) {
    composite_gl_cached_texture(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

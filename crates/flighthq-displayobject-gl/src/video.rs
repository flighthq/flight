//! GL video renderer — uploads video frames as GL textures and composites them.

use flighthq_render_gl::GlRenderState;
use flighthq_render_gl::composite_gl_cached_texture;

/// Draws a video render proxy by compositing the GL texture holding its current
/// frame as a quad.
///
/// The frame upload (`update_gl_texture` against the cached texture) is driven
/// by the resource layer keyed on `render_proxy_id`; this composites whatever is
/// currently cached, placed and scaled by the render state's 2D transform.
pub fn draw_gl_video(state: &mut GlRenderState, render_proxy_id: u64) {
    composite_gl_cached_texture(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

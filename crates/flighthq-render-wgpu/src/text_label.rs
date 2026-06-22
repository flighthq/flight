//! wgpu text label renderer — renders `TextLabel` display objects via a texture.

use crate::draw::composite_wgpu_cached_texture;
use crate::render_state::WgpuRenderState;

/// Default wgpu renderer for `TextLabel` display objects.
pub struct DefaultWgpuTextLabelRenderer;

/// Draws a `TextLabel` render proxy by compositing its rasterised texture as a
/// textured quad.
pub fn draw_wgpu_text_label(state: &mut WgpuRenderState, render_proxy_id: u64) {
    composite_wgpu_cached_texture(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

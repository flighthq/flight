//! wgpu text label renderer — renders `TextLabel` display objects via a texture.
//!
//! TODO(align): glyph rasterization is gated on the future `text-shaping` seam
//! (not yet in TS). The compositing path is the faithful port; the layout texture
//! it draws is produced by the text-layout rasterizer, which has no glyph source
//! until a full-glyph shaper is registered, so today the texture is `None`
//! (no-op draw). See `tools/agents/docs/rust/text.md`.

use flighthq_render_wgpu::WgpuRenderState;
use flighthq_render_wgpu::composite_wgpu_cached_texture;

/// Default wgpu renderer for `TextLabel` display objects.
pub struct DefaultWgpuTextLabelRenderer;

/// Draws a `TextLabel` render proxy by compositing its rasterised texture as a
/// textured quad.
pub fn draw_wgpu_text_label(state: &mut WgpuRenderState, render_proxy_id: u64) {
    composite_wgpu_cached_texture(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

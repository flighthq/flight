//! wgpu rich text renderer — renders `RichText` display objects via a texture.
//!
//! TODO(align): glyph rasterization is gated on the future `text-shaping` seam
//! (not yet in TS). Until a full-glyph shaper is registered there is no glyph-id
//! source to rasterize into the layout texture, so the draw path composites
//! whatever texture the (not-yet-built) text-layout rasterizer produced — today
//! that is `None`, i.e. a no-op. The compositing, overlay, and cache plumbing
//! here are the faithful port; only the glyph-bitmap production is deferred.

use flighthq_render_wgpu::WgpuRenderState;
use flighthq_render_wgpu::{WgpuRichTextOverlay, composite_wgpu_cached_texture};

/// Default wgpu renderer for `RichText` display objects.
pub struct DefaultWgpuRichTextRenderer;

/// Per-node cached rich-text texture data.
#[derive(Debug, Default)]
pub struct WgpuRichTextData {
    pub last_layout_version: u64,
    pub texture: Option<wgpu::Texture>,
}

// `WgpuRichTextOverlay` is a backend-core runtime slot type (the text-input
// overlay hook lives on the render-state runtime); it is defined in
// `flighthq-render-wgpu`'s `runtime_types` and imported above.

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Allocates per-node rich-text cache data for `render_proxy_id`.
///
/// The layout texture is created lazily on first rasterisation (driven by the
/// text-layout layer), so a fresh node starts with no texture.
pub fn create_wgpu_rich_text_data(
    _state: &mut WgpuRenderState,
    _render_proxy_id: u64,
) -> WgpuRichTextData {
    WgpuRichTextData {
        last_layout_version: 0,
        texture: None,
    }
}

/// Frees the per-node rich-text cache data and its texture.
pub fn destroy_wgpu_rich_text_data(_state: &WgpuRenderState, data: WgpuRichTextData) {
    if let Some(texture) = data.texture {
        texture.destroy();
    }
}

/// Draws a `RichText` render proxy by compositing its layout texture as a
/// textured quad.
pub fn draw_wgpu_rich_text(state: &mut WgpuRenderState, render_proxy_id: u64) {
    composite_wgpu_cached_texture(state, render_proxy_id, 1.0, 1.0);
}

/// Draws a `RichText` render proxy, then invokes the registered text-input
/// overlay for caret/selection (if one is installed via
/// `register_wgpu_text_input_overlay`).
pub fn draw_wgpu_rich_text_with_overlay(state: &mut WgpuRenderState, render_proxy_id: u64) {
    draw_wgpu_rich_text(state, render_proxy_id);
    if let Some(overlay) = state.runtime.text_input_overlay {
        overlay(state, render_proxy_id);
    }
}

/// Registers the text-input overlay hook used by `draw_wgpu_rich_text_with_overlay`.
pub fn register_wgpu_text_input_overlay(state: &mut WgpuRenderState, overlay: WgpuRichTextOverlay) {
    state.runtime.text_input_overlay = Some(overlay);
}

#[cfg(test)]
mod tests {}

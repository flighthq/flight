//! GL text label renderer — composites a rasterised text texture as a GL quad.
//!
//! TODO(align): glyph rasterisation is gated on the future `text-shaping` seam
//! (`set_text_shaper`), which is not yet in the authoritative TS package (see
//! `tools/agents/docs/rust/text.md`). Until that lands, this composites whatever
//! texture the resource layer has cached for the node (the canvas-delegated path
//! the TS source uses), keyed on `render_proxy_id`; the native rustybuzz +
//! tiny-skia rasterisation that fills the texture is deferred to the shaper seam.

use flighthq_render_gl::{GlRenderState, composite_gl_cached_texture};

/// Draws a `TextLabel` render proxy by compositing its rasterised text texture
/// as a GL quad.
pub fn draw_gl_text_label(state: &mut GlRenderState, render_proxy_id: u64) {
    composite_gl_cached_texture(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

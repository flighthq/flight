//! GL rich text renderer — composites a rasterised text texture as a GL quad.
//!
//! TODO(align): glyph rasterisation is gated on the future `text-shaping` seam
//! (`set_text_shaper`), not yet in the authoritative TS package (see
//! `tools/agents/docs/rust/text.md`). Multi-format rich-text layout flows
//! through `flighthq-textlayout`, but the shaped-glyph rasterisation that fills
//! the texture is deferred to the shaper seam; this composites the resource
//! layer's cached texture for the node until then.

use flighthq_render_gl::{GlRenderState, composite_gl_cached_texture};

/// Draws a `RichText` render proxy by compositing its rasterised text texture as
/// a GL quad.
pub fn draw_gl_rich_text(state: &mut GlRenderState, render_proxy_id: u64) {
    composite_gl_cached_texture(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

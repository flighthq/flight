//! GL rich text renderer — composites a rasterised text texture as a GL quad.
//!
//! TODO(align): glyph rasterisation is gated on the future `text-shaping` seam
//! (`set_text_shaper`), not yet in the authoritative TS package (see
//! `tools/agents/docs/rust/text.md`). Multi-format rich-text layout flows
//! through `flighthq-textlayout`, but the shaped-glyph rasterisation that fills
//! the texture is deferred to the shaper seam; this composites the resource
//! layer's cached texture for the node until then.

use std::sync::RwLock;

use flighthq_render_gl::{GlRenderState, composite_gl_cached_texture};

/// A rich-text overlay hook: draws the editable-field overlay (caret/selection)
/// on top of an already-composited `RichText` texture. Installed via
/// [`register_gl_text_input_overlay`] (from `enable_gl_text_input`); a static
/// `RichText` leaves the hook unset and pulls no text-input code.
///
/// The TS overlay rasterises onto the offscreen field canvas; the Rust seam
/// composites a caret/selection texture keyed on the field's render-proxy id,
/// biased so it does not collide with the field's own texture.
pub type GlRichTextOverlay = fn(state: &mut GlRenderState, render_proxy_id: u64);

/// Default GL renderer for `RichText` display objects.
pub struct DefaultGlRichTextRenderer;

/// Per-node cached rich-text texture data.
///
/// The layout texture is created lazily on first rasterisation (driven by the
/// text-layout layer), so a fresh node starts with no texture key.
#[derive(Debug, Default)]
pub struct GlRichTextData {
    pub last_layout_version: u64,
    pub last_texture_key: Option<u64>,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Allocates per-node rich-text cache data for `render_proxy_id`.
pub fn create_gl_rich_text_data(
    _state: &mut GlRenderState,
    _render_proxy_id: u64,
) -> GlRichTextData {
    GlRichTextData {
        last_layout_version: 0,
        last_texture_key: None,
    }
}

/// Frees the GPU texture this rich text node owns when it is torn down.
pub fn destroy_gl_rich_text_data(state: &mut GlRenderState, data: GlRichTextData) {
    use glow::HasContext;
    let Some(key) = data.last_texture_key else {
        return;
    };
    if let Some(texture) = state.runtime.texture_cache.remove(&key) {
        unsafe {
            state.gl.delete_texture(texture);
        }
    }
}

/// Draws a `RichText` render proxy by compositing its rasterised text texture as
/// a GL quad. When a text-input overlay is installed (see
/// [`register_gl_text_input_overlay`]), also draws the caret/selection overlay.
pub fn draw_gl_rich_text(state: &mut GlRenderState, render_proxy_id: u64) {
    draw_gl_rich_text_with_overlay(state, render_proxy_id, get_gl_text_input_overlay());
}

/// Draws a `RichText` render proxy, then invokes `overlay` (if any) for the
/// caret/selection. Mirrors the TS `drawGlRichTextWithOverlay`, where the
/// overlay is passed explicitly rather than resolved from module state.
pub fn draw_gl_rich_text_with_overlay(
    state: &mut GlRenderState,
    render_proxy_id: u64,
    overlay: Option<GlRichTextOverlay>,
) {
    composite_gl_cached_texture(state, render_proxy_id, 1.0, 1.0);
    if let Some(overlay) = overlay {
        overlay(state, render_proxy_id);
    }
}

/// Registers the text-input `overlay` hook used by `draw_gl_rich_text`. Importing
/// and calling this (via `enable_gl_text_input`) opts an app into text-input
/// rendering; a static `RichText` leaves the hook unset and pulls none of it.
pub fn register_gl_text_input_overlay(overlay: GlRichTextOverlay) {
    *text_input_overlay_slot().write().expect("overlay lock") = Some(overlay);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Returns the currently-installed overlay hook, if any.
pub(crate) fn get_gl_text_input_overlay() -> Option<GlRichTextOverlay> {
    *text_input_overlay_slot().read().expect("overlay lock")
}

// The process-wide overlay hook slot. Empty until `register_gl_text_input_overlay`
// installs one; no side effect at module load (the lock is lazily constructed).
fn text_input_overlay_slot() -> &'static RwLock<Option<GlRichTextOverlay>> {
    static SLOT: RwLock<Option<GlRichTextOverlay>> = RwLock::new(None);
    &SLOT
}

#[cfg(test)]
mod tests {
    use super::*;

    // create_gl_rich_text_data

    #[test]
    fn create_gl_rich_text_data_starts_without_texture() {
        let data = GlRichTextData::default();
        assert!(data.last_texture_key.is_none());
        assert_eq!(data.last_layout_version, 0);
    }

    // register_gl_text_input_overlay / get_gl_text_input_overlay

    #[test]
    fn register_gl_text_input_overlay_installs_hook() {
        fn noop(_state: &mut GlRenderState, _id: u64) {}
        register_gl_text_input_overlay(noop);
        assert!(get_gl_text_input_overlay().is_some());
    }
}

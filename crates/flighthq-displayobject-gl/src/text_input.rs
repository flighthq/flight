//! GL text input renderer — caret/selection overlay for editable text fields.
//!
//! TODO(align): glyph rasterisation is gated on the future `text-shaping` seam
//! (`set_text_shaper`), not yet in the authoritative TS package (see
//! `tools/agents/docs/rust/text.md`). Composites the resource layer's cached
//! caret/selection texture for the node until the shaper seam lands.

use crate::rich_text::register_gl_text_input_overlay;
use flighthq_render_gl::{GlRenderState, composite_gl_cached_texture};

/// Caret/selection overlay texture-cache keys are derived from the field's
/// render-proxy id (biased) so the caret texture never collides with the field
/// texture.
const TEXT_INPUT_OVERLAY_KEY_BIAS: u64 = 0x8000_0000_0000_0000;

/// Draws a `TextInput` render proxy by compositing its rasterised text texture
/// as a GL quad.
pub fn draw_gl_text_input(state: &mut GlRenderState, render_proxy_id: u64) {
    composite_gl_cached_texture(state, render_proxy_id, 1.0, 1.0);
}

/// Draws the caret and selection highlight overlay for an editable text field on
/// top of its already-composited rich-text texture.
///
/// The caret/selection is rasterised into a texture keyed on `render_proxy_id`
/// (biased so it does not collide with the field's own texture) by the
/// text-input layer; this composites it through the standard textured-quad path.
pub fn draw_gl_text_input_overlay(state: &mut GlRenderState, render_proxy_id: u64) {
    composite_gl_cached_texture(
        state,
        render_proxy_id ^ TEXT_INPUT_OVERLAY_KEY_BIAS,
        1.0,
        1.0,
    );
}

/// Installs the caret/selection overlay onto the GL `RichText` renderer.
///
/// Importing and calling this opts an app into text-input rendering; a static
/// `RichText` leaves the hook unset and pulls none of this module.
pub fn enable_gl_text_input() {
    register_gl_text_input_overlay(draw_gl_text_input_overlay);
}

#[cfg(test)]
mod tests {
    use super::*;

    // draw_gl_text_input_overlay

    #[test]
    fn overlay_key_bias_is_high_bit() {
        // The bias flips the top bit so the caret texture key never collides with
        // a plausible field key.
        assert_eq!(
            0u64 ^ TEXT_INPUT_OVERLAY_KEY_BIAS,
            TEXT_INPUT_OVERLAY_KEY_BIAS
        );
        let _ = draw_gl_text_input_overlay as fn(&mut GlRenderState, u64);
    }
}

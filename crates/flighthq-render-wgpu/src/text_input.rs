//! wgpu text input renderer — caret/selection overlay for editable text fields.

use crate::draw::composite_wgpu_cached_texture;
use crate::render_state::WgpuRenderState;
use crate::rich_text::register_wgpu_text_input_overlay;

/// Caret/selection overlay texture cache keys are derived from the field's
/// render-proxy id so the caret texture never collides with the field texture.
const TEXT_INPUT_OVERLAY_KEY_BIAS: u64 = 0x8000_0000_0000_0000;

/// Draws the caret and selection highlight overlay for an editable text field
/// on top of its already-composited rich-text texture.
///
/// The caret/selection is rasterised into a texture keyed on `render_proxy_id`
/// (biased so it does not collide with the field's own texture) by the
/// text-input layer; this composites it through the standard textured-quad
/// pipeline.
pub fn draw_wgpu_text_input_overlay(state: &mut WgpuRenderState, render_proxy_id: u64) {
    composite_wgpu_cached_texture(
        state,
        render_proxy_id ^ TEXT_INPUT_OVERLAY_KEY_BIAS,
        1.0,
        1.0,
    );
}

/// Installs the text-input overlay hook on `state` so editable rich-text fields
/// draw their caret/selection via `draw_wgpu_rich_text_with_overlay`.
pub fn enable_wgpu_text_input(state: &mut WgpuRenderState) {
    register_wgpu_text_input_overlay(state, draw_wgpu_text_input_overlay);
}

#[cfg(test)]
mod tests {}

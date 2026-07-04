//! Convenience registration helpers that group related renderer kinds.

use flighthq_types::display::{
    quad_batch_kind, rich_text_kind, sprite_kind, text_label_kind, tilemap_kind,
};

use flighthq_render_gl::{GlRenderState, GlRendererSlot};

/// Registers GL sprite-family renderers: `SpriteKind`, `QuadBatchKind`, and
/// `TilemapKind`.
///
/// Call once after `create_gl_render_state` to enable atlas-based sprite batch
/// rendering for sprites, quad batches, and tilemaps.
pub fn register_gl_sprite_renderers(state: &mut GlRenderState) {
    state
        .runtime
        .renderers
        .insert(sprite_kind(), GlRendererSlot::Sprite);
    state
        .runtime
        .renderers
        .insert(quad_batch_kind(), GlRendererSlot::QuadBatch);
    state
        .runtime
        .renderers
        .insert(tilemap_kind(), GlRendererSlot::Tilemap);
}

/// Registers GL text-family renderers: `TextLabelKind` and `RichTextKind`.
///
/// Call once after `create_gl_render_state` to enable text rendering.
pub fn register_gl_text_renderers(state: &mut GlRenderState) {
    state
        .runtime
        .renderers
        .insert(text_label_kind(), GlRendererSlot::TextLabel);
    state
        .runtime
        .renderers
        .insert(rich_text_kind(), GlRendererSlot::RichText);
}

#[cfg(test)]
mod tests {}

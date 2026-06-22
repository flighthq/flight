//! GL sprite renderer — submits `Sprite` nodes into the instanced sprite batch.

use flighthq_types::display::sprite_kind;

use crate::render_state::{GlRenderState, GlRendererSlot};
use crate::sprite_batch::submit_gl_node_atlas_quad;

/// Default GL renderer for `Sprite` / atlas-quad nodes.
///
/// Writes one instanced draw record (13 floats of transform + UV + alpha) per
/// sprite into `state`'s sprite batch, flushing when the texture or material
/// changes.
pub struct DefaultGlSpriteRenderer;

/// Registers the GL sprite renderer on `state` for the `SpriteKind`.
///
/// Call once after `create_gl_render_state` to enable atlas/sprite batch
/// rendering.
pub fn register_gl_sprite_renderer(state: &mut GlRenderState) {
    state
        .runtime
        .renderers
        .insert(sprite_kind(), GlRendererSlot::Sprite);
}

/// Submits a `Sprite` render proxy into the active sprite batch.
pub fn submit_gl_sprite_node(state: &mut GlRenderState, render_proxy_id: u64) {
    submit_gl_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

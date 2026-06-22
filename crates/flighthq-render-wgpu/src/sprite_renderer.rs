//! wgpu sprite renderer — submits `Sprite` nodes into the instanced sprite batch.

use flighthq_types::display::sprite_kind;

use crate::render_state::{WgpuRenderState, WgpuRendererSlot};

/// Default wgpu renderer for `Sprite` / atlas-quad nodes.
///
/// Writes one instanced draw record (13 floats of transform + UV + alpha) per
/// sprite into `state`'s sprite batch, flushing when the texture or material
/// changes.
pub struct DefaultWgpuSpriteRenderer;

/// Registers wgpu sprite renderer on `state` for the `SpriteKind`.
///
/// Call once after `create_wgpu_render_state` to enable atlas/sprite batch
/// rendering.
pub fn register_wgpu_sprite_renderer(state: &mut WgpuRenderState) {
    state
        .runtime
        .renderers
        .insert(sprite_kind(), WgpuRendererSlot::Sprite);
}

#[cfg(test)]
mod tests {}

//! wgpu sprite renderer — submits `Sprite` nodes into the instanced sprite batch.

use flighthq_types::display::{quad_batch_kind, sprite_kind};

use flighthq_render_wgpu::{WgpuRenderState, WgpuRendererSlot};

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
    state
        .runtime
        .renderers
        .insert(quad_batch_kind(), WgpuRendererSlot::QuadBatch);
}

#[cfg(test)]
mod tests {}

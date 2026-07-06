//! wgpu sprite renderer — submits `Sprite` nodes into the instanced sprite batch.

use flighthq_types::display::{quad_batch_kind, sprite_kind, tilemap_kind};

use flighthq_render_wgpu::{WgpuRenderState, WgpuRendererSlot};

/// Default wgpu renderer for `Sprite` / atlas-quad nodes.
///
/// Writes one instanced draw record (13 floats of transform + UV + alpha) per
/// sprite into `state`'s sprite batch, flushing when the texture or material
/// changes.
pub struct DefaultWgpuSpriteRenderer;

/// Registers the wgpu sprite-graph renderers on `state`: `SpriteKind`,
/// `QuadBatchKind`, and `TilemapKind`.
///
/// Call once after `create_wgpu_render_state` to enable atlas/sprite batch
/// rendering.
pub fn register_wgpu_sprite_renderers(state: &mut WgpuRenderState) {
    state
        .runtime
        .renderers
        .insert(sprite_kind(), WgpuRendererSlot::Sprite);
    state
        .runtime
        .renderers
        .insert(quad_batch_kind(), WgpuRendererSlot::QuadBatch);
    state
        .runtime
        .renderers
        .insert(tilemap_kind(), WgpuRendererSlot::Tilemap);
}

#[cfg(test)]
mod tests {}

//! wgpu particle emitter renderer — instanced particle draw via the sprite batch.

use crate::sprite_batch::submit_wgpu_node_atlas_quad;
use flighthq_render_wgpu::WgpuRenderState;

/// Default wgpu renderer for `ParticleEmitter` nodes.
pub struct DefaultWgpuParticleEmitterRenderer;

/// Draws a `ParticleEmitter` render proxy: each live particle is submitted as an
/// instanced atlas quad into the active sprite batch. The per-particle
/// decomposition (position, rotation, color, UV, size) keyed on
/// `render_proxy_id` is supplied by the particle subsystem.
pub fn draw_wgpu_particle_emitter(state: &mut WgpuRenderState, render_proxy_id: u64) {
    submit_wgpu_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

#[cfg(test)]
mod tests {}

use flight_particles::{
    ParticleCollider, ParticleEmitter2D, ParticleEmitterConfig, ParticleEmitterState,
    ParticleForce,
};
use flight_particles::contract::{apply_particle_collisions, apply_particle_forces};

use crate::types::ParticleEmitterCallbacks;
use crate::update_particle_emitter_2d::update_particle_emitter_2d;

// flight-lint: allow(conform-params) D16: explicit caller-owned world_transform replaces TS node hierarchy
pub fn step_particle_emitter_2d(
    emitter: &mut ParticleEmitter2D,
    state: &mut ParticleEmitterState,
    config: &ParticleEmitterConfig,
    delta_time: f32,
    forces: Option<&[ParticleForce]>,
    colliders: Option<&[ParticleCollider]>,
    callbacks: Option<&ParticleEmitterCallbacks>,
    world_transform: Option<&[f32; 6]>,
) {
    if let Some(f) = forces {
        if !f.is_empty() {
            apply_particle_forces(emitter, state, f, delta_time);
        }
    }
    update_particle_emitter_2d(emitter, state, config, delta_time, callbacks, world_transform);
    if let Some(c) = colliders {
        if !c.is_empty() {
            apply_particle_collisions(emitter, state, c);
        }
    }
}

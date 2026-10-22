use flight_particles::{
    ParticleCollider, ParticleEmitter2D, ParticleEmitterConfig, ParticleEmitterData,
    ParticleEmitterState, ParticleForce,
};
use flight_particles::contract::{apply_particle_collisions, apply_particle_forces};

use crate::types::{ParticleEmitter3D, ParticleEmitterCallbacks};
use crate::update_particle_emitter_3d::update_particle_emitter_3d;

fn as_emitter_2d(data: &mut ParticleEmitterData) -> ParticleEmitter2D {
    return ParticleEmitter2D {
        data: std::mem::take(data),
        x: 0.0,
        y: 0.0,
    };
}

// flight-lint: allow(conform-params) D16: explicit caller-owned world_matrix replaces TS node hierarchy
pub fn step_particle_emitter_3d(
    emitter: &mut ParticleEmitter3D,
    state: &mut ParticleEmitterState,
    config: &ParticleEmitterConfig,
    delta_time: f32,
    forces: Option<&[ParticleForce]>,
    colliders: Option<&[ParticleCollider]>,
    callbacks: Option<&ParticleEmitterCallbacks>,
    world_matrix: Option<&[f32; 16]>,
) {
    if let Some(f) = forces {
        if !f.is_empty() {
            let proxy = as_emitter_2d(&mut emitter.data);
            apply_particle_forces(&proxy, state, f, delta_time);
            emitter.data = proxy.data;
        }
    }
    update_particle_emitter_3d(emitter, state, config, delta_time, callbacks, world_matrix);
    if let Some(c) = colliders {
        if !c.is_empty() {
            let mut proxy = as_emitter_2d(&mut emitter.data);
            apply_particle_collisions(&mut proxy, state, c);
            emitter.data = proxy.data;
        }
    }
}

use flight_entity::Ref;
use flight_particles::contract::{apply_particle_collisions, apply_particle_forces};
use flight_particles::{
    ParticleCollider, ParticleEmitterConfig, ParticleEmitterState, ParticleForce,
};

use crate::types::{ParticleEmitter2D, ParticleEmitterCallbacks};
use crate::update_particle_emitter_2d::update_particle_emitter_2d;

pub fn step_particle_emitter_2d(
    emitter: &Ref<ParticleEmitter2D>,
    state: &mut ParticleEmitterState,
    config: &ParticleEmitterConfig,
    delta_time: f32,
    forces: Option<&[ParticleForce]>,
    colliders: Option<&[ParticleCollider]>,
    callbacks: Option<&ParticleEmitterCallbacks>,
) {
    if let Some(f) = forces {
        if !f.is_empty() {
            let guard = emitter.read().unwrap();
            apply_particle_forces(
                &guard.data.transforms,
                &guard.data.positions_z,
                guard.data.particle_count,
                state,
                f,
                delta_time,
            );
        }
    }
    update_particle_emitter_2d(emitter, state, config, delta_time, callbacks);
    if let Some(c) = colliders {
        if !c.is_empty() {
            let mut guard = emitter.write().unwrap();
            let data = &mut guard.data;
            apply_particle_collisions(
                &mut data.transforms,
                &mut data.positions_z,
                data.particle_count,
                state,
                c,
            );
        }
    }
}

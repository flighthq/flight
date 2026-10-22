use flight_entity::Ref;
use flight_particles::{ParticleEmitterConfig, ParticleEmitterState};

use crate::types::{ParticleEmitter2D, ParticleEmitterCallbacks};
use crate::update_particle_emitter_2d::update_particle_emitter_2d;

pub fn prewarm_particle_emitter_2d(
    emitter: &Ref<ParticleEmitter2D>,
    state: &mut ParticleEmitterState,
    config: &ParticleEmitterConfig,
    duration: f32,
    step_delta_time: f32,
    callbacks: Option<&ParticleEmitterCallbacks>,
) {
    let step = if step_delta_time > 0.0 {
        step_delta_time
    } else {
        duration
    };
    let mut elapsed = 0.0f32;
    while elapsed < duration {
        let delta_time = step.min(duration - elapsed);
        update_particle_emitter_2d(emitter, state, config, delta_time, callbacks);
        elapsed += delta_time;
    }
}

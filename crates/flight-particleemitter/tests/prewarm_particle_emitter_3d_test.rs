use std::sync::Arc;

use flight_math::RandomSource;
use flight_particles::ParticleEmitterConfig;
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};
use flight_particleemitter::*;

fn seeded_random(seed: u32) -> RandomSource {
    let s = std::sync::Mutex::new(seed as i32);
    return Arc::new(move || {
        let mut state = s.lock().unwrap();
        *state = (*state).wrapping_mul(1103515245).wrapping_add(12345) & 0x7fffffff;
        return *state as f32 / 0x7fffffff as f32;
    });
}

fn make_config(overrides: ParticleEmitterConfig) -> ParticleEmitterConfig {
    return create_particle_emitter_config(Some(&overrides));
}

mod prewarm_particle_emitter_3d {
    use super::*;

    #[test]
    fn fast_forwards_the_emitter_by_the_given_duration() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(seeded_random(42)));
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 60.0,
            max_particles: 500.0,
            lifetime_min: 2.0,
            lifetime_max: 2.0,
            ..create_particle_emitter_config(None)
        });
        prewarm_particle_emitter_3d(&mut emitter, &mut state, &config, 1.0, 1.0 / 60.0, None);
        assert!(emitter.data.particle_count > 0);
    }

    #[test]
    fn handles_zero_step_delta_time_by_using_duration_as_one_step() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(seeded_random(42)));
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 60.0,
            max_particles: 500.0,
            lifetime_min: 2.0,
            lifetime_max: 2.0,
            ..create_particle_emitter_config(None)
        });
        prewarm_particle_emitter_3d(&mut emitter, &mut state, &config, 1.0, 0.0, None);
        assert!(emitter.data.particle_count > 0);
    }
}

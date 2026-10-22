use flight_math::create_random_source;
use flight_particleemitter::*;
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};

mod prewarm_particle_emitter_3d {
    use super::*;

    #[test]
    fn fast_forwards_the_emitter_by_the_given_duration() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 60.0;
        config.max_particles = 500.0;
        config.lifetime_min = 2.0;
        config.lifetime_max = 2.0;
        prewarm_particle_emitter_3d(&emitter, &mut state, &config, 1.0, 1.0 / 60.0, None);
        assert!(emitter.read().unwrap().data.particle_count > 0);
    }

    #[test]
    fn handles_zero_step_delta_time_by_using_duration_as_one_step() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 60.0;
        config.max_particles = 500.0;
        config.lifetime_min = 2.0;
        config.lifetime_max = 2.0;
        prewarm_particle_emitter_3d(&emitter, &mut state, &config, 1.0, 0.0, None);
        assert!(emitter.read().unwrap().data.particle_count > 0);
    }
}

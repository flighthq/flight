use flight_math::create_random_source;
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};
use flight_particles::{ParticleCollider, ParticleForce};

use flight_particleemitter::*;

mod step_particle_emitter_3d {
    use super::*;

    #[test]
    fn spawns_and_moves_particles() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 10.0;
        config.max_particles = 50.0;
        step_particle_emitter_3d(&emitter, &mut state, &config, 1.0, None, None, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 10);
    }

    #[test]
    fn applies_forces_before_update() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.burst_count = 1.0;
        config.burst_interval = 0.0;
        config.gravity_x = 0.0;
        config.gravity_y = 0.0;
        config.gravity_z = 0.0;
        config.max_particles = 10.0;
        config.spawn_rate = 0.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.1, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 1);

        let wind = ParticleForce::WindForce {
            x: 100.0,
            y: 0.0,
            z: 0.0,
        };
        step_particle_emitter_3d(
            &emitter,
            &mut state,
            &config,
            1.0,
            Some(&[wind]),
            None,
            None,
        );
        assert!(state.velocities[0] > 50.0);
    }

    #[test]
    fn applies_colliders_after_update() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.burst_count = 1.0;
        config.burst_interval = 0.0;
        config.gravity_x = 0.0;
        config.gravity_y = -100.0;
        config.gravity_z = 0.0;
        config.max_particles = 10.0;
        config.spawn_rate = 0.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.1, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 1);

        let ground = ParticleCollider::PlaneCollider {
            nx: 0.0,
            ny: 1.0,
            nz: 0.0,
            distance: 0.0,
            restitution: 0.5,
            friction: 0.0,
        };
        step_particle_emitter_3d(
            &emitter,
            &mut state,
            &config,
            1.0,
            None,
            Some(&[ground]),
            None,
        );
        assert!(emitter.read().unwrap().data.transforms[1] >= 0.0);
    }
}

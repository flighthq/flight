use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};
use flight_particles::{ParticleCollider, ParticleForce};

use flight_particleemitter::*;

mod step_particle_emitter_2d {
    use super::*;

    #[test]
    fn spawns_particles_when_called_with_no_forces_or_colliders() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 10.0;
        config.max_particles = 100.0;
        step_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None, None, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 10);
    }

    #[test]
    fn applies_wind_force_before_update() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        config.spread = 0.0;
        config.direction_x = 0.0;
        config.direction_y = -1.0;
        step_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None, None, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 1);

        let wind = ParticleForce::WindForce {
            x: 200.0,
            y: 0.0,
            z: 0.0,
        };
        step_particle_emitter_2d(
            &emitter,
            &mut state,
            &config,
            1.0,
            Some(&[wind]),
            None,
            None,
        );
        assert!(emitter.read().unwrap().data.transforms[0] > 0.0);
    }

    #[test]
    fn resolves_collisions_after_update() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        config.speed_min = 100.0;
        config.speed_max = 100.0;
        config.spread = 0.0;
        config.direction_x = 0.0;
        config.direction_y = 1.0;
        config.gravity_y = 0.0;
        step_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None, None, None);

        let plane = ParticleCollider::PlaneCollider {
            nx: 0.0,
            ny: -1.0,
            nz: 0.0,
            distance: 0.0,
            restitution: 1.0,
            friction: 0.0,
        };
        step_particle_emitter_2d(
            &emitter,
            &mut state,
            &config,
            1.0,
            None,
            Some(&[plane]),
            None,
        );
        assert!(emitter.read().unwrap().data.transforms[1] >= -1e-4);
    }

    #[test]
    fn passes_callbacks_down_to_update() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 3.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        let spawn_count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let spawn_count_clone = spawn_count.clone();
        let callbacks = ParticleEmitterCallbacks {
            on_spawn: Some(Box::new(move |_x, _y, _z| {
                spawn_count_clone.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            })),
            on_death: None,
        };
        step_particle_emitter_2d(
            &emitter,
            &mut state,
            &config,
            1.0,
            None,
            None,
            Some(&callbacks),
        );
        assert_eq!(spawn_count.load(std::sync::atomic::Ordering::Relaxed), 3);
    }

    #[test]
    fn is_a_no_op_for_zero_delta_time() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 10.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        step_particle_emitter_2d(&emitter, &mut state, &config, 0.0, None, None, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }
}

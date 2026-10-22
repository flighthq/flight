use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use flight_particles::{ParticleCollider, ParticleEmitter2D, ParticleEmitterConfig, ParticleForce};
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};
use flight_particleemitter::*;

fn make_config(overrides: ParticleEmitterConfig) -> ParticleEmitterConfig {
    return create_particle_emitter_config(Some(&overrides));
}

mod step_particle_emitter_2d {
    use super::*;

    #[test]
    fn spawns_particles_when_called_with_no_forces_or_colliders() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            max_particles: 100.0,
            ..create_particle_emitter_config(None)
        });
        step_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None, None, None);
        assert_eq!(emitter.data.particle_count, 10);
    }

    #[test]
    fn applies_wind_force_before_update() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            speed_min: 0.0,
            speed_max: 0.0,
            spread: 0.0,
            direction_x: 0.0,
            direction_y: -1.0,
            ..create_particle_emitter_config(None)
        });
        step_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None, None, None);
        assert_eq!(emitter.data.particle_count, 1);
        let wind = ParticleForce::WindForce { x: 200.0, y: 0.0, z: 0.0 };
        step_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, Some(&[wind]), None, None, None);
        let x = emitter.data.transforms[0];
        assert!(x > 0.0);
    }

    #[test]
    fn resolves_collisions_after_update() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            speed_min: 100.0,
            speed_max: 100.0,
            spread: 0.0,
            direction_x: 0.0,
            direction_y: 1.0,
            gravity_y: 0.0,
            ..create_particle_emitter_config(None)
        });
        step_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None, None, None);
        let plane = ParticleCollider::PlaneCollider {
            nx: 0.0,
            ny: -1.0,
            nz: 0.0,
            distance: 0.0,
            restitution: 1.0,
            friction: 0.0,
        };
        step_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, Some(&[plane]), None, None);
        let y = emitter.data.transforms[1];
        assert!(y >= -1e-4);
    }

    #[test]
    fn passes_callbacks_down_to_update_particle_emitter_2d() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 3.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        let spawn_count = Arc::new(AtomicUsize::new(0));
        let spawn_count_clone = spawn_count.clone();
        let callbacks = ParticleEmitterCallbacks {
            on_spawn: Some(Box::new(move |_x, _y, _z| {
                spawn_count_clone.fetch_add(1, Ordering::Relaxed);
            })),
            on_death: None,
        };
        step_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None, Some(&callbacks), None);
        assert_eq!(spawn_count.load(Ordering::Relaxed), 3);
    }

    #[test]
    fn is_a_no_op_for_zero_delta_time() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        step_particle_emitter_2d(&mut emitter, &mut state, &config, 0.0, None, None, None, None);
        assert_eq!(emitter.data.particle_count, 0);
    }
}

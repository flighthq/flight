use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use flight_particles::{ParticleEmitter2D, ParticleEmitterConfig};
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};
use flight_particleemitter::*;

fn make_config(overrides: ParticleEmitterConfig) -> ParticleEmitterConfig {
    return create_particle_emitter_config(Some(&overrides));
}

mod prewarm_particle_emitter_2d {
    use super::*;

    #[test]
    fn produces_live_particles_after_warming_for_one_lifetime() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 20.0,
            lifetime_min: 1.0,
            lifetime_max: 1.0,
            ..create_particle_emitter_config(None)
        });
        prewarm_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, 1.0 / 60.0, None);
        assert!(emitter.data.particle_count > 0);
    }

    #[test]
    fn does_not_exceed_max_particles() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1000.0,
            max_particles: 10.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        prewarm_particle_emitter_2d(&mut emitter, &mut state, &config, 5.0, 1.0 / 60.0, None);
        assert!(emitter.data.particle_count <= 10);
    }

    #[test]
    fn accepts_a_custom_step_delta_time_and_still_produces_particles() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            lifetime_min: 5.0,
            lifetime_max: 5.0,
            ..create_particle_emitter_config(None)
        });
        prewarm_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, 1.0 / 30.0, None);
        assert!(emitter.data.particle_count > 0);
    }

    #[test]
    fn fires_on_spawn_callback_during_warm_up() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 5.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        let spawned = Arc::new(AtomicUsize::new(0));
        let spawned_clone = spawned.clone();
        let callbacks = ParticleEmitterCallbacks {
            on_spawn: Some(Box::new(move |_x, _y, _z| {
                spawned_clone.fetch_add(1, Ordering::Relaxed);
            })),
            on_death: None,
        };
        prewarm_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, 1.0 / 60.0, Some(&callbacks));
        assert!(spawned.load(Ordering::Relaxed) > 0);
    }

    #[test]
    fn leaves_emitter_unmodified_when_duration_is_zero() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 100.0,
            lifetime_min: 1.0,
            lifetime_max: 1.0,
            ..create_particle_emitter_config(None)
        });
        prewarm_particle_emitter_2d(&mut emitter, &mut state, &config, 0.0, 1.0 / 60.0, None);
        assert_eq!(emitter.data.particle_count, 0);
    }

    #[test]
    fn does_not_hang_when_step_delta_time_is_zero() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        prewarm_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, 0.0, None);
        assert!(emitter.data.particle_count > 0);
    }
}

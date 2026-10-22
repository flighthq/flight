use std::sync::Arc;

use flight_math::RandomSource;
use flight_particles::{ParticleCollider, ParticleEmitterConfig, ParticleForce};
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

mod step_particle_emitter_3d {
    use super::*;

    #[test]
    fn spawns_and_moves_particles_like_update_particle_emitter_3d() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(seeded_random(42)));
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            max_particles: 50.0,
            ..create_particle_emitter_config(None)
        });
        step_particle_emitter_3d(&mut emitter, &mut state, &config, 1.0, None, None, None, None);
        assert_eq!(emitter.data.particle_count, 10);
    }

    #[test]
    fn applies_forces_before_update() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(seeded_random(42)));
        let config = make_config(ParticleEmitterConfig {
            burst_count: 1.0,
            burst_interval: 0.0,
            gravity_x: 0.0,
            gravity_y: 0.0,
            gravity_z: 0.0,
            max_particles: 10.0,
            spawn_rate: 0.0,
            speed_min: 0.0,
            speed_max: 0.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.1, None, None);
        assert_eq!(emitter.data.particle_count, 1);

        let wind = ParticleForce::WindForce { x: 100.0, y: 0.0, z: 0.0 };
        step_particle_emitter_3d(&mut emitter, &mut state, &config, 1.0, Some(&[wind]), None, None, None);
        assert!(state.velocities[0] > 50.0);
    }

    #[test]
    fn applies_colliders_after_update() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(seeded_random(42)));
        let config = make_config(ParticleEmitterConfig {
            burst_count: 1.0,
            burst_interval: 0.0,
            gravity_x: 0.0,
            gravity_y: -100.0,
            gravity_z: 0.0,
            max_particles: 10.0,
            spawn_rate: 0.0,
            speed_min: 0.0,
            speed_max: 0.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.1, None, None);
        assert_eq!(emitter.data.particle_count, 1);

        let ground = ParticleCollider::PlaneCollider {
            nx: 0.0,
            ny: 1.0,
            nz: 0.0,
            distance: 0.0,
            restitution: 0.5,
            friction: 0.0,
        };
        step_particle_emitter_3d(&mut emitter, &mut state, &config, 1.0, None, Some(&[ground]), None, None);
        assert!(emitter.data.transforms[1] >= 0.0);
    }
}

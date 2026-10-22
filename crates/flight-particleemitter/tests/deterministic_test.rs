use flight_math::create_random_source;
use flight_particles::{PARTICLE_VELOCITY_STRIDE, ParticleEmitter2D, ParticleEmitterConfig};
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};
use flight_particleemitter::*;

fn make_config(overrides: ParticleEmitterConfig) -> ParticleEmitterConfig {
    return create_particle_emitter_config(Some(&overrides));
}

mod deterministic_replay {
    use super::*;

    #[test]
    fn produces_byte_identical_soa_buffers_from_two_identically_seeded_emitters() {
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 20.0,
            max_particles: 100.0,
            lifetime_min: 0.5,
            lifetime_max: 2.0,
            speed_min: 50.0,
            speed_max: 150.0,
            spread: std::f32::consts::PI,
            gravity_y: 100.0,
            ..create_particle_emitter_config(None)
        });

        let mut emitter_a = create_particle_emitter_2d();
        let mut state_a = create_particle_emitter_state(Some(create_random_source(42)));

        let mut emitter_b = create_particle_emitter_2d();
        let mut state_b = create_particle_emitter_state(Some(create_random_source(42)));

        let steps = [0.016, 0.033, 0.016, 0.05, 0.016, 0.016, 0.033, 0.016];
        for &dt in &steps {
            step_particle_emitter_2d(&mut emitter_a, &mut state_a, &config, dt, None, None, None, None);
            step_particle_emitter_2d(&mut emitter_b, &mut state_b, &config, dt, None, None, None, None);
        }

        assert!(emitter_a.data.particle_count > 0);
        assert_eq!(emitter_a.data.particle_count, emitter_b.data.particle_count);

        let count = emitter_a.data.particle_count;
        assert_eq!(
            &emitter_a.data.transforms[..count * 4],
            &emitter_b.data.transforms[..count * 4]
        );
        assert_eq!(
            &emitter_a.data.alphas[..count],
            &emitter_b.data.alphas[..count]
        );
        assert_eq!(
            &emitter_a.data.colors[..count * 3],
            &emitter_b.data.colors[..count * 3]
        );
        assert_eq!(
            &emitter_a.data.velocities[..count * 2],
            &emitter_b.data.velocities[..count * 2]
        );
        assert_eq!(
            &emitter_a.data.positions_z[..count],
            &emitter_b.data.positions_z[..count]
        );
        assert_eq!(
            &state_a.lifetimes[..count * 2],
            &state_b.lifetimes[..count * 2]
        );
        assert_eq!(
            &state_a.velocities[..count * PARTICLE_VELOCITY_STRIDE],
            &state_b.velocities[..count * PARTICLE_VELOCITY_STRIDE]
        );
        assert_eq!(
            &state_a.scales[..count],
            &state_b.scales[..count]
        );
    }
}

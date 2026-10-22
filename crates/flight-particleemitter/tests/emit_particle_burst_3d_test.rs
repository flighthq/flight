use std::sync::Arc;

use flight_math::RandomSource;
use flight_particles::{EmitterShape, ParticleEmitterConfig};
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

mod emit_particle_burst_3d {
    use super::*;

    #[test]
    fn spawns_particles_at_the_given_3d_position() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(seeded_random(42)));
        let config = make_config(ParticleEmitterConfig {
            max_particles: 100.0,
            speed_min: 0.0,
            speed_max: 0.0,
            emitter_shape: EmitterShape::Point,
            ..create_particle_emitter_config(None)
        });
        let spawned = emit_particle_burst_3d(&mut emitter, &mut state, &config, 5.0, 10.0, 20.0, 30.0, None);
        assert_eq!(spawned, 5);
        assert_eq!(emitter.data.particle_count, 5);
        for i in 0..5 {
            assert_eq!(emitter.data.transforms[i * 4], 10.0);
            assert_eq!(emitter.data.transforms[i * 4 + 1], 20.0);
            assert_eq!(emitter.data.positions_z[i], 30.0);
        }
    }

    #[test]
    fn caps_to_max_particles() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(seeded_random(42)));
        let config = make_config(ParticleEmitterConfig {
            max_particles: 3.0,
            ..create_particle_emitter_config(None)
        });
        let spawned = emit_particle_burst_3d(&mut emitter, &mut state, &config, 10.0, 0.0, 0.0, 0.0, None);
        assert_eq!(spawned, 3);
        assert_eq!(emitter.data.particle_count, 3);
    }

    #[test]
    fn returns_0_when_emitter_is_full() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(seeded_random(42)));
        let config = make_config(ParticleEmitterConfig {
            max_particles: 2.0,
            ..create_particle_emitter_config(None)
        });
        emit_particle_burst_3d(&mut emitter, &mut state, &config, 2.0, 0.0, 0.0, 0.0, None);
        let spawned = emit_particle_burst_3d(&mut emitter, &mut state, &config, 5.0, 0.0, 0.0, 0.0, None);
        assert_eq!(spawned, 0);
    }

    #[test]
    fn generates_sphere_velocity_directions() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(seeded_random(42)));
        let config = make_config(ParticleEmitterConfig {
            max_particles: 50.0,
            speed_min: 10.0,
            speed_max: 10.0,
            emitter_shape: EmitterShape::Sphere,
            ..create_particle_emitter_config(None)
        });
        emit_particle_burst_3d(&mut emitter, &mut state, &config, 50.0, 0.0, 0.0, 0.0, None);
        let mut has_positive_z = false;
        let mut has_negative_z = false;
        for i in 0..emitter.data.particle_count {
            if state.velocities[i * 3 + 2] > 1.0 {
                has_positive_z = true;
            }
            if state.velocities[i * 3 + 2] < -1.0 {
                has_negative_z = true;
            }
        }
        assert!(has_positive_z);
        assert!(has_negative_z);
    }

    #[test]
    fn applies_box_shape_offsets_relative_to_burst_position() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(seeded_random(42)));
        let config = make_config(ParticleEmitterConfig {
            max_particles: 50.0,
            emitter_shape: EmitterShape::Box,
            emitter_width: 10.0,
            emitter_height: 10.0,
            emitter_depth: 10.0,
            speed_min: 0.0,
            speed_max: 0.0,
            ..create_particle_emitter_config(None)
        });
        emit_particle_burst_3d(&mut emitter, &mut state, &config, 50.0, 100.0, 200.0, 300.0, None);
        let mut has_z_offset = false;
        for i in 0..emitter.data.particle_count {
            if (emitter.data.positions_z[i] - 300.0).abs() > 0.1 {
                has_z_offset = true;
            }
        }
        assert!(has_z_offset);
    }

    #[test]
    fn sets_initial_alpha_from_config() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(seeded_random(42)));
        let config = make_config(ParticleEmitterConfig {
            max_particles: 10.0,
            alpha_start: 0.5,
            ..create_particle_emitter_config(None)
        });
        emit_particle_burst_3d(&mut emitter, &mut state, &config, 3.0, 0.0, 0.0, 0.0, None);
        for i in 0..3 {
            assert!((emitter.data.alphas[i] - 0.5).abs() < 0.01);
        }
    }

    #[test]
    fn modulates_spawn_color_and_alpha_by_a_packed_tint() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(seeded_random(42)));
        let config = make_config(ParticleEmitterConfig {
            max_particles: 10.0,
            alpha_start: 1.0,
            ..create_particle_emitter_config(None)
        });
        emit_particle_burst_3d(&mut emitter, &mut state, &config, 2.0, 0.0, 0.0, 0.0, Some(0x8040c0ff));
        for i in 0..2 {
            assert!((emitter.data.colors[i * 3] - 0x80 as f32 / 255.0).abs() < 0.01);
            assert!((emitter.data.colors[i * 3 + 1] - 0x40 as f32 / 255.0).abs() < 0.01);
            assert!((emitter.data.colors[i * 3 + 2] - 0xc0 as f32 / 255.0).abs() < 0.01);
            assert!((emitter.data.alphas[i] - 1.0).abs() < 0.01);
        }
    }

    #[test]
    fn multiplies_a_non_white_config_color_by_the_tint() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(seeded_random(42)));
        let config = make_config(ParticleEmitterConfig {
            max_particles: 10.0,
            color_start_r: 0.5,
            color_start_g: 1.0,
            color_start_b: 0.25,
            alpha_start: 1.0,
            ..create_particle_emitter_config(None)
        });
        // Tint 0xffffff80: white RGB (no color change) with half alpha.
        emit_particle_burst_3d(&mut emitter, &mut state, &config, 1.0, 0.0, 0.0, 0.0, Some(0xffffff80));
        assert!((emitter.data.colors[0] - 0.5).abs() < 0.01);
        assert!((emitter.data.colors[1] - 1.0).abs() < 0.01);
        assert!((emitter.data.colors[2] - 0.25).abs() < 0.01);
        assert!((emitter.data.alphas[0] - 0x80 as f32 / 255.0).abs() < 0.01);
    }
}

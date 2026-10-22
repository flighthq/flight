use flight_math::create_random_source;
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};
use flight_particles::EmitterShape;

use flight_particleemitter::*;

mod emit_particle_burst_3d {
    use super::*;

    #[test]
    fn spawns_particles_at_the_given_3d_position() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 100.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        config.emitter_shape = EmitterShape::Point;
        let spawned =
            emit_particle_burst_3d(&emitter, &mut state, &config, 5.0, 10.0, 20.0, 30.0, None);
        assert_eq!(spawned, 5);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.particle_count, 5);
        for i in 0..5 {
            assert_eq!(guard.data.transforms[i * 4], 10.0);
            assert_eq!(guard.data.transforms[i * 4 + 1], 20.0);
            assert_eq!(guard.data.positions_z[i], 30.0);
        }
    }

    #[test]
    fn caps_to_max_particles() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 3.0;
        let spawned =
            emit_particle_burst_3d(&emitter, &mut state, &config, 10.0, 0.0, 0.0, 0.0, None);
        assert_eq!(spawned, 3);
        assert_eq!(emitter.read().unwrap().data.particle_count, 3);
    }

    #[test]
    fn returns_0_when_emitter_is_full() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 2.0;
        emit_particle_burst_3d(&emitter, &mut state, &config, 2.0, 0.0, 0.0, 0.0, None);
        let spawned =
            emit_particle_burst_3d(&emitter, &mut state, &config, 5.0, 0.0, 0.0, 0.0, None);
        assert_eq!(spawned, 0);
    }

    #[test]
    fn generates_sphere_velocity_directions() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 50.0;
        config.speed_min = 10.0;
        config.speed_max = 10.0;
        config.emitter_shape = EmitterShape::Sphere;
        emit_particle_burst_3d(&emitter, &mut state, &config, 50.0, 0.0, 0.0, 0.0, None);
        let mut has_positive_z = false;
        let mut has_negative_z = false;
        let guard = emitter.read().unwrap();
        for i in 0..guard.data.particle_count {
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
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 50.0;
        config.emitter_shape = EmitterShape::Box;
        config.emitter_width = 10.0;
        config.emitter_height = 10.0;
        config.emitter_depth = 10.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        emit_particle_burst_3d(
            &emitter,
            &mut state,
            &config,
            50.0,
            100.0,
            200.0,
            300.0,
            None,
        );
        let mut has_z_offset = false;
        let guard = emitter.read().unwrap();
        for i in 0..guard.data.particle_count {
            if (guard.data.positions_z[i] - 300.0).abs() > 0.1 {
                has_z_offset = true;
            }
        }
        assert!(has_z_offset);
    }

    #[test]
    fn sets_initial_alpha_from_config() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 10.0;
        config.alpha_start = 0.5;
        emit_particle_burst_3d(&emitter, &mut state, &config, 3.0, 0.0, 0.0, 0.0, None);
        let guard = emitter.read().unwrap();
        for i in 0..3 {
            assert!((guard.data.alphas[i] - 0.5).abs() < 0.01);
        }
    }

    #[test]
    fn modulates_spawn_color_and_alpha_by_a_packed_tint() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 10.0;
        config.alpha_start = 1.0;
        emit_particle_burst_3d(
            &emitter,
            &mut state,
            &config,
            2.0,
            0.0,
            0.0,
            0.0,
            Some(0x8040c0ff),
        );
        let guard = emitter.read().unwrap();
        for i in 0..2 {
            assert!((guard.data.colors[i * 3] - 0x80 as f32 / 255.0).abs() < 0.01);
            assert!((guard.data.colors[i * 3 + 1] - 0x40 as f32 / 255.0).abs() < 0.01);
            assert!((guard.data.colors[i * 3 + 2] - 0xc0 as f32 / 255.0).abs() < 0.01);
            assert!((guard.data.alphas[i] - 1.0).abs() < 0.01);
        }
    }

    #[test]
    fn multiplies_a_non_white_config_color_by_the_tint() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 10.0;
        config.color_start_r = 0.5;
        config.color_start_g = 1.0;
        config.color_start_b = 0.25;
        config.alpha_start = 1.0;
        emit_particle_burst_3d(
            &emitter,
            &mut state,
            &config,
            1.0,
            0.0,
            0.0,
            0.0,
            Some(0xffffff80),
        );
        let guard = emitter.read().unwrap();
        assert!((guard.data.colors[0] - 0.5).abs() < 0.01);
        assert!((guard.data.colors[1] - 1.0).abs() < 0.01);
        assert!((guard.data.colors[2] - 0.25).abs() < 0.01);
        assert!((guard.data.alphas[0] - 0x80 as f32 / 255.0).abs() < 0.01);
    }
}

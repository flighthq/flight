use flight_math::create_random_source;
use flight_particleemitter::*;
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};

mod emit_particle_burst_2d {
    use super::*;

    #[test]
    fn spawns_the_requested_count_at_the_given_point() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        let n = emit_particle_burst_2d(&emitter, &mut state, &config, 8.0, 200.0, 300.0, None);
        assert_eq!(n, 8);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.particle_count, 8);
        for i in 0..8 {
            assert!((guard.data.transforms[i * 4] - 200.0).abs() < 0.5);
            assert!((guard.data.transforms[i * 4 + 1] - 300.0).abs() < 0.5);
        }
    }

    #[test]
    fn respects_max_particles_and_returns_the_actual_spawn_count() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 5.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        assert_eq!(
            emit_particle_burst_2d(&emitter, &mut state, &config, 100.0, 0.0, 0.0, None),
            5
        );
        assert_eq!(emitter.read().unwrap().data.particle_count, 5);
    }

    #[test]
    fn adds_to_existing_particles_rather_than_replacing_them() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 100.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        emit_particle_burst_2d(&emitter, &mut state, &config, 3.0, 0.0, 0.0, None);
        emit_particle_burst_2d(&emitter, &mut state, &config, 4.0, 0.0, 0.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 7);
    }

    #[test]
    fn does_not_touch_the_continuous_emission_bookkeeping() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        emit_particle_burst_2d(&emitter, &mut state, &config, 3.0, 0.0, 0.0, None);
        assert_eq!(state.spawn_accumulator, 0.0);
        assert_eq!(state.emitter_age, 0.0);
    }

    #[test]
    fn is_deterministic_with_a_seeded_state() {
        let run = || -> Vec<f32> {
            let emitter = create_particle_emitter_2d();
            let mut state = create_particle_emitter_state();
            state.random = create_random_source(99);
            let mut config = create_particle_emitter_config(None);
            config.speed_min = 10.0;
            config.speed_max = 200.0;
            config.spread = std::f32::consts::PI;
            config.lifetime_min = 1.0;
            config.lifetime_max = 5.0;
            emit_particle_burst_2d(&emitter, &mut state, &config, 10.0, 0.0, 0.0, None);
            return state.velocities[..20].to_vec();
        };
        assert_eq!(run(), run());
    }

    #[test]
    fn modulates_spawn_color_and_alpha_by_a_packed_tint() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        config.alpha_start = 1.0;
        emit_particle_burst_2d(
            &emitter,
            &mut state,
            &config,
            2.0,
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
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        config.color_start_r = 0.5;
        config.color_start_g = 1.0;
        config.color_start_b = 0.25;
        config.alpha_start = 1.0;
        emit_particle_burst_2d(
            &emitter,
            &mut state,
            &config,
            1.0,
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

    #[test]
    fn leaves_color_untinted_when_no_tint_is_passed() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        emit_particle_burst_2d(&emitter, &mut state, &config, 1.0, 0.0, 0.0, None);
        let guard = emitter.read().unwrap();
        assert!((guard.data.colors[0] - 1.0).abs() < 0.01);
        assert!((guard.data.colors[1] - 1.0).abs() < 0.01);
        assert!((guard.data.colors[2] - 1.0).abs() < 0.01);
    }

    #[test]
    fn composes_into_a_death_sub_emitter_via_on_death() {
        let emitter = create_particle_emitter_2d();
        let mut parent_state = create_particle_emitter_state();
        let mut parent_config = create_particle_emitter_config(None);
        parent_config.spawn_rate = 5.0;
        parent_config.lifetime_min = 0.5;
        parent_config.lifetime_max = 0.5;
        parent_config.speed_min = 0.0;
        parent_config.speed_max = 0.0;

        let deaths = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let deaths_clone = deaths.clone();
        let callbacks = ParticleEmitterCallbacks {
            on_death: Some(Box::new(move |_x: f32, _y: f32, _z: f32| {
                deaths_clone.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            })),
            on_spawn: None,
        };

        for _i in 0..30 {
            update_particle_emitter_2d(
                &emitter,
                &mut parent_state,
                &parent_config,
                1.0 / 30.0,
                Some(&callbacks),
            );
        }

        let death_count = deaths.load(std::sync::atomic::Ordering::Relaxed);
        assert!(death_count > 0);
        let child_emitter = create_particle_emitter_2d();
        let mut child_state = create_particle_emitter_state();
        let mut child_config = create_particle_emitter_config(None);
        child_config.max_particles = 1000.0;
        child_config.lifetime_min = 10.0;
        child_config.lifetime_max = 10.0;
        let spawned = emit_particle_burst_2d(
            &child_emitter,
            &mut child_state,
            &child_config,
            6.0,
            0.0,
            0.0,
            None,
        );
        assert_eq!(spawned, 6);
    }
}

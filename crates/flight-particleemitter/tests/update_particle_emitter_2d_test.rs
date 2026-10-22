use flight_math::create_random_source;
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};
use flight_particles::{
    EmitterShape, ParticleDeathEvent, ParticleSpawnEvent, enable_particle_emitter_signals,
};
use flight_signals::connect_signal;
use std::sync::{Arc, Mutex};

use flight_particleemitter::*;

mod is_particle_emitter_2d_complete {
    use super::*;

    #[test]
    fn is_true_once_a_one_shot_emitter_has_finished_and_all_particles_died() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 10.0;
        config.max_particles = 1000.0;
        config.lifetime_min = 0.5;
        config.lifetime_max = 0.5;
        config.duration = 1.0;
        config.looping = false;
        assert_eq!(
            is_particle_emitter_2d_complete(&emitter.read().unwrap(), &state, &config),
            false
        );
        for _i in 0..10 {
            update_particle_emitter_2d(&emitter, &mut state, &config, 0.1, None);
        }
        assert!(emitter.read().unwrap().data.particle_count > 0);
        assert_eq!(
            is_particle_emitter_2d_complete(&emitter.read().unwrap(), &state, &config),
            false
        );
        for _i in 0..10 {
            update_particle_emitter_2d(&emitter, &mut state, &config, 0.1, None);
        }
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
        assert_eq!(
            is_particle_emitter_2d_complete(&emitter.read().unwrap(), &state, &config),
            true
        );
    }

    #[test]
    fn is_always_false_for_infinite_or_looping_emitters() {
        let emitter = create_particle_emitter_2d();
        let state = create_particle_emitter_state();
        let mut infinite = create_particle_emitter_config(None);
        infinite.spawn_rate = 0.0;
        infinite.duration = 0.0;
        assert_eq!(
            is_particle_emitter_2d_complete(&emitter.read().unwrap(), &state, &infinite),
            false
        );
        let mut looping = create_particle_emitter_config(None);
        looping.spawn_rate = 0.0;
        looping.duration = 1.0;
        looping.looping = true;
        assert_eq!(
            is_particle_emitter_2d_complete(&emitter.read().unwrap(), &state, &looping),
            false
        );
    }
}

mod update_particle_emitter_2d {
    use super::*;

    #[test]
    fn spawns_particles_up_to_spawn_rate_times_delta_time() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 10.0;
        config.max_particles = 100.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 10);
    }

    #[test]
    fn respects_max_particles_limit() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 100.0;
        config.max_particles = 5.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 5);
    }

    #[test]
    fn ages_particles_over_time() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 1);
        update_particle_emitter_2d(&emitter, &mut state, &config, 0.1, None);
        assert!((state.lifetimes[0] - 0.1).abs() < 0.01);
    }

    #[test]
    fn removes_particles_when_lifetime_expires() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 0.5;
        config.lifetime_max = 0.5;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 1);
        update_particle_emitter_2d(&emitter, &mut state, &config, 0.6, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }

    #[test]
    fn integrates_velocity_with_gravity() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        config.gravity_x = 100.0;
        config.gravity_y = 0.0;
        config.spread = 0.0;
        config.direction_x = 0.0;
        config.direction_y = -1.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        assert!(emitter.read().unwrap().data.transforms[0] > 0.0);
    }

    #[test]
    fn interpolates_alpha_from_start_to_end_over_lifetime() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 1.0;
        config.lifetime_max = 1.0;
        config.alpha_start = 1.0;
        config.alpha_end = 0.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        update_particle_emitter_2d(&emitter, &mut state, &config, 0.5, None);
        assert!((emitter.read().unwrap().data.alphas[0] - 0.5).abs() < 0.05);
    }

    #[test]
    fn accumulates_fractional_spawn_debt_across_frames() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 10.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        config.max_particles = 100.0;
        for _i in 0..10 {
            update_particle_emitter_2d(&emitter, &mut state, &config, 0.05, None);
        }
        assert_eq!(emitter.read().unwrap().data.particle_count, 5);
    }

    #[test]
    fn grows_emitter_arrays_as_needed() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 100.0;
        config.max_particles = 50.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.particle_count, 50);
        assert!(guard.data.transforms.len() >= 50 * 4);
    }

    #[test]
    fn interpolates_color_from_start_to_end_over_lifetime() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 1.0;
        config.lifetime_max = 1.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        config.color_start_r = 1.0;
        config.color_start_g = 0.0;
        config.color_start_b = 0.0;
        config.color_end_r = 0.0;
        config.color_end_g = 0.0;
        config.color_end_b = 1.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        update_particle_emitter_2d(&emitter, &mut state, &config, 0.5, None);
        let guard = emitter.read().unwrap();
        assert!((guard.data.colors[0] - 0.5).abs() < 0.05);
        assert!((guard.data.colors[1] - 0.0).abs() < 0.05);
        assert!((guard.data.colors[2] - 0.5).abs() < 0.05);
    }

    #[test]
    fn animates_scale_over_lifetime() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 1.0;
        config.lifetime_max = 1.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        config.scale_min = 2.0;
        config.scale_max = 2.0;
        config.scale_end = 0.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        update_particle_emitter_2d(&emitter, &mut state, &config, 0.5, None);
        assert!((emitter.read().unwrap().data.transforms[3] - 1.0).abs() < 0.05);
    }

    #[test]
    fn rotates_particles_at_their_individual_rotation_speed() {
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
        config.rotation_speed_min = std::f32::consts::PI;
        config.rotation_speed_max = std::f32::consts::PI;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        let rot_before = emitter.read().unwrap().data.transforms[2];
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        let rot_after = emitter.read().unwrap().data.transforms[2];
        assert!((rot_after - rot_before - std::f32::consts::PI).abs() < 0.01);
    }

    #[test]
    fn spawns_particles_within_the_circle_radius() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 50.0;
        config.max_particles = 50.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        config.emitter_shape = EmitterShape::Circle;
        config.emitter_radius = 100.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        let guard = emitter.read().unwrap();
        for i in 0..guard.data.particle_count {
            let x = guard.data.transforms[i * 4];
            let y = guard.data.transforms[i * 4 + 1];
            assert!((x * x + y * y).sqrt() <= 100.0 + 1e-4);
        }
    }

    #[test]
    fn spawns_particles_within_the_rect_bounds() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 50.0;
        config.max_particles = 50.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        config.emitter_shape = EmitterShape::Rect;
        config.emitter_width = 200.0;
        config.emitter_height = 100.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        let guard = emitter.read().unwrap();
        for i in 0..guard.data.particle_count {
            let x = guard.data.transforms[i * 4];
            let y = guard.data.transforms[i * 4 + 1];
            assert!(x.abs() <= 100.0 + 1e-4);
            assert!(y.abs() <= 50.0 + 1e-4);
        }
    }

    #[test]
    fn fires_a_one_shot_burst_on_the_first_frame() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 0.0;
        config.burst_count = 20.0;
        config.burst_interval = 0.0;
        config.max_particles = 100.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0 / 60.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 20);
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0 / 60.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 20);
    }

    #[test]
    fn fires_repeated_bursts_at_the_configured_interval() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 0.0;
        config.burst_count = 5.0;
        config.burst_interval = 1.0;
        config.max_particles = 100.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 0.01, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 5);
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 10);
    }

    #[test]
    fn fires_on_spawn_callback_for_each_spawned_particle() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 3.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        let spawn_count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let clone = spawn_count.clone();
        let callbacks = ParticleEmitterCallbacks {
            on_spawn: Some(Box::new(move |_x, _y, _z| {
                clone.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            })),
            on_death: None,
        };
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, Some(&callbacks));
        assert_eq!(spawn_count.load(std::sync::atomic::Ordering::Relaxed), 3);
    }

    #[test]
    fn fires_on_death_callback_when_particle_expires() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 0.5;
        config.lifetime_max = 0.5;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        let death_fired = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let clone = death_fired.clone();
        let callbacks = ParticleEmitterCallbacks {
            on_death: Some(Box::new(move |_x, _y, _z| {
                clone.store(true, std::sync::atomic::Ordering::Relaxed);
            })),
            on_spawn: None,
        };
        update_particle_emitter_2d(&emitter, &mut state, &config, 0.6, Some(&callbacks));
        assert!(death_fired.load(std::sync::atomic::Ordering::Relaxed));
    }

    #[test]
    fn prewarm_produces_a_non_empty_particle_state() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 10.0;
        config.lifetime_min = 2.0;
        config.lifetime_max = 2.0;
        prewarm_particle_emitter_2d(&emitter, &mut state, &config, 1.0, 1.0 / 60.0, None);
        assert!(emitter.read().unwrap().data.particle_count > 0);
    }

    #[test]
    fn applies_color_variance() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 5.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        config.color_start_r = 0.5;
        config.color_start_variance_r = 0.5;
        config.color_end_r = 0.5;
        config.color_end_variance_r = 0.5;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        let guard = emitter.read().unwrap();
        for i in 0..guard.data.particle_count {
            assert!(state.color_birth[i * 3] >= 0.0);
            assert!(state.color_birth[i * 3] <= 1.0);
        }
    }

    #[test]
    fn world_space_flag_is_synced_to_data() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.world_space = true;
        config.spawn_rate = 0.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0 / 60.0, None);
        assert_eq!(emitter.read().unwrap().data.world_space, true);
    }

    #[test]
    fn world_space_spawns_at_emitter_node_world_position() {
        let emitter = create_particle_emitter_2d();
        {
            let mut guard = emitter.write().unwrap();
            guard.node.x = 200.0;
            guard.node.y = 300.0;
        }
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        config.world_space = true;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.particle_count, 1);
        assert!((guard.data.transforms[0] - 200.0).abs() < 0.5);
        assert!((guard.data.transforms[1] - 300.0).abs() < 0.5);
    }

    #[test]
    fn ignores_a_zero_delta_time_frame() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 0.0;
        config.burst_count = 1.0;
        config.burst_interval = 0.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0 / 60.0, None);
        let count_before = emitter.read().unwrap().data.particle_count;
        state.burst_timer = 0.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 0.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, count_before);
    }

    #[test]
    fn ignores_a_negative_delta_time_frame() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 10.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        let count_before = emitter.read().unwrap().data.particle_count;
        let acc_before = state.spawn_accumulator;
        update_particle_emitter_2d(&emitter, &mut state, &config, -1.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, count_before);
        assert_eq!(state.spawn_accumulator, acc_before);
    }

    #[test]
    fn still_syncs_world_space_flag_on_zero_delta_time() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.world_space = true;
        config.spawn_rate = 10.0;
        update_particle_emitter_2d(&emitter, &mut state, &config, 0.0, None);
        assert_eq!(emitter.read().unwrap().data.world_space, true);
    }

    #[test]
    fn finite_non_looping_emitter_stops_spawning_after_duration() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 10.0;
        config.max_particles = 1000.0;
        config.lifetime_min = 100.0;
        config.lifetime_max = 100.0;
        config.duration = 1.0;
        config.looping = false;
        for _i in 0..20 {
            update_particle_emitter_2d(&emitter, &mut state, &config, 0.1, None);
        }
        let count_after_duration = emitter.read().unwrap().data.particle_count;
        assert!(count_after_duration > 0);
        assert!(count_after_duration < 15);
        for _i in 0..20 {
            update_particle_emitter_2d(&emitter, &mut state, &config, 0.1, None);
        }
        assert_eq!(
            emitter.read().unwrap().data.particle_count,
            count_after_duration
        );
    }

    #[test]
    fn looping_emitter_keeps_spawning_past_duration() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 10.0;
        config.max_particles = 1000.0;
        config.lifetime_min = 100.0;
        config.lifetime_max = 100.0;
        config.duration = 1.0;
        config.looping = true;
        for _i in 0..30 {
            update_particle_emitter_2d(&emitter, &mut state, &config, 0.1, None);
        }
        assert!(emitter.read().unwrap().data.particle_count > 20);
    }

    #[test]
    fn deterministic_replay_with_same_seed() {
        let run = || -> (Vec<f32>, Vec<f32>, Vec<f32>, Vec<f32>, usize) {
            let emitter = create_particle_emitter_2d();
            let mut state = create_particle_emitter_state();
            state.random = create_random_source(1234);
            let mut config = create_particle_emitter_config(None);
            config.spawn_rate = 30.0;
            config.max_particles = 200.0;
            config.speed_min = 10.0;
            config.speed_max = 200.0;
            config.spread = std::f32::consts::PI;
            config.lifetime_min = 0.5;
            config.lifetime_max = 2.0;
            config.rotation_speed_min = -2.0;
            config.rotation_speed_max = 2.0;
            config.scale_min = 0.5;
            config.scale_max = 2.0;
            config.gravity_y = 50.0;
            for _i in 0..60 {
                update_particle_emitter_2d(&emitter, &mut state, &config, 1.0 / 60.0, None);
            }
            let guard = emitter.read().unwrap();
            let count = guard.data.particle_count;
            return (
                guard.data.transforms[..count * 4].to_vec(),
                guard.data.colors[..count * 3].to_vec(),
                state.velocities[..count * 3].to_vec(),
                state.lifetimes[..count * 2].to_vec(),
                count,
            );
        };
        let first = run();
        let second = run();
        assert!(first.4 > 0);
        assert_eq!(first, second);
    }

    // TS updateParticleEmitter2DIntegration.test.ts: the TS cases replace `signal.emit`; the
    // returned handle here is a clone with its own emit cell, so the slots are connected instead.

    #[test]
    fn on_emitter_complete_fires_once_when_a_finite_non_looping_emitter_completes() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.duration = 0.5;
        config.looping = false;
        config.spawn_rate = 1.0;
        config.lifetime_min = 0.1;
        config.lifetime_max = 0.1;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        let signals = enable_particle_emitter_signals(&mut state);
        let completes = Arc::new(Mutex::new(Vec::<i32>::new()));
        let sink = completes.clone();
        connect_signal(
            &signals.on_emitter_complete,
            Arc::new(move |_: &()| sink.lock().unwrap().push(1)),
            None,
        );
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None); // spawn + age past duration
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None); // particles die -> complete
        assert!(!completes.lock().unwrap().is_empty());
    }

    #[test]
    fn on_emitter_complete_does_not_fire_for_infinite_emitters() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.duration = 0.0;
        config.looping = true;
        config.spawn_rate = 1.0;
        config.lifetime_min = 1.0;
        config.lifetime_max = 1.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        let signals = enable_particle_emitter_signals(&mut state);
        let completes = Arc::new(Mutex::new(Vec::<i32>::new()));
        let sink = completes.clone();
        connect_signal(
            &signals.on_emitter_complete,
            Arc::new(move |_: &()| sink.lock().unwrap().push(1)),
            None,
        );
        for _i in 0..10 {
            update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        }
        assert_eq!(completes.lock().unwrap().len(), 0);
    }

    #[test]
    fn on_particle_death_fires_with_the_particle_position_when_a_particle_dies() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 1.0;
        config.lifetime_max = 1.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        let signals = enable_particle_emitter_signals(&mut state);
        let deaths = Arc::new(Mutex::new(Vec::<ParticleDeathEvent>::new()));
        let sink = deaths.clone();
        connect_signal(
            &signals.on_particle_death,
            Arc::new(move |event: &ParticleDeathEvent| sink.lock().unwrap().push(*event)),
            None,
        );
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None); // spawn
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.1, None); // age past lifetime -> death
        let deaths = deaths.lock().unwrap();
        assert_eq!(deaths.len(), 1);
        assert!(deaths[0].x.is_finite());
        // 2D emitters carry a zero z in the shared 3D-capable signal payload.
        assert_eq!(deaths[0].z, 0.0);
    }

    #[test]
    fn on_particle_spawn_fires_with_spawn_position_and_velocity_when_a_particle_is_spawned() {
        let emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 1.0;
        config.lifetime_max = 1.0;
        config.speed_min = 50.0;
        config.speed_max = 50.0;
        let signals = enable_particle_emitter_signals(&mut state);
        let spawns = Arc::new(Mutex::new(Vec::<ParticleSpawnEvent>::new()));
        let sink = spawns.clone();
        connect_signal(
            &signals.on_particle_spawn,
            Arc::new(move |event: &ParticleSpawnEvent| sink.lock().unwrap().push(*event)),
            None,
        );
        update_particle_emitter_2d(&emitter, &mut state, &config, 1.0, None);
        let spawns = spawns.lock().unwrap();
        assert_eq!(spawns.len(), 1);
        let event = spawns[0];
        // Speed must match config (allow sign variations by checking magnitude).
        assert!(((event.vx * event.vx + event.vy * event.vy).sqrt() - 50.0).abs() < 0.5);
        // 2D emitters carry zero on the z axis of the shared 3D-capable signal payload.
        assert_eq!(event.z, 0.0);
        assert_eq!(event.vz, 0.0);
    }
}

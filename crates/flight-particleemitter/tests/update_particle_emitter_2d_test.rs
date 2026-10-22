use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use flight_math::{RandomSource, create_random_source};
use flight_particles::{
    PARTICLE_VELOCITY_STRIDE, ParticleEmitter2D, ParticleEmitterConfig,
    EmitterShape,
};
use flight_particles::contract::{
    create_particle_emitter_config, create_particle_emitter_state,
};
use flight_particleemitter::*;

fn make_config(overrides: ParticleEmitterConfig) -> ParticleEmitterConfig {
    return create_particle_emitter_config(Some(&overrides));
}

mod is_particle_emitter_2d_complete {
    use super::*;

    #[test]
    fn is_true_once_a_one_shot_emitter_has_finished_and_all_particles_died() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            max_particles: 1000.0,
            lifetime_min: 0.5,
            lifetime_max: 0.5,
            duration: 1.0,
            looping: false,
            ..create_particle_emitter_config(None)
        });
        assert!(!is_particle_emitter_2d_complete(&emitter, &state, &config));
        for _ in 0..10 {
            update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.1, None, None);
        }
        assert!(emitter.data.particle_count > 0);
        assert!(!is_particle_emitter_2d_complete(&emitter, &state, &config));
        for _ in 0..10 {
            update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.1, None, None);
        }
        assert_eq!(emitter.data.particle_count, 0);
        assert!(is_particle_emitter_2d_complete(&emitter, &state, &config));
    }

    #[test]
    fn is_always_false_for_infinite_or_looping_emitters() {
        let emitter = create_particle_emitter_2d();
        let state = create_particle_emitter_state(None);
        let infinite = make_config(ParticleEmitterConfig {
            spawn_rate: 0.0,
            duration: 0.0,
            ..create_particle_emitter_config(None)
        });
        assert!(!is_particle_emitter_2d_complete(&emitter, &state, &infinite));
        let looping = make_config(ParticleEmitterConfig {
            spawn_rate: 0.0,
            duration: 1.0,
            looping: true,
            ..create_particle_emitter_config(None)
        });
        assert!(!is_particle_emitter_2d_complete(&emitter, &state, &looping));
    }
}

mod update_particle_emitter_2d {
    use super::*;

    #[test]
    fn spawns_particles_up_to_spawn_rate_times_delta_time() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            max_particles: 100.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.particle_count, 10);
    }

    #[test]
    fn respects_max_particles_limit() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 100.0,
            max_particles: 5.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.particle_count, 5);
    }

    #[test]
    fn ages_particles_over_time() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.particle_count, 1);
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.1, None, None);
        assert!((state.lifetimes[0] - 0.1).abs() < 0.005);
    }

    #[test]
    fn removes_particles_when_lifetime_expires() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1.0,
            lifetime_min: 0.5,
            lifetime_max: 0.5,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.particle_count, 1);
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.6, None, None);
        assert_eq!(emitter.data.particle_count, 0);
    }

    #[test]
    fn integrates_velocity_with_gravity() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            speed_min: 0.0,
            speed_max: 0.0,
            gravity_x: 100.0,
            gravity_y: 0.0,
            spread: 0.0,
            direction_x: 0.0,
            direction_y: -1.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        let x = emitter.data.transforms[0];
        assert!(x > 0.0);
    }

    #[test]
    fn interpolates_alpha_from_alpha_start_to_alpha_end_over_lifetime() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1.0,
            lifetime_min: 1.0,
            lifetime_max: 1.0,
            alpha_start: 1.0,
            alpha_end: 0.0,
            speed_min: 0.0,
            speed_max: 0.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.5, None, None);
        assert!((emitter.data.alphas[0] - 0.5).abs() < 0.05);
    }

    #[test]
    fn accumulates_fractional_spawn_debt_across_frames() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            max_particles: 100.0,
            ..create_particle_emitter_config(None)
        });
        for _ in 0..10 {
            update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.05, None, None);
        }
        assert_eq!(emitter.data.particle_count, 5);
    }

    #[test]
    fn grows_emitter_arrays_as_needed() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 100.0,
            max_particles: 50.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.particle_count, 50);
        assert!(emitter.data.transforms.len() >= 50 * 4);
    }

    #[test]
    fn pre_reserved_emitters_do_not_reallocate_during_update() {
        let mut emitter = create_particle_emitter_2d();
        reserve_particle_emitter_2d(&mut emitter, 100);
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            max_particles: 100.0,
            ..create_particle_emitter_config(None)
        });
        let ptr_before = emitter.data.transforms.as_ptr();
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.transforms.as_ptr(), ptr_before);
    }

    #[test]
    fn interpolates_color_from_start_to_end_over_lifetime() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1.0,
            lifetime_min: 1.0,
            lifetime_max: 1.0,
            speed_min: 0.0,
            speed_max: 0.0,
            color_start_r: 1.0,
            color_start_g: 0.0,
            color_start_b: 0.0,
            color_end_r: 0.0,
            color_end_g: 0.0,
            color_end_b: 1.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.5, None, None);
        assert!((emitter.data.colors[0] - 0.5).abs() < 0.05);
        assert!((emitter.data.colors[1] - 0.0).abs() < 0.05);
        assert!((emitter.data.colors[2] - 0.5).abs() < 0.05);
    }

    #[test]
    fn animates_scale_over_lifetime_when_scale_end_differs_from_1() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1.0,
            lifetime_min: 1.0,
            lifetime_max: 1.0,
            speed_min: 0.0,
            speed_max: 0.0,
            scale_min: 2.0,
            scale_max: 2.0,
            scale_end: 0.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.5, None, None);
        assert!((emitter.data.transforms[3] - 1.0).abs() < 0.05);
    }

    #[test]
    fn rotates_particles_at_their_individual_rotation_speed() {
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
            rotation_speed_min: std::f32::consts::PI,
            rotation_speed_max: std::f32::consts::PI,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        let rot_before = emitter.data.transforms[2];
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        let rot_after = emitter.data.transforms[2];
        assert!((rot_after - rot_before - std::f32::consts::PI).abs() < 0.001);
    }

    #[test]
    fn spawns_particles_within_the_circle_radius() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 50.0,
            max_particles: 50.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            speed_min: 0.0,
            speed_max: 0.0,
            emitter_shape: EmitterShape::Circle,
            emitter_radius: 100.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        for i in 0..emitter.data.particle_count {
            let x = emitter.data.transforms[i * 4];
            let y = emitter.data.transforms[i * 4 + 1];
            assert!((x * x + y * y).sqrt() <= 100.0 + 1e-4);
        }
    }

    #[test]
    fn spawns_particles_within_the_rect_bounds() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 50.0,
            max_particles: 50.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            speed_min: 0.0,
            speed_max: 0.0,
            emitter_shape: EmitterShape::Rect,
            emitter_width: 200.0,
            emitter_height: 100.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        for i in 0..emitter.data.particle_count {
            let x = emitter.data.transforms[i * 4];
            let y = emitter.data.transforms[i * 4 + 1];
            assert!(x.abs() <= 100.0 + 1e-4);
            assert!(y.abs() <= 50.0 + 1e-4);
        }
    }

    #[test]
    fn spawns_particles_on_the_line_emitter_boundary() {
        let random: RandomSource = Arc::new(move || 0.0);
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(Some(random));
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            speed_min: 0.0,
            speed_max: 0.0,
            emitter_shape: EmitterShape::Line,
            emitter_width: 80.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.transforms[0], -40.0);
        assert_eq!(emitter.data.transforms[1], 0.0);
    }

    #[test]
    fn spawns_particles_on_the_ring_emitter_boundary() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(Some(create_random_source(12345)));
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 20.0,
            max_particles: 20.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            speed_min: 0.0,
            speed_max: 0.0,
            emitter_shape: EmitterShape::Ring,
            emitter_radius: 50.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        for i in 0..emitter.data.particle_count {
            let x = emitter.data.transforms[i * 4];
            let y = emitter.data.transforms[i * 4 + 1];
            let dist = (x * x + y * y).sqrt();
            assert!((dist - 50.0).abs() < 0.01, "ring particle distance {dist} not ~50");
        }
    }

    #[test]
    fn fires_a_one_shot_burst_on_the_first_frame() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 0.0,
            burst_count: 20.0,
            burst_interval: 0.0,
            max_particles: 100.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0 / 60.0, None, None);
        assert_eq!(emitter.data.particle_count, 20);
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0 / 60.0, None, None);
        assert_eq!(emitter.data.particle_count, 20);
    }

    #[test]
    fn fires_repeated_bursts_at_the_configured_interval() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 0.0,
            burst_count: 5.0,
            burst_interval: 1.0,
            max_particles: 100.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.01, None, None);
        assert_eq!(emitter.data.particle_count, 5);
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.particle_count, 10);
    }

    #[test]
    fn advances_flipbook_frame_based_on_age_and_frame_rate() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            speed_min: 0.0,
            speed_max: 0.0,
            region_id_min: 0.0,
            frame_count: 3.0,
            frame_rate: 1.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.ids[0], 0);
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.ids[0], 1);
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.ids[0], 2);
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.ids[0], 0);
    }

    #[test]
    fn fires_on_spawn_callback_for_each_spawned_particle() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 3.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        let spawn_count = Arc::new(AtomicUsize::new(0));
        let sc = Arc::clone(&spawn_count);
        let callbacks = ParticleEmitterCallbacks {
            on_spawn: Some(Box::new(move |_x, _y, _z| {
                sc.fetch_add(1, Ordering::Relaxed);
            })),
            on_death: None,
        };
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, Some(&callbacks), None);
        assert_eq!(spawn_count.load(Ordering::Relaxed), 3);
    }

    #[test]
    fn fires_on_death_callback_with_particle_position_when_it_expires() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1.0,
            lifetime_min: 0.5,
            lifetime_max: 0.5,
            speed_min: 0.0,
            speed_max: 0.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        let death_fired = Arc::new(AtomicBool::new(false));
        let df = Arc::clone(&death_fired);
        let callbacks = ParticleEmitterCallbacks {
            on_death: Some(Box::new(move |_x, _y, _z| {
                df.store(true, Ordering::Relaxed);
            })),
            on_spawn: None,
        };
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.6, Some(&callbacks), None);
        assert!(death_fired.load(Ordering::Relaxed));
    }

    #[test]
    fn prewarm_produces_a_non_empty_particle_state() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            lifetime_min: 2.0,
            lifetime_max: 2.0,
            ..create_particle_emitter_config(None)
        });
        prewarm_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, 0.0, None);
        assert!(emitter.data.particle_count > 0);
    }

    #[test]
    fn applies_color_variance_each_particle_gets_its_own_birth_death_color() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 5.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            speed_min: 0.0,
            speed_max: 0.0,
            color_start_r: 0.5,
            color_start_variance_r: 0.5,
            color_end_r: 0.5,
            color_end_variance_r: 0.5,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        for i in 0..emitter.data.particle_count {
            assert!(state.color_birth[i * 3] >= 0.0);
            assert!(state.color_birth[i * 3] <= 1.0);
        }
    }

    #[test]
    fn world_space_flag_is_synced_to_emitter_data_world_space() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 0.0,
            ..create_particle_emitter_config(None)
        });
        let wt: [f32; 6] = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0 / 60.0, None, Some(&wt));
        assert!(emitter.data.world_space);
    }

    #[test]
    fn world_space_spawned_particle_position_is_transformed() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            speed_min: 0.0,
            speed_max: 0.0,
            ..create_particle_emitter_config(None)
        });
        let wt: [f32; 6] = [1.0, 0.0, 0.0, 1.0, 200.0, 300.0];
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, Some(&wt));
        assert_eq!(emitter.data.particle_count, 1);
        assert!((emitter.data.transforms[0] - 200.0).abs() < 0.01);
        assert!((emitter.data.transforms[1] - 300.0).abs() < 0.01);
    }

    #[test]
    fn trail_interpolation_particles_spawned_at_interpolated_positions() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 5.0,
            max_particles: 10.0,
            lifetime_min: 100.0,
            lifetime_max: 100.0,
            speed_min: 0.0,
            speed_max: 0.0,
            ..create_particle_emitter_config(None)
        });
        let wt1: [f32; 6] = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, Some(&wt1));
        let count_after_frame1 = emitter.data.particle_count;
        assert_eq!(count_after_frame1, 5);

        let wt2: [f32; 6] = [1.0, 0.0, 0.0, 1.0, 100.0, 0.0];
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, Some(&wt2));
        assert_eq!(emitter.data.particle_count, 10);

        let mut min_x = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        for i in count_after_frame1..emitter.data.particle_count {
            let x = emitter.data.transforms[i * 4];
            if x < min_x { min_x = x; }
            if x > max_x { max_x = x; }
        }
        assert!(max_x - min_x > 10.0);
    }

    #[test]
    fn velocity_inheritance_new_particles_receive_fraction_of_emitter_velocity() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 0.0,
            burst_count: 1.0,
            burst_interval: 0.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            speed_min: 0.0,
            speed_max: 0.0,
            spread: 0.0,
            direction_x: 0.0,
            direction_y: -1.0,
            velocity_inheritance: 1.0,
            ..create_particle_emitter_config(None)
        });
        emitter.x = 0.0;
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0 / 60.0, None, None);

        state.burst_timer = 0.0;
        emitter.x = 100.0;
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0 / 60.0, None, None);
        let vx = state.velocities[(emitter.data.particle_count - 1) * PARTICLE_VELOCITY_STRIDE];
        assert!(vx > 100.0);
    }

    #[test]
    fn ignores_a_zero_delta_time_frame() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 0.0,
            burst_count: 1.0,
            burst_interval: 0.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            speed_min: 0.0,
            speed_max: 0.0,
            spread: 0.0,
            velocity_inheritance: 1.0,
            ..create_particle_emitter_config(None)
        });
        emitter.x = 0.0;
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0 / 60.0, None, None);
        let count_before = emitter.data.particle_count;
        state.burst_timer = 0.0;
        emitter.x = 100.0;
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.0, None, None);
        assert_eq!(emitter.data.particle_count, count_before);
        for i in 0..emitter.data.particle_count {
            assert!(state.velocities[i * PARTICLE_VELOCITY_STRIDE].is_finite());
            assert!(state.velocities[i * PARTICLE_VELOCITY_STRIDE + 1].is_finite());
        }
    }

    #[test]
    fn ignores_a_negative_delta_time_frame() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0, None, None);
        let count_before = emitter.data.particle_count;
        let acc_before = state.spawn_accumulator;
        update_particle_emitter_2d(&mut emitter, &mut state, &config, -1.0, None, None);
        assert_eq!(emitter.data.particle_count, count_before);
        assert_eq!(state.spawn_accumulator, acc_before);
    }

    #[test]
    fn still_syncs_the_world_space_flag_on_a_zero_delta_time_frame() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            ..create_particle_emitter_config(None)
        });
        let wt: [f32; 6] = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.0, None, Some(&wt));
        assert!(emitter.data.world_space);
    }

    #[test]
    fn a_finite_non_looping_emitter_stops_spawning_after_its_duration() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            max_particles: 1000.0,
            lifetime_min: 100.0,
            lifetime_max: 100.0,
            duration: 1.0,
            looping: false,
            ..create_particle_emitter_config(None)
        });
        for _ in 0..20 {
            update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.1, None, None);
        }
        let count_after_duration = emitter.data.particle_count;
        assert!(count_after_duration > 0);
        assert!(count_after_duration < 15);
        for _ in 0..20 {
            update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.1, None, None);
        }
        assert_eq!(emitter.data.particle_count, count_after_duration);
    }

    #[test]
    fn a_looping_emitter_keeps_spawning_past_its_duration() {
        let mut emitter = create_particle_emitter_2d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            max_particles: 1000.0,
            lifetime_min: 100.0,
            lifetime_max: 100.0,
            duration: 1.0,
            looping: true,
            ..create_particle_emitter_config(None)
        });
        for _ in 0..30 {
            update_particle_emitter_2d(&mut emitter, &mut state, &config, 0.1, None, None);
        }
        assert!(emitter.data.particle_count > 20);
    }

    #[test]
    fn replays_byte_identically_when_stepped_from_the_same_seed() {
        fn run() -> (Vec<f32>, Vec<f32>, Vec<f32>, Vec<f32>, usize) {
            let mut emitter = create_particle_emitter_2d();
            let mut state = create_particle_emitter_state(Some(create_random_source(1234)));
            let config = make_config(ParticleEmitterConfig {
                spawn_rate: 30.0,
                max_particles: 200.0,
                speed_min: 10.0,
                speed_max: 200.0,
                spread: std::f32::consts::PI,
                lifetime_min: 0.5,
                lifetime_max: 2.0,
                rotation_speed_min: -2.0,
                rotation_speed_max: 2.0,
                scale_min: 0.5,
                scale_max: 2.0,
                gravity_y: 50.0,
                ..create_particle_emitter_config(None)
            });
            for _ in 0..60 {
                update_particle_emitter_2d(&mut emitter, &mut state, &config, 1.0 / 60.0, None, None);
            }
            let count = emitter.data.particle_count;
            return (
                emitter.data.transforms[..count * 4].to_vec(),
                emitter.data.colors[..count * 3].to_vec(),
                state.velocities[..count * 2].to_vec(),
                state.lifetimes[..count * 2].to_vec(),
                count,
            );
        }
        let first = run();
        let second = run();
        assert!(first.4 > 0);
        assert_eq!(first, second);
    }
}

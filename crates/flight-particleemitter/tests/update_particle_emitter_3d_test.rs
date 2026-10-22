use flight_math::create_random_source;
use flight_particles::contract::{create_particle_emitter_config, create_particle_emitter_state};
use flight_particles::{EmitterShape, ParticleSpawnEvent, enable_particle_emitter_signals};
use flight_signals::connect_signal;
use std::sync::{Arc, Mutex};

use flight_particleemitter::*;

mod is_particle_emitter_3d_complete {
    use super::*;

    #[test]
    fn returns_false_for_infinite_emitter() {
        let emitter = create_particle_emitter_3d();
        let state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.duration = 0.0;
        config.looping = false;
        assert_eq!(
            is_particle_emitter_3d_complete(&emitter.read().unwrap(), &state, &config),
            false
        );
    }

    #[test]
    fn returns_false_for_looping_emitter() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.duration = 1.0;
        config.looping = true;
        state.emitter_age = 2.0;
        assert_eq!(
            is_particle_emitter_3d_complete(&emitter.read().unwrap(), &state, &config),
            false
        );
    }

    #[test]
    fn returns_true_when_finite_emitter_is_past_duration_and_all_particles_dead() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.duration = 1.0;
        config.looping = false;
        state.emitter_age = 2.0;
        assert_eq!(
            is_particle_emitter_3d_complete(&emitter.read().unwrap(), &state, &config),
            true
        );
    }

    #[test]
    fn returns_false_when_particles_are_still_alive() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.duration = 1.0;
        config.looping = false;
        state.emitter_age = 2.0;
        emitter.write().unwrap().data.particle_count = 3;
        assert_eq!(
            is_particle_emitter_3d_complete(&emitter.read().unwrap(), &state, &config),
            false
        );
    }
}

mod update_particle_emitter_3d {
    use super::*;

    #[test]
    fn does_nothing_for_zero_delta_time() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 100.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }

    #[test]
    fn spawns_particles_based_on_spawn_rate() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 10.0;
        config.max_particles = 100.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 1.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 10);
    }

    #[test]
    fn applies_gravity_to_particle_velocities() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.burst_count = 1.0;
        config.burst_interval = 0.0;
        config.gravity_x = 0.0;
        config.gravity_y = -10.0;
        config.gravity_z = 0.0;
        config.lifetime_min = 10.0;
        config.lifetime_max = 10.0;
        config.max_particles = 10.0;
        config.spawn_rate = 0.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.1, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 1);
        update_particle_emitter_3d(&emitter, &mut state, &config, 1.0, None);
        assert!((state.velocities[1] - (-10.0)).abs() < 0.5);
    }

    #[test]
    fn moves_particles_by_velocity_times_delta_time() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.burst_count = 1.0;
        config.burst_interval = 0.0;
        config.emitter_shape = EmitterShape::Sphere;
        config.gravity_x = 0.0;
        config.gravity_y = 0.0;
        config.gravity_z = 0.0;
        config.max_particles = 10.0;
        config.spawn_rate = 0.0;
        config.speed_min = 100.0;
        config.speed_max = 100.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.1, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 1);
        let (x0, y0, z0) = {
            let guard = emitter.read().unwrap();
            (
                guard.data.transforms[0],
                guard.data.transforms[1],
                guard.data.positions_z[0],
            )
        };
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.1, None);
        let guard = emitter.read().unwrap();
        let dx = guard.data.transforms[0] - x0;
        let dy = guard.data.transforms[1] - y0;
        let dz = guard.data.positions_z[0] - z0;
        let dist = (dx * dx + dy * dy + dz * dz).sqrt();
        assert!((dist - 10.0).abs() < 0.5);
    }

    #[test]
    fn removes_dead_particles_when_lifetime_expires() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.burst_count = 5.0;
        config.burst_interval = 0.0;
        config.lifetime_min = 0.5;
        config.lifetime_max = 0.5;
        config.max_particles = 10.0;
        config.spawn_rate = 0.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.1, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 5);
        update_particle_emitter_3d(&emitter, &mut state, &config, 1.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 0);
    }

    #[test]
    fn interpolates_alpha_over_lifetime() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.alpha_end = 0.0;
        config.alpha_start = 1.0;
        config.burst_count = 1.0;
        config.burst_interval = 0.0;
        config.lifetime_min = 1.0;
        config.lifetime_max = 1.0;
        config.max_particles = 10.0;
        config.spawn_rate = 0.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.01, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 1);
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.5, None);
        assert!((emitter.read().unwrap().data.alphas[0] - 0.51).abs() < 0.05);
    }

    #[test]
    fn interpolates_color_over_lifetime() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.burst_count = 1.0;
        config.burst_interval = 0.0;
        config.color_end_b = 0.0;
        config.color_end_g = 1.0;
        config.color_end_r = 0.0;
        config.color_start_b = 0.0;
        config.color_start_g = 0.0;
        config.color_start_r = 1.0;
        config.lifetime_min = 1.0;
        config.lifetime_max = 1.0;
        config.max_particles = 10.0;
        config.spawn_rate = 0.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.01, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 1);
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.5, None);
        let guard = emitter.read().unwrap();
        assert!((guard.data.colors[0] - 0.49).abs() < 0.05);
        assert!((guard.data.colors[1] - 0.51).abs() < 0.05);
    }

    #[test]
    fn respects_max_particles_cap() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 100.0;
        config.max_particles = 5.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 1.0, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 5);
    }

    #[test]
    fn uses_sphere_spawn_shape_for_3d_velocity_directions() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.emitter_shape = EmitterShape::Sphere;
        config.max_particles = 50.0;
        config.spawn_rate = 50.0;
        config.speed_min = 10.0;
        config.speed_max = 10.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 1.0, None);
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
    fn leaves_world_space_false_for_local_space_emitter() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.max_particles = 10.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.1, None);
        assert_eq!(emitter.read().unwrap().data.world_space, false);
    }

    #[test]
    fn world_space_identity_at_origin() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.burst_count = 1.0;
        config.burst_interval = 0.0;
        config.max_particles = 10.0;
        config.spawn_rate = 0.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        config.world_space = true;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.1, None);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.particle_count, 1);
        assert_eq!(guard.data.world_space, true);
        assert!((guard.data.transforms[0] - 0.0).abs() < 0.5);
        assert!((guard.data.transforms[1] - 0.0).abs() < 0.5);
        assert!((guard.data.positions_z[0] - 0.0).abs() < 0.5);
    }

    #[test]
    fn world_space_bakes_position_through_world_matrix() {
        let emitter = create_particle_emitter_3d();
        {
            let mut guard = emitter.write().unwrap();
            guard.node.position.x = 5.0;
            guard.node.position.y = 7.0;
            guard.node.position.z = 9.0;
        }
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.burst_count = 1.0;
        config.burst_interval = 0.0;
        config.max_particles = 10.0;
        config.spawn_rate = 0.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        config.world_space = true;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.1, None);
        let guard = emitter.read().unwrap();
        assert_eq!(guard.data.particle_count, 1);
        assert_eq!(guard.data.world_space, true);
        assert!((guard.data.transforms[0] - 5.0).abs() < 0.5);
        assert!((guard.data.transforms[1] - 7.0).abs() < 0.5);
        assert!((guard.data.positions_z[0] - 9.0).abs() < 0.5);
    }

    #[test]
    fn emits_the_spawn_signal_with_the_full_3d_position_and_velocity() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let signals = enable_particle_emitter_signals(&mut state);
        let spawns = Arc::new(Mutex::new(Vec::<ParticleSpawnEvent>::new()));
        let sink = spawns.clone();
        connect_signal(
            &signals.on_particle_spawn,
            Arc::new(move |event: &ParticleSpawnEvent| sink.lock().unwrap().push(*event)),
            None,
        );
        let mut config = create_particle_emitter_config(None);
        config.burst_count = 1.0;
        config.burst_interval = 0.0;
        config.emitter_shape = EmitterShape::Sphere;
        config.max_particles = 10.0;
        config.spawn_rate = 0.0;
        config.speed_max = 10.0;
        config.speed_min = 10.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.1, None);
        let spawns = spawns.lock().unwrap();
        assert_eq!(spawns.len(), 1);
        let event = spawns[0];
        // A sphere direction distributes speed across all three axes -- the signal must carry vz.
        let speed = (event.vx * event.vx + event.vy * event.vy + event.vz * event.vz).sqrt();
        assert!((speed - 10.0).abs() < 1e-3);
    }

    #[test]
    fn invokes_on_spawn_and_on_death_callbacks_carrying_the_particle_z() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let spawns = Arc::new(Mutex::new(Vec::<[f32; 3]>::new()));
        let deaths = Arc::new(Mutex::new(Vec::<[f32; 3]>::new()));
        let spawn_sink = spawns.clone();
        let death_sink = deaths.clone();
        let mut config = create_particle_emitter_config(None);
        config.burst_count = 1.0;
        config.burst_interval = 0.0;
        config.emitter_depth = 10.0;
        config.emitter_shape = EmitterShape::Box;
        config.lifetime_min = 0.5;
        config.lifetime_max = 0.5;
        config.max_particles = 10.0;
        config.spawn_rate = 0.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        let callbacks = ParticleEmitterCallbacks {
            on_spawn: Some(Box::new(move |x, y, z| {
                spawn_sink.lock().unwrap().push([x, y, z]);
            })),
            on_death: Some(Box::new(move |x, y, z| {
                death_sink.lock().unwrap().push([x, y, z]);
            })),
        };
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.1, Some(&callbacks));
        update_particle_emitter_3d(&emitter, &mut state, &config, 1.0, Some(&callbacks));
        let spawns = spawns.lock().unwrap();
        let deaths = deaths.lock().unwrap();
        assert_eq!(spawns.len(), 1);
        assert_eq!(deaths.len(), 1);
        // The box depth gives a non-trivial z that both callbacks report, and it survives to death.
        assert!(spawns[0][2].is_finite());
        assert!((deaths[0][2] - spawns[0][2]).abs() < 1e-4);
    }

    #[test]
    fn stops_spawning_when_finite_duration_elapses() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.duration = 0.5;
        config.lifetime_min = 0.1;
        config.lifetime_max = 0.1;
        config.looping = false;
        config.max_particles = 100.0;
        config.spawn_rate = 10.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.6, None);
        let count_after_duration = emitter.read().unwrap().data.particle_count;
        update_particle_emitter_3d(&emitter, &mut state, &config, 1.0, None);
        assert!(emitter.read().unwrap().data.particle_count <= count_after_duration);
    }

    #[test]
    fn spawns_burst_particles() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.burst_count = 20.0;
        config.burst_interval = 0.0;
        config.max_particles = 100.0;
        config.spawn_rate = 0.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 0.1, None);
        assert_eq!(emitter.read().unwrap().data.particle_count, 20);
    }

    #[test]
    fn uses_box_spawn_shape_with_3d_offsets() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state();
        state.random = create_random_source(42);
        let mut config = create_particle_emitter_config(None);
        config.emitter_depth = 10.0;
        config.emitter_height = 10.0;
        config.emitter_shape = EmitterShape::Box;
        config.emitter_width = 10.0;
        config.max_particles = 50.0;
        config.spawn_rate = 50.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        update_particle_emitter_3d(&emitter, &mut state, &config, 1.0, None);
        let guard = emitter.read().unwrap();
        let mut has_non_zero_z = false;
        for i in 0..guard.data.particle_count {
            if guard.data.positions_z[i].abs() > 0.1 {
                has_non_zero_z = true;
            }
        }
        assert!(has_non_zero_z);
    }
}

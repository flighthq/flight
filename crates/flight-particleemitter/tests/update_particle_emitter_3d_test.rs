use std::sync::{Arc, Mutex};

use flight_math::create_random_source;
use flight_particles::{
    EmitterShape, PARTICLE_VELOCITY_STRIDE, ParticleEmitterConfig,
};
use flight_particles::contract::{
    create_particle_emitter_config, create_particle_emitter_state,
};
use flight_particleemitter::*;

fn make_config(overrides: ParticleEmitterConfig) -> ParticleEmitterConfig {
    return create_particle_emitter_config(Some(&overrides));
}

const IDENTITY_4X4: [f32; 16] = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
];

mod is_particle_emitter_3d_complete {
    use super::*;

    #[test]
    fn returns_false_for_infinite_emitter() {
        let emitter = create_particle_emitter_3d();
        let state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            duration: 0.0,
            looping: false,
            ..create_particle_emitter_config(None)
        });
        assert!(!is_particle_emitter_3d_complete(&emitter, &state, &config));
    }

    #[test]
    fn returns_false_for_looping_emitter() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            duration: 1.0,
            looping: true,
            ..create_particle_emitter_config(None)
        });
        state.emitter_age = 2.0;
        assert!(!is_particle_emitter_3d_complete(&emitter, &state, &config));
    }

    #[test]
    fn returns_true_when_finite_emitter_past_duration_and_all_particles_dead() {
        let emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            duration: 1.0,
            looping: false,
            ..create_particle_emitter_config(None)
        });
        state.emitter_age = 2.0;
        assert!(is_particle_emitter_3d_complete(&emitter, &state, &config));
    }

    #[test]
    fn returns_false_when_particles_still_alive() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            duration: 1.0,
            looping: false,
            ..create_particle_emitter_config(None)
        });
        state.emitter_age = 2.0;
        emitter.data.particle_count = 3;
        assert!(!is_particle_emitter_3d_complete(&emitter, &state, &config));
    }
}

mod update_particle_emitter_3d {
    use super::*;

    #[test]
    fn does_nothing_for_zero_delta_time() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(None);
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 100.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.0, None, None);
        assert_eq!(emitter.data.particle_count, 0);
    }

    #[test]
    fn spawns_particles_based_on_spawn_rate() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 10.0,
            max_particles: 100.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.particle_count, 10);
    }

    #[test]
    fn applies_gravity_to_particle_velocities() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let config = make_config(ParticleEmitterConfig {
            burst_count: 1.0,
            burst_interval: 0.0,
            gravity_x: 0.0,
            gravity_y: -10.0,
            gravity_z: 0.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            max_particles: 10.0,
            spawn_rate: 0.0,
            speed_min: 0.0,
            speed_max: 0.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.1, None, None);
        assert_eq!(emitter.data.particle_count, 1);
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert!((state.velocities[1] - (-10.0)).abs() < 0.5);
    }

    #[test]
    fn moves_particles_by_velocity_times_delta_time() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let config = make_config(ParticleEmitterConfig {
            burst_count: 1.0,
            burst_interval: 0.0,
            emitter_shape: EmitterShape::Sphere,
            gravity_x: 0.0,
            gravity_y: 0.0,
            gravity_z: 0.0,
            max_particles: 10.0,
            spawn_rate: 0.0,
            speed_min: 100.0,
            speed_max: 100.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.1, None, None);
        assert_eq!(emitter.data.particle_count, 1);
        let x0 = emitter.data.transforms[0];
        let y0 = emitter.data.transforms[1];
        let z0 = emitter.data.positions_z[0];
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.1, None, None);
        let dx = emitter.data.transforms[0] - x0;
        let dy = emitter.data.transforms[1] - y0;
        let dz = emitter.data.positions_z[0] - z0;
        let dist = (dx * dx + dy * dy + dz * dz).sqrt();
        assert!((dist - 10.0).abs() < 0.5);
    }

    #[test]
    fn removes_dead_particles_when_lifetime_expires() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let config = make_config(ParticleEmitterConfig {
            burst_count: 5.0,
            burst_interval: 0.0,
            lifetime_min: 0.5,
            lifetime_max: 0.5,
            max_particles: 10.0,
            spawn_rate: 0.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.1, None, None);
        assert_eq!(emitter.data.particle_count, 5);
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.particle_count, 0);
    }

    #[test]
    fn interpolates_alpha_over_lifetime() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let config = make_config(ParticleEmitterConfig {
            alpha_end: 0.0,
            alpha_start: 1.0,
            burst_count: 1.0,
            burst_interval: 0.0,
            lifetime_min: 1.0,
            lifetime_max: 1.0,
            max_particles: 10.0,
            spawn_rate: 0.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.01, None, None);
        assert_eq!(emitter.data.particle_count, 1);
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.5, None, None);
        assert!((emitter.data.alphas[0] - 0.51).abs() < 0.05);
    }

    #[test]
    fn interpolates_color_over_lifetime() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let config = make_config(ParticleEmitterConfig {
            burst_count: 1.0,
            burst_interval: 0.0,
            color_end_b: 0.0,
            color_end_g: 1.0,
            color_end_r: 0.0,
            color_start_b: 0.0,
            color_start_g: 0.0,
            color_start_r: 1.0,
            lifetime_min: 1.0,
            lifetime_max: 1.0,
            max_particles: 10.0,
            spawn_rate: 0.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.01, None, None);
        assert_eq!(emitter.data.particle_count, 1);
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.5, None, None);
        assert!((emitter.data.colors[0] - 0.49).abs() < 0.05);
        assert!((emitter.data.colors[1] - 0.51).abs() < 0.05);
    }

    #[test]
    fn respects_max_particles_cap() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 100.0,
            max_particles: 5.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert_eq!(emitter.data.particle_count, 5);
    }

    #[test]
    fn uses_sphere_spawn_shape_for_3d_velocity_directions() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let config = make_config(ParticleEmitterConfig {
            emitter_shape: EmitterShape::Sphere,
            max_particles: 50.0,
            spawn_rate: 50.0,
            speed_min: 10.0,
            speed_max: 10.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 1.0, None, None);
        let mut has_positive_z = false;
        let mut has_negative_z = false;
        for i in 0..emitter.data.particle_count {
            let vz = state.velocities[i * PARTICLE_VELOCITY_STRIDE + 2];
            if vz > 1.0 {
                has_positive_z = true;
            }
            if vz < -1.0 {
                has_negative_z = true;
            }
        }
        assert!(has_positive_z);
        assert!(has_negative_z);
    }

    #[test]
    fn leaves_world_space_false_for_a_local_space_emitter() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let config = make_config(ParticleEmitterConfig {
            spawn_rate: 1.0,
            max_particles: 10.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.1, None, None);
        assert_eq!(emitter.data.world_space, false);
    }

    #[test]
    fn claims_world_space_at_identity() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let config = make_config(ParticleEmitterConfig {
            burst_count: 1.0,
            burst_interval: 0.0,
            max_particles: 10.0,
            spawn_rate: 0.0,
            speed_min: 0.0,
            speed_max: 0.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.1, None, Some(&IDENTITY_4X4));
        assert_eq!(emitter.data.particle_count, 1);
        assert_eq!(emitter.data.world_space, true);
        assert!((emitter.data.transforms[0]).abs() < 1e-5);
        assert!((emitter.data.transforms[1]).abs() < 1e-5);
        assert!((emitter.data.positions_z[0]).abs() < 1e-5);
    }

    #[test]
    fn invokes_on_spawn_and_on_death_callbacks_carrying_z() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let spawns: Arc<Mutex<Vec<[f32; 3]>>> = Arc::new(Mutex::new(Vec::new()));
        let deaths: Arc<Mutex<Vec<[f32; 3]>>> = Arc::new(Mutex::new(Vec::new()));
        let deaths_clone = Arc::clone(&deaths);
        let spawns_clone = Arc::clone(&spawns);
        let callbacks = ParticleEmitterCallbacks {
            on_death: Some(Box::new(move |x, y, z| {
                deaths_clone.lock().unwrap().push([x, y, z]);
            })),
            on_spawn: Some(Box::new(move |x, y, z| {
                spawns_clone.lock().unwrap().push([x, y, z]);
            })),
        };
        let config = make_config(ParticleEmitterConfig {
            burst_count: 1.0,
            burst_interval: 0.0,
            emitter_depth: 10.0,
            emitter_shape: EmitterShape::Box,
            lifetime_max: 0.5,
            lifetime_min: 0.5,
            max_particles: 10.0,
            spawn_rate: 0.0,
            speed_max: 0.0,
            speed_min: 0.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.1, Some(&callbacks), None);
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 1.0, Some(&callbacks), None);
        let spawns = spawns.lock().unwrap();
        let deaths = deaths.lock().unwrap();
        assert_eq!(spawns.len(), 1);
        assert_eq!(deaths.len(), 1);
        assert!(spawns[0][2].is_finite());
        assert!((deaths[0][2] - spawns[0][2]).abs() < 1e-3);
    }

    #[test]
    fn stops_spawning_when_finite_duration_elapses() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let config = make_config(ParticleEmitterConfig {
            duration: 0.5,
            lifetime_min: 0.1,
            lifetime_max: 0.1,
            looping: false,
            max_particles: 100.0,
            spawn_rate: 10.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.6, None, None);
        let count_after_duration = emitter.data.particle_count;
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 1.0, None, None);
        assert!(emitter.data.particle_count <= count_after_duration);
    }

    #[test]
    fn spawns_burst_particles() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let config = make_config(ParticleEmitterConfig {
            burst_count: 20.0,
            burst_interval: 0.0,
            max_particles: 100.0,
            spawn_rate: 0.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 0.1, None, None);
        assert_eq!(emitter.data.particle_count, 20);
    }

    #[test]
    fn uses_box_spawn_shape_with_3d_offsets() {
        let mut emitter = create_particle_emitter_3d();
        let mut state = create_particle_emitter_state(Some(create_random_source(42)));
        let config = make_config(ParticleEmitterConfig {
            emitter_depth: 10.0,
            emitter_height: 10.0,
            emitter_shape: EmitterShape::Box,
            emitter_width: 10.0,
            max_particles: 50.0,
            spawn_rate: 50.0,
            speed_min: 0.0,
            speed_max: 0.0,
            ..create_particle_emitter_config(None)
        });
        update_particle_emitter_3d(&mut emitter, &mut state, &config, 1.0, None, None);
        let mut has_non_zero_z = false;
        for i in 0..emitter.data.particle_count {
            if emitter.data.positions_z[i].abs() > 0.1 {
                has_non_zero_z = true;
            }
        }
        assert!(has_non_zero_z);
    }
}

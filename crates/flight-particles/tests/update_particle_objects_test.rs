// flight-lint: allow(test-default-call) ParticleEmitterConfigOptions is an input option bag with no create function
use std::cell::RefCell;
use std::sync::Arc;

use flight_math::create_random_source;
use flight_particles::*;
use flight_particles::contract::ensure_particle_objects_state_capacity;

thread_local! {
    static SPAWN_COUNT: RefCell<u32> = RefCell::new(0);
    static SPAWNS: RefCell<Vec<[f32; 3]>> = RefCell::new(Vec::new());
    static DEATHS: RefCell<Vec<[f32; 3]>> = RefCell::new(Vec::new());
}

fn on_spawn_counter(_x: f32, _y: f32, _z: f32) {
    SPAWN_COUNT.with(|c| *c.borrow_mut() += 1);
}

fn on_spawn_recorder(x: f32, y: f32, z: f32) {
    SPAWNS.with(|c| c.borrow_mut().push([x, y, z]));
}

fn on_death_recorder(x: f32, y: f32, z: f32) {
    DEATHS.with(|c| c.borrow_mut().push([x, y, z]));
}

mod is_particle_objects_complete {
    use super::*;

    #[test]
    fn is_always_false_for_infinite_or_looping_emitters() {
        let objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        assert!(!is_particle_objects_complete(
            &objects,
            &state,
            &create_particle_emitter_config(None),
        ));
        assert!(!is_particle_objects_complete(
            &objects,
            &state,
            &create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
                duration: Some(1.0),
                ..create_particle_emitter_config_options()
            })),
        ));
    }

    #[test]
    fn is_true_once_finished_and_all_objects_are_dead() {
        let mut objects: Vec<ParticleObject> =
            (0..50).map(|_| ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }).collect();
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 50);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            lifetime_max: Some(0.5),
            duration: Some(1.0),
            looping: Some(false),
            ..create_particle_emitter_config_options()
        }));
        assert!(!is_particle_objects_complete(&objects, &state, &config));
        for _ in 0..10 {
            update_particle_objects(&mut objects, &mut state, &config, 0.1, None);
        }
        assert!(!is_particle_objects_complete(&objects, &state, &config));
        for _ in 0..10 {
            update_particle_objects(&mut objects, &mut state, &config, 0.1, None);
        }
        assert!(!objects.iter().any(|o| o.visible));
        assert!(is_particle_objects_complete(&objects, &state, &config));
    }
}

mod update_particle_objects {
    use super::*;

    #[test]
    fn a_finite_non_looping_object_emitter_stops_spawning_after_its_duration() {
        let mut objects: Vec<ParticleObject> =
            (0..50).map(|_| ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }).collect();
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 50);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            lifetime_min: Some(100.0),
            lifetime_max: Some(100.0),
            duration: Some(1.0),
            looping: Some(false),
            ..create_particle_emitter_config_options()
        }));
        for _ in 0..20 {
            update_particle_objects(&mut objects, &mut state, &config, 0.1, None);
        }
        let live_after_duration = objects.iter().filter(|o| o.visible).count();
        assert!(live_after_duration > 0);
        for _ in 0..20 {
            update_particle_objects(&mut objects, &mut state, &config, 0.1, None);
        }
        assert_eq!(
            objects.iter().filter(|o| o.visible).count(),
            live_after_duration
        );
    }

    #[test]
    fn applies_alpha_and_scale_curves_over_lifetime() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(1.0),
            lifetime_min: Some(1.0),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            scale_min: Some(4.0),
            scale_max: Some(4.0),
            alpha_curve: Some(Some(vec![1.0, 0.0, 1.0])),
            scale_curve: Some(Some(vec![1.0, 0.5, 0.0])),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        update_particle_objects(&mut objects, &mut state, &config, 0.5, None);
        assert!((objects[0].alpha - 0.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((objects[0].scale_x - 2.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
    }

    #[test]
    fn can_re_use_dead_slots_for_new_spawns() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(2.0),
            lifetime_min: Some(0.1),
            lifetime_max: Some(0.1),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        assert!(objects[0].visible);
    }

    #[test]
    fn does_nothing_when_objects_array_is_empty() {
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 0);
        let config = create_particle_emitter_config(None);
        update_particle_objects(&mut Vec::new(), &mut state, &config, 1.0, None);
    }

    #[test]
    fn fades_alpha_from_alpha_start_to_alpha_end_over_lifetime() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(1.0),
            lifetime_min: Some(1.0),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        update_particle_objects(&mut objects, &mut state, &config, 0.5, None);
        assert!((objects[0].alpha - 0.5).abs() < 0.05); // D1 f32 bound (TS: 0.05)
    }

    #[test]
    fn fires_a_one_shot_burst_on_first_frame() {
        let mut objects: Vec<ParticleObject> =
            (0..30).map(|_| ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }).collect();
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 30);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(0.0),
            burst_count: Some(10.0),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0 / 60.0, None);
        assert_eq!(objects.iter().filter(|o| o.visible).count(), 10);
        update_particle_objects(&mut objects, &mut state, &config, 1.0 / 60.0, None);
        assert_eq!(objects.iter().filter(|o| o.visible).count(), 10);
    }

    #[test]
    fn fires_on_spawn_callback_for_each_spawned_object() {
        SPAWN_COUNT.with(|c| *c.borrow_mut() = 0);
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }, ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 2);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(2.0),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(
            &mut objects,
            &mut state,
            &config,
            1.0,
            Some(&ParticleObjectsUpdateOptions {
                emitter_x: f32::NAN,
                emitter_y: f32::NAN,
                callbacks: Some(ParticleObjectCallbacks {
                    on_spawn: Some(on_spawn_counter),
                    on_death: None,
                }),
            }),
        );
        SPAWN_COUNT.with(|c| assert_eq!(*c.borrow(), 2));
    }

    #[test]
    fn ignores_a_negative_delta_time_frame() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }, ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 2);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        let live_before = objects.iter().filter(|o| o.visible).count();
        update_particle_objects(&mut objects, &mut state, &config, -1.0, None);
        assert_eq!(objects.iter().filter(|o| o.visible).count(), live_before);
    }

    #[test]
    fn ignores_a_zero_delta_time_frame() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(0.0),
            burst_count: Some(1.0),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            spread: Some(0.0),
            velocity_inheritance: Some(1.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(
            &mut objects,
            &mut state,
            &config,
            1.0 / 60.0,
            Some(&ParticleObjectsUpdateOptions {
                emitter_x: 0.0,
                emitter_y: 0.0,
                callbacks: None,
            }),
        );
        let live_before = objects.iter().filter(|o| o.visible).count();
        state.burst_timer = 0.0;
        update_particle_objects(
            &mut objects,
            &mut state,
            &config,
            0.0,
            Some(&ParticleObjectsUpdateOptions {
                emitter_x: 100.0,
                emitter_y: 0.0,
                callbacks: None,
            }),
        );
        assert_eq!(objects.iter().filter(|o| o.visible).count(), live_before);
        assert!(state.velocities[0].is_finite());
        assert!(state.velocities[1].is_finite());
    }

    #[test]
    fn kills_objects_when_their_lifetime_expires() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(1.0),
            lifetime_max: Some(0.5),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        assert!(objects[0].visible);
        update_particle_objects(&mut objects, &mut state, &config, 0.6, None);
        assert!(!objects[0].visible);
    }

    #[test]
    fn moves_objects_according_to_velocity_and_gravity() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(1.0),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            gravity_x: Some(100.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        assert!(objects[0].x > 0.0);
    }

    #[test]
    fn respects_max_particles_does_not_exceed_pool_size() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }, ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 2);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(100.0),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        let live_count = objects.iter().filter(|o| o.visible).count();
        assert!(live_count <= objects.len());
    }

    #[test]
    fn rotates_objects_at_their_per_particle_rotation_speed() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(1.0),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            spread: Some(0.0),
            rotation_speed_min: Some(std::f32::consts::PI),
            rotation_speed_max: Some(std::f32::consts::PI),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        let rot_before = objects[0].rotation;
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        assert!(
            (objects[0].rotation - rot_before - std::f32::consts::PI).abs() < 0.0005 // D1 f32 bound (TS: 0.0005)
        );
    }

    #[test]
    fn sets_spawned_objects_to_visible_and_positions_them_at_origin() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(1.0),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        assert!(objects[0].visible);
        assert_eq!(objects[0].x, 0.0);
        assert_eq!(objects[0].y, 0.0);
    }

    #[test]
    fn spawns_objects_from_the_pool() {
        let mut objects: Vec<ParticleObject> =
            (0..3).map(|_| ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }).collect();
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 3);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(2.0),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        let live_count = objects.iter().filter(|o| o.visible).count();
        assert_eq!(live_count, 2);
    }

    #[test]
    fn spawns_objects_on_the_line_emitter_boundary() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        state.random = Arc::new(|| 0.0_f32);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(1.0),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            emitter_shape: Some(EmitterShape::Line),
            emitter_width: Some(80.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        assert_eq!(objects[0].x, -40.0);
        assert_eq!(objects[0].y, 0.0);
    }

    #[test]
    fn spawns_objects_on_the_ring_emitter_boundary() {
        let mut objects: Vec<ParticleObject> =
            (0..20).map(|_| ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }).collect();
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 20);
        state.random = create_random_source(12345);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(20.0),
            max_particles: Some(20.0),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            emitter_shape: Some(EmitterShape::Ring),
            emitter_radius: Some(50.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        for obj in objects.iter() {
            let d = (obj.x * obj.x + obj.y * obj.y).sqrt();
            assert!((d - 50.0).abs() < 0.00005); // D1 f32 bound (TS: 0.00005)
        }
    }

    #[test]
    fn spawns_objects_within_circle_emitter_shape() {
        let mut objects: Vec<ParticleObject> =
            (0..20).map(|_| ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }).collect();
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 20);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(20.0),
            max_particles: Some(20.0),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            emitter_shape: Some(EmitterShape::Circle),
            emitter_radius: Some(50.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        for obj in objects.iter().filter(|o| o.visible) {
            assert!((obj.x * obj.x + obj.y * obj.y).sqrt() <= 50.0 + 1e-4);
        }
    }

    #[test]
    fn animates_scale_over_lifetime_when_scale_end_differs_from_1() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(1.0),
            lifetime_min: Some(1.0),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            scale_min: Some(2.0),
            scale_max: Some(2.0),
            scale_end: Some(0.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        update_particle_objects(&mut objects, &mut state, &config, 0.5, None);
        assert!((objects[0].scale_x - 1.0).abs() < 0.05); // D1 f32 bound (TS: 0.05)
    }

    #[test]
    fn treats_a_degenerate_line_emitter_as_a_point() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        state.random = create_random_source(42);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            emitter_shape: Some(EmitterShape::Line),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            spawn_rate: Some(1.0),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        assert_eq!(objects[0].x, 0.0);
        assert_eq!(objects[0].y, 0.0);
    }

    #[test]
    fn treats_a_degenerate_ring_emitter_as_a_point() {
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        state.random = create_random_source(42);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            emitter_shape: Some(EmitterShape::Ring),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            spawn_rate: Some(1.0),
            speed_min: Some(0.0),
            speed_max: Some(0.0),
            ..create_particle_emitter_config_options()
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        assert_eq!(objects[0].x, 0.0);
        assert_eq!(objects[0].y, 0.0);
    }

    #[test]
    fn uses_the_injected_rng_for_deterministic_spawning() {
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(5.0),
            lifetime_min: Some(10.0),
            lifetime_max: Some(10.0),
            speed_min: Some(10.0),
            speed_max: Some(200.0),
            ..create_particle_emitter_config_options()
        }));
        let run = || {
            let mut objects: Vec<ParticleObject> =
                (0..20).map(|_| ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }).collect();
            let mut state = create_particle_objects_state();
            ensure_particle_objects_state_capacity(&mut state, 20);
            state.random = create_random_source(12345);
            update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
            objects.iter().map(|o| o.rotation).collect::<Vec<_>>()
        };
        assert_eq!(run(), run());
    }

    #[test]
    fn uses_the_shared_3d_callback_payload_for_object_spawns_and_deaths() {
        SPAWNS.with(|c| c.borrow_mut().clear());
        DEATHS.with(|c| c.borrow_mut().clear());
        let mut objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        state.random = Arc::new(|| 0.0_f32);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            duration: Some(1.0),
            lifetime_max: Some(0.5),
            looping: Some(false),
            spawn_rate: Some(1.0),
            speed_max: Some(0.0),
            speed_min: Some(0.0),
            emitter_shape: Some(EmitterShape::Line),
            emitter_width: Some(20.0),
            ..create_particle_emitter_config_options()
        }));
        let callbacks = ParticleObjectsUpdateOptions {
            emitter_x: f32::NAN,
            emitter_y: f32::NAN,
            callbacks: Some(ParticleObjectCallbacks {
                on_death: Some(on_death_recorder),
                on_spawn: Some(on_spawn_recorder),
            }),
        };
        update_particle_objects(&mut objects, &mut state, &config, 1.0, Some(&callbacks));
        SPAWNS.with(|c| {
            let s = c.borrow();
            assert_eq!(s.len(), 1);
            assert_eq!(s[0], [-10.0, 0.0, 0.0]);
        });
        update_particle_objects(
            &mut objects,
            &mut state,
            &config,
            0.6,
            Some(&callbacks),
        );
        DEATHS.with(|c| {
            let d = c.borrow();
            assert_eq!(d.len(), 1);
            assert_eq!(d[0], [-10.0, 0.0, 0.0]);
        });
    }
}

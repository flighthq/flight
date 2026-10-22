use flight_particles::*;
use flight_particles::contract::*;

fn create_emitter_fixture(capacity: usize) -> ParticleEmitter2D {
    ParticleEmitter2D {
        data: ParticleEmitterData {
            alphas: vec![0.0; capacity],
            colors: vec![0.0; capacity * 3],
            ids: vec![0u16; capacity],
            particle_count: 0,
            positions_z: vec![0.0; capacity],
            transforms: vec![0.0; capacity * 4],
            velocities: vec![0.0; capacity * 2],
            world_space: false,
        },
        x: 0.0,
        y: 0.0,
    }
}

fn one_particle() -> (ParticleEmitter2D, ParticleEmitterState) {
    let mut emitter = create_emitter_fixture(1);
    let mut state = create_particle_emitter_state(None);
    ensure_particle_emitter_state_capacity(&mut state, 1, false);
    emitter.data.particle_count = 1;
    (emitter, state)
}

mod apply_particle_forces {
    use super::*;

    #[test]
    fn attractor_pulls_velocity_toward_the_point() {
        let (mut emitter, mut state) = one_particle();
        emitter.data.transforms[0] = 0.0;
        emitter.data.transforms[1] = 0.0;
        apply_particle_forces(
            &emitter,
            &mut state,
            &[ParticleForce::AttractorForce {
                x: 100.0,
                y: 0.0,
                z: 0.0,
                strength: 50.0,
                falloff: None,
                radius: None,
            }],
            1.0,
        );
        assert!((state.velocities[0] - 50.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((state.velocities[1] - 0.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
    }

    #[test]
    fn attractor_with_z_pulls_velocity_toward_the_3d_point() {
        let (emitter, mut state) = one_particle();
        apply_particle_forces(
            &emitter,
            &mut state,
            &[ParticleForce::AttractorForce {
                x: 0.0,
                y: 0.0,
                z: 100.0,
                strength: 50.0,
                falloff: None,
                radius: None,
            }],
            1.0,
        );
        assert!((state.velocities[0] - 0.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((state.velocities[1] - 0.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((state.velocities[2] - 50.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
    }

    #[test]
    fn composes_multiple_forces_additively() {
        let (emitter, mut state) = one_particle();
        apply_particle_forces(
            &emitter,
            &mut state,
            &[
                ParticleForce::WindForce {
                    x: 10.0,
                    y: 0.0,
                    z: 0.0,
                },
                ParticleForce::WindForce {
                    x: 5.0,
                    y: 0.0,
                    z: 0.0,
                },
            ],
            1.0,
        );
        assert!((state.velocities[0] - 15.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
    }

    #[test]
    fn drag_damps_z_velocity() {
        let (emitter, mut state) = one_particle();
        state.velocities[2] = 100.0;
        apply_particle_forces(
            &emitter,
            &mut state,
            &[ParticleForce::DragForce { strength: 0.5 }],
            1.0,
        );
        assert!((state.velocities[2] - 50.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
    }

    #[test]
    fn drag_reduces_existing_velocity() {
        let (emitter, mut state) = one_particle();
        state.velocities[0] = 100.0;
        state.velocities[1] = 0.0;
        apply_particle_forces(
            &emitter,
            &mut state,
            &[ParticleForce::DragForce { strength: 0.5 }],
            1.0,
        );
        assert!((state.velocities[0] - 50.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
    }

    #[test]
    fn is_a_no_op_for_an_empty_force_list_or_zero_delta_time() {
        let (emitter, mut state) = one_particle();
        state.velocities[0] = 42.0;
        apply_particle_forces(&emitter, &mut state, &[], 1.0);
        apply_particle_forces(
            &emitter,
            &mut state,
            &[ParticleForce::WindForce {
                x: 5.0,
                y: 0.0,
                z: 0.0,
            }],
            0.0,
        );
        assert_eq!(state.velocities[0], 42.0);
    }

    #[test]
    fn negative_strength_attractor_repels() {
        let (emitter, mut state) = one_particle();
        apply_particle_forces(
            &emitter,
            &mut state,
            &[ParticleForce::AttractorForce {
                x: 100.0,
                y: 0.0,
                z: 0.0,
                strength: -50.0,
                falloff: None,
                radius: None,
            }],
            1.0,
        );
        assert!(state.velocities[0] < 0.0);
    }

    #[test]
    fn radius_acts_as_a_hard_cutoff() {
        let (mut emitter, mut state) = one_particle();
        emitter.data.transforms[0] = 0.0;
        emitter.data.transforms[1] = 0.0;
        state.velocities[0] = 42.0;
        state.velocities[1] = 7.0;
        apply_particle_forces(
            &emitter,
            &mut state,
            &[ParticleForce::AttractorForce {
                x: 1000.0,
                y: 0.0,
                z: 0.0,
                strength: 50.0,
                falloff: None,
                radius: Some(50.0),
            }],
            1.0,
        );
        assert_eq!(state.velocities[0], 42.0);
        assert_eq!(state.velocities[1], 7.0);
    }

    #[test]
    fn turbulence_is_finite_and_deterministic_for_a_given_position() {
        let (mut a_emitter, mut a_state) = one_particle();
        a_emitter.data.transforms[0] = 12.5;
        a_emitter.data.transforms[1] = -7.5;
        apply_particle_forces(
            &a_emitter,
            &mut a_state,
            &[ParticleForce::TurbulenceForce {
                strength: 100.0,
                scale: 0.1,
            }],
            1.0,
        );
        let (mut b_emitter, mut b_state) = one_particle();
        b_emitter.data.transforms[0] = 12.5;
        b_emitter.data.transforms[1] = -7.5;
        apply_particle_forces(
            &b_emitter,
            &mut b_state,
            &[ParticleForce::TurbulenceForce {
                strength: 100.0,
                scale: 0.1,
            }],
            1.0,
        );
        assert!(a_state.velocities[0].is_finite());
        assert_eq!(a_state.velocities[0], b_state.velocities[0]);
        assert_eq!(a_state.velocities[1], b_state.velocities[1]);
    }

    #[test]
    fn turbulence_produces_a_finite_z_component() {
        let (mut emitter, mut state) = one_particle();
        emitter.data.transforms[0] = 5.0;
        emitter.data.transforms[1] = 5.0;
        emitter.data.positions_z[0] = 5.0;
        apply_particle_forces(
            &emitter,
            &mut state,
            &[ParticleForce::TurbulenceForce {
                strength: 100.0,
                scale: 0.1,
            }],
            1.0,
        );
        assert!(state.velocities[2].is_finite());
    }

    #[test]
    fn vortex_applies_tangential_velocity() {
        let (mut emitter, mut state) = one_particle();
        emitter.data.transforms[0] = 10.0;
        emitter.data.transforms[1] = 0.0;
        apply_particle_forces(
            &emitter,
            &mut state,
            &[ParticleForce::VortexForce {
                x: 0.0,
                y: 0.0,
                z: 0.0,
                strength: 20.0,
                falloff: None,
                radius: None,
                axis_x: 0.0,
                axis_y: 0.0,
                axis_z: 1.0,
            }],
            1.0,
        );
        assert!((state.velocities[0] - 0.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((state.velocities[1] - 20.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
    }

    #[test]
    fn vortex_with_custom_axis_rotates_around_that_axis() {
        let (mut emitter, mut state) = one_particle();
        emitter.data.transforms[0] = 0.0;
        emitter.data.transforms[1] = 10.0;
        emitter.data.positions_z[0] = 0.0;
        apply_particle_forces(
            &emitter,
            &mut state,
            &[ParticleForce::VortexForce {
                x: 0.0,
                y: 0.0,
                z: 0.0,
                strength: 20.0,
                falloff: None,
                radius: None,
                axis_x: 1.0,
                axis_y: 0.0,
                axis_z: 0.0,
            }],
            1.0,
        );
        assert!((state.velocities[0] - 0.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((state.velocities[1] - 0.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((state.velocities[2] - 20.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
    }

    #[test]
    fn wind_adds_constant_acceleration() {
        let (emitter, mut state) = one_particle();
        apply_particle_forces(
            &emitter,
            &mut state,
            &[ParticleForce::WindForce {
                x: 5.0,
                y: -3.0,
                z: 0.0,
            }],
            2.0,
        );
        assert!((state.velocities[0] - 10.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((state.velocities[1] - (-6.0)).abs() < 0.005); // D1 f32 bound (TS: 0.005)
    }

    #[test]
    fn wind_z_component_adds_acceleration_on_the_z_axis() {
        let (emitter, mut state) = one_particle();
        apply_particle_forces(
            &emitter,
            &mut state,
            &[ParticleForce::WindForce {
                x: 0.0,
                y: 0.0,
                z: 10.0,
            }],
            1.0,
        );
        assert!((state.velocities[0] - 0.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((state.velocities[1] - 0.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((state.velocities[2] - 10.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
    }
}

mod apply_particle_object_forces {
    use super::*;

    #[test]
    fn applies_forces_only_to_live_objects() {
        let mut objects = vec![
            ParticleObject {
                alpha: 1.0,
                blend_mode: None,
                color_scale_bias: None,
                rotation: 0.0,
                scale_x: 1.0,
                scale_y: 1.0,
                visible: false,
                x: 0.0,
                y: 0.0,
            },
            ParticleObject {
                alpha: 1.0,
                blend_mode: None,
                color_scale_bias: None,
                rotation: 0.0,
                scale_x: 1.0,
                scale_y: 1.0,
                visible: false,
                x: 0.0,
                y: 0.0,
            },
        ];
        let mut state = create_particle_objects_state(2, None);
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfig {
            spawn_rate: 1.0,
            lifetime_min: 100.0,
            lifetime_max: 100.0,
            speed_min: 0.0,
            speed_max: 0.0,
            alpha_curve: None,
            alpha_end: 0.0,
            alpha_start: 1.0,
            blend_mode: None,
            burst_count: 0.0,
            burst_interval: 0.0,
            color_curve: None,
            color_end_b: 1.0,
            color_end_g: 1.0,
            color_end_r: 1.0,
            color_end_variance_b: 0.0,
            color_end_variance_g: 0.0,
            color_end_variance_r: 0.0,
            color_start_b: 1.0,
            color_start_g: 1.0,
            color_start_r: 1.0,
            color_start_variance_b: 0.0,
            color_start_variance_g: 0.0,
            color_start_variance_r: 0.0,
            direction_x: 0.0,
            direction_y: -1.0,
            direction_z: 0.0,
            duration: 0.0,
            emitter_cone_angle: 0.0,
            emitter_depth: 0.0,
            emitter_height: 0.0,
            emitter_radius: 0.0,
            emitter_shape: EmitterShape::Point,
            emitter_width: 0.0,
            frame_count: 1.0,
            frame_rate: 12.0,
            gravity_x: 0.0,
            gravity_y: 0.0,
            gravity_z: 0.0,
            looping: true,
            max_particles: 1000.0,
            region_id_max: 1.0,
            region_id_min: 0.0,
            rotation_speed_max: 0.0,
            rotation_speed_min: 0.0,
            scale_curve: None,
            scale_end: 1.0,
            scale_max: 1.0,
            scale_min: 1.0,
            spread: std::f32::consts::PI,
            velocity_inheritance: 0.0,
            world_space: false,
        }));
        update_particle_objects(&mut objects, &mut state, &config, 1.0, None);
        let live_index = objects.iter().position(|o| o.visible).unwrap();
        let dead_index = if live_index == 0 { 1 } else { 0 };
        objects[live_index].x = 0.0;
        objects[live_index].y = 0.0;
        apply_particle_object_forces(
            &objects,
            &mut state,
            &[ParticleForce::WindForce {
                x: 7.0,
                y: 0.0,
                z: 0.0,
            }],
            1.0,
        );
        assert!((state.velocities[live_index * 2] - 7.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert_eq!(state.velocities[dead_index * 2], 0.0);
    }
}

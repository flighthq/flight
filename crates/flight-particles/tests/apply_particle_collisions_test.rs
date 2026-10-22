use flight_particles::contract::*;
use flight_particles::*;

struct BufferFixture {
    transforms: Vec<f32>,
    positions_z: Vec<f32>,
    particle_count: usize,
}

fn place(px: f32, py: f32, vx: f32, vy: f32) -> (BufferFixture, ParticleEmitterState) {
    let mut buf = BufferFixture {
        transforms: vec![0.0; 4],
        positions_z: vec![0.0; 1],
        particle_count: 1,
    };
    let mut state = create_particle_emitter_state();
    ensure_particle_emitter_state_capacity(&mut state, 1, false);
    buf.transforms[0] = px;
    buf.transforms[1] = py;
    state.velocities[0] = vx;
    state.velocities[1] = vy;
    return (buf, state);
}

mod apply_particle_collisions {
    use super::*;

    mod circle {
        use super::*;

        #[test]
        fn exclude_mode_keeps_a_particle_outside_the_disc() {
            let (mut buf, mut state) = place(5.0, 0.0, -10.0, 0.0);
            apply_particle_collisions(
                &mut buf.transforms,
                &mut buf.positions_z,
                buf.particle_count,
                &mut state,
                &[ParticleCollider::CircleCollider {
                    x: 0.0,
                    y: 0.0,
                    radius: 10.0,
                    mode: ColliderMode::Exclude,
                    restitution: 1.0,
                    friction: 0.0,
                }],
            );
            let d = (buf.transforms[0].powi(2) + buf.transforms[1].powi(2)).sqrt();
            assert!((d - 10.0).abs() < 0.005);
            assert!((state.velocities[0] - 10.0).abs() < 0.005);
        }

        #[test]
        fn contain_mode_keeps_a_particle_inside_the_boundary() {
            let (mut buf, mut state) = place(20.0, 0.0, 10.0, 0.0);
            apply_particle_collisions(
                &mut buf.transforms,
                &mut buf.positions_z,
                buf.particle_count,
                &mut state,
                &[ParticleCollider::CircleCollider {
                    x: 0.0,
                    y: 0.0,
                    radius: 10.0,
                    mode: ColliderMode::Contain,
                    restitution: 0.0,
                    friction: 0.0,
                }],
            );
            let d = (buf.transforms[0].powi(2) + buf.transforms[1].powi(2)).sqrt();
            assert!((d - 10.0).abs() < 0.005);
        }
    }

    #[test]
    fn is_a_no_op_with_no_colliders() {
        let (mut buf, mut state) = place(0.0, 520.0, 0.0, 100.0);
        apply_particle_collisions(
            &mut buf.transforms,
            &mut buf.positions_z,
            buf.particle_count,
            &mut state,
            &[],
        );
        assert_eq!(buf.transforms[1], 520.0);
    }

    mod plane_floor {
        use super::*;

        #[test]
        fn pushes_a_penetrating_particle_back_to_the_surface() {
            let (mut buf, mut state) = place(0.0, 520.0, 0.0, 100.0);
            apply_particle_collisions(
                &mut buf.transforms,
                &mut buf.positions_z,
                buf.particle_count,
                &mut state,
                &[ParticleCollider::PlaneCollider {
                    nx: 0.0,
                    ny: -1.0,
                    nz: 0.0,
                    distance: -500.0,
                    restitution: 0.0,
                    friction: 0.0,
                }],
            );
            assert!((buf.transforms[1] - 500.0).abs() < 0.005);
            assert!((state.velocities[1] - 0.0).abs() < 0.005);
        }

        #[test]
        fn bounces_with_restitution() {
            let (mut buf, mut state) = place(0.0, 520.0, 0.0, 100.0);
            apply_particle_collisions(
                &mut buf.transforms,
                &mut buf.positions_z,
                buf.particle_count,
                &mut state,
                &[ParticleCollider::PlaneCollider {
                    nx: 0.0,
                    ny: -1.0,
                    nz: 0.0,
                    distance: -500.0,
                    restitution: 0.5,
                    friction: 0.0,
                }],
            );
            assert!((state.velocities[1] - (-50.0)).abs() < 0.005);
        }

        #[test]
        fn applies_friction_to_the_tangential_component() {
            let (mut buf, mut state) = place(0.0, 520.0, 80.0, 100.0);
            apply_particle_collisions(
                &mut buf.transforms,
                &mut buf.positions_z,
                buf.particle_count,
                &mut state,
                &[ParticleCollider::PlaneCollider {
                    nx: 0.0,
                    ny: -1.0,
                    nz: 0.0,
                    distance: -500.0,
                    restitution: 0.0,
                    friction: 0.25,
                }],
            );
            assert!((state.velocities[0] - 60.0).abs() < 0.005);
        }

        #[test]
        fn leaves_particles_above_the_floor_untouched() {
            let (mut buf, mut state) = place(0.0, 100.0, 0.0, 100.0);
            apply_particle_collisions(
                &mut buf.transforms,
                &mut buf.positions_z,
                buf.particle_count,
                &mut state,
                &[ParticleCollider::PlaneCollider {
                    nx: 0.0,
                    ny: -1.0,
                    nz: 0.0,
                    distance: -500.0,
                    restitution: 0.0,
                    friction: 0.0,
                }],
            );
            assert_eq!(buf.transforms[1], 100.0);
            assert_eq!(state.velocities[1], 100.0);
        }
    }

    mod plane_3d_normal {
        use super::*;

        #[test]
        fn plane_with_nz_pushes_a_penetrating_particle_back() {
            let (mut buf, mut state) = place(0.0, 0.0, 0.0, 0.0);
            buf.positions_z[0] = 120.0;
            state.velocities[2] = 50.0;
            apply_particle_collisions(
                &mut buf.transforms,
                &mut buf.positions_z,
                buf.particle_count,
                &mut state,
                &[ParticleCollider::PlaneCollider {
                    nx: 0.0,
                    ny: 0.0,
                    nz: -1.0,
                    distance: -100.0,
                    restitution: 0.0,
                    friction: 0.0,
                }],
            );
            assert!((buf.positions_z[0] - 100.0).abs() < 0.005);
            assert!((state.velocities[2] - 0.0).abs() < 0.005);
        }
    }

    mod sphere {
        use super::*;

        #[test]
        fn exclude_mode_keeps_a_particle_outside_the_sphere() {
            let (mut buf, mut state) = place(3.0, 4.0, -10.0, 0.0);
            buf.positions_z[0] = 0.0;
            state.velocities[2] = 0.0;
            apply_particle_collisions(
                &mut buf.transforms,
                &mut buf.positions_z,
                buf.particle_count,
                &mut state,
                &[ParticleCollider::SphereCollider {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                    radius: 10.0,
                    mode: ColliderMode::Exclude,
                    restitution: 1.0,
                    friction: 0.0,
                }],
            );
            let d = (buf.transforms[0].powi(2)
                + buf.transforms[1].powi(2)
                + buf.positions_z[0].powi(2))
            .sqrt();
            assert!((d - 10.0).abs() < 0.005);
        }

        #[test]
        fn contain_mode_keeps_a_particle_inside_the_sphere() {
            let (mut buf, mut state) = place(20.0, 0.0, 10.0, 0.0);
            buf.positions_z[0] = 0.0;
            state.velocities[2] = 0.0;
            apply_particle_collisions(
                &mut buf.transforms,
                &mut buf.positions_z,
                buf.particle_count,
                &mut state,
                &[ParticleCollider::SphereCollider {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                    radius: 10.0,
                    mode: ColliderMode::Contain,
                    restitution: 0.0,
                    friction: 0.0,
                }],
            );
            let d = (buf.transforms[0].powi(2)
                + buf.transforms[1].powi(2)
                + buf.positions_z[0].powi(2))
            .sqrt();
            assert!((d - 10.0).abs() < 0.005);
        }

        #[test]
        fn sphere_contain_with_3d_offset() {
            let (mut buf, mut state) = place(0.0, 0.0, 0.0, 0.0);
            buf.positions_z[0] = 25.0;
            state.velocities[2] = 10.0;
            apply_particle_collisions(
                &mut buf.transforms,
                &mut buf.positions_z,
                buf.particle_count,
                &mut state,
                &[ParticleCollider::SphereCollider {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                    radius: 10.0,
                    mode: ColliderMode::Contain,
                    restitution: 0.0,
                    friction: 0.0,
                }],
            );
            assert!((buf.positions_z[0] - 10.0).abs() < 0.005);
        }
    }

    mod rect {
        use super::*;

        #[test]
        fn contain_mode_clamps_particles_to_the_bounds() {
            let (mut buf, mut state) = place(80.0, 0.0, 30.0, 0.0);
            apply_particle_collisions(
                &mut buf.transforms,
                &mut buf.positions_z,
                buf.particle_count,
                &mut state,
                &[ParticleCollider::RectangleCollider {
                    x: 0.0,
                    y: 0.0,
                    width: 100.0,
                    height: 100.0,
                    mode: ColliderMode::Contain,
                    restitution: 1.0,
                    friction: 0.0,
                }],
            );
            assert!((buf.transforms[0] - 50.0).abs() < 0.005);
            assert!((state.velocities[0] - (-30.0)).abs() < 0.005);
        }

        #[test]
        fn exclude_mode_pushes_a_particle_out_of_a_solid_box() {
            let (mut buf, mut state) = place(40.0, 0.0, 0.0, 0.0);
            apply_particle_collisions(
                &mut buf.transforms,
                &mut buf.positions_z,
                buf.particle_count,
                &mut state,
                &[ParticleCollider::RectangleCollider {
                    x: 0.0,
                    y: 0.0,
                    width: 100.0,
                    height: 100.0,
                    mode: ColliderMode::Exclude,
                    restitution: 0.0,
                    friction: 0.0,
                }],
            );
            assert!((buf.transforms[0] - 50.0).abs() < 0.005);
        }
    }
}

fn make_object() -> ParticleObject {
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
    }
}

fn place_object(px: f32, py: f32, vx: f32, vy: f32) -> (Vec<ParticleObject>, ParticleObjectsState) {
    let mut objects = vec![make_object(), make_object()];
    let mut state = create_particle_objects_state();
    ensure_particle_objects_state_capacity(&mut state, 2);
    state.lifetimes[1] = 0.0; // slot 0 age
    state.lifetimes[1 * 2 + 1] = 0.0; // slot 1 dead
    state.lifetimes[0 * 2 + 1] = 100.0; // slot 0 alive
    objects[0].x = px;
    objects[0].y = py;
    state.velocities[0] = vx;
    state.velocities[1] = vy;
    (objects, state)
}

mod apply_particle_object_collisions {
    use super::*;

    #[test]
    fn pushes_a_live_object_back_onto_a_floor_plane() {
        let (mut objects, mut state) = place_object(0.0, 520.0, 0.0, 100.0);
        apply_particle_object_collisions(
            &mut objects,
            &mut state,
            &[ParticleCollider::PlaneCollider {
                nx: 0.0,
                ny: -1.0,
                nz: 0.0,
                distance: -500.0,
                restitution: 0.0,
                friction: 0.0,
            }],
        );
        assert!((objects[0].y - 500.0).abs() < 0.005);
        assert!((state.velocities[1] - 0.0).abs() < 0.005);
    }

    #[test]
    fn bounces_a_live_object_with_restitution() {
        let (mut objects, mut state) = place_object(0.0, 520.0, 0.0, 100.0);
        apply_particle_object_collisions(
            &mut objects,
            &mut state,
            &[ParticleCollider::PlaneCollider {
                nx: 0.0,
                ny: -1.0,
                nz: 0.0,
                distance: -500.0,
                restitution: 0.5,
                friction: 0.0,
            }],
        );
        assert!((state.velocities[1] - (-50.0)).abs() < 0.005);
    }

    #[test]
    fn skips_dead_slots() {
        let (mut objects, mut state) = place_object(0.0, 100.0, 0.0, 0.0);
        objects[1].x = 0.0;
        objects[1].y = 520.0;
        apply_particle_object_collisions(
            &mut objects,
            &mut state,
            &[ParticleCollider::PlaneCollider {
                nx: 0.0,
                ny: -1.0,
                nz: 0.0,
                distance: -500.0,
                restitution: 0.0,
                friction: 0.0,
            }],
        );
        assert_eq!(objects[1].y, 520.0);
    }

    #[test]
    fn is_a_no_op_with_no_colliders() {
        let (mut objects, mut state) = place_object(0.0, 520.0, 0.0, 100.0);
        apply_particle_object_collisions(&mut objects, &mut state, &[]);
        assert_eq!(objects[0].y, 520.0);
        assert_eq!(state.velocities[1], 100.0);
    }
}

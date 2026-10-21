use flight_collision::{CollisionAabb3D, CollisionColliderShape3D, CollisionShape3D};

use super::*;
use crate::common::*;

fn test_world() -> Physics3DWorld {
    let mut world = world();
    add_body(&mut world, Physics3DBodyType::Dynamic);
    add_body(&mut world, Physics3DBodyType::Dynamic);
    world
}

fn add_sphere(world: &mut Physics3DWorld) -> Physics3DColliderRef {
    let body = world.bodies[0].clone();
    let collider = physics_3d_collider(&sphere_shape(1.0, 0.0, 0.0, 0.0), None, None, None);
    add_physics_3d_collider(world, &body, &collider);
    collider
}

mod is_physics_3d_body_state_valid {
    use super::*;

    #[test]
    fn accepts_a_freshly_built_world() {
        assert!(is_physics_3d_body_state_valid(&test_world()));
    }

    #[test]
    fn rejects_a_non_finite_pose_velocity_or_accumulator() {
        for poison in 0..5 {
            let world = test_world();
            let mut body = world.bodies[0].write().unwrap();
            match poison {
                0 => body.z = f32::NAN,
                1 => body.orientation_w = f32::NAN,
                2 => body.angular_velocity_y = f32::NAN,
                3 => body.torque_z = f32::NAN,
                4 => body.center_x = f32::NAN,
                _ => unreachable!(),
            }
            drop(body);
            assert!(!is_physics_3d_body_state_valid(&world));
        }
    }

    #[test]
    fn rejects_a_non_finite_world_inertia_tensor() {
        let world = test_world();
        world.bodies[0].write().unwrap().inverse_inertia_world_xy = f32::INFINITY;

        assert!(!is_physics_3d_body_state_valid(&world));
    }

    #[test]
    fn rejects_a_zero_or_materially_non_unit_orientation() {
        let zero = test_world();
        zero.bodies[0].write().unwrap().orientation_w = 0.0;
        assert!(!is_physics_3d_body_state_valid(&zero));

        let scaled = test_world();
        scaled.bodies[0].write().unwrap().orientation_z = 1.0;
        assert!(!is_physics_3d_body_state_valid(&scaled));

        let rounded = test_world();
        {
            let mut body = rounded.bodies[0].write().unwrap();
            body.orientation_z = 0.707_106_77;
            body.orientation_w = 0.707_106_77;
        }
        assert!(is_physics_3d_body_state_valid(&rounded));
    }

    #[test]
    fn rejects_a_body_the_index_map_has_lost_track_of() {
        let mut world = test_world();
        let index = world.bodies[0].read().unwrap().index;
        world.body_by_index.remove(&index);

        assert!(!is_physics_3d_body_state_valid(&world));
    }

    #[test]
    fn rejects_a_negative_mass() {
        let world = test_world();
        world.bodies[0].write().unwrap().mass = -1.0;

        assert!(!is_physics_3d_body_state_valid(&world));
    }
}

mod is_physics_3d_collider_state_valid {
    use super::*;

    #[test]
    fn accepts_valid_geometry_material_filter_and_derived_shape() {
        let mut world = test_world();
        add_sphere(&mut world);

        assert!(is_physics_3d_collider_state_valid(&world));
    }

    #[test]
    fn rejects_degenerate_authored_geometry_and_a_poisoned_material() {
        let mut shape_world = test_world();
        let shape_collider = add_sphere(&mut shape_world);
        if let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(sphere)) =
            &mut shape_collider.write().unwrap().local
        {
            sphere.radius = 0.0;
        }
        assert!(!is_physics_3d_collider_state_valid(&shape_world));

        let mut material_world = test_world();
        let material_collider = add_sphere(&mut material_world);
        material_collider.write().unwrap().material.friction = f32::NAN;
        assert!(!is_physics_3d_collider_state_valid(&material_world));
    }

    #[test]
    fn rejects_an_incompatible_derived_kind() {
        let mut world = test_world();
        let collider = add_sphere(&mut world);
        collider.write().unwrap().world =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
                min_x: -1.0,
                min_y: -1.0,
                min_z: -1.0,
                max_x: 1.0,
                max_y: 1.0,
                max_z: 1.0,
            }));

        assert!(!is_physics_3d_collider_state_valid(&world));
    }
}

mod is_physics_3d_contact_state_valid {
    use super::*;

    #[test]
    fn accepts_a_world_with_no_contacts() {
        assert!(is_physics_3d_contact_state_valid(&test_world()));
    }

    #[test]
    fn rejects_the_world_when_any_one_contact_is_unusable() {
        let mut world = test_world();
        world.contacts.push(physics_3d_contact(0, 1, None, None));
        let invalid = physics_3d_contact(0, 1, None, None);
        invalid.write().unwrap().friction = f32::NAN;
        world.contacts.push(invalid);

        assert!(!is_physics_3d_contact_state_valid(&world));
    }
}

mod is_physics_3d_contact_valid {
    use super::*;

    #[test]
    fn accepts_a_freshly_allocated_contact() {
        let contact = physics_3d_contact(0, 1, None, None);
        assert!(is_physics_3d_contact_valid(&contact.read().unwrap()));
    }

    #[test]
    fn rejects_a_point_count_that_runs_past_the_points_it_has() {
        let contact = physics_3d_contact(0, 1, None, None);
        contact.write().unwrap().point_count = 2;

        assert!(!is_physics_3d_contact_valid(&contact.read().unwrap()));
    }

    #[test]
    fn rejects_a_negative_friction_or_restitution() {
        let friction = physics_3d_contact(0, 1, None, None);
        friction.write().unwrap().friction = -0.1;
        assert!(!is_physics_3d_contact_valid(&friction.read().unwrap()));

        let restitution = physics_3d_contact(0, 1, None, None);
        restitution.write().unwrap().restitution = -1.0;
        assert!(!is_physics_3d_contact_valid(&restitution.read().unwrap()));
    }

    #[test]
    fn rejects_a_non_finite_field_on_a_point_it_will_actually_read() {
        let contact = physics_3d_contact(0, 1, None, None);
        let mut point = create_physics_3d_contact_point();
        point.r_bz = f32::NAN;
        {
            let mut contact = contact.write().unwrap();
            contact.points.push(point);
            contact.point_count = 1;
        }

        assert!(!is_physics_3d_contact_valid(&contact.read().unwrap()));
    }

    #[test]
    fn ignores_a_point_beyond_the_count_which_the_solver_never_reads() {
        let contact = physics_3d_contact(0, 1, None, None);
        let mut point = create_physics_3d_contact_point();
        point.depth = f32::NAN;
        contact.write().unwrap().points.push(point);

        assert!(is_physics_3d_contact_valid(&contact.read().unwrap()));
    }
}

mod is_physics_3d_gravity_valid {
    use super::*;

    #[test]
    fn accepts_finite_gravity_on_every_axis_and_rejects_any_non_finite_one() {
        assert!(is_physics_3d_gravity_valid(&test_world()));

        for axis in 0..3 {
            let mut world = test_world();
            match axis {
                0 => world.gravity_x = f32::NAN,
                1 => world.gravity_y = f32::NAN,
                2 => world.gravity_z = f32::NAN,
                _ => unreachable!(),
            }
            assert!(!is_physics_3d_gravity_valid(&world));
        }
    }
}

mod is_physics_3d_joint_state_valid {
    use super::*;

    #[test]
    fn accepts_the_infinite_defaults_every_joint_is_born_with() {
        let mut world = world();
        let ball = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        add_physics_3d_joint(&mut world, &ball);
        let mut options = distance_options(0, 1);
        options.enable_limit = Some(true);
        let distance = physics_3d_distance_joint(&options);
        add_physics_3d_joint(&mut world, &distance);

        assert!(is_physics_3d_joint_state_valid(&world));
    }

    #[test]
    fn still_rejects_a_non_finite_field_that_is_not_a_declared_bound() {
        let mut world = world();
        let joint = physics_3d_distance_joint(&distance_options(0, 1));
        add_physics_3d_joint(&mut world, &joint);
        joint.write().unwrap().length = f32::NAN;

        assert!(!is_physics_3d_joint_state_valid(&world));
    }

    #[test]
    fn accepts_a_world_with_no_joints() {
        assert!(is_physics_3d_joint_state_valid(&test_world()));
    }

    #[test]
    fn rejects_a_joint_with_an_empty_kind() {
        let mut world = test_world();
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        add_physics_3d_joint(&mut world, &joint);
        joint.write().unwrap().joint.kind.clear();

        assert!(!is_physics_3d_joint_state_valid(&world));
    }
}

mod is_physics_3d_position_iterations_valid {
    use super::*;

    #[test]
    fn accepts_zero_iterations_represented_by_the_unsigned_native_count() {
        let mut config = create_physics_3d_solver_config();
        config.sequential_impulse.position_iterations = 0;
        assert!(is_physics_3d_position_iterations_valid(&config));
    }
}

mod is_physics_3d_solver_config_valid {
    use super::*;

    #[test]
    fn accepts_the_default_tuning() {
        assert!(is_physics_3d_solver_config_valid(
            &create_physics_3d_solver_config()
        ));
    }

    #[test]
    fn rejects_a_position_correction_outside_zero_to_one() {
        let mut config = create_physics_3d_solver_config();
        config.sequential_impulse.position_correction = 1.5;

        assert!(!is_physics_3d_solver_config_valid(&config));
    }

    #[test]
    fn rejects_negative_sleep_thresholds_and_a_negative_slop() {
        let mut threshold = create_physics_3d_solver_config();
        threshold.sleep_angular_threshold = -1.0;
        assert!(!is_physics_3d_solver_config_valid(&threshold));

        let mut slop = create_physics_3d_solver_config();
        slop.sequential_impulse.penetration_slop = -0.01;
        assert!(!is_physics_3d_solver_config_valid(&slop));
    }

    #[test]
    fn does_not_speak_for_the_iteration_counts_or_substeps() {
        let mut config = create_physics_3d_solver_config();
        config.substeps = 0;
        config.sequential_impulse.velocity_iterations = 0;

        assert!(is_physics_3d_solver_config_valid(&config));
    }
}

mod is_physics_3d_substeps_valid {
    use super::*;

    #[test]
    fn requires_at_least_one_whole_sub_interval() {
        let mut config = create_physics_3d_solver_config();
        assert!(is_physics_3d_substeps_valid(&config));

        config.substeps = 0;
        assert!(!is_physics_3d_substeps_valid(&config));
    }
}

mod is_physics_3d_timestep_valid {
    use super::*;

    #[test]
    fn requires_a_finite_positive_interval() {
        assert!(is_physics_3d_timestep_valid(1.0 / 60.0));
        assert!(!is_physics_3d_timestep_valid(0.0));
        assert!(!is_physics_3d_timestep_valid(-1.0));
        assert!(!is_physics_3d_timestep_valid(f32::NAN));
        assert!(!is_physics_3d_timestep_valid(f32::INFINITY));
    }
}

mod is_physics_3d_velocity_iterations_valid {
    use super::*;

    #[test]
    fn accepts_zero_iterations_represented_by_the_unsigned_native_count() {
        let mut config = create_physics_3d_solver_config();
        config.sequential_impulse.velocity_iterations = 0;
        assert!(is_physics_3d_velocity_iterations_valid(&config));
    }
}

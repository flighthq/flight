use std::collections::HashSet;
use std::sync::Arc;

use super::*;
use crate::common::*;

fn create_box(world: &mut Physics3DWorld) -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    let mut mass = create_physics_3d_mass_data();
    compute_physics_3d_box_mass_data(0.5, 0.5, 0.5, 1.0, &mut mass);
    {
        let mut body = body.write().unwrap();
        set_rigid_body_3d_mass_data(&mut body, &mass);
        refresh_rigid_body_3d_world_inertia(&mut body);
    }
    add_physics_3d_body(world, &body);
    body
}

fn create_contact(body_a: i32, body_b: i32) -> Physics3DContactRef {
    let contact = physics_3d_contact(body_a, body_b, None, None);
    let mut point = create_physics_3d_contact_point();
    point.depth = 0.01;
    point.feature_id = 1;
    point.r_ay = -0.5;
    point.r_by = 0.5;
    {
        let mut contact = contact.write().unwrap();
        contact.normal_y = 1.0;
        contact.point_count = 1;
        contact.points.push(point);
        contact.touching = true;
    }
    contact
}

mod build_physics_3d_solve_islands {
    use super::*;

    #[test]
    fn admits_every_awake_dynamic_body() {
        let mut world = world();
        create_box(&mut world);
        create_box(&mut world);
        update_physics_3d_sleep(&mut world, 0.0);

        build_physics_3d_solve_islands(&mut world);

        assert_eq!(world.solve_island_body_indices.len(), 2);
    }

    #[test]
    fn separates_unconnected_bodies_into_distinct_islands() {
        let mut world = world();
        create_box(&mut world);
        create_box(&mut world);
        update_physics_3d_sleep(&mut world, 0.0);

        build_physics_3d_solve_islands(&mut world);

        assert_eq!(world.solve_island_roots.len(), 2);
        assert_eq!(world.solve_island_body_counts, vec![1, 1]);
    }

    #[test]
    fn merges_bodies_joined_by_a_contact_into_one_island() {
        let mut world = world();
        let a = create_box(&mut world);
        let b = create_box(&mut world);
        world.contacts.push(create_contact(
            a.read().unwrap().index,
            b.read().unwrap().index,
        ));
        update_physics_3d_sleep(&mut world, 0.0);

        build_physics_3d_solve_islands(&mut world);

        assert_eq!(world.solve_island_roots.len(), 1);
        assert_eq!(world.solve_island_body_counts, vec![2]);
        assert_eq!(world.solve_island_contact_counts, vec![1]);
    }

    #[test]
    fn does_not_bridge_two_stacks_through_shared_static_ground() {
        let mut world = world();
        let ground = create_box(&mut world);
        assert!(set_physics_3d_body_type(
            &mut world,
            &ground,
            Physics3DBodyType::Static,
        ));
        let left = create_box(&mut world);
        let right = create_box(&mut world);
        let ground_index = ground.read().unwrap().index;
        world
            .contacts
            .push(create_contact(ground_index, left.read().unwrap().index));
        world
            .contacts
            .push(create_contact(ground_index, right.read().unwrap().index));
        update_physics_3d_sleep(&mut world, 0.0);

        build_physics_3d_solve_islands(&mut world);

        assert_eq!(world.solve_island_roots.len(), 2);
    }

    #[test]
    fn excludes_static_and_sleeping_bodies_from_the_workspace() {
        let mut world = world();
        let dynamic = create_box(&mut world);
        let ground = create_box(&mut world);
        assert!(set_physics_3d_body_type(
            &mut world,
            &ground,
            Physics3DBodyType::Static,
        ));
        let dt = world.config.time_to_sleep + 1.0;
        update_physics_3d_sleep(&mut world, dt);

        build_physics_3d_solve_islands(&mut world);

        assert!(dynamic.read().unwrap().sleeping);
        assert!(world.solve_island_body_indices.is_empty());
        assert!(world.solve_island_roots.is_empty());
    }

    #[test]
    fn gives_each_island_a_contiguous_non_overlapping_slice() {
        let mut world = world();
        let a = create_box(&mut world);
        let b = create_box(&mut world);
        create_box(&mut world);
        world.contacts.push(create_contact(
            a.read().unwrap().index,
            b.read().unwrap().index,
        ));
        update_physics_3d_sleep(&mut world, 0.0);
        build_physics_3d_solve_islands(&mut world);

        let mut seen = HashSet::new();
        for island in 0..world.solve_island_roots.len() {
            let start = world.solve_island_body_starts[island];
            for offset in 0..world.solve_island_body_counts[island] {
                assert!(seen.insert(world.solve_island_body_indices[start + offset]));
            }
        }
        assert_eq!(seen.len(), 3);
    }

    #[test]
    fn skips_a_contact_whose_bodies_are_all_asleep_or_static() {
        let mut world = world();
        let body = create_box(&mut world);
        let ground = create_box(&mut world);
        assert!(set_physics_3d_body_type(
            &mut world,
            &ground,
            Physics3DBodyType::Static,
        ));
        world.contacts.push(create_contact(
            body.read().unwrap().index,
            ground.read().unwrap().index,
        ));
        let dt = world.config.time_to_sleep + 1.0;
        update_physics_3d_sleep(&mut world, dt);

        build_physics_3d_solve_islands(&mut world);

        assert!(world.solve_island_contact_indices.is_empty());
    }

    #[test]
    fn refills_in_place_rather_than_growing_across_rebuilds() {
        let mut world = world();
        create_box(&mut world);
        create_box(&mut world);
        update_physics_3d_sleep(&mut world, 0.0);
        build_physics_3d_solve_islands(&mut world);
        let first = world.solve_island_body_indices.len();

        build_physics_3d_solve_islands(&mut world);

        assert_eq!(world.solve_island_body_indices.len(), first);
    }
}

mod is_rigid_body_3d_pair_awake {
    use super::*;

    #[test]
    fn is_true_while_either_end_can_still_move() {
        let mut world = world();
        let awake = create_box(&mut world);
        let asleep = create_box(&mut world);
        asleep.write().unwrap().sleeping = true;

        assert!(is_rigid_body_3d_pair_awake(
            &awake.read().unwrap(),
            &asleep.read().unwrap(),
        ));
        assert!(is_rigid_body_3d_pair_awake(
            &asleep.read().unwrap(),
            &awake.read().unwrap(),
        ));
    }

    #[test]
    fn is_false_for_two_sleeping_bodies() {
        let mut world = world();
        let a = create_box(&mut world);
        let b = create_box(&mut world);
        a.write().unwrap().sleeping = true;
        b.write().unwrap().sleeping = true;

        assert!(!is_rigid_body_3d_pair_awake(
            &a.read().unwrap(),
            &b.read().unwrap(),
        ));
    }

    #[test]
    fn is_false_for_a_sleeper_resting_on_static_scenery() {
        let mut world = world();
        let body = create_box(&mut world);
        let ground = create_box(&mut world);
        assert!(set_physics_3d_body_type(
            &mut world,
            &ground,
            Physics3DBodyType::Static,
        ));
        body.write().unwrap().sleeping = true;

        assert!(!is_rigid_body_3d_pair_awake(
            &body.read().unwrap(),
            &ground.read().unwrap(),
        ));
    }
}

mod set_physics_3d_joint_resolution_guard {
    use super::*;

    #[test]
    fn installs_and_clears_the_optional_island_build_seam() {
        let mut guards = Physics3DGuardState {
            contact_intake_guard: None,
            enabled: false,
            joint_resolution_guard: None,
            spatial_indexing_guard: None,
            step_guard: None,
        };

        set_physics_3d_joint_resolution_guard(&mut guards, Some(Arc::new(|_| {})));
        assert!(guards.joint_resolution_guard.is_some());
        set_physics_3d_joint_resolution_guard(&mut guards, None);
        assert!(guards.joint_resolution_guard.is_none());
    }
}

mod update_physics_3d_sleep {
    use super::*;

    #[test]
    fn sleeps_a_still_body_once_it_has_been_settled_for_time_to_sleep() {
        let mut world = world();
        let body = create_box(&mut world);
        let dt = world.config.time_to_sleep + 0.001;

        update_physics_3d_sleep(&mut world, dt);

        assert!(body.read().unwrap().sleeping);
    }

    #[test]
    fn includes_floating_point_accumulation_at_the_configured_sleep_deadline() {
        let mut world = world();
        let body = create_box(&mut world);
        let frame_duration = 1.0_f64 / 60.0;
        let frames_to_sleep = (f64::from(world.config.time_to_sleep) / frame_duration) as usize;
        assert_eq!(frames_to_sleep, 30);
        let mut accumulated = 0.0_f64;

        for _ in 1..frames_to_sleep {
            accumulated += frame_duration;
            update_physics_3d_sleep(&mut world, frame_duration as f32);
        }
        assert!(!body.read().unwrap().sleeping);

        accumulated += frame_duration;
        update_physics_3d_sleep(&mut world, frame_duration as f32);
        assert!(accumulated < f64::from(world.config.time_to_sleep));
        assert!(body.read().unwrap().sleeping);
    }

    #[test]
    fn zeroes_velocity_on_sleeping_so_a_woken_body_does_not_resume_stale_motion() {
        let mut world = world();
        let body = create_box(&mut world);
        let dt = world.config.time_to_sleep + 1.0;
        update_physics_3d_sleep(&mut world, dt);
        update_physics_3d_sleep(&mut world, 0.0);
        let body = body.read().unwrap();

        assert_eq!(
            (body.velocity_x, body.velocity_y, body.velocity_z),
            (0.0, 0.0, 0.0)
        );
        assert_eq!(
            (
                body.angular_velocity_x,
                body.angular_velocity_y,
                body.angular_velocity_z,
            ),
            (0.0, 0.0, 0.0)
        );
    }

    #[test]
    fn keeps_a_moving_body_awake() {
        let mut world = world();
        let body = create_box(&mut world);
        body.write().unwrap().velocity_x = 10.0;
        let dt = world.config.time_to_sleep + 1.0;

        update_physics_3d_sleep(&mut world, dt);

        let body = body.read().unwrap();
        assert!(!body.sleeping);
        assert_eq!(body.sleep_timer, 0.0);
    }

    #[test]
    fn treats_angular_velocity_as_a_magnitude_not_per_axis() {
        let mut world = world();
        let body = create_box(&mut world);
        let per_axis = world.config.sleep_angular_threshold * 0.9;
        {
            let mut body = body.write().unwrap();
            body.angular_velocity_x = per_axis;
            body.angular_velocity_y = per_axis;
            body.angular_velocity_z = per_axis;
        }
        let dt = world.config.time_to_sleep + 1.0;

        update_physics_3d_sleep(&mut world, dt);

        assert!(!body.read().unwrap().sleeping);
    }

    #[test]
    fn treats_an_applied_force_as_motion_even_before_it_becomes_velocity() {
        let mut world = world();
        let body = create_box(&mut world);
        body.write().unwrap().force_y = 100.0;
        let dt = world.config.time_to_sleep + 1.0;

        update_physics_3d_sleep(&mut world, dt);

        assert!(!body.read().unwrap().sleeping);
    }

    #[test]
    fn treats_an_applied_torque_as_motion() {
        let mut world = world();
        let body = create_box(&mut world);
        body.write().unwrap().torque_z = 100.0;
        let dt = world.config.time_to_sleep + 1.0;

        update_physics_3d_sleep(&mut world, dt);

        assert!(!body.read().unwrap().sleeping);
    }

    #[test]
    fn keeps_a_whole_island_awake_while_any_one_member_still_moves() {
        let mut world = world();
        let settled = create_box(&mut world);
        let moving = create_box(&mut world);
        moving.write().unwrap().velocity_x = 10.0;
        world.contacts.push(create_contact(
            settled.read().unwrap().index,
            moving.read().unwrap().index,
        ));
        let dt = world.config.time_to_sleep + 1.0;

        update_physics_3d_sleep(&mut world, dt);

        assert!(!settled.read().unwrap().sleeping);
        assert!(!moving.read().unwrap().sleeping);
    }

    #[test]
    fn sleeps_an_island_only_once_every_member_has_settled() {
        let mut world = world();
        let a = create_box(&mut world);
        let b = create_box(&mut world);
        b.write().unwrap().velocity_x = 10.0;
        world.contacts.push(create_contact(
            a.read().unwrap().index,
            b.read().unwrap().index,
        ));
        let dt = world.config.time_to_sleep + 1.0;
        update_physics_3d_sleep(&mut world, dt);
        assert!(!a.read().unwrap().sleeping);

        b.write().unwrap().velocity_x = 0.0;
        update_physics_3d_sleep(&mut world, dt);

        assert!(a.read().unwrap().sleeping);
        assert!(b.read().unwrap().sleeping);
    }

    #[test]
    fn keeps_a_rider_awake_on_a_moving_kinematic_platform() {
        let mut world = world();
        let rider = create_box(&mut world);
        let lift = create_box(&mut world);
        assert!(set_physics_3d_body_type(
            &mut world,
            &lift,
            Physics3DBodyType::Kinematic,
        ));
        lift.write().unwrap().velocity_y = 5.0;
        world.contacts.push(create_contact(
            rider.read().unwrap().index,
            lift.read().unwrap().index,
        ));
        let dt = world.config.time_to_sleep + 1.0;

        update_physics_3d_sleep(&mut world, dt);

        assert!(!rider.read().unwrap().sleeping);
    }

    #[test]
    fn wakes_everything_when_sleeping_is_switched_off() {
        let mut world = world();
        let body = create_box(&mut world);
        let dt = world.config.time_to_sleep + 1.0;
        update_physics_3d_sleep(&mut world, dt);
        assert!(body.read().unwrap().sleeping);

        world.config.allow_sleeping = false;
        update_physics_3d_sleep(&mut world, 0.0);

        let body = body.read().unwrap();
        assert!(!body.sleeping);
        assert_eq!(body.sleep_timer, 0.0);
    }

    #[test]
    fn builds_the_island_graph_even_when_sleeping_is_switched_off() {
        let mut world = world();
        let a = create_box(&mut world);
        let b = create_box(&mut world);
        world.contacts.push(create_contact(
            a.read().unwrap().index,
            b.read().unwrap().index,
        ));
        world.config.allow_sleeping = false;
        update_physics_3d_sleep(&mut world, 0.0);

        build_physics_3d_solve_islands(&mut world);

        assert_eq!(world.solve_island_roots.len(), 1);
        assert_eq!(world.solve_island_body_counts, vec![2]);
    }

    #[test]
    fn never_sleeps_a_body_whose_sleep_enabled_is_false() {
        let mut world = world();
        let body = create_box(&mut world);
        body.write().unwrap().sleep_enabled = false;
        let dt = world.config.time_to_sleep + 1.0;

        update_physics_3d_sleep(&mut world, dt);

        assert!(!body.read().unwrap().sleeping);
    }

    #[test]
    fn makes_a_woken_island_earn_its_rest_from_zero() {
        let mut world = world();
        let body = create_box(&mut world);
        let dt = world.config.time_to_sleep + 1.0;
        update_physics_3d_sleep(&mut world, dt);
        assert!(body.read().unwrap().sleeping);

        body.write().unwrap().velocity_x = 10.0;
        update_physics_3d_sleep(&mut world, 0.001);

        let body = body.read().unwrap();
        assert!(!body.sleeping);
        assert_eq!(body.sleep_timer, 0.0);
    }

    #[test]
    fn leaves_static_bodies_neither_awake_nor_asleep() {
        let mut world = world();
        let ground = create_box(&mut world);
        assert!(set_physics_3d_body_type(
            &mut world,
            &ground,
            Physics3DBodyType::Static,
        ));
        let dt = world.config.time_to_sleep + 1.0;

        update_physics_3d_sleep(&mut world, dt);

        assert!(!ground.read().unwrap().sleeping);
    }
}

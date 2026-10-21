use std::sync::{Arc, RwLock, RwLockReadGuard, RwLockWriteGuard};

use flight_entity::Ref;
use flight_physics2d::*;

struct TestJoint {
    fields: Physics2DJointFields,
}

flight_physics2d::impl_physics2d_joint!(TestJoint, []);

fn add(world: &mut Physics2DWorld, body: Ref<RigidBody2D>) -> Ref<RigidBody2D> {
    add_physics2d_body(world, &body);
    return body;
}

// A contact carries no mass properties and no geometry that sleep cares about, only which two bodies
// it links, so the island tests build the linkage directly.
fn link(world: &mut Physics2DWorld, a: &Ref<RigidBody2D>, b: &Ref<RigidBody2D>, sensor: bool) {
    let (index_a, index_b) = (read(a).index, read(b).index);
    world.contacts.push(Arc::new(RwLock::new(Physics2DContact {
        body_a: index_a.min(index_b),
        body_b: index_a.max(index_b),
        collider_a: 0,
        collider_b: 0,
        enabled: true,
        friction: 0.0,
        normal_x: 0.0,
        normal_y: 1.0,
        point_count: 0,
        points: Vec::new(),
        restitution: 0.0,
        sensor,
        touching: true,
    })));
}

fn moving(world: &mut Physics2DWorld, x: f32) -> Ref<RigidBody2D> {
    let body = add(
        world,
        create_rigid_body2d(Physics2DBodyType::Dynamic, x, 0.0, None),
    );
    write(&body).velocity_x = 5.0;
    return body;
}

fn push_joint(world: &mut Physics2DWorld, kind: &str, body_a: i32, body_b: i32) {
    let make: fn() -> Physics2DJointFields = Physics2DJointFields::default;
    let mut fields = make();
    fields.kind = kind.to_string();
    fields.body_a = body_a;
    fields.body_b = body_b;
    fields.collide_connected = false;
    let joint: Physics2DJointRef = Arc::new(RwLock::new(TestJoint { fields }));
    world.joints.push(joint);
}

fn read(body: &Ref<RigidBody2D>) -> RwLockReadGuard<'_, RigidBody2D> {
    return body.read().unwrap();
}

fn solver(uses_body_a: Option<bool>, keeps_bodies_awake: Option<bool>) -> Physics2DJointSolverRef {
    return Arc::new(Physics2DJointSolver {
        clear_accumulated_impulses: None,
        keeps_bodies_awake,
        prepare: Arc::new(|_, _, _| {}),
        scale_accumulated_impulses: None,
        solve: Arc::new(|_, _| {}),
        swap_ends: None,
        uses_body_a,
        warm_start: None,
        write_reaction: None,
    });
}

fn static_body(world: &mut Physics2DWorld) -> Ref<RigidBody2D> {
    return add(
        world,
        create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None),
    );
}

fn still(world: &mut Physics2DWorld, x: f32) -> Ref<RigidBody2D> {
    return add(
        world,
        create_rigid_body2d(Physics2DBodyType::Dynamic, x, 0.0, None),
    );
}

fn write(body: &Ref<RigidBody2D>) -> RwLockWriteGuard<'_, RigidBody2D> {
    return body.write().unwrap();
}

mod build_physics2d_solve_islands {
    use super::*;

    // Vec identity: the buffers are captured once allocated (an empty Vec has no storage yet), then
    // must survive the rebuild rather than be replaced.
    #[test]
    fn builds_deterministic_contiguous_lists_without_replacing_world_owned_workspace() {
        let mut world = create_physics2d_world(None, None, None);
        world.config.allow_sleeping = false;
        let first = still(&mut world, 0.0);
        let second = still(&mut world, 1.0);
        let third = still(&mut world, 10.0);
        link(&mut world, &first, &second, false);

        update_physics2d_sleep(&mut world, 0.016);
        build_physics2d_solve_islands(&mut world);
        let body_indices = world.solve_island_body_indices.as_ptr();
        let contact_indices = world.solve_island_contact_indices.as_ptr();

        assert_eq!(world.solve_island_roots.len(), 2);
        assert_eq!(world.solve_island_body_counts, vec![2, 1]);
        assert_eq!(world.solve_island_contact_counts, vec![1, 0]);
        assert_eq!(world.solve_island_body_indices, vec![0, 1, 2]);
        assert_eq!(world.solve_island_contact_indices, vec![0]);

        world.contacts.clear();
        update_physics2d_sleep(&mut world, 0.016);
        build_physics2d_solve_islands(&mut world);
        assert_eq!(world.solve_island_body_indices.as_ptr(), body_indices);
        assert_eq!(world.solve_island_contact_indices.as_ptr(), contact_indices);
        assert_eq!(world.solve_island_body_counts, vec![1, 1, 1]);
        assert!(!read(&third).sleeping);
    }

    #[test]
    fn does_not_admit_sleeping_bodies_or_their_constraints_to_the_solve_lists() {
        let mut world = create_physics2d_world(None, None, None);
        let ground = static_body(&mut world);
        let settled = still(&mut world, 0.0);
        link(&mut world, &ground, &settled, false);

        let dt = world.config.time_to_sleep + 0.01;
        update_physics2d_sleep(&mut world, dt);
        build_physics2d_solve_islands(&mut world);

        assert!(read(&settled).sleeping);
        assert_eq!(world.solve_island_roots.len(), 0);
        assert_eq!(world.solve_island_body_indices.len(), 0);
        assert_eq!(world.solve_island_contact_indices.len(), 0);
    }
}

mod is_rigid_body2d_pair_awake {
    use super::*;

    #[test]
    fn reports_a_pair_asleep_when_both_ends_are_sleeping() {
        let mut world = create_physics2d_world(None, None, None);
        let first = still(&mut world, 0.0);
        let second = still(&mut world, 1.0);
        write(&first).sleeping = true;
        write(&second).sleeping = true;

        assert!(!is_rigid_body2d_pair_awake(&read(&first), &read(&second)));
    }

    #[test]
    fn reports_a_pair_awake_when_one_end_is_an_awake_dynamic_body() {
        let mut world = create_physics2d_world(None, None, None);
        let anchor = static_body(&mut world);
        let crate_body = still(&mut world, 0.0);

        assert!(is_rigid_body2d_pair_awake(
            &read(&anchor),
            &read(&crate_body)
        ));
    }

    #[test]
    fn reports_a_sleeper_anchored_to_static_scenery_asleep() {
        let mut world = create_physics2d_world(None, None, None);
        let anchor = static_body(&mut world);
        let crate_body = still(&mut world, 0.0);
        write(&crate_body).sleeping = true;

        assert!(!is_rigid_body2d_pair_awake(
            &read(&anchor),
            &read(&crate_body)
        ));
    }
}

mod update_physics2d_sleep {
    use super::*;

    fn sleep_dt(world: &Physics2DWorld) -> f32 {
        return world.config.time_to_sleep + 0.01;
    }

    #[test]
    fn clears_the_timer_of_a_body_it_wakes_so_rest_has_to_be_earned_again() {
        let mut world = create_physics2d_world(None, None, None);
        let settled = still(&mut world, 0.0);
        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);
        assert!(read(&settled).sleeping);

        let shoved = moving(&mut world, 1.0);
        link(&mut world, &settled, &shoved, false);
        update_physics2d_sleep(&mut world, 0.016);

        assert!(!read(&settled).sleeping);
        assert_eq!(read(&settled).sleep_timer, 0.0);
    }

    #[test]
    fn does_not_island_connect_a_one_body_joint_through_its_unused_body_a() {
        let mut world = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(
            &mut world,
            "one-body".to_string(),
            solver(Some(false), None),
        );
        let settled = still(&mut world, 0.0);
        let shoved = moving(&mut world, 1.0);
        let (shoved_index, settled_index) = (read(&shoved).index, read(&settled).index);
        push_joint(&mut world, "one-body", shoved_index, settled_index);

        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);

        assert!(read(&settled).sleeping);
        assert!(!read(&shoved).sleeping);
    }

    #[test]
    fn does_not_let_a_sensor_contact_merge_two_islands() {
        let mut world = create_physics2d_world(None, None, None);
        let settled = still(&mut world, 0.0);
        let shoved = moving(&mut world, 1.0);
        link(&mut world, &settled, &shoved, true);

        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);

        assert!(read(&settled).sleeping);
    }

    #[test]
    fn does_not_let_a_shared_static_body_merge_two_islands() {
        let mut world = create_physics2d_world(None, None, None);
        let ground = static_body(&mut world);
        let settled = still(&mut world, 0.0);
        let shoved = moving(&mut world, 20.0);
        link(&mut world, &ground, &settled, false);
        link(&mut world, &ground, &shoved, false);

        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);

        assert!(read(&settled).sleeping);
        assert!(!read(&shoved).sleeping);
    }

    #[test]
    fn keeps_a_connected_island_awake_while_one_member_has_per_body_sleeping_disabled() {
        let mut world = create_physics2d_world(None, None, None);
        let first = still(&mut world, 0.0);
        let controlled = still(&mut world, 1.0);
        write(&controlled).sleep_enabled = false;
        link(&mut world, &first, &controlled, false);

        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);

        assert!(!read(&controlled).sleeping);
        assert_eq!(read(&controlled).sleep_timer, 0.0);
        assert!(!read(&first).sleeping);
    }

    #[test]
    fn keeps_a_contact_island_awake_while_any_one_member_is_moving() {
        let mut world = create_physics2d_world(None, None, None);
        let settled = still(&mut world, 0.0);
        let shoved = moving(&mut world, 1.0);
        link(&mut world, &settled, &shoved, false);

        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);

        assert!(!read(&shoved).sleeping);
        assert!(!read(&settled).sleeping);
    }

    #[test]
    fn keeps_a_joint_island_awake_while_any_one_member_is_moving() {
        let mut world = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(&mut world, "test".to_string(), solver(None, None));
        let settled = still(&mut world, 0.0);
        let shoved = moving(&mut world, 1.0);
        let (settled_index, shoved_index) = (read(&settled).index, read(&shoved).index);
        push_joint(&mut world, "test", settled_index, shoved_index);

        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);

        assert!(!read(&settled).sleeping);
    }

    #[test]
    fn keeps_a_transitively_linked_member_awake_through_an_intermediate_body() {
        let mut world = create_physics2d_world(None, None, None);
        let settled = still(&mut world, 0.0);
        let middle = still(&mut world, 1.0);
        let shoved = moving(&mut world, 2.0);
        link(&mut world, &settled, &middle, false);
        link(&mut world, &middle, &shoved, false);

        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);

        assert!(!read(&settled).sleeping);
    }

    #[test]
    fn keeps_only_participating_endpoints_awake_for_an_externally_driven_joint() {
        let mut world = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(
            &mut world,
            "external".to_string(),
            solver(Some(false), Some(true)),
        );
        let unused = still(&mut world, 0.0);
        let driven = still(&mut world, 1.0);
        let (unused_index, driven_index) = (read(&unused).index, read(&driven).index);
        push_joint(&mut world, "external", unused_index, driven_index);

        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);

        assert!(read(&unused).sleeping);
        assert!(!read(&driven).sleeping);
        assert_eq!(read(&driven).sleep_timer, 0.0);
    }

    #[test]
    fn leaves_a_still_body_awake_until_time_to_sleep_has_elapsed() {
        let mut world = create_physics2d_world(None, None, None);
        let crate_body = still(&mut world, 0.0);

        let dt = world.config.time_to_sleep - 0.01;
        update_physics2d_sleep(&mut world, dt);

        assert!(!read(&crate_body).sleeping);
        assert!(
            (read(&crate_body).sleep_timer - (world.config.time_to_sleep - 0.01)).abs() < 0.005
        );
    }

    #[test]
    fn leaves_static_bodies_neither_asleep_nor_accumulating_a_timer() {
        let mut world = create_physics2d_world(None, None, None);
        let ground = static_body(&mut world);

        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);

        assert!(!read(&ground).sleeping);
        assert_eq!(read(&ground).sleep_timer, 0.0);
    }

    #[test]
    fn resets_the_timer_of_a_body_moving_faster_than_the_linear_threshold() {
        let mut world = create_physics2d_world(None, None, None);
        let crate_body = still(&mut world, 0.0);
        update_physics2d_sleep(&mut world, 0.4);
        write(&crate_body).velocity_x = world.config.sleep_linear_threshold * 10.0;

        update_physics2d_sleep(&mut world, 0.4);

        assert_eq!(read(&crate_body).sleep_timer, 0.0);
        assert!(!read(&crate_body).sleeping);
    }

    #[test]
    fn resets_the_timer_of_a_body_spinning_faster_than_the_angular_threshold() {
        let mut world = create_physics2d_world(None, None, None);
        let crate_body = still(&mut world, 0.0);
        update_physics2d_sleep(&mut world, 0.4);
        write(&crate_body).angular_velocity = world.config.sleep_angular_threshold * 10.0;

        update_physics2d_sleep(&mut world, 0.4);

        assert_eq!(read(&crate_body).sleep_timer, 0.0);
        assert!(!read(&crate_body).sleeping);
    }

    // Map identity: the maps are fields of the world, so "not replaced" is observed as retained
    // storage (capacity) across a shrinking update.
    #[test]
    fn reuses_world_owned_island_scratch_instead_of_allocating_maps_during_each_update() {
        let mut world = create_physics2d_world(None, None, None);
        let first = still(&mut world, 0.0);
        let second = still(&mut world, 1.0);
        link(&mut world, &first, &second, false);

        update_physics2d_sleep(&mut world, 0.1);
        let parents = world.island_parents.capacity();
        let timers = world.island_sleep_timers.capacity();
        assert!(!world.island_parents.is_empty());
        assert!(!world.island_sleep_timers.is_empty());

        world.contacts.clear();
        update_physics2d_sleep(&mut world, 0.1);
        assert_eq!(world.island_parents.capacity(), parents);
        assert_eq!(world.island_sleep_timers.capacity(), timers);
        assert_eq!(world.island_parents.len(), 0);
        assert_eq!(world.island_sleep_timers.len(), 2);
    }

    #[test]
    fn sleeps_a_body_that_has_been_still_for_the_full_time_to_sleep() {
        let mut world = create_physics2d_world(None, None, None);
        let crate_body = still(&mut world, 0.0);

        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);

        assert!(read(&crate_body).sleeping);
    }

    #[test]
    fn treats_a_body_carrying_an_applied_force_as_moving_even_at_zero_velocity() {
        let mut world = create_physics2d_world(None, None, None);
        let crate_body = still(&mut world, 0.0);
        write(&crate_body).force_x = 100.0;

        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);

        assert!(!read(&crate_body).sleeping);
        assert_eq!(read(&crate_body).sleep_timer, 0.0);
    }

    #[test]
    fn treats_a_body_carrying_an_applied_torque_as_moving_even_at_zero_velocity() {
        let mut world = create_physics2d_world(None, None, None);
        let crate_body = still(&mut world, 0.0);
        write(&crate_body).torque = 100.0;

        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);

        assert!(!read(&crate_body).sleeping);
    }

    #[test]
    fn wakes_everything_already_asleep_when_allow_sleeping_is_turned_off() {
        let mut world = create_physics2d_world(None, None, None);
        let crate_body = still(&mut world, 0.0);
        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);
        assert!(read(&crate_body).sleeping);

        world.config.allow_sleeping = false;
        update_physics2d_sleep(&mut world, 0.016);

        assert!(!read(&crate_body).sleeping);
        assert_eq!(read(&crate_body).sleep_timer, 0.0);
    }

    #[test]
    fn zeroes_the_velocity_of_a_body_it_puts_to_sleep() {
        let mut world = create_physics2d_world(None, None, None);
        let crate_body = still(&mut world, 0.0);
        write(&crate_body).velocity_x = world.config.sleep_linear_threshold / 2.0;
        write(&crate_body).angular_velocity = world.config.sleep_angular_threshold / 2.0;

        let dt = sleep_dt(&world);
        update_physics2d_sleep(&mut world, dt);

        assert!(read(&crate_body).sleeping);
        assert_eq!(read(&crate_body).velocity_x, 0.0);
        assert_eq!(read(&crate_body).angular_velocity, 0.0);
    }
}

mod wake_physics2d_body {
    use super::*;

    #[test]
    fn clears_both_the_sleeping_flag_and_the_stillness_timer() {
        let mut world = create_physics2d_world(None, None, None);
        let crate_body = still(&mut world, 0.0);
        let dt = world.config.time_to_sleep + 0.01;
        update_physics2d_sleep(&mut world, dt);

        wake_physics2d_body(&mut write(&crate_body));

        assert!(!read(&crate_body).sleeping);
        assert_eq!(read(&crate_body).sleep_timer, 0.0);
    }
}

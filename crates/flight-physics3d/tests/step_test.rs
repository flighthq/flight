use std::any::Any;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex};

use flight_collision::{CollisionAabb3D, CollisionColliderShape3D, CollisionShape3D};

use super::*;
use crate::common::*;

fn assert_close(actual: f32, expected: f32, tolerance: f32) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "expected {actual} to be within {tolerance} of {expected}"
    );
}

fn panic_message(payload: &(dyn Any + Send)) -> &str {
    if let Some(error) = payload.downcast_ref::<flight_entity::FlightError>() {
        return &error.message;
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return message;
    }
    if let Some(message) = payload.downcast_ref::<&'static str>() {
        return message;
    }
    panic!("unexpected panic payload");
}

fn create_test_world() -> Physics3DWorld {
    let mut world = world();
    world.gravity_y = -10.0;
    world
}

fn add_unit_body(world: &mut Physics3DWorld) -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    let mut data = create_physics_3d_mass_data();
    data.mass = 1.0;
    data.inertia_xx = 1.0;
    data.inertia_yy = 1.0;
    data.inertia_zz = 1.0;
    set_rigid_body_3d_mass_data(&mut body.write().unwrap(), &data);
    add_physics_3d_body(world, &body);
    body
}

fn attach_unit_box_collider(world: &mut Physics3DWorld, body: &RigidBody3DRef, friction: f32) {
    let shape = CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
        min_x: -0.5,
        min_y: -0.5,
        min_z: -0.5,
        max_x: 0.5,
        max_y: 0.5,
        max_z: 0.5,
    }));
    let material = Physics3DMaterial {
        density: 1.0,
        friction,
        restitution: 0.0,
    };
    let collider = physics_3d_collider(&shape, Some(&material), None, None);
    add_physics_3d_collider(world, body, &collider);

    let mut data = create_physics_3d_mass_data();
    data.mass = 1.0;
    data.inertia_xx = 1.0;
    data.inertia_yy = 1.0;
    data.inertia_zz = 1.0;
    let mut body = body.write().unwrap();
    set_rigid_body_3d_mass_data(&mut body, &data);
    refresh_rigid_body_3d_world_inertia(&mut body);
}

fn add_resting_contact(
    world: &mut Physics3DWorld,
    box_body: &RigidBody3DRef,
    ground: &RigidBody3DRef,
    friction: f32,
) -> Physics3DContactRef {
    let box_y = box_body.read().unwrap().y;
    ground.write().unwrap().y = box_y - 0.99;
    attach_unit_box_collider(world, box_body, friction);
    attach_unit_box_collider(world, ground, friction);
    build_physics_3d_contacts(world, &registered_registry());
    world.contacts[0].clone()
}

mod set_physics_3d_step_guard {
    use super::*;

    #[test]
    fn is_consulted_only_when_the_step_declines_and_only_while_installed() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let guard_seen = seen.clone();
        let mut guards = Physics3DGuardState {
            contact_intake_guard: None,
            enabled: false,
            joint_resolution_guard: None,
            spatial_indexing_guard: None,
            step_guard: None,
        };
        set_physics_3d_step_guard(
            &mut guards,
            Some(Arc::new(move |_, dt| guard_seen.lock().unwrap().push(dt))),
        );
        let mut world = world();
        add_body(&mut world, Physics3DBodyType::Dynamic);
        let registry = registered_registry();

        step_physics_3d(&mut world, &registry, 1.0 / 60.0, Some(&guards));
        assert!(seen.lock().unwrap().is_empty());

        step_physics_3d(&mut world, &registry, 0.0, Some(&guards));
        assert_eq!(*seen.lock().unwrap(), vec![0.0]);

        set_physics_3d_step_guard(&mut guards, None);
        step_physics_3d(&mut world, &registry, 0.0, Some(&guards));
        assert_eq!(*seen.lock().unwrap(), vec![0.0]);
    }
}

mod step_physics_3d {
    use super::*;

    #[test]
    fn advances_a_free_body_by_gravity_over_the_interval() {
        let mut world = create_test_world();
        let body = add_unit_body(&mut world);

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        let body = body.read().unwrap();
        assert_close(body.velocity_y, world.gravity_y / 60.0, 1.0e-6);
        assert_close(body.y, (world.gravity_y / 60.0) * (1.0 / 60.0), 1.0e-6);
    }

    #[test]
    fn refuses_to_run_inside_itself() {
        let mut world = create_test_world();
        let ground = add_unit_body(&mut world);
        let body = add_unit_body(&mut world);
        add_resting_contact(&mut world, &body, &ground, 0.0);
        world.contact_hooks.pre_solve = Some(Arc::new(|inner, _| {
            step_physics_3d(inner, &registered_registry(), 1.0 / 60.0, None);
        }));

        let result = catch_unwind(AssertUnwindSafe(|| {
            step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        }));
        let payload = result.expect_err("recursive step must panic");
        assert!(panic_message(payload.as_ref()).contains("recursively"));
    }

    #[test]
    fn declines_silently_rather_than_throwing_on_an_unusable_timestep() {
        let mut world = create_test_world();
        let body = add_unit_body(&mut world);
        let registry = registered_registry();

        step_physics_3d(&mut world, &registry, 0.0, None);
        step_physics_3d(&mut world, &registry, f32::NAN, None);

        let body = body.read().unwrap();
        assert_eq!(body.velocity_y, 0.0);
        assert_eq!(body.y, 0.0);
    }

    #[test]
    fn declines_on_a_body_carrying_a_non_finite_field() {
        let mut world = create_test_world();
        let body = add_unit_body(&mut world);
        let other = add_unit_body(&mut world);
        other.write().unwrap().velocity_x = f32::INFINITY;

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert_eq!(body.read().unwrap().velocity_y, 0.0);
    }

    #[test]
    fn declines_before_an_invalid_collider_can_generate_a_poisoned_contact() {
        let mut world = create_test_world();
        let body = add_unit_body(&mut world);
        let collider = physics_3d_collider(&sphere_shape(1.0, 0.0, 0.0, 0.0), None, None, None);
        add_physics_3d_collider(&mut world, &body, &collider);
        collider.write().unwrap().material.friction = f32::NAN;

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert_eq!(body.read().unwrap().velocity_y, 0.0);
        assert!(world.contacts.is_empty());
    }

    #[test]
    fn declines_when_substeps_would_advance_nothing() {
        let mut world = create_test_world();
        let body = add_unit_body(&mut world);
        world.config.substeps = 0;

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert_eq!(body.read().unwrap().velocity_y, 0.0);
    }

    #[test]
    fn clears_the_force_accumulators_so_a_force_applied_once_acts_once() {
        let mut world = create_test_world();
        world.gravity_y = 0.0;
        let body = add_unit_body(&mut world);
        apply_physics_3d_force(&body, 10.0, 0.0, 0.0);
        let registry = registered_registry();

        step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
        let after_one = body.read().unwrap().velocity_x;
        step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);

        assert_close(after_one, 10.0 / 60.0, 1.0e-6);
        assert_close(body.read().unwrap().velocity_x, after_one, 1.0e-6);
    }

    #[test]
    fn records_the_sub_interval_as_the_previous_timestep_not_the_whole_step() {
        let mut world = create_test_world();
        add_unit_body(&mut world);
        world.config.substeps = 4;

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert_close(world.previous_timestep, 1.0 / 240.0, 1.0e-7);
    }

    #[test]
    fn integrates_more_accurately_with_more_substeps_over_the_same_interval() {
        let mut coarse = create_test_world();
        let coarse_body = add_unit_body(&mut coarse);
        step_physics_3d(&mut coarse, &registered_registry(), 1.0 / 60.0, None);

        let mut fine = create_test_world();
        fine.config.substeps = 8;
        let fine_body = add_unit_body(&mut fine);
        step_physics_3d(&mut fine, &registered_registry(), 1.0 / 60.0, None);

        let exact = 0.5 * fine.gravity_y * (1.0 / 60.0) * (1.0 / 60.0);
        assert_close(
            fine_body.read().unwrap().velocity_y,
            coarse_body.read().unwrap().velocity_y,
            1.0e-6,
        );
        assert!(
            (fine_body.read().unwrap().y - exact).abs()
                < (coarse_body.read().unwrap().y - exact).abs()
        );
    }

    #[test]
    fn refreshes_contacts_between_substeps_just_like_separate_half_steps() {
        fn impact_scene() -> (Physics3DWorld, RigidBody3DRef) {
            let mut world = create_test_world();
            let ground = add_unit_body(&mut world);
            ground.write().unwrap().y = -0.5;
            set_physics_3d_body_type(&mut world, &ground, Physics3DBodyType::Static);
            attach_unit_box_collider(&mut world, &ground, 0.0);
            let body = add_unit_body(&mut world);
            {
                let mut body = body.write().unwrap();
                body.y = 0.51;
                body.velocity_y = -1.0;
            }
            attach_unit_box_collider(&mut world, &body, 0.0);
            set_physics_3d_body_fixed_rotation(&mut world, &body, true);
            (world, body)
        }

        let (mut combined, combined_body) = impact_scene();
        combined.config.substeps = 2;
        step_physics_3d(&mut combined, &registered_registry(), 1.0 / 30.0, None);

        let (mut split, split_body) = impact_scene();
        let registry = registered_registry();
        step_physics_3d(&mut split, &registry, 1.0 / 60.0, None);
        step_physics_3d(&mut split, &registry, 1.0 / 60.0, None);

        assert_close(
            combined_body.read().unwrap().y,
            split_body.read().unwrap().y,
            1.0e-6,
        );
        assert_close(
            combined_body.read().unwrap().velocity_y,
            split_body.read().unwrap().velocity_y,
            1.0e-6,
        );
        assert_eq!(combined.contacts.len(), 1);
        assert_eq!(combined.events.began.len(), 1);
    }

    #[test]
    fn resolves_a_generated_contact_so_a_falling_body_does_not_pass_through_the_ground() {
        let mut world = create_test_world();
        let ground = add_unit_body(&mut world);
        set_physics_3d_body_type(&mut world, &ground, Physics3DBodyType::Static);
        refresh_rigid_body_3d_world_inertia(&mut ground.write().unwrap());
        let body = add_unit_body(&mut world);
        body.write().unwrap().velocity_y = -10.0;
        add_resting_contact(&mut world, &body, &ground, 0.0);

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert!(body.read().unwrap().velocity_y > -1.0e-6);
    }

    #[test]
    fn holds_two_bodies_together_through_a_joint_across_many_steps() {
        let mut world = create_test_world();
        register_built_in_physics_3d_joint_solvers(&mut world);
        let anchor = add_unit_body(&mut world);
        set_physics_3d_body_type(&mut world, &anchor, Physics3DBodyType::Static);
        refresh_rigid_body_3d_world_inertia(&mut anchor.write().unwrap());
        let hanging = add_unit_body(&mut world);
        hanging.write().unwrap().x = 1.0;
        let mut options =
            frame_options(anchor.read().unwrap().index, hanging.read().unwrap().index);
        options.joint.local_anchor_bx = Some(-1.0);
        let joint = physics_3d_fixed_joint(&options);
        add_physics_3d_joint(&mut world, &joint);
        let registry = registered_registry();

        for _ in 0..120 {
            step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
        }

        assert!(hanging.read().unwrap().y.abs() < 0.05);
        assert_close(hanging.read().unwrap().x, 1.0, 0.05);
    }

    #[test]
    fn lets_a_hinge_motor_drive_a_body_it_is_anchored_to() {
        let mut world = create_test_world();
        world.gravity_y = 0.0;
        register_built_in_physics_3d_joint_solvers(&mut world);
        let anchor = add_unit_body(&mut world);
        set_physics_3d_body_type(&mut world, &anchor, Physics3DBodyType::Static);
        refresh_rigid_body_3d_world_inertia(&mut anchor.write().unwrap());
        let arm = add_unit_body(&mut world);
        let mut options = hinge_options(anchor.read().unwrap().index, arm.read().unwrap().index);
        options.enable_motor = Some(true);
        options.motor_speed = Some(2.0);
        options.max_motor_torque = Some(1000.0);
        let joint = physics_3d_hinge_joint(&options);
        add_physics_3d_joint(&mut world, &joint);
        let registry = registered_registry();

        for _ in 0..30 {
            step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
        }

        assert_close(arm.read().unwrap().angular_velocity_x, 2.0, 1.0e-4);
    }

    #[test]
    fn stops_integrating_a_settled_island_even_under_gravity() {
        let mut world = create_test_world();
        world.gravity_y = 0.0;
        let body = add_unit_body(&mut world);
        let registry = registered_registry();
        for _ in 0..60 {
            step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
        }
        assert!(body.read().unwrap().sleeping);
        let resting_y = body.read().unwrap().y;

        world.gravity_y = -10.0;
        step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);

        let body = body.read().unwrap();
        assert_eq!(body.y, resting_y);
        assert_eq!(body.velocity_y, 0.0);
        assert!(body.sleeping);
    }

    #[test]
    fn wakes_a_sleeping_body_the_caller_writes_a_velocity_onto() {
        let mut world = create_test_world();
        world.gravity_y = 0.0;
        let body = add_unit_body(&mut world);
        let registry = registered_registry();
        for _ in 0..60 {
            step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
        }
        assert!(body.read().unwrap().sleeping);

        body.write().unwrap().velocity_y = 5.0;
        step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);

        let body = body.read().unwrap();
        assert!(!body.sleeping);
        assert_close(body.y, 5.0 / 60.0, 1.0e-6);
    }

    #[test]
    fn lets_a_pre_solve_hook_disable_a_contact_for_the_step() {
        let mut world = create_test_world();
        world.config.substeps = 2;
        let ground = add_unit_body(&mut world);
        set_physics_3d_body_type(&mut world, &ground, Physics3DBodyType::Static);
        refresh_rigid_body_3d_world_inertia(&mut ground.write().unwrap());
        let body = add_unit_body(&mut world);
        body.write().unwrap().velocity_y = -10.0;
        add_resting_contact(&mut world, &body, &ground, 0.0);
        world.contact_hooks.pre_solve = Some(Arc::new(|_, contact| {
            contact.write().unwrap().enabled = false;
        }));

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert!(body.read().unwrap().velocity_y < -9.0);
    }

    #[test]
    fn runs_the_post_solve_hook_once_the_step_has_committed() {
        let mut world = create_test_world();
        let ground = add_unit_body(&mut world);
        set_physics_3d_body_type(&mut world, &ground, Physics3DBodyType::Static);
        refresh_rigid_body_3d_world_inertia(&mut ground.write().unwrap());
        let body = add_unit_body(&mut world);
        body.write().unwrap().velocity_y = -10.0;
        add_resting_contact(&mut world, &body, &ground, 0.0);
        let observed = Arc::new(Mutex::new(f32::NAN));
        let hook_observed = observed.clone();
        let hook_body = body.clone();
        world.contact_hooks.post_solve = Some(Arc::new(move |_, _| {
            *hook_observed.lock().unwrap() = hook_body.read().unwrap().velocity_y;
        }));

        step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);

        assert_close(
            *observed.lock().unwrap(),
            body.read().unwrap().velocity_y,
            1.0e-6,
        );
    }

    #[test]
    fn rejects_a_lifecycle_mutation_attempted_from_inside_a_hook() {
        let mut world = create_test_world();
        register_built_in_physics_3d_joint_solvers(&mut world);
        let ground = add_unit_body(&mut world);
        let body = add_unit_body(&mut world);
        add_resting_contact(&mut world, &body, &ground, 0.0);
        let mut options = frame_options(ground.read().unwrap().index, body.read().unwrap().index);
        options.joint.collide_connected = Some(true);
        let typed_joint = physics_3d_fixed_joint(&options);
        add_physics_3d_joint(&mut world, &typed_joint);
        let joint: Physics3DJointRef = typed_joint;
        world.contact_hooks.pre_solve = Some(Arc::new(move |inner, _| {
            remove_physics_3d_joint(inner, &joint);
        }));

        let result = catch_unwind(AssertUnwindSafe(|| {
            step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        }));
        let payload = result.expect_err("lifecycle mutation must panic");
        assert!(panic_message(payload.as_ref()).contains("stepping"));
    }

    #[test]
    fn restores_the_fields_a_throwing_hook_touched_before_the_failure_propagates() {
        let mut world = create_test_world();
        let ground = add_unit_body(&mut world);
        let body = add_unit_body(&mut world);
        let contact = add_resting_contact(&mut world, &body, &ground, 0.5);
        world.contact_hooks.pre_solve = Some(Arc::new(|_, edited| {
            edited.write().unwrap().friction = 9.0;
            panic!("hook failed");
        }));

        let result = catch_unwind(AssertUnwindSafe(|| {
            step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        }));

        let payload = result.expect_err("throwing hook must propagate");
        assert!(panic_message(payload.as_ref()).contains("hook failed"));
        assert_close(contact.read().unwrap().friction, 0.5, 1.0e-6);
        assert_eq!(ground.read().unwrap().index, 0);
    }

    #[test]
    fn rejects_a_hook_that_leaves_a_contact_the_step_cannot_use() {
        let mut world = create_test_world();
        let ground = add_unit_body(&mut world);
        let body = add_unit_body(&mut world);
        let contact = add_resting_contact(&mut world, &body, &ground, 0.0);
        world.contact_hooks.pre_solve = Some(Arc::new(|_, edited| {
            edited.write().unwrap().friction = f32::NAN;
        }));

        let result = catch_unwind(AssertUnwindSafe(|| {
            step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        }));

        let payload = result.expect_err("invalid contact hook must panic");
        assert!(panic_message(payload.as_ref()).contains("invalid contact state"));
        assert_eq!(contact.read().unwrap().friction, 0.0);
    }

    #[test]
    fn clears_the_stepping_flag_after_a_hook_throws_so_the_next_step_still_runs() {
        let mut world = create_test_world();
        let body = add_unit_body(&mut world);
        let other = add_unit_body(&mut world);
        add_resting_contact(&mut world, &other, &body, 0.0);
        world.contact_hooks.pre_solve = Some(Arc::new(|_, _| panic!("hook failed")));
        let registry = registered_registry();

        let result = catch_unwind(AssertUnwindSafe(|| {
            step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
        }));
        assert!(result.is_err());
        world.contact_hooks.pre_solve = None;

        let resumed = catch_unwind(AssertUnwindSafe(|| {
            step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
        }));
        assert!(resumed.is_ok());
        assert!(body.read().unwrap().velocity_y < 0.0);
    }

    #[test]
    fn survives_a_body_removed_while_a_joint_still_names_it() {
        let mut world = create_test_world();
        register_built_in_physics_3d_joint_solvers(&mut world);
        let anchor = add_unit_body(&mut world);
        let hanging = add_unit_body(&mut world);
        let joint = physics_3d_fixed_joint(&frame_options(
            anchor.read().unwrap().index,
            hanging.read().unwrap().index,
        ));
        add_physics_3d_joint(&mut world, &joint);
        remove_physics_3d_body(&mut world, &hanging);

        let result = catch_unwind(AssertUnwindSafe(|| {
            step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        }));

        assert!(result.is_ok());
        assert!(anchor.read().unwrap().y.is_finite());
    }
}

mod step_physics_3d_interval {
    use super::*;

    #[test]
    fn advances_one_sub_interval_without_touching_the_force_accumulators() {
        let mut world = create_test_world();
        let body = add_unit_body(&mut world);
        apply_physics_3d_force(&body, 6.0, 0.0, 0.0);
        let registry = registered_registry();
        step_physics_3d(&mut world, &registry, 1.0 / 60.0, None);
        apply_physics_3d_force(&body, 6.0, 0.0, 0.0);
        let before = body.read().unwrap().velocity_x;

        step_physics_3d_interval(&mut world, &registry, 1.0 / 60.0);

        let body = body.read().unwrap();
        assert_close(body.velocity_x, before + 6.0 / 60.0, 1.0e-6);
        assert_eq!(body.force_x, 6.0);
    }
}

// flight-lint: allow-file(f64) D1: readback values are the wire's IEEE doubles and the step dt is flight-physics2d's f64 timestep
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use flight_collision::{
    CollisionAabb2D, CollisionRegistry2D, CollisionShape2D,
    register_built_in_collision_pair_tests2d, register_built_in_collision_supports2d,
};
use flight_entity::{FlightError, FlightErrorKind, Ref, get_entity_id};
use flight_physics2d::{
    Physics2DBodyType, Physics2DJointOptions, Physics2DMaterial, Physics2DRevoluteJointOptions,
    RigidBody2D, add_physics2d_body, add_physics2d_collider, add_physics2d_joint,
    create_physics2d_collider, create_physics2d_revolute_joint, create_physics2d_world,
    create_rigid_body2d, register_built_in_physics2d_joint_solvers, step_physics2d,
};
use flight_physics2d_abi::contract::*;

use crate::support::defaults;

const MATERIAL: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};
const DT: f64 = 1.0 / 60.0;

fn box_shape(half_w: f32, half_h: f32) -> CollisionShape2D {
    return CollisionShape2D::Aabb(CollisionAabb2D {
        min_x: -half_w,
        min_y: -half_h,
        max_x: half_w,
        max_y: half_h,
    });
}

fn collision_registry() -> CollisionRegistry2D {
    let mut registry = CollisionRegistry2D {
        pair_tests: std::collections::HashMap::new(),
        supports: std::collections::HashMap::new(),
        test_guard: None,
    };
    register_built_in_collision_supports2d(&mut registry);
    register_built_in_collision_pair_tests2d(&mut registry);
    return registry;
}

fn execute(
    abi: &Physics2DAbi,
    handle: Physics2DAbiWorldHandle,
    commands: &Physics2DAbiCommandBuffer,
) -> bool {
    let mut result = create_physics2d_abi_execution_result();
    return (abi.execute)(handle, commands, &mut result);
}

fn hanging_pair() -> (Ref<RigidBody2D>, Ref<RigidBody2D>) {
    let anchor = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
    let hanging = with_collider(
        create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, -1.0, None),
        box_shape(0.5, 0.5),
    );
    return (anchor, hanging);
}

// Writes each body as id i + 1 and its colliders under consecutive ids.
fn publish(commands: &mut Physics2DAbiCommandBuffer, bodies: &[Ref<RigidBody2D>]) {
    let mut collider_id = 1;
    for (i, body) in bodies.iter().enumerate() {
        let body = body.read().unwrap();
        assert!(write_physics2d_abi_set_body_command(
            commands,
            i as u32 + 1,
            &body
        ));
        for collider in &body.colliders {
            assert!(write_physics2d_abi_set_collider_command(
                commands,
                collider_id,
                i as u32 + 1,
                &collider.read().unwrap()
            ));
            collider_id += 1;
        }
    }
}

fn revolute(
    body_a: i32,
    body_b: i32,
    break_force: Option<f32>,
) -> Ref<flight_physics2d::Physics2DRevoluteJoint> {
    return create_physics2d_revolute_joint(&Physics2DRevoluteJointOptions {
        base: Physics2DJointOptions {
            body_a,
            body_b,
            break_force,
            ..defaults()
        },
        ..defaults()
    });
}

// Pushes a collider onto an unattached body, as the source's `body.colliders.push`. Such a body is
// only ever written to a command stream here, never added to a world.
fn with_collider(body: Ref<RigidBody2D>, shape: CollisionShape2D) -> Ref<RigidBody2D> {
    let collider = create_physics2d_collider(&shape, &MATERIAL, None, None);
    body.write().unwrap().colliders.push(collider);
    return body;
}

fn floor_and_box() -> (Physics2DAbi, Physics2DAbiWorldHandle) {
    let abi = create_physics2d_abi();
    let handle = (abi.create_world)();
    let mut commands = create_physics2d_abi_command_buffer(Some(4096));
    let floor = with_collider(
        create_rigid_body2d(Physics2DBodyType::Static, 0.0, -0.5, None),
        box_shape(4.0, 0.5),
    );
    let crate_body = with_collider(
        create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.5, None),
        box_shape(0.5, 0.5),
    );
    publish(&mut commands, &[floor, crate_body]);
    assert!(execute(&abi, handle, &commands));
    return (abi, handle);
}

fn hooks(pre_solve: Option<Physics2DAbiContactHook>, capacity: usize) -> Physics2DAbiContactHooks {
    return Physics2DAbiContactHooks {
        buffer: Arc::new(RwLock::new(create_physics2d_abi_contact_buffer(
            capacity,
            capacity * 2,
        ))),
        post_solve: None,
        pre_solve,
    };
}

fn crate_y(abi: &Physics2DAbi, handle: Physics2DAbiWorldHandle) -> f64 {
    let mut out = create_physics2d_abi_body_buffer(2);
    assert!(read_physics2d_abi_bodies(&mut out, abi, handle, Some(&[2])));
    return out.values[PHYSICS2D_ABI_BODY_VALUE_Y];
}

mod create_reference_physics2d_abi {
    use super::*;

    // The load-bearing test of the package: the SAME scene through the standard object API and
    // through the wire must agree to the bit. A contract that round-trips perfectly and simulates
    // something else is worthless.
    #[test]
    fn reproduces_the_standard_solver_exactly_over_a_settling_stack() {
        let shapes = [
            box_shape(6.0, 0.5),
            box_shape(0.5, 0.5),
            box_shape(0.5, 0.5),
            box_shape(0.5, 0.5),
        ];
        let poses = [
            (Physics2DBodyType::Static, 0.0, -0.5),
            (Physics2DBodyType::Dynamic, 0.0, 0.5),
            (Physics2DBodyType::Dynamic, 0.2, 1.6),
            (Physics2DBodyType::Dynamic, -0.1, 2.7),
        ];
        let mut world = create_physics2d_world(None, None, None);
        register_built_in_physics2d_joint_solvers(&mut world);
        let registry = collision_registry();
        let bodies: Vec<Ref<RigidBody2D>> = poses
            .iter()
            .zip(shapes)
            .map(|((body_type, x, y), shape)| {
                let body = create_rigid_body2d(*body_type, *x, *y, None);
                add_physics2d_body(&mut world, &body);
                add_physics2d_collider(
                    &mut world,
                    &body,
                    &create_physics2d_collider(&shape, &MATERIAL, None, None),
                );
                return body;
            })
            .collect();

        let abi = create_physics2d_abi();
        let handle = (abi.create_world)();
        let mut commands = create_physics2d_abi_command_buffer(Some(8192));
        publish(&mut commands, &bodies);
        assert!(execute(&abi, handle, &commands));

        let mut out = create_physics2d_abi_body_buffer(8);
        for _ in 0..120 {
            step_physics2d(&mut world, DT, &registry, None);
            assert_eq!(
                step_physics2d_abi_world(&abi, handle, DT, None),
                Physics2DAbiStepStatus::Complete
            );
        }
        assert!(read_physics2d_abi_bodies(&mut out, &abi, handle, None));
        assert_eq!(out.count, 4);

        for (i, body) in bodies.iter().enumerate() {
            let body = body.read().unwrap();
            let base = i * PHYSICS2D_ABI_BODY_VALUE_STRIDE;
            assert_eq!(
                out.values[base + PHYSICS2D_ABI_BODY_VALUE_X],
                f64::from(body.x),
                "body {} x",
                i
            );
            assert_eq!(
                out.values[base + PHYSICS2D_ABI_BODY_VALUE_Y],
                f64::from(body.y),
                "body {} y",
                i
            );
            assert_eq!(
                out.values[base + PHYSICS2D_ABI_BODY_VALUE_ANGLE],
                f64::from(body.angle),
                "body {} angle",
                i
            );
            assert_eq!(
                out.values[base + PHYSICS2D_ABI_BODY_VALUE_VELOCITY_X],
                f64::from(body.velocity_x)
            );
            assert_eq!(
                out.values[base + PHYSICS2D_ABI_BODY_VALUE_VELOCITY_Y],
                f64::from(body.velocity_y)
            );
            assert_eq!(
                out.values[base + PHYSICS2D_ABI_BODY_VALUE_ANGULAR_VELOCITY],
                f64::from(body.angular_velocity)
            );
        }
        // The stack must actually have moved, or bit-equality says nothing.
        assert!(bodies[3].read().unwrap().y < 2.7);
    }

    #[test]
    fn derives_mass_from_colliders_rather_than_from_the_wire() {
        // Mass is the one body block the mutation path deliberately ignores: Physics2D derives it from
        // collider geometry and density, and the ABI keeps that the single source.
        let source = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        let mut world = create_physics2d_world(None, None, None);
        add_physics2d_body(&mut world, &source);
        add_physics2d_collider(
            &mut world,
            &source,
            &create_physics2d_collider(&box_shape(1.0, 1.0), &MATERIAL, None, None),
        );
        let derived_mass = source.read().unwrap().mass;
        assert!(derived_mass > 0.0);

        let abi = create_physics2d_abi();
        let handle = (abi.create_world)();
        let mut commands = create_physics2d_abi_command_buffer(Some(4096));
        source.write().unwrap().mass = 12345.0;
        publish(&mut commands, &[source]);
        assert!(execute(&abi, handle, &commands));

        let mut out = create_physics2d_abi_body_buffer(1);
        assert!(read_physics2d_abi_bodies(&mut out, &abi, handle, None));
        assert_eq!(
            out.values[PHYSICS2D_ABI_BODY_VALUE_MASS],
            f64::from(derived_mass)
        );
        assert_ne!(out.values[PHYSICS2D_ABI_BODY_VALUE_MASS], 12345.0);
    }

    #[test]
    fn reports_a_joint_that_broke_which_the_world_no_longer_holds() {
        // A 2D joint carries no `broken` field: breaking REMOVES it. The readback flag is the only
        // channel by which a caller holding an id learns its joint is gone, with the load that did it.
        let (anchor, hanging) = hanging_pair();
        let abi = create_physics2d_abi();
        let handle = (abi.create_world)();
        let mut commands = create_physics2d_abi_command_buffer(Some(4096));
        publish(&mut commands, &[anchor, hanging]);
        assert!(write_physics2d_abi_set_joint_command(
            &mut commands,
            1,
            1,
            2,
            &*revolute(0, 1, Some(0.001)).read().unwrap()
        ));
        assert!(execute(&abi, handle, &commands));

        assert_eq!(
            step_physics2d_abi_world(&abi, handle, DT, None),
            Physics2DAbiStepStatus::Complete
        );
        let mut joints = create_physics2d_abi_joint_buffer(4);
        assert!((abi.read_joints)(handle, &mut joints));
        assert_eq!(joints.count, 1);
        assert_eq!(joints.ids[0], 1);
        assert_eq!(
            joints.flags[0] & PHYSICS2D_ABI_JOINT_FLAG_BROKEN,
            PHYSICS2D_ABI_JOINT_FLAG_BROKEN
        );
        assert!(joints.values[0].hypot(joints.values[1]) > 0.0);

        assert!((abi.read_joints)(handle, &mut joints));
        assert_eq!(joints.count, 0);
        assert_eq!(joints.required_count, 0);
    }

    #[test]
    fn retires_an_unread_broken_event_when_its_id_is_reused_by_a_live_joint() {
        let (anchor, hanging) = hanging_pair();
        let abi = create_physics2d_abi();
        let handle = (abi.create_world)();
        let mut setup = create_physics2d_abi_command_buffer(Some(4096));
        publish(&mut setup, &[anchor, hanging]);
        assert!(write_physics2d_abi_set_joint_command(
            &mut setup,
            1,
            1,
            2,
            &*revolute(0, 1, Some(0.001)).read().unwrap()
        ));
        assert!(execute(&abi, handle, &setup));
        assert_eq!(
            step_physics2d_abi_world(&abi, handle, DT, None),
            Physics2DAbiStepStatus::Complete
        );

        let mut replacement = create_physics2d_abi_command_buffer(Some(512));
        assert!(write_physics2d_abi_set_joint_command(
            &mut replacement,
            1,
            1,
            2,
            &*revolute(0, 1, None).read().unwrap()
        ));
        assert!(execute(&abi, handle, &replacement));

        let mut joints = create_physics2d_abi_joint_buffer(4);
        assert!((abi.read_joints)(handle, &mut joints));
        assert_eq!(joints.count, 1);
        assert_eq!(joints.required_count, 1);
        assert_eq!(joints.ids[0], 1);
        assert_eq!(joints.flags[0] & PHYSICS2D_ABI_JOINT_FLAG_BROKEN, 0);
    }

    #[test]
    fn keeps_a_joint_reported_and_unbroken_while_it_holds() {
        let (anchor, hanging) = hanging_pair();
        let abi = create_physics2d_abi();
        let handle = (abi.create_world)();
        let mut commands = create_physics2d_abi_command_buffer(Some(4096));
        publish(&mut commands, &[anchor, hanging]);
        assert!(write_physics2d_abi_set_joint_command(
            &mut commands,
            7,
            1,
            2,
            &*revolute(0, 1, None).read().unwrap()
        ));
        assert!(execute(&abi, handle, &commands));
        assert_eq!(
            step_physics2d_abi_world(&abi, handle, DT, None),
            Physics2DAbiStepStatus::Complete
        );

        let mut joints = create_physics2d_abi_joint_buffer(4);
        assert!((abi.read_joints)(handle, &mut joints));
        assert_eq!(joints.count, 1);
        assert_eq!(joints.ids[0], 7);
        assert_eq!(joints.flags[0] & PHYSICS2D_ABI_JOINT_FLAG_BROKEN, 0);
    }

    #[test]
    fn applies_an_impulse_through_the_wire_exactly_as_the_standard_helper_does() {
        let direct = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        let mut world = create_physics2d_world(None, None, None);
        world.gravity_y = 0.0;
        add_physics2d_body(&mut world, &direct);
        add_physics2d_collider(
            &mut world,
            &direct,
            &create_physics2d_collider(&box_shape(0.5, 0.5), &MATERIAL, None, None),
        );

        let abi = create_physics2d_abi();
        let handle = (abi.create_world)();
        let mut commands = create_physics2d_abi_command_buffer(Some(4096));
        assert!(write_physics2d_abi_set_gravity_command(
            &mut commands,
            0.0,
            0.0
        ));
        publish(&mut commands, &[direct.clone()]);
        assert!(write_physics2d_abi_apply_linear_impulse_command(
            &mut commands,
            1,
            3.0,
            -2.0
        ));
        assert!(execute(&abi, handle, &commands));

        let (expected_x, expected_y) = {
            let mut body = direct.write().unwrap();
            body.velocity_x += 3.0 / body.mass;
            body.velocity_y += -2.0 / body.mass;
            (f64::from(body.velocity_x), f64::from(body.velocity_y))
        };
        let mut out = create_physics2d_abi_body_buffer(1);
        assert!(read_physics2d_abi_bodies(&mut out, &abi, handle, None));
        for (actual, expected) in [
            (out.values[PHYSICS2D_ABI_BODY_VALUE_VELOCITY_X], expected_x),
            (out.values[PHYSICS2D_ABI_BODY_VALUE_VELOCITY_Y], expected_y),
        ] {
            // D1 f32 bound (TS: 0.5e-12)
            let bound = 0.5e-12_f64.max(4.0 * f64::from(f32::EPSILON) * expected.abs().max(1.0));
            assert!(
                (actual - expected).abs() <= bound,
                "expected {}, got {}",
                expected,
                actual
            );
        }
    }

    #[test]
    fn declines_a_step_the_standard_world_would_also_decline() {
        let abi = create_physics2d_abi();
        let handle = (abi.create_world)();
        assert_eq!(
            step_physics2d_abi_world(&abi, handle, f64::NAN, None),
            Physics2DAbiStepStatus::Declined
        );
        assert_eq!(
            step_physics2d_abi_world(&abi, handle, -1.0, None),
            Physics2DAbiStepStatus::Declined
        );
    }

    #[test]
    fn reports_a_destroyed_world_as_stale_rather_than_failing_silently() {
        let abi = create_physics2d_abi();
        let handle = (abi.create_world)();
        assert!((abi.destroy_world)(handle));
        assert_eq!(
            (abi.get_world_status)(handle),
            Physics2DAbiWorldStatus::Stale
        );
        assert_eq!(
            step_physics2d_abi_world(&abi, handle, DT, None),
            Physics2DAbiStepStatus::StaleWorld
        );
        let mut out = create_physics2d_abi_body_buffer(1);
        assert!(!read_physics2d_abi_bodies(&mut out, &abi, handle, None));
    }

    #[test]
    fn adds_a_joint_the_standard_world_also_accepts() {
        let mut world = create_physics2d_world(None, None, None);
        register_built_in_physics2d_joint_solvers(&mut world);
        let registry = collision_registry();
        let a = create_rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        let b = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, -1.0, None);
        add_physics2d_body(&mut world, &a);
        add_physics2d_body(&mut world, &b);
        add_physics2d_collider(
            &mut world,
            &b,
            &create_physics2d_collider(&box_shape(0.5, 0.5), &MATERIAL, None, None),
        );
        let (a_index, b_index) = (a.read().unwrap().index, b.read().unwrap().index);
        let direct_joint: flight_physics2d::Physics2DJointRef = revolute(a_index, b_index, None);
        add_physics2d_joint(&mut world, &direct_joint);
        for _ in 0..60 {
            step_physics2d(&mut world, DT, &registry, None);
        }

        let abi = create_physics2d_abi();
        let handle = (abi.create_world)();
        let mut commands = create_physics2d_abi_command_buffer(Some(4096));
        publish(&mut commands, &[a, b]);
        assert!(write_physics2d_abi_set_joint_command(
            &mut commands,
            1,
            1,
            2,
            &*revolute(0, 1, None).read().unwrap()
        ));
        assert!(execute(&abi, handle, &commands));
        let mut joints = create_physics2d_abi_joint_buffer(4);
        assert!((abi.read_joints)(handle, &mut joints));
        assert_eq!(joints.count, 1);
    }

    // The source suite never runs a contact hook; these pin the hook contract the reference
    // implements: synchronous, reentrancy-safe, cleaned up on a throw, validated on readback.

    #[test]
    fn runs_a_pre_solve_hook_that_can_disable_a_contact() {
        let (resting, resting_handle) = floor_and_box();
        let (abi, handle) = floor_and_box();
        let calls = Arc::new(AtomicUsize::new(0));
        let seen = calls.clone();
        let hook: Physics2DAbiContactHook =
            Arc::new(move |buffer: &mut Physics2DAbiContactBuffer| {
                seen.fetch_add(1, Ordering::SeqCst);
                assert_eq!(buffer.count, 1);
                assert_eq!([buffer.ids[0], buffer.ids[1]], [1, 2]);
                buffer.flags[0] &= !PHYSICS2D_ABI_CONTACT_FLAG_ENABLED;
            });
        let disabling = hooks(Some(hook), 1);
        for _ in 0..30 {
            assert_eq!(
                step_physics2d_abi_world(&abi, handle, DT, Some(&disabling)),
                Physics2DAbiStepStatus::Complete
            );
            step_physics2d_abi_world(&resting, resting_handle, DT, None);
        }
        assert!(calls.load(Ordering::SeqCst) > 0);
        // With every contact disabled the crate falls through the floor; without, it rests on it.
        assert!(crate_y(&abi, handle) < 0.0);
        assert!(crate_y(&resting, resting_handle) > 0.4);
    }

    #[test]
    fn reports_the_world_busy_to_a_reentrant_hook_and_ready_afterwards() {
        let (abi, handle) = floor_and_box();
        let (status, step, read_bodies, destroy) = (
            abi.get_world_status.clone(),
            abi.step.clone(),
            abi.read_bodies.clone(),
            abi.destroy_world.clone(),
        );
        let observed = Arc::new(Mutex::new(Vec::new()));
        let record = observed.clone();
        let hook: Physics2DAbiContactHook =
            Arc::new(move |_buffer: &mut Physics2DAbiContactBuffer| {
                let mut bodies = create_physics2d_abi_body_buffer(2);
                record.lock().unwrap().push((
                    status(handle),
                    step(handle, DT, None),
                    read_bodies(handle, None, &mut bodies),
                    destroy(handle),
                ));
            });
        let reentrant = hooks(Some(hook), 1);
        for _ in 0..10 {
            step_physics2d_abi_world(&abi, handle, DT, Some(&reentrant));
        }
        let observed = observed.lock().unwrap();
        assert!(!observed.is_empty());
        for entry in observed.iter() {
            assert_eq!(
                *entry,
                (
                    Physics2DAbiWorldStatus::Busy,
                    Physics2DAbiStepStatus::BusyWorld,
                    false,
                    false
                )
            );
        }
        assert_eq!(
            (abi.get_world_status)(handle),
            Physics2DAbiWorldStatus::Ready
        );
    }

    #[test]
    fn releases_the_world_and_detaches_the_hooks_when_a_hook_throws() {
        let (abi, handle) = floor_and_box();
        for _ in 0..30 {
            step_physics2d_abi_world(&abi, handle, DT, None);
        }
        let hook: Physics2DAbiContactHook = Arc::new(|_buffer: &mut Physics2DAbiContactBuffer| {
            panic!("hook failure");
        });
        let throwing = hooks(Some(hook), 1);
        let outcome = catch_unwind(AssertUnwindSafe(|| {
            step_physics2d_abi_world(&abi, handle, DT, Some(&throwing))
        }));
        assert!(outcome.is_err());

        assert_eq!(
            (abi.get_world_status)(handle),
            Physics2DAbiWorldStatus::Ready
        );
        // The hook was detached: a plain step no longer reaches it.
        assert_eq!(
            step_physics2d_abi_world(&abi, handle, DT, None),
            Physics2DAbiStepStatus::Complete
        );
        assert!(crate_y(&abi, handle) > 0.4);
    }

    #[test]
    fn throws_a_range_error_when_a_hook_writes_a_non_finite_friction() {
        let (abi, handle) = floor_and_box();
        for _ in 0..30 {
            step_physics2d_abi_world(&abi, handle, DT, None);
        }
        let hook: Physics2DAbiContactHook = Arc::new(|buffer: &mut Physics2DAbiContactBuffer| {
            buffer.values[PHYSICS2D_ABI_CONTACT_VALUE_FRICTION] = f64::NAN;
        });
        let invalid = hooks(Some(hook), 1);
        let payload = catch_unwind(AssertUnwindSafe(|| {
            step_physics2d_abi_world(&abi, handle, DT, Some(&invalid))
        }))
        .expect_err("a RangeError");
        assert_eq!(
            payload
                .downcast_ref::<FlightError>()
                .expect("a FlightError")
                .kind,
            FlightErrorKind::RangeError
        );
        assert_eq!(
            (abi.get_world_status)(handle),
            Physics2DAbiWorldStatus::Ready
        );
    }

    #[test]
    fn refuses_a_hook_buffer_too_small_for_one_contact() {
        let (abi, handle) = floor_and_box();
        let hook: Physics2DAbiContactHook = Arc::new(|_buffer: &mut Physics2DAbiContactBuffer| {});
        let empty = hooks(Some(hook), 0);
        assert_eq!(
            step_physics2d_abi_world(&abi, handle, DT, Some(&empty)),
            Physics2DAbiStepStatus::InsufficientHookBuffer
        );
        // A hook set with no callbacks needs no buffer.
        let none = hooks(None, 0);
        assert_eq!(
            step_physics2d_abi_world(&abi, handle, DT, Some(&none)),
            Physics2DAbiStepStatus::Complete
        );
    }
}

mod initialize_reference_physics2d_abi {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_reference_physics2d_abi() {
        let mut abi = create_reference_physics2d_abi();
        let id = get_entity_id(&abi);
        let old = (abi.create_world)();

        initialize_reference_physics2d_abi(&mut abi);

        // A fresh backend: the old world table is gone, the identity is the same allocation.
        assert_eq!((abi.get_world_status)(old), Physics2DAbiWorldStatus::Stale);
        assert_eq!(abi.version, PHYSICS2D_ABI_VERSION);
        assert_eq!(get_entity_id(&abi), id);
        assert!((abi.create_world)() > 0);
    }
}

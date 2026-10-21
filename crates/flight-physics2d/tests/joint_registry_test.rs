use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_collision::{
    CollisionAabb2D, CollisionRegistry2D, CollisionShape2D,
    register_built_in_collision_pair_tests2d, register_built_in_collision_supports2d,
};
use flight_entity::{FlightError, Ref, allocate_entity};
use flight_physics2d::*;

const STONE: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};

// A custom joint kind carrying one kind-owned directional field.
#[derive(Clone, Debug, Default)]
struct TestJoint {
    fields: Physics2DJointFields,
    direction: f32,
}

flight_physics2d::impl_physics2d_joint!(TestJoint, [direction]);

fn body(world: &mut Physics2DWorld, x: f32, y: f32) -> Ref<RigidBody2D> {
    let made = create_rigid_body2d(Physics2DBodyType::Dynamic, x, y, None);
    let local = CollisionShape2D::Aabb(CollisionAabb2D {
        min_x: -0.5,
        min_y: -0.5,
        max_x: 0.5,
        max_y: 0.5,
    });
    made.write()
        .unwrap()
        .colliders
        .push(create_physics2d_collider(&local, &STONE, None, None));
    add_physics2d_body(world, &made);
    return made;
}

fn direction_of(joint: &Physics2DJointRef) -> f32 {
    return joint
        .read()
        .unwrap()
        .as_any()
        .downcast_ref::<TestJoint>()
        .unwrap()
        .direction;
}

fn fields_of(joint: &Physics2DJointRef) -> Physics2DJointFields {
    return joint.read().unwrap().joint_fields().clone();
}

fn index_of(body: &Ref<RigidBody2D>) -> i32 {
    return body.read().unwrap().index;
}

fn joint(
    kind: &str,
    body_a: i32,
    body_b: i32,
    anchor_ax: f32,
    anchor_bx: f32,
) -> Physics2DJointRef {
    let mut out: TestJoint = allocate_entity();
    out.kind = kind.to_string();
    out.body_a = body_a;
    out.body_b = body_b;
    out.local_anchor_ax = anchor_ax;
    out.local_anchor_ay = 0.0;
    out.local_anchor_bx = anchor_bx;
    out.local_anchor_by = 0.0;
    out.collide_connected = false;
    out.break_force = f32::INFINITY;
    out.break_torque = f32::INFINITY;
    out.impulse0 = 0.0;
    out.impulse1 = 0.0;
    out.impulse2 = 0.0;
    out.r_ax = 0.0;
    out.r_ay = 0.0;
    out.r_bx = 0.0;
    out.r_by = 0.0;
    return Arc::new(RwLock::new(out));
}

fn registry() -> CollisionRegistry2D {
    let mut registry = CollisionRegistry2D {
        pair_tests: std::collections::HashMap::new(),
        supports: std::collections::HashMap::new(),
        test_guard: None,
    };
    register_built_in_collision_supports2d(&mut registry);
    register_built_in_collision_pair_tests2d(&mut registry);
    return registry;
}

fn set_asleep(body: &Ref<RigidBody2D>) {
    let mut guard = body.write().unwrap();
    guard.sleeping = true;
    guard.sleep_timer = 5.0;
}

fn sleep_state(body: &Ref<RigidBody2D>) -> (bool, f64) {
    let guard = body.read().unwrap();
    return (guard.sleeping, guard.sleep_timer);
}

fn solver() -> Physics2DJointSolver {
    return Physics2DJointSolver {
        clear_accumulated_impulses: None,
        keeps_bodies_awake: None,
        prepare: Arc::new(|_, _, _| {}),
        scale_accumulated_impulses: None,
        solve: Arc::new(|_, _| {}),
        swap_ends: None,
        uses_body_a: None,
        warm_start: None,
        write_reaction: None,
    };
}

fn suppression(world: &Physics2DWorld, a: i32, b: i32) -> Option<u32> {
    return world
        .joint_collision_suppressions
        .get(&a)
        .and_then(|inner| inner.get(&b))
        .copied();
}

fn thrown_message(action: impl FnOnce()) -> Option<String> {
    let result = catch_unwind(AssertUnwindSafe(action));
    return match result {
        Ok(()) => None,
        Err(payload) => Some(
            payload
                .downcast_ref::<FlightError>()
                .map(|error| error.message.clone())
                .unwrap_or_default(),
        ),
    };
}

mod add_physics2d_joint {
    use super::*;

    #[test]
    fn canonicalizes_an_already_added_joint_when_its_solver_registers_later_reversing_direction() {
        // Critic's repro: register the solver AFTER the joint is already in the world, and the kind's
        // own reversal must still run. Previously the generic swap had already happened at add time
        // without the kind's consent, so the directional field kept its authored sign forever.
        let mut world = create_physics2d_world(None, None, None);
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        let added = joint("Directional", index_of(&second), index_of(&first), 7.0, 9.0);
        added
            .write()
            .unwrap()
            .as_any_mut()
            .downcast_mut::<TestJoint>()
            .unwrap()
            .direction = 1.0;
        add_physics2d_joint(&mut world, &added);

        let mut swapping = solver();
        swapping.swap_ends = Some(Arc::new(|target| {
            let directional = target.as_any_mut().downcast_mut::<TestJoint>().unwrap();
            directional.direction = -directional.direction;
            return true;
        }));
        register_physics2d_joint_solver(&mut world, "Directional".to_string(), Arc::new(swapping));

        assert_eq!(fields_of(&added).body_a, index_of(&first));
        assert_eq!(fields_of(&added).local_anchor_ax, 9.0);
        assert_eq!(direction_of(&added), -1.0);
    }

    #[test]
    fn honours_a_solver_that_vetoes_the_swap_when_it_registers_later() {
        // A kind that vetoes the exchange must still be obeyed on the deferred path.
        let mut world = create_physics2d_world(None, None, None);
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        let added = joint("Vetoing", index_of(&second), index_of(&first), 7.0, 9.0);
        add_physics2d_joint(&mut world, &added);

        let mut vetoing = solver();
        vetoing.swap_ends = Some(Arc::new(|_| false));
        register_physics2d_joint_solver(&mut world, "Vetoing".to_string(), Arc::new(vetoing));

        assert_eq!(fields_of(&added).body_a, index_of(&second));
        assert_eq!(fields_of(&added).local_anchor_ax, 7.0);
    }

    #[test]
    fn leaves_a_joint_whose_kind_has_no_solver_in_its_authored_order() {
        // Adding a joint whose kind has no solver yet is explicitly supported — a scene can deserialize
        // ahead of the code that solves it. Canonicalizing there would exchange bodies and anchors
        // while the kind's own direction fields stayed as authored, and no later registration would
        // repair that half swap. So ordering waits for the kind, and an unsolved joint constrains
        // nothing meanwhile.
        let mut world = create_physics2d_world(None, None, None);
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);

        let added = joint("Unknown", index_of(&second), index_of(&first), 7.0, 9.0);
        add_physics2d_joint(&mut world, &added);

        assert_eq!(fields_of(&added).body_a, index_of(&second));
        assert_eq!(fields_of(&added).local_anchor_ax, 7.0);
    }

    #[test]
    fn leaves_an_already_ordered_joint_untouched() {
        let mut world = create_physics2d_world(None, None, None);
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        let added = joint("Test", index_of(&first), index_of(&second), 7.0, 9.0);
        add_physics2d_joint(&mut world, &added);
        assert_eq!(fields_of(&added).body_a, index_of(&first));
        assert_eq!(fields_of(&added).local_anchor_ax, 7.0);
    }

    #[test]
    fn leaves_an_unknown_joint_inert_until_registration_then_wakes_both_ends() {
        let mut world = create_physics2d_world(None, None, None);
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        set_asleep(&first);
        set_asleep(&second);

        add_physics2d_joint(
            &mut world,
            &joint("Deferred", index_of(&first), index_of(&second), 0.0, 0.0),
        );
        assert!(sleep_state(&first).0);
        assert!(sleep_state(&second).0);

        register_physics2d_joint_solver(&mut world, "Deferred".to_string(), Arc::new(solver()));
        assert_eq!(sleep_state(&first), (false, 0.0));
        assert_eq!(sleep_state(&second), (false, 0.0));
    }

    #[test]
    fn orders_the_joint_by_body_index_carrying_its_anchors_with_the_swap() {
        // Obligation 1 applies to joints too: they enter the SAME sequential solve list as contacts,
        // and a joint has no broadphase to canonicalise it, so this is the one place it can be
        // enforced. The anchors have to travel with the bodies — a joint whose ends were exchanged
        // without its anchors would attach to the wrong points and hold the pair in a pose nobody
        // asked for.
        let mut world = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(&mut world, "Test".to_string(), Arc::new(solver()));
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        let added = joint("Test", index_of(&second), index_of(&first), 7.0, 9.0);
        add_physics2d_joint(&mut world, &added);

        let fields = fields_of(&added);
        assert_eq!(fields.body_a, index_of(&first));
        assert_eq!(fields.body_b, index_of(&second));
        assert_eq!(fields.local_anchor_ax, 9.0);
        assert_eq!(fields.local_anchor_bx, 7.0);
    }

    #[test]
    fn rejects_duplicate_and_cross_world_insertion_without_solving_a_shared_accumulator_twice() {
        let mut first_world = create_physics2d_world(None, None, None);
        let mut second_world = create_physics2d_world(None, None, None);
        let first = body(&mut first_world, 0.0, 0.0);
        let second = body(&mut first_world, 2.0, 0.0);
        let added = joint("Unknown", index_of(&first), index_of(&second), 0.0, 0.0);

        add_physics2d_joint(&mut first_world, &added);

        assert!(thrown_message(|| add_physics2d_joint(&mut first_world, &added)).is_some());
        assert!(thrown_message(|| add_physics2d_joint(&mut second_world, &added)).is_some());
        assert_eq!(first_world.joints.len(), 1);
        assert!(Arc::ptr_eq(&first_world.joints[0], &added));
        assert_eq!(second_world.joints.len(), 0);
    }

    #[test]
    fn wakes_both_bodies_when_an_active_constraint_is_added() {
        let mut world = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(&mut world, "Test".to_string(), Arc::new(solver()));
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        set_asleep(&first);
        set_asleep(&second);

        add_physics2d_joint(
            &mut world,
            &joint("Test", index_of(&first), index_of(&second), 0.0, 0.0),
        );

        assert_eq!(sleep_state(&first), (false, 0.0));
        assert_eq!(sleep_state(&second), (false, 0.0));
    }
}

mod get_physics2d_joint_solver {
    use super::*;

    #[test]
    fn returns_null_for_an_unregistered_kind_rather_than_throwing() {
        // A scene deserialized with a joint kind this build does not know about should import and
        // simply not constrain, not refuse to load.
        let world = create_physics2d_world(None, None, None);
        assert!(get_physics2d_joint_solver(&world, "acme.Conveyor").is_none());
    }

    #[test]
    fn steps_a_world_holding_a_joint_whose_kind_has_no_solver() {
        let mut world = create_physics2d_world(None, None, None);
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        add_physics2d_joint(
            &mut world,
            &joint(
                "acme.Unknown",
                index_of(&first),
                index_of(&second),
                0.0,
                0.0,
            ),
        );
        let registry = registry();
        assert!(
            thrown_message(|| step_physics2d(&mut world, 1.0 / 60.0, &registry, None)).is_none()
        );
    }
}

mod invalidate_physics2d_joint {
    use super::*;

    #[test]
    fn clears_common_and_kind_owned_impulses_and_wakes_both_participating_bodies() {
        let mut world = create_physics2d_world(None, None, None);
        let cleared = Arc::new(AtomicUsize::new(0));
        let mut clearing = solver();
        let counter = cleared.clone();
        clearing.clear_accumulated_impulses = Some(Arc::new(move |value| {
            counter.fetch_add(1, Ordering::SeqCst);
            value.joint_fields_mut().impulse2 = 0.0;
        }));
        register_physics2d_joint_solver(&mut world, "Test".to_string(), Arc::new(clearing));
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        let added = joint("Test", index_of(&first), index_of(&second), 0.0, 0.0);
        add_physics2d_joint(&mut world, &added);
        {
            let mut guard = added.write().unwrap();
            let fields = guard.joint_fields_mut();
            fields.impulse0 = 10.0;
            fields.impulse1 = 20.0;
            fields.impulse2 = 30.0;
        }
        set_asleep(&first);
        set_asleep(&second);

        assert!(invalidate_physics2d_joint(&mut world, &added));

        assert_eq!(cleared.load(Ordering::SeqCst), 1);
        let fields = fields_of(&added);
        assert_eq!(
            [fields.impulse0, fields.impulse1, fields.impulse2],
            [0.0, 0.0, 0.0]
        );
        assert_eq!(sleep_state(&first), (false, 0.0));
        assert_eq!(sleep_state(&second), (false, 0.0));
    }

    #[test]
    fn reindexes_collision_suppression_after_an_authored_flag_changes() {
        let mut world = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(&mut world, "Test".to_string(), Arc::new(solver()));
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        let added = joint("Test", index_of(&first), index_of(&second), 0.0, 0.0);
        add_physics2d_joint(&mut world, &added);
        assert_eq!(
            suppression(&world, index_of(&first), index_of(&second)),
            Some(1)
        );

        added.write().unwrap().joint_fields_mut().collide_connected = true;
        assert!(invalidate_physics2d_joint(&mut world, &added));

        assert_eq!(
            suppression(&world, index_of(&first), index_of(&second)),
            None
        );
    }

    #[test]
    fn reports_false_without_mutating_a_joint_owned_by_another_world() {
        let mut owner = create_physics2d_world(None, None, None);
        let mut other = create_physics2d_world(None, None, None);
        let first = body(&mut owner, 0.0, 0.0);
        let second = body(&mut owner, 2.0, 0.0);
        let added = joint("Unknown", index_of(&first), index_of(&second), 0.0, 0.0);
        add_physics2d_joint(&mut owner, &added);
        added.write().unwrap().joint_fields_mut().impulse0 = 10.0;

        assert!(!invalidate_physics2d_joint(&mut other, &added));
        assert_eq!(fields_of(&added).impulse0, 10.0);
    }
}

mod register_physics2d_joint_solver {
    use super::*;

    #[test]
    fn is_scoped_to_its_world_so_two_worlds_can_register_different_kinds() {
        let mut first = create_physics2d_world(None, None, None);
        let second = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(&mut first, "acme.One".to_string(), Arc::new(solver()));
        assert!(get_physics2d_joint_solver(&first, "acme.One").is_some());
        assert!(get_physics2d_joint_solver(&second, "acme.One").is_none());
    }

    #[test]
    fn lets_a_later_registration_replace_an_earlier_one() {
        let mut world = create_physics2d_world(None, None, None);
        let replacement: Physics2DJointSolverRef = Arc::new(solver());
        register_physics2d_joint_solver(&mut world, "acme.One".to_string(), Arc::new(solver()));
        register_physics2d_joint_solver(&mut world, "acme.One".to_string(), replacement.clone());
        assert!(Arc::ptr_eq(
            &get_physics2d_joint_solver(&world, "acme.One").unwrap(),
            &replacement
        ));
    }

    #[test]
    fn makes_a_custom_kind_solvable_without_this_package_knowing_it() {
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        let prepared = Arc::new(AtomicUsize::new(0));
        let solved = Arc::new(AtomicUsize::new(0));
        let (prepare_count, solve_count) = (prepared.clone(), solved.clone());
        let mut counting = solver();
        counting.prepare = Arc::new(move |_, _, _| {
            prepare_count.fetch_add(1, Ordering::SeqCst);
        });
        counting.solve = Arc::new(move |_, _| {
            solve_count.fetch_add(1, Ordering::SeqCst);
        });
        register_physics2d_joint_solver(
            &mut world,
            "acme.Conveyor".to_string(),
            Arc::new(counting),
        );
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        add_physics2d_joint(
            &mut world,
            &joint(
                "acme.Conveyor",
                index_of(&first),
                index_of(&second),
                0.0,
                0.0,
            ),
        );
        step_physics2d(&mut world, 1.0 / 60.0, &registry(), None);

        assert_eq!(prepared.load(Ordering::SeqCst), 1);
        assert_eq!(
            solved.load(Ordering::SeqCst),
            world.config.velocity_iterations as usize
        );
    }
}

mod remove_physics2d_joint {
    use super::*;

    #[test]
    fn drops_joints_naming_a_removed_body_so_a_later_body_cannot_inherit_the_constraint() {
        let mut world = create_physics2d_world(None, None, None);
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        add_physics2d_joint(
            &mut world,
            &joint("Test", index_of(&first), index_of(&second), 0.0, 0.0),
        );
        remove_physics2d_body(&mut world, &second);
        assert_eq!(world.joints.len(), 0);
    }

    #[test]
    fn keeps_a_pair_suppressed_until_its_final_suppressing_joint_is_removed() {
        let mut world = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(&mut world, "Test".to_string(), Arc::new(solver()));
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        let (a, b) = (index_of(&first), index_of(&second));
        let one = joint("Test", a, b, 0.0, 0.0);
        let two = joint("Test", a, b, 0.0, 0.0);
        add_physics2d_joint(&mut world, &one);
        add_physics2d_joint(&mut world, &two);
        assert_eq!(suppression(&world, a, b), Some(2));

        remove_physics2d_joint(&mut world, &one);
        assert_eq!(suppression(&world, a, b), Some(1));
        remove_physics2d_joint(&mut world, &two);
        assert_eq!(suppression(&world, a, b), None);
    }

    #[test]
    fn releases_ownership_so_a_detached_joint_may_be_inserted_again() {
        let mut first_world = create_physics2d_world(None, None, None);
        let mut second_world = create_physics2d_world(None, None, None);
        let first = body(&mut first_world, 0.0, 0.0);
        let second = body(&mut first_world, 2.0, 0.0);
        let added = joint("Unknown", index_of(&first), index_of(&second), 0.0, 0.0);
        add_physics2d_joint(&mut first_world, &added);

        remove_physics2d_joint(&mut first_world, &added);

        add_physics2d_joint(&mut second_world, &added);
        assert!(Arc::ptr_eq(&second_world.joints[0], &added));
    }

    #[test]
    fn removes_the_joint_and_reports_false_for_one_the_world_does_not_hold() {
        let mut world = create_physics2d_world(None, None, None);
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        let added = joint("Test", index_of(&first), index_of(&second), 0.0, 0.0);
        add_physics2d_joint(&mut world, &added);
        assert!(remove_physics2d_joint(&mut world, &added));
        assert_eq!(world.joints.len(), 0);
        assert!(!remove_physics2d_joint(&mut world, &added));
    }

    #[test]
    fn wakes_both_ends_when_an_active_constraint_is_removed() {
        let mut world = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(&mut world, "Test".to_string(), Arc::new(solver()));
        let first = body(&mut world, 0.0, 0.0);
        let second = body(&mut world, 2.0, 0.0);
        let added = joint("Test", index_of(&first), index_of(&second), 0.0, 0.0);
        add_physics2d_joint(&mut world, &added);
        set_asleep(&first);
        set_asleep(&second);

        remove_physics2d_joint(&mut world, &added);

        assert_eq!(sleep_state(&first), (false, 0.0));
        assert_eq!(sleep_state(&second), (false, 0.0));
    }

    #[test]
    fn wakes_the_surviving_end_when_its_joint_neighbour_is_removed_from_the_world() {
        let mut world = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(&mut world, "Test".to_string(), Arc::new(solver()));
        let removed = body(&mut world, 0.0, 0.0);
        let survivor = body(&mut world, 2.0, 0.0);
        add_physics2d_joint(
            &mut world,
            &joint("Test", index_of(&removed), index_of(&survivor), 0.0, 0.0),
        );
        set_asleep(&survivor);

        remove_physics2d_body(&mut world, &removed);

        assert_eq!(sleep_state(&survivor), (false, 0.0));
    }
}

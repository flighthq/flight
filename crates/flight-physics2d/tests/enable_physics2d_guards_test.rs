use crate::flight_physics2d_support_test::*;

use std::sync::{Arc, RwLock};

use flight_collision::{
    CollisionCapsule2D, CollisionCircle2D, CollisionRegistry2D, CollisionSegment2D,
    CollisionShape2D, register_built_in_collision_pair_tests2d,
    register_built_in_collision_supports2d,
};
use flight_entity::Ref;
use flight_log::{
    LogData, LogEntry, LogStateRef, LogValue, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries, remove_log_sink,
};
use flight_physics2d::*;

const STONE: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};

// The caller-owned guard state, log state and step registry that replace the source's module state (D5).
struct Harness {
    guards: Physics2DGuardState,
    log_state: LogStateRef,
    registry: CollisionRegistry2D,
}

fn ball(
    world: &mut Physics2DWorld,
    body_type: Physics2DBodyType,
    x: f32,
    y: f32,
) -> Ref<RigidBody2D> {
    let local = CollisionShape2D::Circle(CollisionCircle2D {
        x: 0.0,
        y: 0.0,
        radius: 0.5,
    });
    return body_with(world, body_type, x, y, local);
}

fn body_with(
    world: &mut Physics2DWorld,
    body_type: Physics2DBodyType,
    x: f32,
    y: f32,
    local: CollisionShape2D,
) -> Ref<RigidBody2D> {
    let body = rigid_body2d(body_type, x, y, None);
    body.write()
        .unwrap()
        .colliders
        .push(physics2d_collider(&local, &STONE, None, None));
    add_physics2d_body(world, &body);
    return body;
}

fn capture_log(harness: &Harness, run: impl FnOnce()) -> Vec<LogEntry> {
    let sink = create_memory_log_sink(8);
    add_log_sink(&harness.log_state, sink.sink.clone());
    run();
    let entries = {
        let mut collected = Vec::new();
        get_memory_log_sink_entries(&mut collected, &sink);
        collected
    };
    remove_log_sink(&harness.log_state, &sink.sink);
    return entries;
}

fn distance_joint(body_a: i32, body_b: i32) -> Physics2DJointRef {
    let make: fn() -> Physics2DJointOptions = Physics2DJointOptions::default;
    let mut base = make();
    base.body_a = body_a;
    base.body_b = body_b;
    return physics2d_distance_joint(&Physics2DDistanceJointOptions {
        base,
        damping_ratio: Some(0.0),
        frequency_hz: Some(0.0),
        length: 3.0,
    });
}

fn enabled(harness: &mut Harness) {
    enable_physics2d_guards(
        &mut harness.guards,
        harness.log_state.clone(),
        Arc::new(|| 0.0),
    );
}

// Each test owns a fresh log state, so the source's per-test `clearLogOnceKeys` and
// `disablePhysics2DGuards` hooks are implicit.
fn harness() -> Harness {
    let make: fn() -> Physics2DGuardState = Physics2DGuardState::default;
    let mut registry = CollisionRegistry2D {
        pair_tests: std::collections::HashMap::new(),
        supports: std::collections::HashMap::new(),
        test_guard: None,
    };
    register_built_in_collision_supports2d(&mut registry);
    register_built_in_collision_pair_tests2d(&mut registry);
    return Harness {
        guards: make(),
        log_state: Arc::new(RwLock::new(create_log_state())),
        registry,
    };
}

fn record(entry: &LogEntry) -> &std::collections::HashMap<String, LogValue> {
    let LogData::Record(data) = &entry.data else {
        panic!("expected a record entry");
    };
    return data;
}

fn step(harness: &Harness, world: &mut Physics2DWorld) {
    step_physics2d(world, 1.0 / 60.0, &harness.registry, Some(&harness.guards));
}

fn string_field(entry: &LogEntry, name: &str) -> String {
    return match record(entry).get(name) {
        Some(LogValue::Str(value)) => value.clone(),
        _ => panic!("expected a string field {}", name),
    };
}

fn strings_field(entry: &LogEntry, name: &str) -> Vec<String> {
    let Some(LogValue::Array(values)) = record(entry).get(name) else {
        panic!("expected an array field {}", name);
    };
    return values
        .iter()
        .map(|value| match value {
            LogValue::Str(text) => text.clone(),
            _ => panic!("expected strings"),
        })
        .collect();
}

// A world with one distance joint and NO solver registered for it — the exact shape of the mistake the
// joint guard exists for, since registration is opt-in so that unused solvers tree-shake away.
fn unregistered_joint_world() -> Physics2DWorld {
    let mut world = physics2d_world(Some(0.0), Some(-10.0), None);
    let anchor = ball(&mut world, Physics2DBodyType::Static, 0.0, 0.0);
    let bob = ball(&mut world, Physics2DBodyType::Dynamic, 0.0, -3.0);
    let joint = distance_joint(anchor.read().unwrap().index, bob.read().unwrap().index);
    add_physics2d_joint(&mut world, &joint);
    return world;
}

mod are_physics2d_guards_enabled {
    use super::*;

    #[test]
    fn reports_the_current_module_guard_state() {
        let mut harness = harness();
        assert!(!are_physics2d_guards_enabled(&harness.guards));
        enabled(&mut harness);
        assert!(are_physics2d_guards_enabled(&harness.guards));
        disable_physics2d_guards(&mut harness.guards);
        assert!(!are_physics2d_guards_enabled(&harness.guards));
    }
}

mod disable_physics2d_guards {
    use super::*;

    #[test]
    fn removes_both_seams_so_a_declined_step_and_an_unsolved_joint_are_silent_again() {
        let mut harness = harness();
        enabled(&mut harness);
        disable_physics2d_guards(&mut harness.guards);
        let mut declining = physics2d_world(Some(0.0), Some(-10.0), None);
        declining.config.position_iterations = -3;
        let mut unregistered = unregistered_joint_world();

        let entries = capture_log(&harness, || {
            step(&harness, &mut declining);
            step(&harness, &mut unregistered);
        });

        assert_eq!(entries.len(), 0);
    }
}

mod enable_physics2d_guards {
    use super::*;

    #[test]
    fn collapses_many_identically_broken_joints_into_one_report() {
        // A ragdoll with a dozen unregistered joints of the same kind is ONE mistake. Listing twelve
        // indices would read as twelve, and re-keying per index would defeat logOnce entirely.
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = unregistered_joint_world();
        let (body_a, body_b) = {
            let first = world.joints[0].read().unwrap();
            (first.joint_fields().body_a, first.joint_fields().body_b)
        };
        // TS spreads `world.joints[0]` into a fresh object; a Rust clone would carry the owning world's
        // link, so each copy is built from the same authored values instead.
        for _ in 0..11 {
            add_physics2d_joint(&mut world, &distance_joint(body_a, body_b));
        }
        assert_eq!(world.joints.len(), 12);

        let entries = capture_log(&harness, || step(&harness, &mut world));

        assert_eq!(entries.len(), 1);
        assert_eq!(
            strings_field(&entries[0], "faults"),
            vec!["Distance:solver-unregistered".to_string()]
        );
        assert!(string_field(&entries[0], "message").contains("12 of 12"));
    }

    #[test]
    fn does_not_add_the_joint_complaint_on_top_of_a_declined_step() {
        // A declined step advanced nothing at all, so its own message is the whole story. Repeating the
        // joint finding underneath it would bury the reason the world is frozen.
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = unregistered_joint_world();
        world.config.velocity_iterations = -1;

        let entries = capture_log(&harness, || step(&harness, &mut world));

        assert_eq!(entries.len(), 1);
        assert_eq!(string_field(&entries[0], "status"), "invalid-step");
    }

    #[test]
    fn names_every_failing_precondition_at_once_not_only_the_first() {
        // The step's own condition short-circuits, so surfacing one fault per frame would cost a round
        // trip per fault. The explain seam exists to avoid exactly that and the guard must not
        // reintroduce it.
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = physics2d_world(Some(f32::NAN), Some(-10.0), None);
        world.config.position_iterations = -3;

        let entries = capture_log(&harness, || step(&harness, &mut world));

        assert_eq!(entries.len(), 1);
        assert_eq!(string_field(&entries[0], "status"), "invalid-step");
        let failing = strings_field(&entries[0], "failing");
        assert!(failing.contains(&"gravityValid".to_string()));
        assert!(failing.contains(&"positionIterationsValid".to_string()));
    }

    #[test]
    fn reports_a_joint_whose_endpoint_body_is_gone_with_endpoint_advice_not_registration_advice() {
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = unregistered_joint_world();
        register_built_in_physics2d_joint_solvers(&mut world);
        world.joints[0].write().unwrap().joint_fields_mut().body_b = 9999;

        let entries = capture_log(&harness, || step(&harness, &mut world));

        assert_eq!(entries.len(), 1);
        assert_eq!(
            strings_field(&entries[0], "faults"),
            vec!["Distance:body-b-missing".to_string()]
        );
        let message = string_field(&entries[0], "message");
        assert!(message.contains("removed with the body"));
        assert!(!message.contains("registerBuiltInPhysics2DJointSolvers"));
    }

    #[test]
    fn reports_a_joint_whose_kind_has_no_registered_solver_on_a_step_that_otherwise_succeeds() {
        // The case the whole second seam is for. The world steps, the bob falls, nothing fails — and the
        // rope it is supposed to be hanging from is simply not there.
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = unregistered_joint_world();

        let entries = capture_log(&harness, || step(&harness, &mut world));

        assert_eq!(entries.len(), 1);
        assert_eq!(string_field(&entries[0], "status"), "unresolved-joints");
        assert_eq!(
            strings_field(&entries[0], "faults"),
            vec!["Distance:solver-unregistered".to_string()]
        );
        assert!(
            string_field(&entries[0], "message").contains("registerBuiltInPhysics2DJointSolvers")
        );
        // The step really did run — this is a warning about a world that is otherwise working, which is
        // what makes it hard to notice without the guard.
        assert!(world.bodies[1].read().unwrap().velocity_y < 0.0);
    }

    #[test]
    fn reports_an_area_less_collider_used_as_a_body_shape() {
        // The third seam. A segment on a rigid body is a modelling mistake the simulation cannot show
        // you: nothing fails, nothing is slow, the body simply never collides with anything.
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = physics2d_world(Some(0.0), Some(-10.0), None);
        let segment = CollisionShape2D::Segment(CollisionSegment2D {
            x0: 0.0,
            y0: 0.0,
            x1: 1.0,
            y1: 0.0,
        });
        body_with(&mut world, Physics2DBodyType::Dynamic, 0.0, 0.0, segment);

        let entries = capture_log(&harness, || step(&harness, &mut world));

        assert_eq!(entries.len(), 1);
        assert_eq!(
            string_field(&entries[0], "status"),
            "missing-contact-support"
        );
        assert_eq!(
            strings_field(&entries[0], "kinds"),
            vec!["segment".to_string()]
        );
        assert!(string_field(&entries[0], "message").contains("no area"));
    }

    #[test]
    fn says_nothing_about_a_capsule_which_the_dispatcher_answers_for() {
        // This test is the inverse of one that used to assert the opposite. The capsule was named by
        // this guard while its pair functions were missing and stopped being named when they landed,
        // which is the seam working in both directions rather than a list someone edits by hand.
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = physics2d_world(Some(0.0), Some(-10.0), None);
        let capsule = CollisionShape2D::Capsule(CollisionCapsule2D {
            x0: 0.0,
            y0: 0.0,
            x1: 1.0,
            y1: 0.0,
            radius: 0.4,
        });
        body_with(&mut world, Physics2DBodyType::Dynamic, 0.0, 0.0, capsule);

        assert_eq!(
            capture_log(&harness, || step(&harness, &mut world)).len(),
            0
        );
    }

    #[test]
    fn says_nothing_about_colliders_the_dispatcher_does_answer_for() {
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = physics2d_world(Some(0.0), Some(-10.0), None);
        ball(&mut world, Physics2DBodyType::Dynamic, 0.0, 0.0);

        assert_eq!(
            capture_log(&harness, || step(&harness, &mut world)).len(),
            0
        );
    }

    #[test]
    fn says_nothing_about_joints_once_their_solvers_are_registered() {
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = unregistered_joint_world();
        register_built_in_physics2d_joint_solvers(&mut world);

        let entries = capture_log(&harness, || step(&harness, &mut world));

        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn says_nothing_while_a_healthy_world_steps() {
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = physics2d_world(Some(0.0), Some(-10.0), None);
        ball(&mut world, Physics2DBodyType::Static, 0.0, 0.0);
        ball(&mut world, Physics2DBodyType::Dynamic, 0.0, 2.0);

        let entries = capture_log(&harness, || step(&harness, &mut world));

        // A guard that fired on a healthy step would be worse than none: the message is supposed to mean
        // something has stopped working.
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn still_speaks_when_a_second_different_fault_appears_after_the_first() {
        // The counterpart risk of keying on the fault set: a world that develops a new problem must not
        // be silenced by having already reported the old one.
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = unregistered_joint_world();

        let entries = capture_log(&harness, || {
            step(&harness, &mut world);
            register_built_in_physics2d_joint_solvers(&mut world);
            world.joints[0].write().unwrap().joint_fields_mut().body_a = 9999;
            step(&harness, &mut world);
        });

        assert_eq!(entries.len(), 2);
        assert_eq!(
            strings_field(&entries[1], "faults"),
            vec!["Distance:body-a-missing".to_string()]
        );
    }

    #[test]
    fn warns_once_for_a_repeated_fault_rather_than_once_per_frame() {
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = unregistered_joint_world();

        let entries = capture_log(&harness, || {
            for _ in 0..60 {
                step(&harness, &mut world);
            }
        });

        assert_eq!(entries.len(), 1);
    }
}

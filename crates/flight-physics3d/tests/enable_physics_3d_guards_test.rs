use std::sync::{Arc, RwLock};

use flight_collision::{
    CollisionAabb3D, CollisionColliderShape3D, CollisionRegistry3D, CollisionShape3D,
};
use flight_log::{
    LogData, LogEntry, LogStateRef, LogValue, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries, remove_log_sink,
};

use super::*;
use crate::common::*;

// The caller-owned guard, log and collision-registry state that replace the source's module state (D5).
struct Harness {
    guards: Physics3DGuardState,
    log_state: LogStateRef,
    registry: CollisionRegistry3D,
}

fn capture_log(harness: &Harness, run: impl FnOnce()) -> Vec<LogEntry> {
    let sink = create_memory_log_sink(8);
    add_log_sink(&harness.log_state, sink.sink.clone());
    run();
    let mut entries = Vec::new();
    get_memory_log_sink_entries(&mut entries, &sink);
    remove_log_sink(&harness.log_state, &sink.sink);
    return entries;
}

fn create_overflow_body() -> RigidBody3DRef {
    let body = rigid_body(Physics3DBodyType::Static);
    let shape = CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
        min_x: -16.0,
        min_y: -16.0,
        min_z: -16.0,
        max_x: 16.0,
        max_y: 16.0,
        max_z: 16.0,
    }));
    body.write()
        .unwrap()
        .colliders
        .push(physics_3d_collider(&shape, None, None, None));
    return body;
}

fn create_test_world() -> Physics3DWorld {
    let mut world = world();
    add_body(&mut world, Physics3DBodyType::Dynamic);
    add_body(&mut world, Physics3DBodyType::Dynamic);
    return world;
}

fn enabled(harness: &mut Harness) {
    enable_physics_3d_guards(
        &mut harness.guards,
        harness.log_state.clone(),
        Arc::new(|| 0.0),
    );
}

// Each test owns a fresh log state, so the source's per-test clear/disable hooks are implicit.
fn harness() -> Harness {
    let make: fn() -> Physics3DGuardState = Physics3DGuardState::default;
    Harness {
        guards: make(),
        log_state: Arc::new(RwLock::new(create_log_state())),
        registry: registered_registry(),
    }
}

fn integers_field(entry: &LogEntry, name: &str) -> Vec<i64> {
    let Some(LogValue::Array(values)) = record(entry).get(name) else {
        panic!("expected an array field {name}");
    };
    return values
        .iter()
        .map(|value| match value {
            LogValue::Int(number) => *number,
            _ => panic!("expected integers"),
        })
        .collect();
}

fn joint_issues(entry: &LogEntry) -> Vec<(i64, String, String)> {
    let Some(LogValue::Array(values)) = record(entry).get("joints") else {
        panic!("expected a joints array");
    };
    return values
        .iter()
        .map(|value| {
            let LogValue::Record(joint) = value else {
                panic!("expected a joint record");
            };
            let Some(LogValue::Int(index)) = joint.get("index") else {
                panic!("expected a joint index");
            };
            let Some(LogValue::Str(kind)) = joint.get("kind") else {
                panic!("expected a joint kind");
            };
            let Some(LogValue::Str(status)) = joint.get("status") else {
                panic!("expected a joint status");
            };
            (*index, kind.clone(), status.clone())
        })
        .collect();
}

fn record(entry: &LogEntry) -> &std::collections::HashMap<String, LogValue> {
    let LogData::Record(data) = &entry.data else {
        panic!("expected a record entry");
    };
    return data;
}

fn step(harness: &Harness, world: &mut Physics3DWorld, dt: f32) {
    step_physics_3d(world, &harness.registry, dt, Some(&harness.guards));
}

fn string_field(entry: &LogEntry, name: &str) -> String {
    return match record(entry).get(name) {
        Some(LogValue::Str(value)) => value.clone(),
        _ => panic!("expected a string field {name}"),
    };
}

fn strings_field(entry: &LogEntry, name: &str) -> Vec<String> {
    let Some(LogValue::Array(values)) = record(entry).get(name) else {
        panic!("expected an array field {name}");
    };
    return values
        .iter()
        .map(|value| match value {
            LogValue::Str(text) => text.clone(),
            _ => panic!("expected strings"),
        })
        .collect();
}

mod are_physics_3d_guards_enabled {
    use super::*;

    #[test]
    fn reports_the_current_module_guard_state() {
        let mut harness = harness();
        assert!(!are_physics_3d_guards_enabled(&harness.guards));
        enabled(&mut harness);
        assert!(are_physics_3d_guards_enabled(&harness.guards));
        disable_physics_3d_guards(&mut harness.guards);
        assert!(!are_physics_3d_guards_enabled(&harness.guards));
    }
}

mod disable_physics_3d_guards {
    use super::*;

    #[test]
    fn removes_the_seam_so_a_declined_step_is_silent_again() {
        let mut harness = harness();
        enabled(&mut harness);
        disable_physics_3d_guards(&mut harness.guards);
        let mut world = create_test_world();
        world.config.substeps = 0;

        let entries = capture_log(&harness, || step(&harness, &mut world, 1.0 / 60.0));

        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn removes_the_spatial_indexing_seam() {
        let mut harness = harness();
        enabled(&mut harness);
        disable_physics_3d_guards(&mut harness.guards);
        let mut world = world();
        let overflow = create_overflow_body();
        add_physics_3d_body(&mut world, &overflow);

        let entries = capture_log(&harness, || {
            report_physics_3d_spatial_indexing(&world, Some(&harness.guards))
        });

        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn removes_the_unresolved_joint_seam() {
        let mut harness = harness();
        enabled(&mut harness);
        disable_physics_3d_guards(&mut harness.guards);
        let mut world = create_test_world();
        let joint = physics_3d_hinge_joint(&hinge_options(0, 1));
        add_physics_3d_joint(&mut world, &joint);

        let entries = capture_log(&harness, || step(&harness, &mut world, 1.0 / 60.0));

        assert_eq!(entries.len(), 0);
    }
}

mod enable_physics_3d_guards {
    use super::*;

    #[test]
    fn logs_once_for_a_repeating_fault_and_again_when_a_different_one_joins_it() {
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = create_test_world();
        world.config.substeps = 0;

        let repeated = capture_log(&harness, || {
            for _ in 0..5 {
                step(&harness, &mut world, 1.0 / 60.0);
            }
        });
        assert_eq!(repeated.len(), 1);

        let widened = capture_log(&harness, || {
            world.gravity_z = f32::NAN;
            step(&harness, &mut world, 1.0 / 60.0);
        });
        assert_eq!(widened.len(), 1);
        assert!(strings_field(&widened[0], "failing").contains(&"gravityValid".to_string()));
    }

    #[test]
    fn names_every_failing_precondition_at_once_not_only_the_first() {
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = create_test_world();
        world.gravity_y = f32::NAN;
        world.config.substeps = 0;

        let entries = capture_log(&harness, || step(&harness, &mut world, 0.0));

        assert_eq!(entries.len(), 1);
        let mut failing = strings_field(&entries[0], "failing");
        failing.sort();
        assert_eq!(
            failing,
            vec![
                "gravityValid".to_string(),
                "substepsValid".to_string(),
                "timestepValid".to_string(),
            ]
        );
    }

    #[test]
    fn names_every_joint_the_solve_skips_and_distinguishes_why() {
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = create_test_world();
        let unregistered = physics_3d_hinge_joint(&hinge_options(0, 1));
        unregistered.write().unwrap().joint.kind = "guard.unregistered".to_string();
        add_physics_3d_joint(&mut world, &unregistered);
        register_built_in_physics_3d_joint_solvers(&mut world);
        let invalid_bodies = physics_3d_hinge_joint(&hinge_options(0, 1));
        add_physics_3d_joint(&mut world, &invalid_bodies);
        invalid_bodies.write().unwrap().joint.body_b = 99;

        let entries = capture_log(&harness, || {
            step(&harness, &mut world, 1.0 / 60.0);
            step(&harness, &mut world, 1.0 / 60.0);
        });

        assert_eq!(entries.len(), 1);
        assert_eq!(string_field(&entries[0], "status"), "unresolved-joints");
        assert_eq!(
            joint_issues(&entries[0]),
            vec![
                (
                    0,
                    "guard.unregistered".to_string(),
                    "unregistered-kind".to_string(),
                ),
                (1, "Hinge".to_string(), "invalid-bodies".to_string()),
            ]
        );
    }

    #[test]
    fn names_invalid_collider_state_before_contact_intake_can_consume_it() {
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = create_test_world();
        let collider = physics_3d_collider(&sphere_shape(1.0, 0.0, 0.0, 0.0), None, None, None);
        let body = world.bodies[0].clone();
        add_physics_3d_collider(&mut world, &body, &collider);
        collider.write().unwrap().material.restitution = f32::NAN;

        let entries = capture_log(&harness, || step(&harness, &mut world, 1.0 / 60.0));

        assert_eq!(entries.len(), 1);
        assert_eq!(
            strings_field(&entries[0], "failing"),
            vec!["colliderStateValid".to_string()]
        );
    }

    #[test]
    fn reports_a_body_routed_through_spatial_overflow_once_and_stays_silent_for_ordinary_indexing()
    {
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = world();

        let entries = capture_log(&harness, || {
            let ordinary = create_rigid_body_3d();
            ordinary
                .write()
                .unwrap()
                .colliders
                .push(physics_3d_collider(
                    &sphere_shape(0.5, 0.0, 0.0, 0.0),
                    None,
                    None,
                    None,
                ));
            add_physics_3d_body(&mut world, &ordinary);
            let first_overflow = create_overflow_body();
            add_physics_3d_body(&mut world, &first_overflow);
            report_physics_3d_spatial_indexing(&world, Some(&harness.guards));
            let second_overflow = create_overflow_body();
            add_physics_3d_body(&mut world, &second_overflow);
            report_physics_3d_spatial_indexing(&world, Some(&harness.guards));
            report_physics_3d_spatial_indexing(&world, Some(&harness.guards));
        });

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].channel.as_deref(), Some("physics3d"));
        assert_eq!(string_field(&entries[0], "status"), "spatial-overflow");
        assert_eq!(integers_field(&entries[0], "bodyIndices"), vec![1]);
    }

    #[test]
    fn says_nothing_while_the_world_steps_normally() {
        let mut harness = harness();
        enabled(&mut harness);
        let mut world = create_test_world();

        let entries = capture_log(&harness, || step(&harness, &mut world, 1.0 / 60.0));

        assert_eq!(entries.len(), 0);
    }
}

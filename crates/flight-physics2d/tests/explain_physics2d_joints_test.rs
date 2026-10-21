use std::sync::Arc;

use flight_entity::Ref;
use flight_physics2d::*;

fn add_body(world: &mut Physics2DWorld, x: f32) -> i32 {
    let body = create_rigid_body2d(Physics2DBodyType::Dynamic, x, 0.0, None);
    add_physics2d_body(world, &body);
    return body.read().unwrap().index;
}

fn add_distance(world: &mut Physics2DWorld, body_a: i32, body_b: i32, kind: Option<&str>) {
    let make: fn() -> Physics2DDistanceJointOptions = Physics2DDistanceJointOptions::default;
    let mut options = make();
    options.base.body_a = body_a;
    options.base.body_b = body_b;
    options.length = 1.0;
    let joint: Physics2DJointRef = create_physics2d_distance_joint(&options);
    if let Some(kind) = kind {
        joint.write().unwrap().joint_fields_mut().kind = kind.to_string();
    }
    add_physics2d_joint(world, &joint);
}

fn noop_solver(uses_body_a: Option<bool>) -> Physics2DJointSolverRef {
    return Arc::new(Physics2DJointSolver {
        clear_accumulated_impulses: None,
        keeps_bodies_awake: None,
        prepare: Arc::new(|_, _, _| {}),
        scale_accumulated_impulses: None,
        solve: Arc::new(|_, _| {}),
        swap_ends: None,
        uses_body_a,
        warm_start: None,
        write_reaction: None,
    });
}

type _Unused = Ref<RigidBody2D>;

mod explain_physics2d_joints {
    use super::*;

    #[test]
    fn makes_an_unregistered_kind_and_every_missing_endpoint_observable() {
        let mut world = create_physics2d_world(None, None, None);
        let body = add_body(&mut world, 0.0);
        add_distance(&mut world, body, 99, Some("acme.Unknown"));
        register_physics2d_joint_solver(&mut world, "MissingA".to_string(), noop_solver(None));
        register_physics2d_joint_solver(&mut world, "MissingB".to_string(), noop_solver(None));
        register_physics2d_joint_solver(&mut world, "MissingBoth".to_string(), noop_solver(None));
        add_distance(&mut world, 98, body, Some("MissingA"));
        add_distance(&mut world, body, 99, Some("MissingB"));
        add_distance(&mut world, 98, 99, Some("MissingBoth"));

        let explanation = explain_physics2d_joints(&world);

        assert_eq!(
            explanation.status,
            Physics2DJointResolutionExplanationStatus::UnresolvedJoints
        );
        assert_eq!(explanation.ready_count, 0);
        let statuses: Vec<Physics2DJointResolutionStatus> = explanation
            .joints
            .iter()
            .map(|joint| joint.status)
            .collect();
        assert_eq!(
            statuses,
            vec![
                Physics2DJointResolutionStatus::SolverUnregistered,
                Physics2DJointResolutionStatus::BodyAMissing,
                Physics2DJointResolutionStatus::BodyBMissing,
                Physics2DJointResolutionStatus::BodiesMissing,
            ]
        );
        let first = &explanation.joints[0];
        assert!(first.body_a_found && !first.body_b_found && !first.solver_registered);
    }

    #[test]
    fn recomputes_current_state_without_retaining_earlier_failures() {
        let mut world = create_physics2d_world(None, None, None);
        let first = add_body(&mut world, 0.0);
        let second = add_body(&mut world, 1.0);
        add_distance(&mut world, first, second, Some("acme.Deferred"));
        let before = explain_physics2d_joints(&world);

        register_physics2d_joint_solver(&mut world, "acme.Deferred".to_string(), noop_solver(None));
        let after = explain_physics2d_joints(&world);

        assert_eq!(
            before.joints[0].status,
            Physics2DJointResolutionStatus::SolverUnregistered
        );
        assert_eq!(
            after.joints[0].status,
            Physics2DJointResolutionStatus::Ready
        );
        assert_eq!(
            after.status,
            Physics2DJointResolutionExplanationStatus::Complete
        );
    }

    #[test]
    fn reports_a_fully_resolvable_world_as_complete() {
        let mut world = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(&mut world, "Distance".to_string(), noop_solver(None));
        let first = add_body(&mut world, 0.0);
        let second = add_body(&mut world, 1.0);
        add_distance(&mut world, first, second, None);

        assert_eq!(
            explain_physics2d_joints(&world),
            Physics2DJointResolutionExplanation {
                joints: vec![Physics2DJointResolution {
                    body_a: first,
                    body_a_found: true,
                    body_a_used: true,
                    body_b: second,
                    body_b_found: true,
                    joint_index: 0,
                    kind: "Distance".to_string(),
                    solver_registered: true,
                    status: Physics2DJointResolutionStatus::Ready,
                }],
                ready_count: 1,
                status: Physics2DJointResolutionExplanationStatus::Complete,
            }
        );
    }

    #[test]
    fn reports_an_unused_missing_body_a_as_ready() {
        let mut world = create_physics2d_world(None, None, None);
        let body = add_body(&mut world, 0.0);
        register_physics2d_joint_solver(
            &mut world,
            "OneBody".to_string(),
            noop_solver(Some(false)),
        );
        add_distance(&mut world, 999, body, Some("OneBody"));

        let explanation = explain_physics2d_joints(&world);

        let first = &explanation.joints[0];
        assert!(!first.body_a_found && !first.body_a_used);
        assert_eq!(first.status, Physics2DJointResolutionStatus::Ready);
        assert_eq!(
            explanation.status,
            Physics2DJointResolutionExplanationStatus::Complete
        );
    }
}

use std::collections::HashMap;
use std::sync::Arc;

use flight_physics2d::*;

fn joint(kind: &str, body_a: i32, body_b: i32, collide_connected: bool) -> Physics2DJointRef {
    let make: fn() -> Physics2DDistanceJointOptions = Physics2DDistanceJointOptions::default;
    let mut options = make();
    options.base.body_a = body_a;
    options.base.body_b = body_b;
    options.base.collide_connected = Some(collide_connected);
    let joint: Physics2DJointRef = create_physics2d_distance_joint(&options);
    joint.write().unwrap().joint_fields_mut().kind = kind.to_string();
    return joint;
}

fn solver(uses_body_a: Option<bool>) -> Physics2DJointSolverRef {
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

mod is_physics2d_pair_joint_suppressed {
    use super::*;

    #[test]
    fn looks_up_either_endpoint_order_and_becomes_false_after_the_index_is_cleared() {
        let mut world = create_physics2d_world(None, None, None);
        world
            .joint_collision_suppressions
            .insert(2, HashMap::from([(7, 1)]));
        assert!(is_physics2d_pair_joint_suppressed(&world, 2, 7));
        assert!(is_physics2d_pair_joint_suppressed(&world, 7, 2));
        world.joint_collision_suppressions.clear();
        assert!(!is_physics2d_pair_joint_suppressed(&world, 2, 7));
    }
}

mod rebuild_physics2d_joint_collision_suppressions {
    use super::*;

    #[test]
    fn counts_every_active_suppressing_joint_while_ignoring_unknown_and_one_body_kinds() {
        let mut world = create_physics2d_world(None, None, None);
        register_physics2d_joint_solver(&mut world, "two-body".to_string(), solver(None));
        register_physics2d_joint_solver(&mut world, "one-body".to_string(), solver(Some(false)));
        world.joints.push(joint("two-body", 9, 3, false));
        world.joints.push(joint("two-body", 3, 9, false));
        world.joints.push(joint("two-body", 3, 9, true));
        world.joints.push(joint("unknown", 3, 9, false));
        world.joints.push(joint("one-body", 3, 9, false));

        rebuild_physics2d_joint_collision_suppressions(&mut world);

        assert_eq!(
            world
                .joint_collision_suppressions
                .get(&3)
                .and_then(|ends| ends.get(&9))
                .copied(),
            Some(2)
        );
    }
}

use super::*;
use crate::common::*;

fn test_world(register_solver: bool) -> Physics3DWorld {
    let mut world = world();
    if register_solver {
        register_built_in_physics_3d_joint_solvers(&mut world);
    }
    add_body(&mut world, Physics3DBodyType::Dynamic);
    add_body(&mut world, Physics3DBodyType::Dynamic);
    add_body(&mut world, Physics3DBodyType::Dynamic);
    world
}

fn ball_joint(
    body_a: i32,
    body_b: i32,
    collide_connected: bool,
) -> flight_entity::Ref<Physics3DBallAndSocketJoint> {
    let mut options = joint_options(body_a, body_b);
    options.collide_connected = Some(collide_connected);
    physics_3d_ball_and_socket_joint(&options)
}

mod is_physics_3d_pair_joint_suppressed {
    use super::*;

    #[test]
    fn answers_the_same_whichever_way_round_the_pair_is_given() {
        let mut world = test_world(true);
        let joint = ball_joint(0, 1, false);
        add_physics_3d_joint(&mut world, &joint);

        assert!(is_physics_3d_pair_joint_suppressed(&world, 1, 0));
    }

    #[test]
    fn keeps_a_pair_suppressed_while_a_second_joint_still_holds_it() {
        let mut world = test_world(true);
        let first = ball_joint(0, 1, false);
        let second = ball_joint(0, 1, false);
        add_physics_3d_joint(&mut world, &first);
        add_physics_3d_joint(&mut world, &second);
        let second: Physics3DJointRef = second;

        assert!(remove_physics_3d_joint(&mut world, &second));

        assert!(is_physics_3d_pair_joint_suppressed(&world, 0, 1));
    }

    #[test]
    fn leaves_a_pair_alone_when_the_joint_kind_has_no_solver() {
        let mut world = test_world(false);
        let joint = ball_joint(0, 1, false);
        add_physics_3d_joint(&mut world, &joint);

        assert!(!is_physics_3d_pair_joint_suppressed(&world, 0, 1));
    }

    #[test]
    fn leaves_a_pair_alone_when_the_joint_opts_into_colliding() {
        let mut world = test_world(true);
        let joint = ball_joint(0, 1, true);
        add_physics_3d_joint(&mut world, &joint);

        assert!(!is_physics_3d_pair_joint_suppressed(&world, 0, 1));
    }

    #[test]
    fn reports_a_pair_held_by_a_joint_that_does_not_collide() {
        let mut world = test_world(true);
        let joint = ball_joint(0, 1, false);
        add_physics_3d_joint(&mut world, &joint);

        assert!(is_physics_3d_pair_joint_suppressed(&world, 0, 1));
    }

    #[test]
    fn reports_false_for_an_unrelated_pair() {
        let mut world = test_world(true);
        let joint = ball_joint(0, 1, false);
        add_physics_3d_joint(&mut world, &joint);

        assert!(!is_physics_3d_pair_joint_suppressed(&world, 0, 2));
    }
}

mod rebuild_physics_3d_joint_collision_suppressions {
    use super::*;

    #[test]
    fn drops_every_suppression_when_the_joint_list_empties() {
        let mut world = test_world(true);
        let joint = ball_joint(0, 1, false);
        add_physics_3d_joint(&mut world, &joint);
        world.joints.clear();

        rebuild_physics_3d_joint_collision_suppressions(&mut world);

        assert!(!is_physics_3d_pair_joint_suppressed(&world, 0, 1));
    }

    #[test]
    fn picks_up_an_endpoint_edited_in_place() {
        let mut world = test_world(true);
        let joint = ball_joint(0, 1, false);
        add_physics_3d_joint(&mut world, &joint);
        joint.write().unwrap().joint.body_b = 2;

        rebuild_physics_3d_joint_collision_suppressions(&mut world);

        assert!(!is_physics_3d_pair_joint_suppressed(&world, 0, 1));
        assert!(is_physics_3d_pair_joint_suppressed(&world, 0, 2));
    }
}

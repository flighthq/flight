use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Arc;

use super::*;
use crate::common::*;

fn test_world() -> Physics3DWorld {
    let mut world = world();
    add_body(&mut world, Physics3DBodyType::Dynamic);
    add_body(&mut world, Physics3DBodyType::Dynamic);
    world
}

fn hinge(body_a: i32, body_b: i32) -> flight_entity::Ref<Physics3DHingeJoint> {
    physics_3d_hinge_joint(&hinge_options(body_a, body_b))
}

mod add_physics_3d_joint {
    use super::*;

    #[test]
    fn records_the_same_joint_on_the_world() {
        let mut world = test_world();
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        let erased: Physics3DJointRef = joint.clone();

        add_physics_3d_joint(&mut world, &joint);

        assert_eq!(world.joints.len(), 1);
        assert!(Arc::ptr_eq(&world.joints[0], &erased));
    }

    #[test]
    fn refuses_a_joint_that_already_belongs_to_a_world() {
        let mut first = test_world();
        let mut second = test_world();
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        add_physics_3d_joint(&mut first, &joint);

        assert!(
            catch_unwind(AssertUnwindSafe(|| add_physics_3d_joint(
                &mut first, &joint
            )))
            .is_err()
        );
        assert!(
            catch_unwind(AssertUnwindSafe(|| add_physics_3d_joint(
                &mut second,
                &joint
            )))
            .is_err()
        );
    }

    #[test]
    fn exchanges_out_of_order_ends_when_the_kind_has_a_solver() {
        let mut world = test_world();
        register_physics_3d_joint_solver(
            &mut world,
            PHYSICS_3D_HINGE_JOINT_KIND.to_string(),
            PHYSICS_3D_HINGE_JOINT_SOLVER.clone(),
        );
        let mut options = hinge_options(1, 0);
        options.frame.joint.local_anchor_ax = Some(5.0);
        options.frame.joint.local_anchor_bx = Some(7.0);
        options.lower_angle = Some(-0.25);
        options.upper_angle = Some(1.5);
        let joint = physics_3d_hinge_joint(&options);

        add_physics_3d_joint(&mut world, &joint);

        let joint = joint.read().unwrap();
        assert_eq!((joint.joint.body_a, joint.joint.body_b), (0, 1));
        assert_eq!(
            (joint.joint.local_anchor_ax, joint.joint.local_anchor_bx),
            (7.0, 5.0)
        );
        assert_eq!(joint.lower_angle, -1.5);
    }

    #[test]
    fn leaves_an_unknown_kind_in_its_authored_order() {
        let mut world = test_world();
        let mut options = hinge_options(1, 0);
        options.lower_angle = Some(-0.25);
        options.upper_angle = Some(1.5);
        let joint = physics_3d_hinge_joint(&options);

        add_physics_3d_joint(&mut world, &joint);

        let joint = joint.read().unwrap();
        assert_eq!(joint.joint.body_a, 1);
        assert_eq!(joint.lower_angle, -0.25);
    }

    #[test]
    fn wakes_both_bodies_when_the_constraint_is_live() {
        let mut world = test_world();
        register_physics_3d_joint_solver(
            &mut world,
            PHYSICS_3D_HINGE_JOINT_KIND.to_string(),
            PHYSICS_3D_HINGE_JOINT_SOLVER.clone(),
        );
        world.bodies[0].write().unwrap().sleeping = true;
        world.bodies[1].write().unwrap().sleeping = true;

        add_physics_3d_joint(&mut world, &hinge(0, 1));

        assert!(!world.bodies[0].read().unwrap().sleeping);
        assert!(!world.bodies[1].read().unwrap().sleeping);
    }

    #[test]
    fn leaves_a_sleeping_pair_asleep_for_an_unknown_kind() {
        let mut world = test_world();
        world.bodies[0].write().unwrap().sleeping = true;

        add_physics_3d_joint(&mut world, &hinge(0, 1));

        assert!(world.bodies[0].read().unwrap().sleeping);
    }

    #[test]
    fn rejects_a_mutation_while_the_world_is_stepping() {
        let mut world = test_world();
        let first = world.bodies[0].clone();
        let second = world.bodies[1].clone();
        add_physics_3d_collider(&mut world, &first, &collider());
        add_physics_3d_collider(&mut world, &second, &collider());
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        world.contact_hooks.pre_solve = Some(Arc::new(move |world, _| {
            add_physics_3d_joint(world, &joint);
        }));

        let result = catch_unwind(AssertUnwindSafe(|| {
            step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        }));

        assert!(result.is_err());
    }
}

mod get_physics_3d_joint_solver {
    use super::*;

    #[test]
    fn returns_none_for_an_unregistered_kind() {
        assert!(get_physics_3d_joint_solver(&test_world(), "acme.Suspension").is_none());
    }

    #[test]
    fn returns_the_registered_solver() {
        let mut world = test_world();
        register_physics_3d_joint_solver(
            &mut world,
            PHYSICS_3D_HINGE_JOINT_KIND.to_string(),
            PHYSICS_3D_HINGE_JOINT_SOLVER.clone(),
        );

        let solver = get_physics_3d_joint_solver(&world, PHYSICS_3D_HINGE_JOINT_KIND).unwrap();
        assert!(Arc::ptr_eq(
            &solver.prepare,
            &PHYSICS_3D_HINGE_JOINT_SOLVER.prepare
        ));
    }
}

mod invalidate_physics_3d_joint {
    use super::*;

    #[test]
    fn clears_every_common_accumulator_and_the_kind_specific_ones() {
        let mut world = test_world();
        register_physics_3d_joint_solver(
            &mut world,
            PHYSICS_3D_HINGE_JOINT_KIND.to_string(),
            PHYSICS_3D_HINGE_JOINT_SOLVER.clone(),
        );
        let joint = hinge(0, 1);
        let erased: Physics3DJointRef = joint.clone();
        add_physics_3d_joint(&mut world, &joint);
        {
            let mut joint = joint.write().unwrap();
            joint.joint.impulse0 = 1.0;
            joint.joint.impulse5 = 2.0;
            joint.motor_impulse = 3.0;
        }

        assert!(invalidate_physics_3d_joint(&mut world, &erased));

        let joint = joint.read().unwrap();
        assert_eq!(joint.joint.impulse0, 0.0);
        assert_eq!(joint.joint.impulse5, 0.0);
        assert_eq!(joint.motor_impulse, 0.0);
    }

    #[test]
    fn returns_false_for_a_joint_this_world_does_not_hold() {
        let mut world = test_world();
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        let erased: Physics3DJointRef = joint.clone();

        assert!(!invalidate_physics_3d_joint(&mut world, &erased));
    }
}

mod is_physics_3d_pair_ordered {
    use super::*;

    #[test]
    fn orders_by_persistent_index_and_admits_a_pair_already_in_order() {
        assert!(is_physics_3d_pair_ordered(0, 1));
        assert!(is_physics_3d_pair_ordered(1, 1));
        assert!(!is_physics_3d_pair_ordered(1, 0));
    }
}

mod register_physics_3d_joint_solver {
    use super::*;

    #[test]
    fn canonicalizes_joints_that_were_added_before_their_solver_existed() {
        let mut world = test_world();
        let mut options = hinge_options(1, 0);
        options.lower_angle = Some(-0.25);
        options.upper_angle = Some(1.5);
        let joint = physics_3d_hinge_joint(&options);
        add_physics_3d_joint(&mut world, &joint);

        register_physics_3d_joint_solver(
            &mut world,
            PHYSICS_3D_HINGE_JOINT_KIND.to_string(),
            PHYSICS_3D_HINGE_JOINT_SOLVER.clone(),
        );

        let joint = joint.read().unwrap();
        assert_eq!(joint.joint.body_a, 0);
        assert_eq!(joint.lower_angle, -1.5);
        assert_eq!(joint.upper_angle, 0.25);
    }

    #[test]
    fn lets_a_later_registration_replace_an_earlier_one() {
        let mut world = test_world();
        let mut replacement = PHYSICS_3D_HINGE_JOINT_SOLVER.clone();
        replacement.prepare = Arc::new(|_, _, _| {});
        register_physics_3d_joint_solver(
            &mut world,
            PHYSICS_3D_HINGE_JOINT_KIND.to_string(),
            PHYSICS_3D_HINGE_JOINT_SOLVER.clone(),
        );
        register_physics_3d_joint_solver(
            &mut world,
            PHYSICS_3D_HINGE_JOINT_KIND.to_string(),
            replacement.clone(),
        );

        let solver = get_physics_3d_joint_solver(&world, PHYSICS_3D_HINGE_JOINT_KIND).unwrap();
        assert!(Arc::ptr_eq(&solver.prepare, &replacement.prepare));
    }

    #[test]
    fn wakes_the_bodies_of_a_joint_the_registration_just_brought_to_life() {
        let mut world = test_world();
        add_physics_3d_joint(&mut world, &hinge(0, 1));
        world.bodies[0].write().unwrap().sleeping = true;
        world.bodies[1].write().unwrap().sleeping = true;

        register_physics_3d_joint_solver(
            &mut world,
            PHYSICS_3D_HINGE_JOINT_KIND.to_string(),
            PHYSICS_3D_HINGE_JOINT_SOLVER.clone(),
        );

        assert!(!world.bodies[0].read().unwrap().sleeping);
        assert!(!world.bodies[1].read().unwrap().sleeping);
    }
}

mod remove_physics_3d_joint {
    use super::*;

    #[test]
    fn drops_the_joint_and_reports_it() {
        let mut world = test_world();
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        let erased: Physics3DJointRef = joint.clone();
        add_physics_3d_joint(&mut world, &joint);

        assert!(remove_physics_3d_joint(&mut world, &erased));
        assert!(world.joints.is_empty());
    }

    #[test]
    fn returns_false_for_a_joint_it_never_held() {
        let mut world = test_world();
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        let erased: Physics3DJointRef = joint.clone();

        assert!(!remove_physics_3d_joint(&mut world, &erased));
    }

    #[test]
    fn releases_ownership_so_the_joint_can_be_added_again() {
        let mut world = test_world();
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        let erased: Physics3DJointRef = joint.clone();
        add_physics_3d_joint(&mut world, &joint);
        assert!(remove_physics_3d_joint(&mut world, &erased));

        add_physics_3d_joint(&mut world, &joint);

        assert_eq!(world.joints.len(), 1);
    }

    #[test]
    fn wakes_both_bodies_when_a_live_constraint_is_taken_away() {
        let mut world = test_world();
        register_physics_3d_joint_solver(
            &mut world,
            PHYSICS_3D_HINGE_JOINT_KIND.to_string(),
            PHYSICS_3D_HINGE_JOINT_SOLVER.clone(),
        );
        let joint = hinge(0, 1);
        let erased: Physics3DJointRef = joint.clone();
        add_physics_3d_joint(&mut world, &joint);
        world.bodies[0].write().unwrap().sleeping = true;
        world.bodies[1].write().unwrap().sleeping = true;

        assert!(remove_physics_3d_joint(&mut world, &erased));

        assert!(!world.bodies[0].read().unwrap().sleeping);
        assert!(!world.bodies[1].read().unwrap().sleeping);
    }
}

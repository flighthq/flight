use std::sync::Arc;

use flight_physics2d::*;

fn noop_solver() -> Physics2DJointSolverRef {
    return Arc::new(Physics2DJointSolver {
        clear_accumulated_impulses: None,
        keeps_bodies_awake: None,
        prepare: Arc::new(|_, _, _| {}),
        scale_accumulated_impulses: None,
        solve: Arc::new(|_, _| {}),
        swap_ends: None,
        uses_body_a: None,
        warm_start: None,
        write_reaction: None,
    });
}

mod register_built_in_physics2d_joint_solvers {
    use super::*;

    #[test]
    fn activates_factory_created_joints_that_were_loaded_before_the_bank() {
        let mut world = create_physics2d_world(None, None, None);
        let first = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        let second = create_rigid_body2d(Physics2DBodyType::Dynamic, 1.0, 0.0, None);
        add_physics2d_body(&mut world, &first);
        add_physics2d_body(&mut world, &second);
        first.write().unwrap().sleeping = true;
        second.write().unwrap().sleeping = true;
        let make: fn() -> Physics2DDistanceJointOptions = Physics2DDistanceJointOptions::default;
        let mut options = make();
        options.base.body_a = first.read().unwrap().index;
        options.base.body_b = second.read().unwrap().index;
        options.length = 1.0;
        let joint: Physics2DJointRef = create_physics2d_distance_joint(&options);
        add_physics2d_joint(&mut world, &joint);

        register_built_in_physics2d_joint_solvers(&mut world);

        assert!(!first.read().unwrap().sleeping);
        assert!(!second.read().unwrap().sleeping);
    }

    #[test]
    fn installs_the_complete_built_in_bank_under_its_public_kinds() {
        let mut world = create_physics2d_world(None, None, None);

        register_built_in_physics2d_joint_solvers(&mut world);

        for (kind, solver) in [
            (
                PHYSICS2D_DISTANCE_JOINT_KIND,
                &*PHYSICS2D_DISTANCE_JOINT_SOLVER,
            ),
            (PHYSICS2D_GEAR_JOINT_KIND, &*PHYSICS2D_GEAR_JOINT_SOLVER),
            (PHYSICS2D_MOUSE_JOINT_KIND, &*PHYSICS2D_MOUSE_JOINT_SOLVER),
            (
                PHYSICS2D_PRISMATIC_JOINT_KIND,
                &*PHYSICS2D_PRISMATIC_JOINT_SOLVER,
            ),
            (PHYSICS2D_PULLEY_JOINT_KIND, &*PHYSICS2D_PULLEY_JOINT_SOLVER),
            (
                PHYSICS2D_REVOLUTE_JOINT_KIND,
                &*PHYSICS2D_REVOLUTE_JOINT_SOLVER,
            ),
            (PHYSICS2D_ROPE_JOINT_KIND, &*PHYSICS2D_ROPE_JOINT_SOLVER),
            (PHYSICS2D_WELD_JOINT_KIND, &*PHYSICS2D_WELD_JOINT_SOLVER),
            (PHYSICS2D_WHEEL_JOINT_KIND, &*PHYSICS2D_WHEEL_JOINT_SOLVER),
        ] {
            assert!(
                Arc::ptr_eq(world.joint_solvers.get(kind).unwrap(), solver),
                "{}",
                kind
            );
        }
    }

    #[test]
    fn preserves_vendor_registrations_and_restores_built_ins_on_repeat_calls() {
        let mut world = create_physics2d_world(None, None, None);
        let custom = noop_solver();
        register_physics2d_joint_solver(&mut world, "acme.Conveyor".to_string(), custom.clone());
        register_physics2d_joint_solver(
            &mut world,
            PHYSICS2D_DISTANCE_JOINT_KIND.to_string(),
            custom.clone(),
        );

        register_built_in_physics2d_joint_solvers(&mut world);
        register_built_in_physics2d_joint_solvers(&mut world);

        assert!(Arc::ptr_eq(
            world.joint_solvers.get("acme.Conveyor").unwrap(),
            &custom
        ));
        assert!(Arc::ptr_eq(
            world
                .joint_solvers
                .get(PHYSICS2D_DISTANCE_JOINT_KIND)
                .unwrap(),
            &PHYSICS2D_DISTANCE_JOINT_SOLVER
        ));
        let mut built_ins = create_physics2d_world(None, None, None);
        register_built_in_physics2d_joint_solvers(&mut built_ins);
        assert_eq!(world.joint_solvers.len(), built_ins.joint_solvers.len() + 1);
    }
}

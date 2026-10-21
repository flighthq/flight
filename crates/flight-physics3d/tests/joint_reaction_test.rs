use super::*;
use crate::common::*;

struct HangingScene {
    world: Physics3DWorld,
    joint: Physics3DJointRef,
}

fn unit_body(mass: f32) -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    let mut data = create_physics_3d_mass_data();
    data.mass = mass;
    data.inertia_xx = mass;
    data.inertia_yy = mass;
    data.inertia_zz = mass;
    set_rigid_body_3d_mass_data(&mut body.write().unwrap(), &data);
    body
}

fn hanging_scene(mass: f32, gravity: f32) -> HangingScene {
    let mut world = world();
    world.gravity_y = -gravity;
    register_built_in_physics_3d_joint_solvers(&mut world);
    add_body(&mut world, Physics3DBodyType::Static);
    let hanging = unit_body(mass);
    add_physics_3d_body(&mut world, &hanging);
    let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
    let erased: Physics3DJointRef = joint.clone();
    add_physics_3d_joint(&mut world, &joint);
    HangingScene {
        world,
        joint: erased,
    }
}

fn step(world: &mut Physics3DWorld, dt: f32) {
    step_physics_3d(world, &registered_registry(), dt, None);
}

mod accumulate_physics_3d_joint_row_reaction {
    use super::*;

    #[test]
    fn reads_a_linear_row_as_pure_force_with_no_torque_at_the_anchor() {
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        {
            let mut joint = joint.write().unwrap();
            joint.joint.r_bx = 0.0;
            joint.joint.r_by = 2.0;
            joint.joint.r_bz = 0.0;
        }
        let state = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -2.0];
        let mut out = create_physics_3d_joint_reaction();

        accumulate_physics_3d_joint_row_reaction(&mut out, &*joint.read().unwrap(), &state, 0, 5.0);

        assert!((out.force_x - 5.0).abs() < 1e-6);
        assert!(get_physics_3d_joint_reaction_torque(&out) < 1e-6);
    }

    #[test]
    fn reads_a_purely_angular_row_as_pure_torque() {
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        {
            let mut joint = joint.write().unwrap();
            joint.joint.r_bx = 3.0;
            joint.joint.r_by = 1.0;
            joint.joint.r_bz = -2.0;
        }
        let state = [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0];
        let mut out = create_physics_3d_joint_reaction();

        accumulate_physics_3d_joint_row_reaction(&mut out, &*joint.read().unwrap(), &state, 0, 4.0);

        assert!(get_physics_3d_joint_reaction_force(&out) < 1e-6);
        assert!((out.torque_y - 4.0).abs() < 1e-6);
    }

    #[test]
    fn adds_rather_than_overwriting_so_several_rows_sum_into_one_reaction() {
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        let state = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        let mut out = create_physics_3d_joint_reaction();

        accumulate_physics_3d_joint_row_reaction(&mut out, &*joint.read().unwrap(), &state, 0, 2.0);
        accumulate_physics_3d_joint_row_reaction(&mut out, &*joint.read().unwrap(), &state, 0, 3.0);

        assert!((out.force_x - 5.0).abs() < 1e-6);
    }

    #[test]
    fn ignores_a_zero_impulse() {
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        let mut out = create_physics_3d_joint_reaction();
        out.force_x = 9.0;

        accumulate_physics_3d_joint_row_reaction(
            &mut out,
            &*joint.read().unwrap(),
            &[1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            0,
            0.0,
        );

        assert_eq!(out.force_x, 9.0);
    }
}

mod clear_physics_3d_joint_reaction {
    use super::*;

    #[test]
    fn zeroes_every_component() {
        let mut out = create_physics_3d_joint_reaction();
        out.force_x = 1.0;
        out.force_y = 2.0;
        out.force_z = 3.0;
        out.torque_x = 4.0;
        out.torque_y = 5.0;
        out.torque_z = 6.0;

        clear_physics_3d_joint_reaction(&mut out);

        assert_eq!(
            (
                out.force_x,
                out.force_y,
                out.force_z,
                out.torque_x,
                out.torque_y,
                out.torque_z,
            ),
            (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        );
    }
}

mod create_physics_3d_joint_reaction {
    use super::*;

    #[test]
    fn starts_zeroed() {
        let out = create_physics_3d_joint_reaction();
        assert_eq!(
            (
                out.force_x,
                out.force_y,
                out.force_z,
                out.torque_x,
                out.torque_y,
                out.torque_z,
            ),
            (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        );
    }
}

mod get_physics_3d_joint_reaction_force {
    use super::*;

    #[test]
    fn is_the_magnitude_of_the_force_triple() {
        let mut out = create_physics_3d_joint_reaction();
        out.force_x = 3.0;
        out.force_y = 4.0;
        assert_eq!(get_physics_3d_joint_reaction_force(&out), 5.0);
    }
}

mod get_physics_3d_joint_reaction_torque {
    use super::*;

    #[test]
    fn is_the_magnitude_of_the_torque_triple() {
        let mut out = create_physics_3d_joint_reaction();
        out.torque_y = 6.0;
        out.torque_z = 8.0;
        assert_eq!(get_physics_3d_joint_reaction_torque(&out), 10.0);
    }
}

mod initialize_physics_3d_joint_reaction {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let mut out = create_physics_3d_joint_reaction();
        out.force_z = 9.0;

        initialize_physics_3d_joint_reaction(&mut out);

        assert_eq!(out.force_z, 0.0);
    }
}

mod write_physics_3d_joint_reaction {
    use super::*;

    #[test]
    fn measures_the_weight_a_joint_is_holding_up() {
        let mut scene = hanging_scene(3.0, 10.0);
        step(&mut scene.world, 1.0 / 60.0);
        let mut out = create_physics_3d_joint_reaction();

        assert!(write_physics_3d_joint_reaction(
            &mut out,
            &scene.world,
            &scene.joint,
            1.0 / 60.0,
        ));
        assert!((get_physics_3d_joint_reaction_force(&out) - 30.0).abs() < 0.5);
    }

    #[test]
    fn scales_with_the_hanging_mass() {
        let mut light = hanging_scene(1.0, 10.0);
        let mut heavy = hanging_scene(4.0, 10.0);
        step(&mut light.world, 1.0 / 60.0);
        step(&mut heavy.world, 1.0 / 60.0);
        let mut out = create_physics_3d_joint_reaction();
        assert!(write_physics_3d_joint_reaction(
            &mut out,
            &light.world,
            &light.joint,
            1.0 / 60.0,
        ));
        let light_force = get_physics_3d_joint_reaction_force(&out);
        assert!(write_physics_3d_joint_reaction(
            &mut out,
            &heavy.world,
            &heavy.joint,
            1.0 / 60.0,
        ));

        assert!((get_physics_3d_joint_reaction_force(&out) / light_force - 4.0).abs() < 0.5);
    }

    #[test]
    fn reports_a_force_so_the_reading_does_not_move_with_the_timestep() {
        let mut coarse = hanging_scene(3.0, 10.0);
        let mut fine = hanging_scene(3.0, 10.0);
        step(&mut coarse.world, 1.0 / 60.0);
        step(&mut fine.world, 1.0 / 120.0);
        let mut out = create_physics_3d_joint_reaction();
        assert!(write_physics_3d_joint_reaction(
            &mut out,
            &coarse.world,
            &coarse.joint,
            1.0 / 60.0,
        ));
        let coarse_force = get_physics_3d_joint_reaction_force(&out);
        assert!(write_physics_3d_joint_reaction(
            &mut out,
            &fine.world,
            &fine.joint,
            1.0 / 120.0,
        ));

        assert!((get_physics_3d_joint_reaction_force(&out) - coarse_force).abs() < 0.5);
    }

    #[test]
    fn declines_a_joint_whose_kind_has_no_registered_solver() {
        let mut scene = hanging_scene(3.0, 10.0);
        scene.world.joint_solvers.clear();
        let mut out = create_physics_3d_joint_reaction();

        assert!(!write_physics_3d_joint_reaction(
            &mut out,
            &scene.world,
            &scene.joint,
            1.0 / 60.0,
        ));
        assert_eq!(get_physics_3d_joint_reaction_force(&out), 0.0);
    }

    #[test]
    fn declines_a_joint_that_has_not_been_solved_yet() {
        let scene = hanging_scene(3.0, 10.0);
        let mut out = create_physics_3d_joint_reaction();

        assert!(!write_physics_3d_joint_reaction(
            &mut out,
            &scene.world,
            &scene.joint,
            1.0 / 60.0,
        ));
    }

    #[test]
    fn declines_a_non_positive_timestep_rather_than_dividing_by_it() {
        let mut scene = hanging_scene(3.0, 10.0);
        step(&mut scene.world, 1.0 / 60.0);
        let mut out = create_physics_3d_joint_reaction();

        assert!(!write_physics_3d_joint_reaction(
            &mut out,
            &scene.world,
            &scene.joint,
            0.0,
        ));
        assert!(get_physics_3d_joint_reaction_force(&out).is_finite());
    }

    #[test]
    fn reads_a_distance_joint_whose_one_slot_is_an_axial_scalar() {
        let mut world = world();
        world.gravity_y = -10.0;
        register_built_in_physics_3d_joint_solvers(&mut world);
        add_body(&mut world, Physics3DBodyType::Static);
        let hanging = unit_body(2.0);
        hanging.write().unwrap().y = -3.0;
        add_physics_3d_body(&mut world, &hanging);
        let mut options = distance_options(0, 1);
        options.length = Some(3.0);
        let joint = physics_3d_distance_joint(&options);
        let erased: Physics3DJointRef = joint.clone();
        add_physics_3d_joint(&mut world, &joint);
        step(&mut world, 1.0 / 60.0);
        let mut out = create_physics_3d_joint_reaction();

        assert!(write_physics_3d_joint_reaction(
            &mut out,
            &world,
            &erased,
            1.0 / 60.0,
        ));
        assert!((get_physics_3d_joint_reaction_force(&out) - 20.0).abs() < 0.5);
        assert!((out.force_y.abs() - 20.0).abs() < 0.5);
    }
}

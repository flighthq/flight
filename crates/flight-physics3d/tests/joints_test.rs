use std::collections::HashSet;

use super::*;
use crate::common::*;

struct Scene {
    world: Physics3DWorld,
    body_a: RigidBody3DRef,
    body_b: RigidBody3DRef,
}

fn anchor_speed(scene: &Scene, joint: &Physics3DJointRef) -> f32 {
    let body_a = scene.body_a.read().unwrap();
    let body_b = scene.body_b.read().unwrap();
    write_physics_3d_joint_anchors(&mut *joint.write().unwrap(), &body_a, &body_b);
    let mut velocity = [0.0; 3];
    write_physics_3d_joint_anchor_velocity(
        &mut velocity,
        &body_a,
        &body_b,
        &*joint.read().unwrap(),
    );
    (velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2]).sqrt()
}

fn create_scene() -> Scene {
    let mut world = world();
    let body_a = create_unit_body();
    let body_b = create_unit_body();
    body_b.write().unwrap().x = 2.0;
    add_physics_3d_body(&mut world, &body_a);
    add_physics_3d_body(&mut world, &body_b);
    Scene {
        world,
        body_a,
        body_b,
    }
}

fn create_loaded_hinge_stop() -> (Scene, flight_entity::Ref<Physics3DHingeJoint>) {
    let mut scene = create_scene();
    make_static(&mut scene.world, &scene.body_a);
    set_axis_angle(&scene.body_b, 1.0, 0.0, 0.0, 0.2);
    let mut options = hinge_options(0, 1);
    options.enable_limit = Some(true);
    options.lower_angle = Some(-0.05);
    options.upper_angle = Some(0.05);
    let joint = physics_3d_hinge_joint(&options);
    (scene, joint)
}

fn create_unit_body() -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    let mut data = create_physics_3d_mass_data();
    data.mass = 1.0;
    data.inertia_xx = 1.0;
    data.inertia_yy = 1.0;
    data.inertia_zz = 1.0;
    let mut body_value = body.write().unwrap();
    set_rigid_body_3d_mass_data(&mut body_value, &data);
    refresh_rigid_body_3d_world_inertia(&mut body_value);
    drop(body_value);
    body
}

fn make_static(world: &mut Physics3DWorld, body: &RigidBody3DRef) {
    set_physics_3d_body_type(world, body, Physics3DBodyType::Static);
    refresh_rigid_body_3d_world_inertia(&mut body.write().unwrap());
}

fn separation_speed(scene: &Scene) -> f32 {
    let body_a = scene.body_a.read().unwrap();
    let body_b = scene.body_b.read().unwrap();
    let axis_x = body_b.x - body_a.x;
    let axis_y = body_b.y - body_a.y;
    let axis_z = body_b.z - body_a.z;
    let length = (axis_x * axis_x + axis_y * axis_y + axis_z * axis_z).sqrt();
    if length == 0.0 {
        return 0.0;
    }
    ((body_b.velocity_x - body_a.velocity_x) * axis_x
        + (body_b.velocity_y - body_a.velocity_y) * axis_y
        + (body_b.velocity_z - body_a.velocity_z) * axis_z)
        / length
}

fn set_axis_angle(body: &RigidBody3DRef, x: f32, y: f32, z: f32, angle: f32) {
    let sine = (angle / 2.0).sin();
    let mut body = body.write().unwrap();
    body.orientation_x = x * sine;
    body.orientation_y = y * sine;
    body.orientation_z = z * sine;
    body.orientation_w = (angle / 2.0).cos();
    refresh_rigid_body_3d_world_inertia(&mut body);
}

fn solve_joint(
    world: &mut Physics3DWorld,
    joint: &Physics3DJointRef,
    solver: &Physics3DJointSolver,
    iterations: usize,
    dt: f32,
) {
    (solver.prepare)(world, joint, dt);
    if let Some(warm_start) = &solver.warm_start {
        warm_start(world, joint);
    }
    for _ in 0..iterations {
        (solver.solve)(world, joint, dt);
    }
}

mod built_in_joint_solvers {
    use super::*;

    #[test]
    fn expose_complete_solver_lifecycles() {
        let solvers = [
            &*PHYSICS_3D_BALL_AND_SOCKET_JOINT_SOLVER,
            &*PHYSICS_3D_CONE_TWIST_JOINT_SOLVER,
            &*PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            &*PHYSICS_3D_FIXED_JOINT_SOLVER,
            &*PHYSICS_3D_GENERIC_6_DOF_JOINT_SOLVER,
            &*PHYSICS_3D_HINGE_JOINT_SOLVER,
            &*PHYSICS_3D_SLIDER_JOINT_SOLVER,
        ];
        for solver in solvers {
            assert!(solver.write_reaction.is_some());
            assert!(solver.clear_accumulated_impulses.is_some());
        }
    }

    #[test]
    fn prepare_each_solver_for_a_registered_body_pair() {
        let mut world = world();
        let (a, b) = add_dynamic_pair(&mut world);
        let body_a = a.read().unwrap().index;
        let body_b = b.read().unwrap().index;
        add_physics_3d_joint(
            &mut world,
            &physics_3d_ball_and_socket_joint(&joint_options(body_a, body_b)),
        );
        add_physics_3d_joint(
            &mut world,
            &physics_3d_cone_twist_joint(&cone_options(body_a, body_b)),
        );
        add_physics_3d_joint(
            &mut world,
            &physics_3d_distance_joint(&distance_options(body_a, body_b)),
        );
        add_physics_3d_joint(
            &mut world,
            &physics_3d_fixed_joint(&frame_options(body_a, body_b)),
        );
        add_physics_3d_joint(
            &mut world,
            &physics_3d_generic_6_dof_joint(&dof_options(body_a, body_b)),
        );
        add_physics_3d_joint(
            &mut world,
            &physics_3d_hinge_joint(&hinge_options(body_a, body_b)),
        );
        add_physics_3d_joint(
            &mut world,
            &physics_3d_slider_joint(&slider_options(body_a, body_b)),
        );
        let joints = world.joints.clone();
        let solvers = [
            &*PHYSICS_3D_BALL_AND_SOCKET_JOINT_SOLVER,
            &*PHYSICS_3D_CONE_TWIST_JOINT_SOLVER,
            &*PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            &*PHYSICS_3D_FIXED_JOINT_SOLVER,
            &*PHYSICS_3D_GENERIC_6_DOF_JOINT_SOLVER,
            &*PHYSICS_3D_HINGE_JOINT_SOLVER,
            &*PHYSICS_3D_SLIDER_JOINT_SOLVER,
        ];
        for (joint, solver) in joints.iter().zip(solvers) {
            (solver.prepare)(&mut world, joint, 1.0 / 60.0);
            assert!(get_joint_solve_state(&*joint.read().unwrap()).is_some());
        }
    }
}

mod physics_3d_ball_and_socket_joint_kind {
    use super::*;

    #[test]
    fn names_every_built_in_kind_uniquely_and_without_a_vendor_prefix() {
        let kinds = [
            PHYSICS_3D_BALL_AND_SOCKET_JOINT_KIND,
            PHYSICS_3D_CONE_TWIST_JOINT_KIND,
            PHYSICS_3D_DISTANCE_JOINT_KIND,
            PHYSICS_3D_FIXED_JOINT_KIND,
            PHYSICS_3D_GENERIC_6_DOF_JOINT_KIND,
            PHYSICS_3D_HINGE_JOINT_KIND,
            PHYSICS_3D_SLIDER_JOINT_KIND,
        ];

        assert_eq!(
            kinds.iter().copied().collect::<HashSet<_>>().len(),
            kinds.len()
        );
        assert!(kinds.iter().all(|kind| !kind.contains('.')));
    }
}

mod physics_3d_ball_and_socket_joint_solver {
    use super::*;

    #[test]
    fn cancels_the_velocity_separating_the_two_anchors() {
        let mut scene = create_scene();
        let mut options = joint_options(0, 1);
        options.local_anchor_ax = Some(1.0);
        options.local_anchor_bx = Some(-1.0);
        let typed = physics_3d_ball_and_socket_joint(&options);
        let joint: Physics3DJointRef = typed;
        {
            let mut body_b = scene.body_b.write().unwrap();
            body_b.velocity_x = 4.0;
            body_b.velocity_y = -2.0;
        }

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_BALL_AND_SOCKET_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        assert!(anchor_speed(&scene, &joint) < 1.0e-6);
    }

    #[test]
    fn leaves_relative_rotation_completely_free() {
        let mut scene = create_scene();
        let typed = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        let joint: Physics3DJointRef = typed;
        scene.body_b.write().unwrap().angular_velocity_y = 3.0;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_BALL_AND_SOCKET_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        assert_eq!(scene.body_b.read().unwrap().angular_velocity_y, 3.0);
    }

    #[test]
    fn pulls_a_separated_pair_back_together() {
        let mut scene = create_scene();
        let mut options = joint_options(0, 1);
        options.local_anchor_ax = Some(1.0);
        options.local_anchor_bx = Some(-1.0);
        let typed = physics_3d_ball_and_socket_joint(&options);
        let joint: Physics3DJointRef = typed;
        scene.body_b.write().unwrap().x = 4.0;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_BALL_AND_SOCKET_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        assert!(scene.body_b.read().unwrap().velocity_x < 0.0);
        assert!(scene.body_a.read().unwrap().velocity_x > 0.0);
    }
}

mod physics_3d_cone_twist_joint_solver {
    use super::*;

    #[test]
    fn leaves_a_swing_inside_the_cone_alone() {
        let mut scene = create_scene();
        let mut options = cone_options(0, 1);
        options.swing_limit_y = Some(1.0);
        options.swing_limit_z = Some(1.0);
        let typed = physics_3d_cone_twist_joint(&options);
        let joint: Physics3DJointRef = typed;
        scene.body_b.write().unwrap().angular_velocity_z = 0.5;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_CONE_TWIST_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let relative = scene.body_b.read().unwrap().angular_velocity_z
            - scene.body_a.read().unwrap().angular_velocity_z;
        assert!((relative - 0.5).abs() < 1.0e-6);
    }

    #[test]
    fn pushes_back_on_a_swing_past_the_cone() {
        let mut scene = create_scene();
        set_axis_angle(&scene.body_b, 0.0, 0.0, 1.0, 0.5);
        let mut options = cone_options(0, 1);
        options.swing_limit_y = Some(0.2);
        options.swing_limit_z = Some(0.2);
        let typed = physics_3d_cone_twist_joint(&options);
        let joint: Physics3DJointRef = typed;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_CONE_TWIST_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let relative = scene.body_b.read().unwrap().angular_velocity_z
            - scene.body_a.read().unwrap().angular_velocity_z;
        assert!(relative < 0.0);
    }

    #[test]
    fn takes_its_cone_from_the_axis_the_tilt_is_actually_in() {
        let mut wide = create_scene();
        set_axis_angle(&wide.body_b, 0.0, 0.0, 1.0, 0.5);
        let mut wide_options = cone_options(0, 1);
        wide_options.swing_limit_y = Some(1.2);
        wide_options.swing_limit_z = Some(0.05);
        let wide_typed = physics_3d_cone_twist_joint(&wide_options);
        let wide_joint: Physics3DJointRef = wide_typed;
        solve_joint(
            &mut wide.world,
            &wide_joint,
            &PHYSICS_3D_CONE_TWIST_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let mut narrow = create_scene();
        set_axis_angle(&narrow.body_b, 0.0, 0.0, 1.0, 0.5);
        let mut narrow_options = cone_options(0, 1);
        narrow_options.swing_limit_y = Some(0.05);
        narrow_options.swing_limit_z = Some(1.2);
        let narrow_typed = physics_3d_cone_twist_joint(&narrow_options);
        let narrow_joint: Physics3DJointRef = narrow_typed;
        solve_joint(
            &mut narrow.world,
            &narrow_joint,
            &PHYSICS_3D_CONE_TWIST_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        assert!(wide.body_b.read().unwrap().angular_velocity_z.abs() < 1.0e-6);
        assert!(narrow.body_b.read().unwrap().angular_velocity_z < 0.0);
    }

    #[test]
    fn bounds_the_twist_without_touching_the_swing() {
        let mut scene = create_scene();
        set_axis_angle(&scene.body_b, 1.0, 0.0, 0.0, 0.5);
        let mut options = cone_options(0, 1);
        options.enable_swing_limit = Some(false);
        options.enable_twist_limit = Some(true);
        options.lower_twist_angle = Some(-0.1);
        options.upper_twist_angle = Some(0.1);
        let typed = physics_3d_cone_twist_joint(&options);
        let joint: Physics3DJointRef = typed;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_CONE_TWIST_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let relative = scene.body_b.read().unwrap().angular_velocity_x
            - scene.body_a.read().unwrap().angular_velocity_x;
        assert!(relative < 0.0);
    }

    #[test]
    fn refuses_to_exchange_its_ends() {
        let typed = physics_3d_cone_twist_joint(&cone_options(1, 0));
        let joint: Physics3DJointRef = typed;
        assert_eq!(
            PHYSICS_3D_CONE_TWIST_JOINT_SOLVER
                .swap_ends
                .as_ref()
                .unwrap()(&joint),
            false
        );
    }
}

mod physics_3d_distance_joint_solver {
    use super::*;

    #[test]
    fn cancels_the_velocity_changing_the_separation() {
        let mut scene = create_scene();
        let mut options = distance_options(0, 1);
        options.length = Some(2.0);
        let typed = physics_3d_distance_joint(&options);
        let joint: Physics3DJointRef = typed;
        scene.body_b.write().unwrap().velocity_x = 4.0;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        assert!(separation_speed(&scene).abs() < 1.0e-6);
    }

    #[test]
    fn leaves_motion_perpendicular_to_the_axis_alone() {
        let mut scene = create_scene();
        let mut options = distance_options(0, 1);
        options.length = Some(2.0);
        let typed = physics_3d_distance_joint(&options);
        let joint: Physics3DJointRef = typed;
        scene.body_b.write().unwrap().velocity_y = 3.0;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        assert!((scene.body_b.read().unwrap().velocity_y - 3.0).abs() < 1.0e-6);
    }

    #[test]
    fn leaves_relative_rotation_free() {
        let mut scene = create_scene();
        let mut options = distance_options(0, 1);
        options.length = Some(2.0);
        let typed = physics_3d_distance_joint(&options);
        let joint: Physics3DJointRef = typed;
        scene.body_b.write().unwrap().angular_velocity_y = 3.0;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        assert_eq!(scene.body_b.read().unwrap().angular_velocity_y, 3.0);
    }

    #[test]
    fn pulls_a_stretched_pair_together_and_pushes_a_compressed_pair_apart() {
        let mut stretched = create_scene();
        stretched.body_b.write().unwrap().x = 4.0;
        let mut stretched_options = distance_options(0, 1);
        stretched_options.length = Some(2.0);
        let stretched_typed = physics_3d_distance_joint(&stretched_options);
        let stretched_joint: Physics3DJointRef = stretched_typed;
        solve_joint(
            &mut stretched.world,
            &stretched_joint,
            &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );
        assert!(stretched.body_b.read().unwrap().velocity_x < 0.0);
        assert!(stretched.body_a.read().unwrap().velocity_x > 0.0);

        let mut compressed = create_scene();
        compressed.body_b.write().unwrap().x = 1.0;
        let mut compressed_options = distance_options(0, 1);
        compressed_options.length = Some(2.0);
        let compressed_typed = physics_3d_distance_joint(&compressed_options);
        let compressed_joint: Physics3DJointRef = compressed_typed;
        solve_joint(
            &mut compressed.world,
            &compressed_joint,
            &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );
        assert!(compressed.body_b.read().unwrap().velocity_x > 0.0);
        assert!(compressed.body_a.read().unwrap().velocity_x < 0.0);
    }

    #[test]
    fn is_slack_inside_its_limit_interval_which_is_what_makes_it_a_rope() {
        let mut scene = create_scene();
        let mut options = distance_options(0, 1);
        options.length = Some(2.0);
        options.enable_limit = Some(true);
        options.max_length = Some(5.0);
        let typed = physics_3d_distance_joint(&options);
        let joint: Physics3DJointRef = typed;
        scene.body_b.write().unwrap().velocity_x = 4.0;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        assert!((scene.body_b.read().unwrap().velocity_x - 4.0).abs() < 1.0e-6);
        assert!(scene.body_a.read().unwrap().velocity_x.abs() < 1.0e-6);
    }

    #[test]
    fn catches_the_pair_at_its_maximum_length() {
        let mut scene = create_scene();
        scene.body_b.write().unwrap().x = 6.0;
        let mut options = distance_options(0, 1);
        options.enable_limit = Some(true);
        options.max_length = Some(5.0);
        let typed = physics_3d_distance_joint(&options);
        let joint: Physics3DJointRef = typed;
        scene.body_b.write().unwrap().velocity_x = 4.0;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        assert!(scene.body_b.read().unwrap().velocity_x < 0.0);
    }

    #[test]
    fn holds_the_pair_apart_at_its_minimum_length() {
        let mut scene = create_scene();
        let mut options = distance_options(0, 1);
        options.enable_limit = Some(true);
        options.min_length = Some(4.0);
        options.max_length = Some(9.0);
        let typed = physics_3d_distance_joint(&options);
        let joint: Physics3DJointRef = typed;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        assert!(scene.body_b.read().unwrap().velocity_x > 0.0);
        assert!(scene.body_a.read().unwrap().velocity_x < 0.0);
    }

    #[test]
    fn never_pulls_at_its_maximum_only_catches() {
        let mut scene = create_scene();
        {
            let mut body_b = scene.body_b.write().unwrap();
            body_b.x = 3.0;
            body_b.velocity_x = -4.0;
        }
        let mut options = distance_options(0, 1);
        options.enable_limit = Some(true);
        options.min_length = Some(0.0);
        options.max_length = Some(5.0);
        let typed = physics_3d_distance_joint(&options);
        let joint: Physics3DJointRef = typed;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        assert!((scene.body_b.read().unwrap().velocity_x + 4.0).abs() < 1.0e-6);
    }

    #[test]
    fn yields_under_load_where_the_rigid_form_does_not() {
        let mut rigid = create_scene();
        rigid.body_b.write().unwrap().x = 4.0;
        let mut rigid_options = distance_options(0, 1);
        rigid_options.length = Some(2.0);
        let rigid_typed = physics_3d_distance_joint(&rigid_options);
        let rigid_joint: Physics3DJointRef = rigid_typed;
        solve_joint(
            &mut rigid.world,
            &rigid_joint,
            &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        let mut soft = create_scene();
        soft.body_b.write().unwrap().x = 4.0;
        let mut soft_options = distance_options(0, 1);
        soft_options.length = Some(2.0);
        soft_options.enable_spring = Some(true);
        soft_options.frequency_hz = Some(2.0);
        soft_options.damping_ratio = Some(0.5);
        let soft_typed = physics_3d_distance_joint(&soft_options);
        let soft_joint: Physics3DJointRef = soft_typed;
        solve_joint(
            &mut soft.world,
            &soft_joint,
            &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        assert!(
            soft.body_b.read().unwrap().velocity_x.abs()
                < rigid.body_b.read().unwrap().velocity_x.abs()
        );
    }

    #[test]
    fn settles_a_spring_at_its_rest_length_over_time() {
        let mut scene = create_scene();
        make_static(&mut scene.world, &scene.body_a);
        scene.body_b.write().unwrap().x = 5.0;
        let mut options = distance_options(0, 1);
        options.length = Some(2.0);
        options.enable_spring = Some(true);
        options.frequency_hz = Some(4.0);
        options.damping_ratio = Some(1.0);
        let typed = physics_3d_distance_joint(&options);
        let joint: Physics3DJointRef = typed;

        for _ in 0..240 {
            solve_joint(
                &mut scene.world,
                &joint,
                &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
                8,
                1.0 / 60.0,
            );
            integrate_rigid_body_3d_pose(&mut scene.body_b.write().unwrap(), 1.0 / 60.0);
        }

        assert!((scene.body_b.read().unwrap().x - 2.0).abs() < 0.005);
    }

    #[test]
    fn settles_a_stiffer_spring_faster_than_a_looser_one() {
        let mut loose_scene = create_scene();
        make_static(&mut loose_scene.world, &loose_scene.body_a);
        loose_scene.body_b.write().unwrap().x = 5.0;
        let mut loose_options = distance_options(0, 1);
        loose_options.length = Some(2.0);
        loose_options.enable_spring = Some(true);
        loose_options.frequency_hz = Some(1.0);
        loose_options.damping_ratio = Some(1.0);
        let loose_typed = physics_3d_distance_joint(&loose_options);
        let loose: Physics3DJointRef = loose_typed;

        let mut stiff_scene = create_scene();
        make_static(&mut stiff_scene.world, &stiff_scene.body_a);
        stiff_scene.body_b.write().unwrap().x = 5.0;
        let mut stiff_options = distance_options(0, 1);
        stiff_options.length = Some(2.0);
        stiff_options.enable_spring = Some(true);
        stiff_options.frequency_hz = Some(6.0);
        stiff_options.damping_ratio = Some(1.0);
        let stiff_typed = physics_3d_distance_joint(&stiff_options);
        let stiff: Physics3DJointRef = stiff_typed;

        for _ in 0..30 {
            solve_joint(
                &mut loose_scene.world,
                &loose,
                &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
                8,
                1.0 / 60.0,
            );
            integrate_rigid_body_3d_pose(&mut loose_scene.body_b.write().unwrap(), 1.0 / 60.0);
            solve_joint(
                &mut stiff_scene.world,
                &stiff,
                &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
                8,
                1.0 / 60.0,
            );
            integrate_rigid_body_3d_pose(&mut stiff_scene.body_b.write().unwrap(), 1.0 / 60.0);
        }

        assert!(
            (stiff_scene.body_b.read().unwrap().x - 2.0).abs()
                < (loose_scene.body_b.read().unwrap().x - 2.0).abs()
        );
    }

    #[test]
    fn bounds_a_spring_by_its_limits_rather_than_letting_it_stretch_through_them() {
        let mut scene = create_scene();
        make_static(&mut scene.world, &scene.body_a);
        scene.body_b.write().unwrap().x = 2.0;
        let mut options = distance_options(0, 1);
        options.length = Some(20.0);
        options.enable_spring = Some(true);
        options.frequency_hz = Some(6.0);
        options.damping_ratio = Some(0.1);
        options.enable_limit = Some(true);
        options.min_length = Some(0.0);
        options.max_length = Some(4.0);
        let typed = physics_3d_distance_joint(&options);
        let joint: Physics3DJointRef = typed;

        for _ in 0..240 {
            solve_joint(
                &mut scene.world,
                &joint,
                &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
                8,
                1.0 / 60.0,
            );
            integrate_rigid_body_3d_pose(&mut scene.body_b.write().unwrap(), 1.0 / 60.0);
        }

        assert!(scene.body_b.read().unwrap().x < 4.1);
    }

    #[test]
    fn clears_its_limit_accumulators_on_request() {
        let mut options = distance_options(0, 1);
        options.enable_limit = Some(true);
        options.max_length = Some(1.0);
        let typed = physics_3d_distance_joint(&options);
        {
            let mut joint = typed.write().unwrap();
            joint.joint.impulse0 = 5.0;
            joint.lower_limit_impulse = 3.0;
            joint.upper_limit_impulse = 7.0;
        }
        let joint: Physics3DJointRef = typed.clone();

        PHYSICS_3D_DISTANCE_JOINT_SOLVER
            .clear_accumulated_impulses
            .as_ref()
            .unwrap()(&joint);

        let joint = typed.read().unwrap();
        assert_eq!(joint.joint.impulse0, 0.0);
        assert_eq!(joint.lower_limit_impulse, 0.0);
        assert_eq!(joint.upper_limit_impulse, 0.0);
    }

    #[test]
    fn accepts_an_exchange_of_ends_having_nothing_signed_to_reverse() {
        let mut options = distance_options(1, 0);
        options.length = Some(2.0);
        let typed = physics_3d_distance_joint(&options);
        let joint: Physics3DJointRef = typed;

        assert!(PHYSICS_3D_DISTANCE_JOINT_SOLVER.swap_ends.as_ref().unwrap()(&joint));
    }

    #[test]
    fn survives_coincident_anchors_without_producing_nan() {
        let mut scene = create_scene();
        scene.body_b.write().unwrap().x = 0.0;
        let mut options = distance_options(0, 1);
        options.length = Some(2.0);
        let typed = physics_3d_distance_joint(&options);
        let joint: Physics3DJointRef = typed;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_DISTANCE_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        let body_b = scene.body_b.read().unwrap();
        assert!(body_b.velocity_x.is_finite());
        assert!(body_b.velocity_y.is_finite());
        assert!(body_b.velocity_z.is_finite());
    }
}

mod physics_3d_fixed_joint_solver {
    use super::*;

    #[test]
    fn cancels_relative_rotation_about_every_axis() {
        let mut scene = create_scene();
        let typed = physics_3d_fixed_joint(&frame_options(0, 1));
        let joint: Physics3DJointRef = typed;
        {
            let mut body_b = scene.body_b.write().unwrap();
            body_b.angular_velocity_x = 1.5;
            body_b.angular_velocity_y = -0.8;
            body_b.angular_velocity_z = 2.1;
        }

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_FIXED_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );

        let body_a = scene.body_a.read().unwrap();
        let body_b = scene.body_b.read().unwrap();
        assert!((body_b.angular_velocity_x - body_a.angular_velocity_x).abs() < 1.0e-6);
        assert!((body_b.angular_velocity_y - body_a.angular_velocity_y).abs() < 1.0e-6);
        assert!((body_b.angular_velocity_z - body_a.angular_velocity_z).abs() < 1.0e-6);
    }

    #[test]
    fn cancels_relative_anchor_motion_as_well_as_rotation() {
        let mut scene = create_scene();
        let mut options = frame_options(0, 1);
        options.joint.local_anchor_ax = Some(1.0);
        options.joint.local_anchor_bx = Some(-1.0);
        let typed = physics_3d_fixed_joint(&options);
        let joint: Physics3DJointRef = typed;
        {
            let mut body_b = scene.body_b.write().unwrap();
            body_b.velocity_z = 3.0;
            body_b.angular_velocity_y = 1.0;
        }

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_FIXED_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        assert!(anchor_speed(&scene, &joint) < 1.0e-6);
    }

    #[test]
    fn exchanges_the_frames_when_its_ends_are_swapped() {
        let mut options = frame_options(0, 1);
        options.local_rotation_ax = Some(1.0);
        options.local_rotation_aw = Some(0.0);
        let typed = physics_3d_fixed_joint(&options);
        let joint: Physics3DJointRef = typed.clone();

        assert!(PHYSICS_3D_FIXED_JOINT_SOLVER.swap_ends.as_ref().unwrap()(
            &joint
        ));
        let joint = typed.read().unwrap();
        assert_eq!(joint.frames.local_rotation_ax, 0.0);
        assert_eq!(joint.frames.local_rotation_aw, 1.0);
        assert_eq!(joint.frames.local_rotation_bx, 1.0);
        assert_eq!(joint.frames.local_rotation_bw, 0.0);
    }
}

mod physics_3d_generic_6_dof_joint_solver {
    use super::*;

    #[test]
    fn constrains_nothing_when_every_axis_is_free() {
        let mut scene = create_scene();
        let typed = physics_3d_generic_6_dof_joint(&dof_options(0, 1));
        let joint: Physics3DJointRef = typed;
        {
            let mut body_b = scene.body_b.write().unwrap();
            body_b.velocity_x = 1.0;
            body_b.velocity_y = 2.0;
            body_b.angular_velocity_z = 3.0;
        }

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_GENERIC_6_DOF_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let body_b = scene.body_b.read().unwrap();
        assert_eq!(body_b.velocity_x, 1.0);
        assert_eq!(body_b.velocity_y, 2.0);
        assert_eq!(body_b.angular_velocity_z, 3.0);
    }

    #[test]
    fn locks_the_one_axis_whose_bounds_are_equal_and_leaves_the_rest_free() {
        let mut scene = create_scene();
        make_static(&mut scene.world, &scene.body_a);
        let mut options = dof_options(0, 1);
        options.lower_linear_y = Some(0.0);
        options.upper_linear_y = Some(0.0);
        let typed = physics_3d_generic_6_dof_joint(&options);
        let joint: Physics3DJointRef = typed;
        {
            let mut body_b = scene.body_b.write().unwrap();
            body_b.velocity_x = 1.0;
            body_b.velocity_y = 2.0;
        }

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_GENERIC_6_DOF_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let body_a = scene.body_a.read().unwrap();
        let body_b = scene.body_b.read().unwrap();
        assert!((body_b.velocity_y - body_a.velocity_y).abs() < 1.0e-6);
        assert!((body_b.velocity_x - 1.0).abs() < 1.0e-6);
    }

    #[test]
    fn lets_a_limited_axis_move_within_its_interval() {
        let mut scene = create_scene();
        let mut options = dof_options(0, 1);
        options.lower_linear_x = Some(1.0);
        options.upper_linear_x = Some(3.0);
        let typed = physics_3d_generic_6_dof_joint(&options);
        let joint: Physics3DJointRef = typed;
        scene.body_b.write().unwrap().velocity_x = 0.5;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_GENERIC_6_DOF_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let relative =
            scene.body_b.read().unwrap().velocity_x - scene.body_a.read().unwrap().velocity_x;
        assert!((relative - 0.5).abs() < 1.0e-6);
    }

    #[test]
    fn stops_a_limited_axis_at_the_end_of_its_interval() {
        let mut scene = create_scene();
        let mut options = dof_options(0, 1);
        options.lower_linear_x = Some(-1.0);
        options.upper_linear_x = Some(1.0);
        let typed = physics_3d_generic_6_dof_joint(&options);
        let joint: Physics3DJointRef = typed;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_GENERIC_6_DOF_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let relative =
            scene.body_b.read().unwrap().velocity_x - scene.body_a.read().unwrap().velocity_x;
        assert!(relative < 0.0);
    }

    #[test]
    fn locks_an_angular_axis_without_disturbing_the_other_two() {
        let mut scene = create_scene();
        let mut options = dof_options(0, 1);
        options.lower_angular_z = Some(0.0);
        options.upper_angular_z = Some(0.0);
        let typed = physics_3d_generic_6_dof_joint(&options);
        let joint: Physics3DJointRef = typed;
        {
            let mut body_b = scene.body_b.write().unwrap();
            body_b.angular_velocity_y = 1.0;
            body_b.angular_velocity_z = 2.0;
        }

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_GENERIC_6_DOF_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let body_a = scene.body_a.read().unwrap();
        let body_b = scene.body_b.read().unwrap();
        assert!((body_b.angular_velocity_z - body_a.angular_velocity_z).abs() < 1.0e-6);
        assert!((body_b.angular_velocity_y - body_a.angular_velocity_y - 1.0).abs() < 1.0e-6);
    }

    #[test]
    fn refuses_to_exchange_its_ends() {
        let typed = physics_3d_generic_6_dof_joint(&dof_options(1, 0));
        let joint: Physics3DJointRef = typed;
        assert_eq!(
            PHYSICS_3D_GENERIC_6_DOF_JOINT_SOLVER
                .swap_ends
                .as_ref()
                .unwrap()(&joint),
            false
        );
    }

    #[test]
    fn carries_a_limited_axis_accumulator_but_drops_it_when_the_axis_stops_being_limited() {
        let mut scene = create_scene();
        make_static(&mut scene.world, &scene.body_a);
        let mut options = dof_options(0, 1);
        options.lower_angular_x = Some(-0.05);
        options.upper_angular_x = Some(0.05);
        let typed = physics_3d_generic_6_dof_joint(&options);
        let joint: Physics3DJointRef = typed.clone();
        set_axis_angle(&scene.body_b, 1.0, 0.0, 0.0, 0.2);
        scene.body_b.write().unwrap().angular_velocity_x = 1.0;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_GENERIC_6_DOF_JOINT_SOLVER,
            4,
            1.0 / 60.0,
        );
        assert!(typed.read().unwrap().upper_limit_impulses[3] > 0.0);

        {
            let mut joint = typed.write().unwrap();
            joint.lower_angular_x = 1.0;
            joint.upper_angular_x = -1.0;
        }
        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_GENERIC_6_DOF_JOINT_SOLVER,
            1,
            1.0 / 60.0,
        );
        assert_eq!(typed.read().unwrap().upper_limit_impulses[3], 0.0);
    }
}

mod physics_3d_hinge_joint_solver {
    use super::*;

    #[test]
    fn leaves_rotation_about_its_own_axis_free_while_cancelling_the_other_two() {
        let mut scene = create_scene();
        let typed = physics_3d_hinge_joint(&hinge_options(0, 1));
        let joint: Physics3DJointRef = typed;
        {
            let mut body_b = scene.body_b.write().unwrap();
            body_b.angular_velocity_x = 2.0;
            body_b.angular_velocity_y = 1.3;
            body_b.angular_velocity_z = -0.9;
        }

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_HINGE_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let body_a = scene.body_a.read().unwrap();
        let body_b = scene.body_b.read().unwrap();
        assert!((body_b.angular_velocity_x - body_a.angular_velocity_x - 2.0).abs() < 1.0e-6);
        assert!((body_b.angular_velocity_y - body_a.angular_velocity_y).abs() < 1.0e-6);
        assert!((body_b.angular_velocity_z - body_a.angular_velocity_z).abs() < 1.0e-6);
    }

    #[test]
    fn holds_the_hinge_line_even_when_the_frames_rotate_it_off_the_body_axes() {
        let mut scene = create_scene();
        let half = std::f32::consts::FRAC_1_SQRT_2;
        let mut options = hinge_options(0, 1);
        options.frame.local_rotation_az = Some(half);
        options.frame.local_rotation_aw = Some(half);
        options.frame.local_rotation_bz = Some(half);
        options.frame.local_rotation_bw = Some(half);
        let typed = physics_3d_hinge_joint(&options);
        let joint: Physics3DJointRef = typed;
        {
            let mut body_b = scene.body_b.write().unwrap();
            body_b.angular_velocity_x = 1.1;
            body_b.angular_velocity_y = 2.0;
        }

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_HINGE_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let body_a = scene.body_a.read().unwrap();
        let body_b = scene.body_b.read().unwrap();
        assert!((body_b.angular_velocity_y - body_a.angular_velocity_y - 2.0).abs() < 1.0e-6);
        assert!((body_b.angular_velocity_x - body_a.angular_velocity_x).abs() < 1.0e-6);
    }

    #[test]
    fn drives_the_relative_spin_toward_the_motor_speed() {
        let mut scene = create_scene();
        let mut options = hinge_options(0, 1);
        options.enable_motor = Some(true);
        options.motor_speed = Some(3.0);
        options.max_motor_torque = Some(1000.0);
        let typed = physics_3d_hinge_joint(&options);
        let joint: Physics3DJointRef = typed;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_HINGE_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let relative = scene.body_b.read().unwrap().angular_velocity_x
            - scene.body_a.read().unwrap().angular_velocity_x;
        assert!((relative - 3.0).abs() < 1.0e-6);
    }

    #[test]
    fn bounds_the_motor_by_its_torque_budget_rather_than_by_the_iteration_count() {
        fn run(iterations: usize) -> f32 {
            let mut scene = create_scene();
            let mut options = hinge_options(0, 1);
            options.enable_motor = Some(true);
            options.motor_speed = Some(50.0);
            options.max_motor_torque = Some(1.0);
            let typed = physics_3d_hinge_joint(&options);
            let joint: Physics3DJointRef = typed;
            solve_joint(
                &mut scene.world,
                &joint,
                &PHYSICS_3D_HINGE_JOINT_SOLVER,
                iterations,
                1.0 / 60.0,
            );
            let velocity = scene.body_b.read().unwrap().angular_velocity_x;
            velocity
        }

        assert!((run(32) - run(4)).abs() < 1.0e-6);
    }

    #[test]
    fn pushes_back_when_the_hinge_angle_is_past_its_upper_limit() {
        let mut scene = create_scene();
        set_axis_angle(&scene.body_b, 1.0, 0.0, 0.0, 0.1);
        let mut options = hinge_options(0, 1);
        options.enable_limit = Some(true);
        options.lower_angle = Some(-0.05);
        options.upper_angle = Some(0.05);
        let typed = physics_3d_hinge_joint(&options);
        let joint: Physics3DJointRef = typed;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_HINGE_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let relative = scene.body_b.read().unwrap().angular_velocity_x
            - scene.body_a.read().unwrap().angular_velocity_x;
        assert!(relative < 0.0);
    }

    #[test]
    fn carries_a_limit_impulse_across_steps_and_reapplies_it_before_the_first_iteration() {
        let (mut scene, typed) = create_loaded_hinge_stop();
        let joint: Physics3DJointRef = typed.clone();
        scene.body_b.write().unwrap().angular_velocity_x = 1.0;
        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_HINGE_JOINT_SOLVER,
            4,
            1.0 / 60.0,
        );
        assert!(typed.read().unwrap().upper_limit_impulse > 0.0);

        let before = scene.body_b.read().unwrap().angular_velocity_x;
        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_HINGE_JOINT_SOLVER,
            0,
            1.0 / 60.0,
        );

        assert!(scene.body_b.read().unwrap().angular_velocity_x < before);
    }

    #[test]
    fn drops_a_carried_limit_impulse_when_the_limit_is_turned_off() {
        let (mut scene, typed) = create_loaded_hinge_stop();
        let joint: Physics3DJointRef = typed.clone();
        scene.body_b.write().unwrap().angular_velocity_x = 1.0;
        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_HINGE_JOINT_SOLVER,
            4,
            1.0 / 60.0,
        );
        assert!(typed.read().unwrap().upper_limit_impulse > 0.0);

        typed.write().unwrap().enable_limit = false;
        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_HINGE_JOINT_SOLVER,
            1,
            1.0 / 60.0,
        );
        assert_eq!(typed.read().unwrap().upper_limit_impulse, 0.0);
    }

    #[test]
    fn exchanges_rather_than_negates_the_limit_accumulators_when_its_ends_are_swapped() {
        let mut options = hinge_options(1, 0);
        options.enable_limit = Some(true);
        options.lower_angle = Some(-1.0);
        options.upper_angle = Some(1.0);
        let typed = physics_3d_hinge_joint(&options);
        {
            let mut joint = typed.write().unwrap();
            joint.lower_limit_impulse = 3.0;
            joint.upper_limit_impulse = 7.0;
        }
        let joint: Physics3DJointRef = typed.clone();

        PHYSICS_3D_HINGE_JOINT_SOLVER.swap_ends.as_ref().unwrap()(&joint);

        let joint = typed.read().unwrap();
        assert_eq!(joint.lower_limit_impulse, 7.0);
        assert_eq!(joint.upper_limit_impulse, 3.0);
    }

    #[test]
    fn rescales_carried_limit_accumulators_with_the_timestep() {
        let mut options = hinge_options(0, 1);
        options.enable_limit = Some(true);
        let typed = physics_3d_hinge_joint(&options);
        {
            let mut joint = typed.write().unwrap();
            joint.lower_limit_impulse = 2.0;
            joint.upper_limit_impulse = 5.0;
        }
        let joint: Physics3DJointRef = typed.clone();

        PHYSICS_3D_HINGE_JOINT_SOLVER
            .scale_accumulated_impulses
            .as_ref()
            .unwrap()(&joint, 0.5);

        let joint = typed.read().unwrap();
        assert_eq!(joint.lower_limit_impulse, 1.0);
        assert_eq!(joint.upper_limit_impulse, 2.5);
    }

    #[test]
    fn does_not_brake_a_hinge_that_is_nowhere_near_its_limits() {
        let mut scene = create_scene();
        let mut options = hinge_options(0, 1);
        options.enable_limit = Some(true);
        options.lower_angle = Some(-1.0);
        options.upper_angle = Some(1.0);
        let typed = physics_3d_hinge_joint(&options);
        let joint: Physics3DJointRef = typed;
        scene.body_b.write().unwrap().angular_velocity_x = 0.5;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_HINGE_JOINT_SOLVER,
            16,
            1.0 / 60.0,
        );

        let relative = scene.body_b.read().unwrap().angular_velocity_x
            - scene.body_a.read().unwrap().angular_velocity_x;
        assert!((relative - 0.5).abs() < 1.0e-6);
    }

    #[test]
    fn reverses_and_exchanges_the_limit_interval_when_its_ends_are_swapped() {
        let mut options = hinge_options(1, 0);
        options.lower_angle = Some(-0.25);
        options.upper_angle = Some(1.5);
        options.motor_speed = Some(4.0);
        let typed = physics_3d_hinge_joint(&options);
        let joint: Physics3DJointRef = typed.clone();

        assert!(PHYSICS_3D_HINGE_JOINT_SOLVER.swap_ends.as_ref().unwrap()(
            &joint
        ));
        let joint = typed.read().unwrap();
        assert_eq!(joint.lower_angle, -1.5);
        assert_eq!(joint.upper_angle, 0.25);
        assert_eq!(joint.motor_speed, -4.0);
        assert_eq!(joint.motor_impulse, 0.0);
    }

    #[test]
    fn scales_the_motor_accumulator_with_a_changed_timestep() {
        let typed = physics_3d_hinge_joint(&hinge_options(0, 1));
        typed.write().unwrap().motor_impulse = 6.0;
        let joint: Physics3DJointRef = typed.clone();

        PHYSICS_3D_HINGE_JOINT_SOLVER
            .scale_accumulated_impulses
            .as_ref()
            .unwrap()(&joint, 0.5);

        assert_eq!(typed.read().unwrap().motor_impulse, 3.0);
    }
}

mod physics_3d_joint_soft_limits {
    use super::*;

    fn solve_loaded_stop(
        soft: bool,
        frequency_hz: f32,
        damping_ratio: f32,
    ) -> flight_entity::Ref<Physics3DHingeJoint> {
        let (mut scene, typed) = create_loaded_hinge_stop();
        {
            let mut joint = typed.write().unwrap();
            joint.enable_limit_spring = soft;
            joint.limit_frequency_hz = frequency_hz;
            joint.limit_damping_ratio = damping_ratio;
        }
        let joint: Physics3DJointRef = typed.clone();
        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_HINGE_JOINT_SOLVER,
            8,
            1.0 / 60.0,
        );
        typed
    }

    #[test]
    fn yields_more_than_a_hard_stop_under_the_same_load() {
        let hard = solve_loaded_stop(false, 4.0, 0.7);
        let soft = solve_loaded_stop(true, 4.0, 0.7);
        let hard_impulse = hard.read().unwrap().upper_limit_impulse;
        let soft_impulse = soft.read().unwrap().upper_limit_impulse;
        assert!(soft_impulse > 0.0);
        assert!(soft_impulse < hard_impulse);
    }

    #[test]
    fn stiffens_toward_the_hard_stop_as_frequency_rises() {
        let slack = solve_loaded_stop(true, 2.0, 0.7);
        let stiff = solve_loaded_stop(true, 30.0, 0.7);
        let hard = solve_loaded_stop(false, 4.0, 0.7);
        let slack_impulse = slack.read().unwrap().upper_limit_impulse;
        let stiff_impulse = stiff.read().unwrap().upper_limit_impulse;
        let hard_impulse = hard.read().unwrap().upper_limit_impulse;
        assert!(slack_impulse < stiff_impulse);
        assert!(stiff_impulse <= hard_impulse + 1.0e-6);
    }

    #[test]
    fn degrades_exactly_to_a_hard_stop_when_the_frequency_is_zero() {
        let hard = solve_loaded_stop(false, 4.0, 0.7);
        let unconfigured = solve_loaded_stop(true, 0.0, 0.7);
        let hard = hard.read().unwrap();
        let unconfigured = unconfigured.read().unwrap();
        assert_eq!(unconfigured.upper_limit_impulse, hard.upper_limit_impulse);
        assert_eq!(unconfigured.lower_limit_impulse, hard.lower_limit_impulse);
    }

    #[test]
    fn stays_one_sided_never_pulling_the_coordinate_back_through_the_bound() {
        let soft = solve_loaded_stop(true, 4.0, 0.7);
        let soft = soft.read().unwrap();
        assert_eq!(soft.lower_limit_impulse, 0.0);
        assert!(soft.upper_limit_impulse >= 0.0);
    }

    #[test]
    fn softens_a_slider_travel_stop_the_same_way() {
        fn solve_slider(soft: bool) -> flight_entity::Ref<Physics3DSliderJoint> {
            let mut scene = create_scene();
            make_static(&mut scene.world, &scene.body_a);
            scene.body_b.write().unwrap().x = 3.0;
            let mut options = slider_options(0, 1);
            options.enable_limit = Some(true);
            options.lower_translation = Some(-0.5);
            options.upper_translation = Some(0.5);
            options.enable_limit_spring = Some(soft);
            options.limit_frequency_hz = Some(4.0);
            options.limit_damping_ratio = Some(0.7);
            let typed = physics_3d_slider_joint(&options);
            let joint: Physics3DJointRef = typed.clone();
            solve_joint(
                &mut scene.world,
                &joint,
                &PHYSICS_3D_SLIDER_JOINT_SOLVER,
                8,
                1.0 / 60.0,
            );
            typed
        }

        let hard = solve_slider(false);
        let soft = solve_slider(true);
        assert!(
            soft.read().unwrap().upper_limit_impulse.abs()
                < hard.read().unwrap().upper_limit_impulse.abs()
        );
    }

    #[test]
    fn softens_a_cone_twist_twist_stop_whose_bias_slot_it_shares_with_the_swing_stop() {
        fn solve_cone(soft: bool) -> flight_entity::Ref<Physics3DConeTwistJoint> {
            let mut scene = create_scene();
            make_static(&mut scene.world, &scene.body_a);
            set_axis_angle(&scene.body_b, 1.0, 0.0, 0.0, 0.4);
            let mut options = cone_options(0, 1);
            options.enable_twist_limit = Some(true);
            options.lower_twist_angle = Some(-0.05);
            options.upper_twist_angle = Some(0.05);
            options.enable_limit_spring = Some(soft);
            options.limit_frequency_hz = Some(4.0);
            options.limit_damping_ratio = Some(0.7);
            let typed = physics_3d_cone_twist_joint(&options);
            let joint: Physics3DJointRef = typed.clone();
            solve_joint(
                &mut scene.world,
                &joint,
                &PHYSICS_3D_CONE_TWIST_JOINT_SOLVER,
                8,
                1.0 / 60.0,
            );
            typed
        }

        let hard = solve_cone(false);
        let soft = solve_cone(true);
        let hard = hard.read().unwrap();
        let soft = soft.read().unwrap();
        let hard_total = hard.lower_twist_impulse + hard.upper_twist_impulse;
        let soft_total = soft.lower_twist_impulse + soft.upper_twist_impulse;
        assert!(soft_total > 0.0);
        assert!(soft_total < hard_total);
    }

    #[test]
    fn softens_a_6_dof_axis_limit() {
        fn solve_dof(soft: bool) -> flight_entity::Ref<Physics3DGeneric6DofJoint> {
            let mut scene = create_scene();
            make_static(&mut scene.world, &scene.body_a);
            scene.body_b.write().unwrap().x = 3.0;
            let mut options = dof_options(0, 1);
            options.lower_linear_x = Some(-0.5);
            options.upper_linear_x = Some(0.5);
            options.enable_limit_spring = Some(soft);
            options.limit_frequency_hz = Some(4.0);
            options.limit_damping_ratio = Some(0.7);
            let typed = physics_3d_generic_6_dof_joint(&options);
            let joint: Physics3DJointRef = typed.clone();
            solve_joint(
                &mut scene.world,
                &joint,
                &PHYSICS_3D_GENERIC_6_DOF_JOINT_SOLVER,
                8,
                1.0 / 60.0,
            );
            typed
        }

        let hard = solve_dof(false);
        let soft = solve_dof(true);
        let hard_impulse = hard.read().unwrap().upper_limit_impulses[0];
        let soft_impulse = soft.read().unwrap().upper_limit_impulses[0];
        assert!(soft_impulse > 0.0);
        assert!(soft_impulse < hard_impulse);
    }
}

mod physics_3d_slider_joint_solver {
    use super::*;

    #[test]
    fn leaves_travel_along_its_axis_free_while_cancelling_the_other_two() {
        let mut scene = create_scene();
        make_static(&mut scene.world, &scene.body_a);
        let typed = physics_3d_slider_joint(&slider_options(0, 1));
        let joint: Physics3DJointRef = typed;
        {
            let mut body_b = scene.body_b.write().unwrap();
            body_b.velocity_x = 2.0;
            body_b.velocity_y = 1.5;
            body_b.velocity_z = -1.0;
        }

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_SLIDER_JOINT_SOLVER,
            24,
            1.0 / 60.0,
        );

        let body_a = scene.body_a.read().unwrap();
        let body_b = scene.body_b.read().unwrap();
        assert!((body_b.velocity_x - body_a.velocity_x - 2.0).abs() < 1.0e-6);
        assert!((body_b.velocity_y - body_a.velocity_y).abs() < 1.0e-6);
        assert!((body_b.velocity_z - body_a.velocity_z).abs() < 1.0e-6);
    }

    #[test]
    fn locks_relative_rotation_about_every_axis() {
        let mut scene = create_scene();
        let typed = physics_3d_slider_joint(&slider_options(0, 1));
        let joint: Physics3DJointRef = typed;
        {
            let mut body_b = scene.body_b.write().unwrap();
            body_b.angular_velocity_x = 1.0;
            body_b.angular_velocity_y = -2.0;
        }

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_SLIDER_JOINT_SOLVER,
            24,
            1.0 / 60.0,
        );

        let body_a = scene.body_a.read().unwrap();
        let body_b = scene.body_b.read().unwrap();
        assert!((body_b.angular_velocity_x - body_a.angular_velocity_x).abs() < 1.0e-6);
        assert!((body_b.angular_velocity_y - body_a.angular_velocity_y).abs() < 1.0e-6);
    }

    #[test]
    fn drives_the_travel_toward_the_motor_speed() {
        let mut scene = create_scene();
        let mut options = slider_options(0, 1);
        options.enable_motor = Some(true);
        options.motor_speed = Some(4.0);
        options.max_motor_force = Some(1000.0);
        let typed = physics_3d_slider_joint(&options);
        let joint: Physics3DJointRef = typed;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_SLIDER_JOINT_SOLVER,
            24,
            1.0 / 60.0,
        );

        let relative =
            scene.body_b.read().unwrap().velocity_x - scene.body_a.read().unwrap().velocity_x;
        assert!((relative - 4.0).abs() < 1.0e-6);
    }

    #[test]
    fn stops_travel_at_the_end_of_its_interval() {
        let mut scene = create_scene();
        let mut options = slider_options(0, 1);
        options.enable_limit = Some(true);
        options.lower_translation = Some(-0.5);
        options.upper_translation = Some(0.5);
        let typed = physics_3d_slider_joint(&options);
        let joint: Physics3DJointRef = typed;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_SLIDER_JOINT_SOLVER,
            24,
            1.0 / 60.0,
        );

        let relative =
            scene.body_b.read().unwrap().velocity_x - scene.body_a.read().unwrap().velocity_x;
        assert!(relative < 0.0);
    }

    #[test]
    fn does_not_brake_travel_that_is_nowhere_near_its_limits() {
        let mut scene = create_scene();
        let mut options = slider_options(0, 1);
        options.enable_limit = Some(true);
        options.lower_translation = Some(-5.0);
        options.upper_translation = Some(5.0);
        let typed = physics_3d_slider_joint(&options);
        let joint: Physics3DJointRef = typed;
        scene.body_b.write().unwrap().velocity_x = 1.0;

        solve_joint(
            &mut scene.world,
            &joint,
            &PHYSICS_3D_SLIDER_JOINT_SOLVER,
            24,
            1.0 / 60.0,
        );

        let relative =
            scene.body_b.read().unwrap().velocity_x - scene.body_a.read().unwrap().velocity_x;
        assert!((relative - 1.0).abs() < 1.0e-6);
    }

    #[test]
    fn reverses_and_exchanges_the_travel_interval_when_its_ends_are_swapped() {
        let mut options = slider_options(1, 0);
        options.lower_translation = Some(-0.25);
        options.upper_translation = Some(1.5);
        options.motor_speed = Some(4.0);
        let typed = physics_3d_slider_joint(&options);
        let joint: Physics3DJointRef = typed.clone();

        assert!(PHYSICS_3D_SLIDER_JOINT_SOLVER.swap_ends.as_ref().unwrap()(
            &joint
        ));
        let joint = typed.read().unwrap();
        assert_eq!(joint.lower_translation, -1.5);
        assert_eq!(joint.upper_translation, 0.25);
        assert_eq!(joint.motor_speed, -4.0);
    }
}

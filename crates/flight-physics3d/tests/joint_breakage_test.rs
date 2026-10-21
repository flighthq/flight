use std::sync::Arc;

use flight_entity::Ref;

use super::*;
use crate::common::*;

struct HangingScene {
    world: Physics3DWorld,
    body: RigidBody3DRef,
    joint: Ref<Physics3DBallAndSocketJoint>,
}

fn create_hanging_scene(mass: f32, gravity: f32, break_force: f32) -> HangingScene {
    let mut world = world();
    world.gravity_y = -gravity;
    register_built_in_physics_3d_joint_solvers(&mut world);
    add_body(&mut world, Physics3DBodyType::Static);
    let body = create_rigid_body_3d();
    let mut data = create_physics_3d_mass_data();
    data.mass = mass;
    data.inertia_xx = mass;
    data.inertia_yy = mass;
    data.inertia_zz = mass;
    set_rigid_body_3d_mass_data(&mut body.write().unwrap(), &data);
    add_physics_3d_body(&mut world, &body);
    let mut options = joint_options(0, 1);
    options.break_force = Some(break_force);
    let joint = physics_3d_ball_and_socket_joint(&options);
    add_physics_3d_joint(&mut world, &joint);
    HangingScene { world, body, joint }
}

fn step_scene(scene: &mut HangingScene) {
    step_physics_3d(&mut scene.world, &registered_registry(), 1.0 / 60.0, None);
}

mod break_physics_3d_joint {
    use super::*;

    #[test]
    fn leaves_the_joint_in_the_world_for_the_caller() {
        let mut scene = create_hanging_scene(3.0, 10.0, f32::INFINITY);
        let erased: Physics3DJointRef = scene.joint.clone();

        break_physics_3d_joint(&mut scene.world, &erased);

        assert!(
            scene
                .world
                .joints
                .iter()
                .any(|joint| Arc::ptr_eq(joint, &erased))
        );
    }

    #[test]
    fn marks_the_joint_and_records_the_break() {
        let mut scene = create_hanging_scene(3.0, 10.0, f32::INFINITY);
        let erased: Physics3DJointRef = scene.joint.clone();

        break_physics_3d_joint(&mut scene.world, &erased);

        assert!(scene.joint.read().unwrap().broken);
        assert!(
            scene
                .world
                .joint_events
                .broke
                .iter()
                .any(|joint| Arc::ptr_eq(joint, &erased))
        );
    }

    #[test]
    fn reports_a_break_once() {
        let mut scene = create_hanging_scene(3.0, 10.0, f32::INFINITY);
        let erased: Physics3DJointRef = scene.joint.clone();

        break_physics_3d_joint(&mut scene.world, &erased);
        break_physics_3d_joint(&mut scene.world, &erased);

        assert_eq!(scene.world.joint_events.broke.len(), 1);
    }
}

mod evaluate_physics_3d_joint_breakage {
    use super::*;

    #[test]
    fn breaks_a_joint_the_load_exceeds_and_spares_one_it_does_not() {
        let mut weak = create_hanging_scene(3.0, 10.0, 20.0);
        let mut strong = create_hanging_scene(3.0, 10.0, 60.0);

        step_scene(&mut weak);
        step_scene(&mut strong);

        assert!(weak.joint.read().unwrap().broken);
        assert!(!strong.joint.read().unwrap().broken);
    }

    #[test]
    fn clears_the_event_lane_on_the_next_step() {
        let mut scene = create_hanging_scene(3.0, 10.0, 20.0);

        step_scene(&mut scene);
        assert_eq!(scene.world.joint_events.broke.len(), 1);
        step_scene(&mut scene);

        assert!(scene.world.joint_events.broke.is_empty());
    }

    #[test]
    fn leaves_an_unbreakable_joint_alone() {
        let mut scene = create_hanging_scene(1000.0, 10.0, f32::INFINITY);

        step_scene(&mut scene);

        assert!(!scene.joint.read().unwrap().broken);
    }

    #[test]
    fn reports_the_break_through_the_world_event_lane() {
        let mut scene = create_hanging_scene(3.0, 10.0, 20.0);
        let erased: Physics3DJointRef = scene.joint.clone();

        step_scene(&mut scene);

        assert!(
            scene
                .world
                .joint_events
                .broke
                .iter()
                .any(|joint| Arc::ptr_eq(joint, &erased))
        );
    }

    #[test]
    fn runs_without_a_solved_joint() {
        let mut scene = create_hanging_scene(3.0, 10.0, 20.0);

        evaluate_physics_3d_joint_breakage(&mut scene.world, 1.0 / 60.0);

        assert!(!scene.joint.read().unwrap().broken);
    }

    #[test]
    fn stops_constraining_once_broken_so_the_body_falls_free() {
        let mut scene = create_hanging_scene(3.0, 10.0, 20.0);

        for _ in 0..30 {
            step_scene(&mut scene);
        }

        assert!(scene.body.read().unwrap().y < -0.5);
    }
}

mod is_physics_3d_joint_breakable {
    use super::*;

    #[test]
    fn is_false_for_infinite_defaults() {
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        assert!(!is_physics_3d_joint_breakable(&*joint.read().unwrap()));
    }

    #[test]
    fn is_true_once_either_threshold_is_finite() {
        let mut force_options = joint_options(0, 1);
        force_options.break_force = Some(5.0);
        let force = physics_3d_ball_and_socket_joint(&force_options);
        assert!(is_physics_3d_joint_breakable(&*force.read().unwrap()));

        let mut torque_options = joint_options(0, 1);
        torque_options.break_torque = Some(5.0);
        let torque = physics_3d_ball_and_socket_joint(&torque_options);
        assert!(is_physics_3d_joint_breakable(&*torque.read().unwrap()));
    }
}

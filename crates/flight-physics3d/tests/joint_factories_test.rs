use super::*;
use crate::common::*;

mod create_physics_3d_ball_and_socket_joint {
    use super::*;

    #[test]
    fn stamps_its_kind_and_zeroes_every_accumulator() {
        let joint = create_physics_3d_ball_and_socket_joint();
        let joint = joint.read().unwrap();
        assert_eq!(joint.kind, PHYSICS_3D_BALL_AND_SOCKET_JOINT_KIND);
        assert_eq!((joint.body_a, joint.body_b), (0, 0));
        assert_eq!(
            (
                joint.impulse0,
                joint.impulse1,
                joint.impulse2,
                joint.impulse3,
                joint.impulse4,
                joint.impulse5,
            ),
            (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        );
    }

    #[test]
    fn defaults_both_anchors_to_the_body_origin_and_the_pair_to_non_colliding() {
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        let joint = joint.read().unwrap();
        assert_eq!(
            (
                joint.local_anchor_ax,
                joint.local_anchor_ay,
                joint.local_anchor_az,
            ),
            (0.0, 0.0, 0.0)
        );
        assert!(!joint.collide_connected);
    }

    #[test]
    fn carries_the_anchors_it_was_given() {
        let mut options = joint_options(0, 1);
        options.local_anchor_ax = Some(1.0);
        options.local_anchor_ay = Some(2.0);
        options.local_anchor_az = Some(3.0);
        options.local_anchor_bz = Some(-4.0);
        options.collide_connected = Some(true);
        let joint = physics_3d_ball_and_socket_joint(&options);
        let joint = joint.read().unwrap();
        assert_eq!(
            (
                joint.local_anchor_ax,
                joint.local_anchor_ay,
                joint.local_anchor_az,
            ),
            (1.0, 2.0, 3.0)
        );
        assert_eq!(joint.local_anchor_bz, -4.0);
        assert!(joint.collide_connected);
    }
}

mod create_physics_3d_cone_twist_joint {
    use super::*;

    #[test]
    fn defaults_to_a_45_degree_cone_with_the_twist_unbounded() {
        let joint = create_physics_3d_cone_twist_joint();
        let joint = joint.read().unwrap();
        assert_eq!(joint.joint.kind, PHYSICS_3D_CONE_TWIST_JOINT_KIND);
        assert!(joint.enable_swing_limit);
        assert_eq!(joint.swing_limit_y, std::f32::consts::PI / 4.0);
        assert_eq!(joint.swing_limit_z, std::f32::consts::PI / 4.0);
        assert!(!joint.enable_twist_limit);
    }

    #[test]
    fn carries_an_elliptical_cone_and_a_twist_interval() {
        let mut options = cone_options(0, 1);
        options.swing_limit_y = Some(0.3);
        options.swing_limit_z = Some(1.1);
        options.enable_twist_limit = Some(true);
        options.lower_twist_angle = Some(-0.2);
        options.upper_twist_angle = Some(0.9);
        let joint = physics_3d_cone_twist_joint(&options);
        let joint = joint.read().unwrap();
        assert_eq!(joint.swing_limit_y, 0.3);
        assert_eq!(joint.swing_limit_z, 1.1);
        assert_eq!(joint.lower_twist_angle, -0.2);
        assert_eq!(joint.upper_twist_angle, 0.9);
    }
}

mod create_physics_3d_distance_joint {
    use super::*;

    #[test]
    fn defaults_to_zero_length_with_no_spring_and_no_limit() {
        let joint = create_physics_3d_distance_joint();
        let joint = joint.read().unwrap();
        assert_eq!(joint.joint.kind, PHYSICS_3D_DISTANCE_JOINT_KIND);
        assert_eq!(joint.length, 0.0);
        assert!(!joint.enable_spring);
        assert!(!joint.enable_limit);
    }

    #[test]
    fn defaults_its_interval_to_unbounded_above_not_to_zero() {
        let joint = physics_3d_distance_joint(&distance_options(0, 1));
        let joint = joint.read().unwrap();
        assert_eq!(joint.min_length, 0.0);
        assert_eq!(joint.max_length, f32::INFINITY);
    }

    #[test]
    fn carries_the_spring_and_limit_it_was_given() {
        let mut options = distance_options(0, 1);
        options.length = Some(2.0);
        options.enable_spring = Some(true);
        options.frequency_hz = Some(4.0);
        options.damping_ratio = Some(0.7);
        options.enable_limit = Some(true);
        options.min_length = Some(1.0);
        options.max_length = Some(5.0);
        let joint = physics_3d_distance_joint(&options);
        let joint = joint.read().unwrap();
        assert_eq!(joint.frequency_hz, 4.0);
        assert_eq!(joint.damping_ratio, 0.7);
        assert_eq!(joint.min_length, 1.0);
        assert_eq!(joint.max_length, 5.0);
    }

    #[test]
    fn starts_its_limit_accumulators_cold() {
        let joint = physics_3d_distance_joint(&distance_options(0, 1));
        let joint = joint.read().unwrap();
        assert_eq!(joint.lower_limit_impulse, 0.0);
        assert_eq!(joint.upper_limit_impulse, 0.0);
    }
}

mod create_physics_3d_fixed_joint {
    use super::*;

    #[test]
    fn defaults_both_frames_to_the_identity() {
        let joint = create_physics_3d_fixed_joint();
        let joint = joint.read().unwrap();
        assert_eq!(joint.joint.kind, PHYSICS_3D_FIXED_JOINT_KIND);
        assert_eq!(
            (
                joint.frames.local_rotation_ax,
                joint.frames.local_rotation_ay,
                joint.frames.local_rotation_az,
                joint.frames.local_rotation_aw,
            ),
            (0.0, 0.0, 0.0, 1.0)
        );
        assert_eq!(
            (
                joint.frames.local_rotation_bx,
                joint.frames.local_rotation_by,
                joint.frames.local_rotation_bz,
                joint.frames.local_rotation_bw,
            ),
            (0.0, 0.0, 0.0, 1.0)
        );
    }

    #[test]
    fn carries_the_frames_it_was_given() {
        let mut options = frame_options(0, 1);
        options.local_rotation_az = Some(std::f32::consts::FRAC_1_SQRT_2);
        options.local_rotation_aw = Some(std::f32::consts::FRAC_1_SQRT_2);
        let joint = physics_3d_fixed_joint(&options);
        let joint = joint.read().unwrap();
        assert_eq!(
            joint.frames.local_rotation_az,
            std::f32::consts::FRAC_1_SQRT_2
        );
        assert_eq!(
            joint.frames.local_rotation_aw,
            std::f32::consts::FRAC_1_SQRT_2
        );
    }
}

mod create_physics_3d_generic_6_dof_joint {
    use super::*;

    #[test]
    fn defaults_all_axes_to_free() {
        let joint = create_physics_3d_generic_6_dof_joint();
        let joint = joint.read().unwrap();
        assert_eq!(joint.joint.kind, PHYSICS_3D_GENERIC_6_DOF_JOINT_KIND);
        assert!(joint.lower_linear_x > joint.upper_linear_x);
        assert!(joint.lower_linear_y > joint.upper_linear_y);
        assert!(joint.lower_linear_z > joint.upper_linear_z);
        assert!(joint.lower_angular_x > joint.upper_angular_x);
        assert!(joint.lower_angular_y > joint.upper_angular_y);
        assert!(joint.lower_angular_z > joint.upper_angular_z);
    }

    #[test]
    fn carries_the_bounds_it_was_given() {
        let mut options = dof_options(0, 1);
        options.lower_linear_y = Some(-2.0);
        options.upper_linear_y = Some(5.0);
        options.lower_angular_z = Some(0.0);
        options.upper_angular_z = Some(0.0);
        let joint = physics_3d_generic_6_dof_joint(&options);
        let joint = joint.read().unwrap();
        assert_eq!(joint.lower_linear_y, -2.0);
        assert_eq!(joint.upper_linear_y, 5.0);
        assert_eq!(joint.lower_angular_z, 0.0);
        assert_eq!(joint.upper_angular_z, 0.0);
    }
}

mod create_physics_3d_hinge_joint {
    use super::*;

    #[test]
    fn defaults_to_a_free_hinge_with_no_motor() {
        let joint = create_physics_3d_hinge_joint();
        let joint = joint.read().unwrap();
        assert_eq!(joint.joint.kind, PHYSICS_3D_HINGE_JOINT_KIND);
        assert!(!joint.enable_limit);
        assert!(!joint.enable_motor);
        assert_eq!(joint.motor_impulse, 0.0);
    }

    #[test]
    fn carries_its_limits_and_motor_settings() {
        let mut options = hinge_options(0, 1);
        options.enable_limit = Some(true);
        options.lower_angle = Some(-1.0);
        options.upper_angle = Some(2.0);
        options.enable_motor = Some(true);
        options.motor_speed = Some(3.0);
        options.max_motor_torque = Some(40.0);
        let joint = physics_3d_hinge_joint(&options);
        let joint = joint.read().unwrap();
        assert_eq!(joint.lower_angle, -1.0);
        assert_eq!(joint.upper_angle, 2.0);
        assert_eq!(joint.motor_speed, 3.0);
        assert_eq!(joint.max_motor_torque, 40.0);
    }
}

mod create_physics_3d_slider_joint {
    use super::*;

    #[test]
    fn defaults_to_free_travel_with_no_motor() {
        let joint = create_physics_3d_slider_joint();
        let joint = joint.read().unwrap();
        assert_eq!(joint.joint.kind, PHYSICS_3D_SLIDER_JOINT_KIND);
        assert!(!joint.enable_limit);
        assert!(!joint.enable_motor);
        assert_eq!(joint.motor_impulse, 0.0);
    }

    #[test]
    fn carries_its_travel_interval_and_motor_settings() {
        let mut options = slider_options(0, 1);
        options.enable_limit = Some(true);
        options.lower_translation = Some(-3.0);
        options.upper_translation = Some(3.0);
        options.enable_motor = Some(true);
        options.motor_speed = Some(2.0);
        options.max_motor_force = Some(15.0);
        let joint = physics_3d_slider_joint(&options);
        let joint = joint.read().unwrap();
        assert_eq!(joint.lower_translation, -3.0);
        assert_eq!(joint.upper_translation, 3.0);
        assert_eq!(joint.motor_speed, 2.0);
        assert_eq!(joint.max_motor_force, 15.0);
    }
}

mod initialize_physics_3d_ball_and_socket_joint {
    use super::*;
    #[test]
    fn resets_body_indices() {
        let joint = physics_3d_ball_and_socket_joint(&joint_options(1, 2));
        initialize_physics_3d_ball_and_socket_joint(&mut joint.write().unwrap());
        assert_eq!(joint.read().unwrap().body_a, 0);
    }
}

mod initialize_physics_3d_cone_twist_joint {
    use super::*;
    #[test]
    fn restores_defaults() {
        let joint = physics_3d_cone_twist_joint(&cone_options(1, 2));
        joint.write().unwrap().enable_swing_limit = false;
        initialize_physics_3d_cone_twist_joint(&mut joint.write().unwrap());
        assert!(joint.read().unwrap().enable_swing_limit);
    }
}

mod initialize_physics_3d_distance_joint {
    use super::*;
    #[test]
    fn restores_the_default_length() {
        let joint = physics_3d_distance_joint(&distance_options(1, 2));
        joint.write().unwrap().length = 5.0;
        initialize_physics_3d_distance_joint(&mut joint.write().unwrap());
        assert_eq!(joint.read().unwrap().length, 0.0);
    }
}

mod initialize_physics_3d_fixed_joint {
    use super::*;
    #[test]
    fn restores_frame_rotation() {
        let joint = physics_3d_fixed_joint(&frame_options(1, 2));
        joint.write().unwrap().frames.local_rotation_aw = 0.5;
        initialize_physics_3d_fixed_joint(&mut joint.write().unwrap());
        assert_eq!(joint.read().unwrap().frames.local_rotation_aw, 1.0);
    }
}

mod initialize_physics_3d_generic_6_dof_joint {
    use super::*;
    #[test]
    fn restores_a_linear_bound() {
        let joint = physics_3d_generic_6_dof_joint(&dof_options(1, 2));
        joint.write().unwrap().lower_linear_x = -2.0;
        initialize_physics_3d_generic_6_dof_joint(&mut joint.write().unwrap());
        assert_eq!(joint.read().unwrap().lower_linear_x, 1.0);
    }
}

mod initialize_physics_3d_hinge_joint {
    use super::*;
    #[test]
    fn restores_motor_speed() {
        let joint = physics_3d_hinge_joint(&hinge_options(1, 2));
        joint.write().unwrap().motor_speed = 3.0;
        initialize_physics_3d_hinge_joint(&mut joint.write().unwrap());
        assert_eq!(joint.read().unwrap().motor_speed, 0.0);
    }
}

mod initialize_physics_3d_slider_joint {
    use super::*;
    #[test]
    fn restores_motor_speed() {
        let joint = physics_3d_slider_joint(&slider_options(1, 2));
        joint.write().unwrap().motor_speed = 3.0;
        initialize_physics_3d_slider_joint(&mut joint.write().unwrap());
        assert_eq!(joint.read().unwrap().motor_speed, 0.0);
    }
}

use flight_entity::{Entity, allocate_entity};
use flight_physics2d::contract::*;

mod create_physics2d_distance_joint {
    use super::*;

    #[test]
    fn owns_common_defaults_and_solver_scratch() {
        fn assert_entity<T: Entity>(_value: &T) {}
        let joint = create_physics2d_distance_joint();
        let joint = joint.read().unwrap();
        assert_entity(&*joint);
        assert_eq!(joint.kind, "Distance");
        assert_eq!(joint.body_a, 0);
        assert_eq!(joint.body_b, 0);
        assert_eq!(joint.local_anchor_ax, 0.0);
        assert_eq!(joint.local_anchor_ay, 0.0);
        assert_eq!(joint.local_anchor_bx, 0.0);
        assert_eq!(joint.local_anchor_by, 0.0);
        assert!(!joint.collide_connected);
        assert_eq!(joint.break_force, f32::INFINITY);
        assert_eq!(joint.break_torque, f32::INFINITY);
        assert_eq!(joint.impulse0, 0.0);
        assert_eq!(joint.impulse1, 0.0);
        assert_eq!(joint.impulse2, 0.0);
        assert_eq!(joint.r_ax, 0.0);
        assert_eq!(joint.r_ay, 0.0);
        assert_eq!(joint.r_bx, 0.0);
        assert_eq!(joint.r_by, 0.0);
        assert_eq!(joint.length, 0.0);
        assert_eq!(joint.frequency_hz, 0.0);
        assert_eq!(joint.damping_ratio, 0.0);
    }
}

mod create_physics2d_gear_joint {
    use super::*;

    #[test]
    fn defaults_coordinate_semantics_and_both_linear_axes() {
        let joint = create_physics2d_gear_joint();
        let joint = joint.read().unwrap();
        assert_eq!(joint.axis_ax, 1.0);
        assert_eq!(joint.axis_ay, 0.0);
        assert_eq!(joint.axis_bx, 1.0);
        assert_eq!(joint.axis_by, 0.0);
        assert_eq!(joint.kind, "Gear");
        assert_eq!(joint.coordinate_a, Physics2DGearCoordinateKind::Angular);
        assert_eq!(joint.coordinate_b, Physics2DGearCoordinateKind::Angular);
        assert_eq!(joint.ratio, 1.0);
        assert_eq!(joint.constant, 0.0);
    }
}

mod create_physics2d_mouse_joint {
    use super::*;

    #[test]
    fn hides_the_dummy_endpoint_and_owns_stable_drag_defaults() {
        let joint = create_physics2d_mouse_joint();
        let joint = joint.read().unwrap();
        assert_eq!(joint.body_a, 0);
        assert_eq!(joint.body_b, 0);
        assert_eq!(joint.damping_ratio, 0.7);
        assert_eq!(joint.kind, "Mouse");
        assert_eq!(joint.frequency_hz, 5.0);
        assert_eq!(joint.max_force, 0.0);
        assert_eq!((joint.target_x, joint.target_y), (0.0, 0.0));
    }
}

mod create_physics2d_prismatic_joint {
    use super::*;

    #[test]
    fn initializes_canonical_controls_and_motor_scratch() {
        let joint = create_physics2d_prismatic_joint();
        let joint = joint.read().unwrap();
        assert!(!joint.collide_connected);
        assert!(!joint.enable_limit);
        assert!(!joint.enable_motor);
        assert_eq!(joint.kind, "Prismatic");
        assert_eq!(joint.local_anchor_ax, 0.0);
        assert_eq!(joint.local_axis_ax, 1.0);
        assert_eq!(joint.local_axis_ay, 0.0);
        assert_eq!(joint.lower_translation, 0.0);
        assert_eq!(joint.max_motor_force, 0.0);
        assert_eq!(joint.motor_impulse, 0.0);
        assert_eq!(joint.motor_speed, 0.0);
        assert_eq!(joint.upper_translation, 0.0);
    }
}

mod create_physics2d_pulley_joint {
    use super::*;

    #[test]
    fn defaults_the_ratio_and_world_anchors() {
        let joint = create_physics2d_pulley_joint();
        let joint = joint.read().unwrap();
        assert_eq!(joint.ground_anchor_ax, 0.0);
        assert_eq!(joint.ground_anchor_bx, 0.0);
        assert_eq!(joint.kind, "Pulley");
        assert_eq!(joint.ratio, 1.0);
        assert_eq!(joint.constant, 0.0);
    }
}

mod create_physics2d_revolute_joint {
    use super::*;

    #[test]
    fn starts_with_inactive_motor_and_limits() {
        let joint = create_physics2d_revolute_joint();
        let joint = joint.read().unwrap();
        assert!(!joint.enable_limit);
        assert!(!joint.enable_motor);
        assert_eq!(joint.kind, "Revolute");
        assert_eq!(joint.motor_impulse, 0.0);
    }
}

mod create_physics2d_rope_joint {
    use super::*;

    #[test]
    fn defaults_the_authored_maximum_length() {
        let joint = create_physics2d_rope_joint();
        let joint = joint.read().unwrap();
        assert_eq!(joint.kind, "Rope");
        assert_eq!(joint.max_length, 0.0);
    }
}

mod create_physics2d_weld_joint {
    use super::*;

    #[test]
    fn defaults_the_reference_pose_to_zero_relative_angle() {
        let joint = create_physics2d_weld_joint();
        let joint = joint.read().unwrap();
        assert_eq!(joint.kind, "Weld");
        assert_eq!(joint.reference_angle, 0.0);
    }
}

mod create_physics2d_wheel_joint {
    use super::*;

    #[test]
    fn defaults_to_a_vertical_free_suspension_with_no_motor() {
        let joint = create_physics2d_wheel_joint();
        let joint = joint.read().unwrap();
        assert!(!joint.enable_motor);
        assert_eq!(joint.kind, "Wheel");
        assert_eq!(joint.local_axis_ax, 0.0);
        assert_eq!(joint.local_axis_ay, 1.0);
        assert_eq!(joint.motor_impulse, 0.0);
        assert_eq!(joint.frequency_hz, 0.0);
    }
}

mod initialize_physics2d_distance_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_distance_joint() {
        let mut out: Physics2DDistanceJoint = allocate_entity();
        initialize_physics2d_distance_joint(&mut out);
        assert_eq!(out.kind, "Distance");
        assert_eq!(out.length, 0.0);
    }
}

mod initialize_physics2d_gear_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_gear_joint() {
        let mut out: Physics2DGearJoint = allocate_entity();
        initialize_physics2d_gear_joint(&mut out);
        assert_eq!(out.kind, "Gear");
        assert_eq!(out.coordinate_b, Physics2DGearCoordinateKind::Angular);
    }
}

mod initialize_physics2d_mouse_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_mouse_joint() {
        let mut out: Physics2DMouseJoint = allocate_entity();
        initialize_physics2d_mouse_joint(&mut out);
        assert_eq!(out.kind, "Mouse");
        assert_eq!(out.max_force, 0.0);
    }
}

mod initialize_physics2d_prismatic_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_prismatic_joint() {
        let mut out: Physics2DPrismaticJoint = allocate_entity();
        initialize_physics2d_prismatic_joint(&mut out);
        assert_eq!(out.kind, "Prismatic");
        assert_eq!(out.upper_translation, 0.0);
    }
}

mod initialize_physics2d_pulley_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_pulley_joint() {
        let mut out: Physics2DPulleyJoint = allocate_entity();
        initialize_physics2d_pulley_joint(&mut out);
        assert_eq!(out.kind, "Pulley");
        assert_eq!(out.constant, 0.0);
    }
}

mod initialize_physics2d_revolute_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_revolute_joint() {
        let mut out: Physics2DRevoluteJoint = allocate_entity();
        initialize_physics2d_revolute_joint(&mut out);
        assert_eq!(out.kind, "Revolute");
        assert_eq!(out.body_b, 0);
    }
}

mod initialize_physics2d_rope_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_rope_joint() {
        let mut out: Physics2DRopeJoint = allocate_entity();
        initialize_physics2d_rope_joint(&mut out);
        assert_eq!(out.kind, "Rope");
        assert_eq!(out.max_length, 0.0);
    }
}

mod initialize_physics2d_weld_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_weld_joint() {
        let mut out: Physics2DWeldJoint = allocate_entity();
        initialize_physics2d_weld_joint(&mut out);
        assert_eq!(out.kind, "Weld");
        assert_eq!(out.body_a, 0);
    }
}

mod initialize_physics2d_wheel_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_wheel_joint() {
        let mut out: Physics2DWheelJoint = allocate_entity();
        initialize_physics2d_wheel_joint(&mut out);
        assert_eq!(out.kind, "Wheel");
        assert_eq!(out.local_axis_ay, 1.0);
    }
}

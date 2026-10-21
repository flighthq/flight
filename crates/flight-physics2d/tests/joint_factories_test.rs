use flight_entity::{Entity, allocate_entity};
use flight_physics2d::contract::*;

fn base(body_a: i32, body_b: i32) -> Physics2DJointOptions {
    let make: fn() -> Physics2DJointOptions = Physics2DJointOptions::default;
    let mut out = make();
    out.body_a = body_a;
    out.body_b = body_b;
    return out;
}

fn distance_options() -> Physics2DDistanceJointOptions {
    return Physics2DDistanceJointOptions {
        base: base(1, 2),
        damping_ratio: None,
        frequency_hz: None,
        length: 3.0,
    };
}

fn gear_options() -> Physics2DGearJointOptions {
    return Physics2DGearJointOptions {
        axis_ax: None,
        axis_ay: None,
        axis_bx: None,
        axis_by: None,
        base: base(1, 2),
        constant: 0.0,
        coordinate_a: Physics2DGearCoordinateKind::Angular,
        coordinate_b: Physics2DGearCoordinateKind::Linear,
        ratio: None,
    };
}

fn mouse_options() -> Physics2DMouseJointOptions {
    return Physics2DMouseJointOptions {
        body: 7,
        break_force: None,
        break_torque: None,
        damping_ratio: None,
        frequency_hz: None,
        local_anchor_x: None,
        local_anchor_y: None,
        max_force: 100.0,
        target_x: 3.0,
        target_y: 4.0,
    };
}

fn prismatic_options() -> Physics2DPrismaticJointOptions {
    let mut base = base(3, 4);
    base.local_anchor_ax = Some(1.0);
    base.collide_connected = Some(true);
    return Physics2DPrismaticJointOptions {
        base,
        enable_limit: Some(true),
        enable_limit_spring: None,
        enable_motor: Some(true),
        limit_damping_ratio: None,
        limit_frequency_hz: None,
        local_axis_ax: Some(0.0),
        local_axis_ay: Some(-1.0),
        lower_translation: Some(-3.0),
        max_motor_force: Some(8.0),
        motor_speed: Some(2.0),
        reference_angle: None,
        upper_translation: Some(5.0),
    };
}

fn pulley_options() -> Physics2DPulleyJointOptions {
    return Physics2DPulleyJointOptions {
        base: base(1, 2),
        constant: 6.0,
        ground_anchor_ax: -1.0,
        ground_anchor_ay: 2.0,
        ground_anchor_bx: 1.0,
        ground_anchor_by: 2.0,
        ratio: None,
    };
}

fn revolute_options() -> Physics2DRevoluteJointOptions {
    let make: fn() -> Physics2DRevoluteJointOptions = Physics2DRevoluteJointOptions::default;
    let mut out = make();
    out.base = base(1, 2);
    return out;
}

fn rope_options() -> Physics2DRopeJointOptions {
    return Physics2DRopeJointOptions {
        base: base(1, 2),
        max_length: 4.0,
    };
}

fn weld_options() -> Physics2DWeldJointOptions {
    return Physics2DWeldJointOptions {
        base: base(1, 2),
        reference_angle: None,
    };
}

fn wheel_options() -> Physics2DWheelJointOptions {
    let make: fn() -> Physics2DWheelJointOptions = Physics2DWheelJointOptions::default;
    let mut out = make();
    out.base = base(1, 2);
    return out;
}

mod create_physics2d_distance_joint {
    use super::*;

    #[test]
    fn owns_common_defaults_and_solver_scratch() {
        fn assert_entity<T: Entity>(_value: &T) {}
        let joint = create_physics2d_distance_joint(&distance_options());
        let joint = joint.read().unwrap();
        assert_entity(&*joint);
        assert_eq!(joint.kind, "Distance");
        assert_eq!(joint.body_a, 1);
        assert_eq!(joint.body_b, 2);
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
        assert_eq!(joint.length, 3.0);
        assert_eq!(joint.frequency_hz, 0.0);
        assert_eq!(joint.damping_ratio, 0.0);
    }
}

mod create_physics2d_gear_joint {
    use super::*;

    #[test]
    fn requires_coordinate_semantics_and_defaults_both_linear_axes() {
        let joint = create_physics2d_gear_joint(&gear_options());
        let joint = joint.read().unwrap();
        assert_eq!(joint.axis_ax, 1.0);
        assert_eq!(joint.axis_ay, 0.0);
        assert_eq!(joint.axis_bx, 1.0);
        assert_eq!(joint.axis_by, 0.0);
        assert_eq!(joint.kind, "Gear");
        assert_eq!(joint.ratio, 1.0);
    }
}

mod create_physics2d_mouse_joint {
    use super::*;

    #[test]
    fn hides_the_dummy_endpoint_and_owns_stable_drag_defaults() {
        let joint = create_physics2d_mouse_joint(&mouse_options());
        let joint = joint.read().unwrap();
        assert_eq!(joint.body_a, 7);
        assert_eq!(joint.body_b, 7);
        assert_eq!(joint.damping_ratio, 0.7);
        assert_eq!(joint.kind, "Mouse");
        assert_eq!(joint.frequency_hz, 5.0);
    }
}

mod create_physics2d_prismatic_joint {
    use super::*;

    #[test]
    fn preserves_authored_controls_while_initializing_motor_scratch() {
        let joint = create_physics2d_prismatic_joint(&prismatic_options());
        let joint = joint.read().unwrap();
        assert!(joint.collide_connected);
        assert!(joint.enable_limit);
        assert!(joint.enable_motor);
        assert_eq!(joint.kind, "Prismatic");
        assert_eq!(joint.local_anchor_ax, 1.0);
        assert_eq!(joint.local_axis_ax, 0.0);
        assert_eq!(joint.local_axis_ay, -1.0);
        assert_eq!(joint.lower_translation, -3.0);
        assert_eq!(joint.max_motor_force, 8.0);
        assert_eq!(joint.motor_impulse, 0.0);
        assert_eq!(joint.motor_speed, 2.0);
        assert_eq!(joint.upper_translation, 5.0);
    }
}

mod create_physics2d_pulley_joint {
    use super::*;

    #[test]
    fn defaults_the_ratio_while_retaining_required_world_anchors() {
        let joint = create_physics2d_pulley_joint(&pulley_options());
        let joint = joint.read().unwrap();
        assert_eq!(joint.ground_anchor_ax, -1.0);
        assert_eq!(joint.ground_anchor_bx, 1.0);
        assert_eq!(joint.kind, "Pulley");
        assert_eq!(joint.ratio, 1.0);
    }
}

mod create_physics2d_revolute_joint {
    use super::*;

    #[test]
    fn starts_with_inactive_motor_and_limits() {
        let joint = create_physics2d_revolute_joint(&revolute_options());
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
    fn requires_the_authored_maximum_length() {
        let joint = create_physics2d_rope_joint(&rope_options());
        let joint = joint.read().unwrap();
        assert_eq!(joint.kind, "Rope");
        assert_eq!(joint.max_length, 4.0);
    }
}

mod create_physics2d_weld_joint {
    use super::*;

    #[test]
    fn defaults_the_reference_pose_to_zero_relative_angle() {
        let joint = create_physics2d_weld_joint(&weld_options());
        let joint = joint.read().unwrap();
        assert_eq!(joint.kind, "Weld");
        assert_eq!(joint.reference_angle, 0.0);
    }
}

mod create_physics2d_wheel_joint {
    use super::*;

    #[test]
    fn defaults_to_a_vertical_free_suspension_with_no_motor() {
        let joint = create_physics2d_wheel_joint(&wheel_options());
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
        initialize_physics2d_distance_joint(&mut out, &distance_options());
        assert_eq!(out.kind, "Distance");
        assert_eq!(out.length, 3.0);
    }
}

mod initialize_physics2d_gear_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_gear_joint() {
        let mut out: Physics2DGearJoint = allocate_entity();
        initialize_physics2d_gear_joint(&mut out, &gear_options());
        assert_eq!(out.kind, "Gear");
        assert_eq!(out.coordinate_b, Physics2DGearCoordinateKind::Linear);
    }
}

mod initialize_physics2d_mouse_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_mouse_joint() {
        let mut out: Physics2DMouseJoint = allocate_entity();
        initialize_physics2d_mouse_joint(&mut out, &mouse_options());
        assert_eq!(out.kind, "Mouse");
        assert_eq!(out.max_force, 100.0);
    }
}

mod initialize_physics2d_prismatic_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_prismatic_joint() {
        let mut out: Physics2DPrismaticJoint = allocate_entity();
        initialize_physics2d_prismatic_joint(&mut out, &prismatic_options());
        assert_eq!(out.kind, "Prismatic");
        assert_eq!(out.upper_translation, 5.0);
    }
}

mod initialize_physics2d_pulley_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_pulley_joint() {
        let mut out: Physics2DPulleyJoint = allocate_entity();
        initialize_physics2d_pulley_joint(&mut out, &pulley_options());
        assert_eq!(out.kind, "Pulley");
        assert_eq!(out.constant, 6.0);
    }
}

mod initialize_physics2d_revolute_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_revolute_joint() {
        let mut out: Physics2DRevoluteJoint = allocate_entity();
        initialize_physics2d_revolute_joint(&mut out, &revolute_options());
        assert_eq!(out.kind, "Revolute");
        assert_eq!(out.body_b, 2);
    }
}

mod initialize_physics2d_rope_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_rope_joint() {
        let mut out: Physics2DRopeJoint = allocate_entity();
        initialize_physics2d_rope_joint(&mut out, &rope_options());
        assert_eq!(out.kind, "Rope");
        assert_eq!(out.max_length, 4.0);
    }
}

mod initialize_physics2d_weld_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_weld_joint() {
        let mut out: Physics2DWeldJoint = allocate_entity();
        initialize_physics2d_weld_joint(&mut out, &weld_options());
        assert_eq!(out.kind, "Weld");
        assert_eq!(out.body_a, 1);
    }
}

mod initialize_physics2d_wheel_joint {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_wheel_joint() {
        let mut out: Physics2DWheelJoint = allocate_entity();
        initialize_physics2d_wheel_joint(&mut out, &wheel_options());
        assert_eq!(out.kind, "Wheel");
        assert_eq!(out.local_axis_ay, 1.0);
    }
}

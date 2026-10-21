// flight-lint: allow-file(f64) D1: circle and polygon scalars are flight-collision's f64 shape fields
use flight_collision::{
    CollisionAabb2D, CollisionCapsule2D, CollisionCircle2D, CollisionObb2D, CollisionPolygon2D,
    CollisionShape2D, MAX_COLLISION_CONTACT_POINTS_2D, collide_contact_manifold2d,
    create_collision_contact_manifold2d,
};
use flight_physics2d_abi::contract::*;

// These constants ARE the wire contract. A test that recomputed them from the source would agree
// with any change, so every number here is written out literally: changing one has to be a
// deliberate edit in two places, which is what makes a version bump a decision.

mod physics2d_abi_body_flag {
    use super::*;

    #[test]
    fn reserves_the_low_two_bits_for_the_type_and_one_bit_each_above_it() {
        assert_eq!(PHYSICS2D_ABI_BODY_FLAG_TYPE_MASK, 0b11);
        let types = [
            PHYSICS2D_ABI_BODY_TYPE_DYNAMIC,
            PHYSICS2D_ABI_BODY_TYPE_KINEMATIC,
            PHYSICS2D_ABI_BODY_TYPE_STATIC,
        ];
        assert_eq!(types, [0, 1, 2]);
        for body_type in types {
            assert_eq!(body_type & PHYSICS2D_ABI_BODY_FLAG_TYPE_MASK, body_type);
        }
        assert_eq!(PHYSICS2D_ABI_BODY_FLAG_FIXED_ROTATION, 4);
        assert_eq!(PHYSICS2D_ABI_BODY_FLAG_BULLET, 8);
        assert_eq!(PHYSICS2D_ABI_BODY_FLAG_SLEEPING, 16);
        assert_eq!(PHYSICS2D_ABI_BODY_FLAG_SLEEP_ENABLED, 32);
    }
}

mod physics2d_abi_body_value {
    use super::*;

    #[test]
    fn indexes_seventeen_authored_body_scalars_in_wire_order() {
        assert_eq!(PHYSICS2D_ABI_BODY_VALUE_STRIDE, 17);
        let values = [
            PHYSICS2D_ABI_BODY_VALUE_X,
            PHYSICS2D_ABI_BODY_VALUE_Y,
            PHYSICS2D_ABI_BODY_VALUE_ANGLE,
            PHYSICS2D_ABI_BODY_VALUE_VELOCITY_X,
            PHYSICS2D_ABI_BODY_VALUE_VELOCITY_Y,
            PHYSICS2D_ABI_BODY_VALUE_ANGULAR_VELOCITY,
            PHYSICS2D_ABI_BODY_VALUE_FORCE_X,
            PHYSICS2D_ABI_BODY_VALUE_FORCE_Y,
            PHYSICS2D_ABI_BODY_VALUE_TORQUE,
            PHYSICS2D_ABI_BODY_VALUE_MASS,
            PHYSICS2D_ABI_BODY_VALUE_INERTIA,
            PHYSICS2D_ABI_BODY_VALUE_CENTER_X,
            PHYSICS2D_ABI_BODY_VALUE_CENTER_Y,
            PHYSICS2D_ABI_BODY_VALUE_LINEAR_DAMPING,
            PHYSICS2D_ABI_BODY_VALUE_ANGULAR_DAMPING,
            PHYSICS2D_ABI_BODY_VALUE_GRAVITY_SCALE,
            PHYSICS2D_ABI_BODY_VALUE_SLEEP_TIMER,
        ];
        assert_eq!(values, std::array::from_fn::<usize, 17, _>(|i| i));
        assert_eq!(PHYSICS2D_ABI_BODY_VALUE_X, 0);
        assert_eq!(PHYSICS2D_ABI_BODY_VALUE_ANGLE, 2);
        assert_eq!(PHYSICS2D_ABI_BODY_VALUE_MASS, 9);
        assert_eq!(PHYSICS2D_ABI_BODY_VALUE_SLEEP_TIMER, 16);
    }
}

mod physics2d_abi_capability {
    use super::*;

    #[test]
    fn declares_one_bit_per_optional_backend_feature() {
        assert_eq!(
            [
                PHYSICS2D_ABI_CAPABILITY_CONTACT_HOOKS,
                PHYSICS2D_ABI_CAPABILITY_PERSISTENT_WORLDS,
                PHYSICS2D_ABI_CAPABILITY_QUERIES,
                PHYSICS2D_ABI_CAPABILITY_SELECTIVE_READBACK,
            ],
            [1, 2, 4, 8]
        );
    }
}

mod physics2d_abi_command_byte_length {
    use super::*;

    #[test]
    fn keeps_every_record_eight_aligned_and_consistent_with_its_payload() {
        let lengths = [
            ("SetGravity", PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_GRAVITY),
            (
                "SetSolverConfig",
                PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_SOLVER_CONFIG,
            ),
            ("SetBody", PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_BODY),
            (
                "DestroyBody",
                PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_DESTROY_BODY,
            ),
            (
                "SetColliderMinimum",
                PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_COLLIDER_MINIMUM,
            ),
            (
                "DestroyCollider",
                PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_DESTROY_COLLIDER,
            ),
            ("SetJoint", PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_JOINT),
            (
                "DestroyJoint",
                PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_DESTROY_JOINT,
            ),
            ("BodyAction", PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_BODY_ACTION),
            ("WakeBody", PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_WAKE_BODY),
        ];
        for (name, byte_length) in lengths {
            assert_eq!(byte_length % 8, 0, "{}", name);
            assert!(
                byte_length >= PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH,
                "{}",
                name
            );
        }
        let header = PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH;
        assert_eq!(
            PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_GRAVITY,
            header + 2 * 8
        );
        assert_eq!(
            PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_BODY,
            header + PHYSICS2D_ABI_SET_BODY_PAYLOAD_OFFSET_VALUES + 17 * 8
        );
        assert_eq!(
            PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_JOINT,
            header + PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND_VALUES + 9 * 8
        );
        assert_eq!(
            PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_SOLVER_CONFIG,
            header + PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_VALUES + 6 * 8
        );
        assert_eq!(
            PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_BODY_ACTION,
            header + 4 * 8
        );
        assert_eq!(
            PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_COLLIDER_MINIMUM,
            header
                + PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE
                + PHYSICS2D_ABI_SHAPE_HEADER_BYTE_LENGTH
        );
    }
}

mod physics2d_abi_command_kind {
    use super::*;

    #[test]
    fn assigns_each_command_a_stable_discriminant() {
        assert_eq!(
            [
                PHYSICS2D_ABI_COMMAND_KIND_SET_GRAVITY,
                PHYSICS2D_ABI_COMMAND_KIND_SET_SOLVER_CONFIG,
                PHYSICS2D_ABI_COMMAND_KIND_SET_BODY,
                PHYSICS2D_ABI_COMMAND_KIND_DESTROY_BODY,
                PHYSICS2D_ABI_COMMAND_KIND_SET_COLLIDER,
                PHYSICS2D_ABI_COMMAND_KIND_DESTROY_COLLIDER,
                PHYSICS2D_ABI_COMMAND_KIND_SET_JOINT,
                PHYSICS2D_ABI_COMMAND_KIND_DESTROY_JOINT,
                PHYSICS2D_ABI_COMMAND_KIND_APPLY_FORCE,
                PHYSICS2D_ABI_COMMAND_KIND_APPLY_FORCE_AT_POINT,
                PHYSICS2D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE,
                PHYSICS2D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE_AT_POINT,
                PHYSICS2D_ABI_COMMAND_KIND_APPLY_TORQUE,
                PHYSICS2D_ABI_COMMAND_KIND_WAKE_BODY,
            ],
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
        );
    }
}

mod physics2d_abi_command_magic {
    use super::*;

    #[test]
    fn spells_p2da_distinguishing_the_stream_from_the_3d_one_at_the_header() {
        assert_eq!(PHYSICS2D_ABI_COMMAND_MAGIC, 0x41443250);
        assert_eq!(&PHYSICS2D_ABI_COMMAND_MAGIC.to_le_bytes(), b"P2DA");
        assert_eq!(PHYSICS2D_ABI_VERSION, 1);
        assert_eq!(PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH, 16);
        assert_eq!(
            [
                PHYSICS2D_ABI_COMMAND_HEADER_OFFSET_MAGIC,
                PHYSICS2D_ABI_COMMAND_HEADER_OFFSET_VERSION,
                PHYSICS2D_ABI_COMMAND_HEADER_OFFSET_BYTE_LENGTH,
                PHYSICS2D_ABI_COMMAND_HEADER_OFFSET_COMMAND_COUNT,
            ],
            [0, 4, 8, 12]
        );
        assert_eq!(
            [
                PHYSICS2D_ABI_COMMAND_RECORD_OFFSET_KIND,
                PHYSICS2D_ABI_COMMAND_RECORD_OFFSET_BYTE_LENGTH,
                PHYSICS2D_ABI_COMMAND_RECORD_OFFSET_OBJECT_ID,
                PHYSICS2D_ABI_COMMAND_RECORD_OFFSET_RELATED_ID,
            ],
            [0, 4, 8, 12]
        );
    }
}

mod physics2d_abi_contact_flag {
    use super::*;

    #[test]
    fn names_the_three_contact_states_the_standard_record_carries() {
        assert_eq!(
            [
                PHYSICS2D_ABI_CONTACT_FLAG_ENABLED,
                PHYSICS2D_ABI_CONTACT_FLAG_SENSOR,
                PHYSICS2D_ABI_CONTACT_FLAG_TOUCHING,
            ],
            [1, 2, 4]
        );
    }
}

mod physics2d_abi_contact_value {
    use super::*;

    #[test]
    fn sizes_a_manifold_to_the_exact_planar_bound_of_two_points() {
        assert_eq!(PHYSICS2D_ABI_MAX_CONTACT_POINTS, 2);
        assert_eq!(PHYSICS2D_ABI_CONTACT_ID_STRIDE, 4);
        assert_eq!(PHYSICS2D_ABI_CONTACT_VALUE_STRIDE, 4);
        assert_eq!(PHYSICS2D_ABI_CONTACT_POINT_VALUE_STRIDE, 7);
        assert_eq!(
            [
                PHYSICS2D_ABI_CONTACT_ID_BODY_A,
                PHYSICS2D_ABI_CONTACT_ID_BODY_B,
                PHYSICS2D_ABI_CONTACT_ID_COLLIDER_A,
                PHYSICS2D_ABI_CONTACT_ID_COLLIDER_B,
            ],
            [0, 1, 2, 3]
        );
        assert_eq!(
            [
                PHYSICS2D_ABI_CONTACT_VALUE_NORMAL_X,
                PHYSICS2D_ABI_CONTACT_VALUE_NORMAL_Y,
                PHYSICS2D_ABI_CONTACT_VALUE_FRICTION,
                PHYSICS2D_ABI_CONTACT_VALUE_RESTITUTION,
            ],
            [0, 1, 2, 3]
        );
        assert_eq!(
            [
                PHYSICS2D_ABI_CONTACT_POINT_VALUE_X,
                PHYSICS2D_ABI_CONTACT_POINT_VALUE_Y,
                PHYSICS2D_ABI_CONTACT_POINT_VALUE_DEPTH,
                PHYSICS2D_ABI_CONTACT_POINT_VALUE_RELATIVE_AX,
                PHYSICS2D_ABI_CONTACT_POINT_VALUE_RELATIVE_AY,
                PHYSICS2D_ABI_CONTACT_POINT_VALUE_RELATIVE_BX,
                PHYSICS2D_ABI_CONTACT_POINT_VALUE_RELATIVE_BY,
            ],
            [0, 1, 2, 3, 4, 5, 6]
        );
    }
}

mod physics2d_abi_joint_flag {
    use super::*;

    #[test]
    fn overlays_the_gear_coordinate_bits_on_the_enable_bits_which_no_kind_uses_together() {
        assert_eq!(PHYSICS2D_ABI_JOINT_FLAG_COLLIDE_CONNECTED, 1);
        assert_eq!(PHYSICS2D_ABI_JOINT_FLAG_BROKEN, 2);
        // Deliberate aliasing: a record carries exactly one kind, so a gear's coordinates and a
        // revolute's motor/limit bits share positions 2 and 3 without either reading the other.
        assert_eq!(
            PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_A,
            PHYSICS2D_ABI_JOINT_FLAG_ENABLE_MOTOR
        );
        assert_eq!(
            PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_B,
            PHYSICS2D_ABI_JOINT_FLAG_ENABLE_LIMIT
        );
    }
}

mod physics2d_abi_joint_kind {
    use super::*;

    #[test]
    fn covers_all_nine_built_in_2d_joints() {
        assert_eq!(
            [
                PHYSICS2D_ABI_JOINT_KIND_DISTANCE,
                PHYSICS2D_ABI_JOINT_KIND_REVOLUTE,
                PHYSICS2D_ABI_JOINT_KIND_PRISMATIC,
                PHYSICS2D_ABI_JOINT_KIND_WELD,
                PHYSICS2D_ABI_JOINT_KIND_WHEEL,
                PHYSICS2D_ABI_JOINT_KIND_ROPE,
                PHYSICS2D_ABI_JOINT_KIND_MOUSE,
                PHYSICS2D_ABI_JOINT_KIND_PULLEY,
                PHYSICS2D_ABI_JOINT_KIND_GEAR,
            ],
            [1, 2, 3, 4, 5, 6, 7, 8, 9]
        );
        assert_eq!(PHYSICS2D_ABI_JOINT_KIND_VALUE_COUNT, 9);
        assert_eq!(
            [
                PHYSICS2D_ABI_JOINT_COMMON_VALUE_LOCAL_ANCHOR_AX,
                PHYSICS2D_ABI_JOINT_COMMON_VALUE_LOCAL_ANCHOR_AY,
                PHYSICS2D_ABI_JOINT_COMMON_VALUE_LOCAL_ANCHOR_BX,
                PHYSICS2D_ABI_JOINT_COMMON_VALUE_LOCAL_ANCHOR_BY,
                PHYSICS2D_ABI_JOINT_COMMON_VALUE_BREAK_FORCE,
                PHYSICS2D_ABI_JOINT_COMMON_VALUE_BREAK_TORQUE,
            ],
            [0, 1, 2, 3, 4, 5]
        );
        assert_eq!(
            [
                PHYSICS2D_ABI_JOINT_VALUE_FORCE_X,
                PHYSICS2D_ABI_JOINT_VALUE_FORCE_Y,
                PHYSICS2D_ABI_JOINT_VALUE_TORQUE,
            ],
            [0, 1, 2]
        );
        assert_eq!(PHYSICS2D_ABI_JOINT_VALUE_STRIDE, 3);
    }
}

mod physics2d_abi_max_contact_points {
    use super::*;

    // Moves a shape by (dx, dy), additionally rotating the kinds that carry an angle so the sweep
    // reaches arrangements an axis-aligned slide never would.
    fn translate_shape(
        shape: &CollisionShape2D,
        dx: f64,
        dy: f64,
        rotation: f64,
    ) -> CollisionShape2D {
        let (cos, sin) = (rotation.cos(), rotation.sin());
        return match shape {
            CollisionShape2D::Circle(s) => CollisionShape2D::Circle(CollisionCircle2D {
                x: s.x + dx,
                y: s.y + dy,
                radius: s.radius,
            }),
            CollisionShape2D::Aabb(s) => CollisionShape2D::Aabb(CollisionAabb2D {
                min_x: s.min_x + dx as f32,
                min_y: s.min_y + dy as f32,
                max_x: s.max_x + dx as f32,
                max_y: s.max_y + dy as f32,
            }),
            CollisionShape2D::Obb(s) => CollisionShape2D::Obb(CollisionObb2D {
                x: s.x + dx as f32,
                y: s.y + dy as f32,
                rotation: rotation as f32,
                ..*s
            }),
            CollisionShape2D::Capsule(s) => {
                let (x0, y0, x1, y1) = (
                    f64::from(s.x0),
                    f64::from(s.y0),
                    f64::from(s.x1),
                    f64::from(s.y1),
                );
                CollisionShape2D::Capsule(CollisionCapsule2D {
                    x0: (x0 * cos - y0 * sin + dx) as f32,
                    y0: (x0 * sin + y0 * cos + dy) as f32,
                    x1: (x1 * cos - y1 * sin + dx) as f32,
                    y1: (x1 * sin + y1 * cos + dy) as f32,
                    radius: s.radius,
                })
            }
            CollisionShape2D::Polygon(s) => {
                let mut points = Vec::with_capacity(s.points.len());
                for pair in s.points.chunks(2) {
                    let (x, y) = (pair[0], pair[1]);
                    points.push(x * cos - y * sin + dx);
                    points.push(x * sin + y * cos + dy);
                }
                CollisionShape2D::Polygon(CollisionPolygon2D { points })
            }
            other => other.clone(),
        };
    }

    #[test]
    fn is_not_exceeded_by_any_built_in_2d_manifold_swept_rather_than_argued() {
        // The hook buffer reserves exactly this many point slots and the contact writer clamps to it.
        // This sweeps the pair matrix: if a shape or manifold change produced a third point, a hook
        // would silently see a truncated manifold, and this is what would say so.
        let shapes = [
            CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 0.6,
            }),
            CollisionShape2D::Aabb(CollisionAabb2D {
                min_x: -0.6,
                min_y: -0.6,
                max_x: 0.6,
                max_y: 0.6,
            }),
            CollisionShape2D::Obb(CollisionObb2D {
                x: 0.0,
                y: 0.0,
                half_w: 0.6,
                half_h: 0.4,
                rotation: 0.0,
            }),
            CollisionShape2D::Capsule(CollisionCapsule2D {
                x0: -0.5,
                y0: 0.0,
                x1: 0.5,
                y1: 0.0,
                radius: 0.35,
            }),
            CollisionShape2D::Polygon(CollisionPolygon2D {
                points: vec![-0.6, -0.5, 0.6, -0.5, 0.7, 0.4, -0.4, 0.6],
            }),
        ];
        let mut manifold = create_collision_contact_manifold2d();
        let mut widest = 0;
        let mut overlaps = 0;
        for a in &shapes {
            for b in &shapes {
                for step in -12..=12 {
                    let offset = f64::from(step) * 0.1;
                    for rotation in [0.0, 0.37, std::f64::consts::FRAC_PI_4, 1.2] {
                        let moved = translate_shape(b, offset, offset * 0.5, rotation);
                        if !collide_contact_manifold2d(a, &moved, &mut manifold) {
                            continue;
                        }
                        overlaps += 1;
                        widest = widest.max(manifold.point_count);
                    }
                }
            }
        }
        // The sweep has to actually collide things, or "never exceeded" says nothing.
        assert!(overlaps > 100, "only {} overlaps", overlaps);
        assert_eq!(widest, PHYSICS2D_ABI_MAX_CONTACT_POINTS);
        // Rust's collision crate does declare the planar bound the source lacked; they agree.
        assert_eq!(
            MAX_COLLISION_CONTACT_POINTS_2D,
            PHYSICS2D_ABI_MAX_CONTACT_POINTS
        );
    }
}

mod physics2d_abi_query_value {
    use super::*;

    #[test]
    fn carries_fraction_point_and_normal_in_five_slots() {
        assert_eq!(PHYSICS2D_ABI_QUERY_VALUE_STRIDE, 5);
        assert_eq!(
            [
                PHYSICS2D_ABI_QUERY_VALUE_FRACTION,
                PHYSICS2D_ABI_QUERY_VALUE_X,
                PHYSICS2D_ABI_QUERY_VALUE_Y,
                PHYSICS2D_ABI_QUERY_VALUE_NORMAL_X,
                PHYSICS2D_ABI_QUERY_VALUE_NORMAL_Y,
            ],
            [0, 1, 2, 3, 4]
        );
    }
}

mod physics2d_abi_shape_kind {
    use super::*;

    #[test]
    fn covers_all_seven_built_in_2d_shapes_including_the_two_area_less_ones() {
        assert_eq!(
            [
                PHYSICS2D_ABI_SHAPE_KIND_CIRCLE,
                PHYSICS2D_ABI_SHAPE_KIND_AABB,
                PHYSICS2D_ABI_SHAPE_KIND_OBB,
                PHYSICS2D_ABI_SHAPE_KIND_CAPSULE,
                PHYSICS2D_ABI_SHAPE_KIND_POLYGON,
                PHYSICS2D_ABI_SHAPE_KIND_SEGMENT,
                PHYSICS2D_ABI_SHAPE_KIND_POINT,
            ],
            [1, 2, 3, 4, 5, 6, 7]
        );
        assert_eq!(PHYSICS2D_ABI_SHAPE_HEADER_BYTE_LENGTH, 16);
        assert_eq!(
            [
                PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_KIND,
                PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_SCALAR_COUNT,
                PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_INTEGER_COUNT,
                PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_VERSION,
                PHYSICS2D_ABI_SHAPE_HEADER_OFFSET_SCALARS,
            ],
            [0, 4, 8, 12, 16]
        );
    }
}

mod physics2d_abi_solver_config_flag {
    use super::*;

    #[test]
    fn holds_the_substep_word_zero_since_physics2d_has_no_substeps() {
        assert_eq!(
            [
                PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_ALLOW_SLEEPING,
                PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_CONTINUOUS_COLLISION,
                PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_WARM_STARTING,
            ],
            [1, 2, 4]
        );
        assert_eq!(PHYSICS2D_ABI_SET_SOLVER_CONFIG_PAYLOAD_OFFSET_RESERVED0, 4);
        assert_eq!(
            [
                PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_SLEEP_LINEAR_THRESHOLD,
                PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_SLEEP_ANGULAR_THRESHOLD,
                PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_TIME_TO_SLEEP,
                PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_PENETRATION_SLOP,
                PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_POSITION_CORRECTION,
                PHYSICS2D_ABI_SOLVER_CONFIG_VALUE_RESTITUTION_THRESHOLD,
            ],
            [0, 1, 2, 3, 4, 5]
        );
    }
}

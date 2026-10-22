// flight-lint: allow-file(f64) D1: command scalars are the wire's IEEE doubles and circle/polygon scalars are flight-collision's f64 shape fields
use flight_collision::{
    CollisionAabb2D, CollisionCapsule2D, CollisionCircle2D, CollisionObb2D, CollisionPoint2D,
    CollisionPolygon2D, CollisionSegment2D, CollisionShape2D,
};
use flight_entity::Ref;
use flight_physics2d::{
    Physics2DBodyType, Physics2DCollider, Physics2DCollisionFilter, Physics2DDistanceJointOptions,
    Physics2DGearCoordinateKind, Physics2DGearJointOptions, Physics2DJoint, Physics2DJointOptions,
    Physics2DMaterial, Physics2DMouseJointOptions, Physics2DPrismaticJointOptions,
    Physics2DPulleyJointOptions, Physics2DRevoluteJointOptions, Physics2DRopeJointOptions,
    Physics2DWeldJointOptions, Physics2DWheelJointOptions, RigidBody2D, create_physics2d_collider,
    create_physics2d_distance_joint, create_physics2d_gear_joint, create_physics2d_mouse_joint,
    create_physics2d_prismatic_joint, create_physics2d_pulley_joint,
    create_physics2d_revolute_joint, create_physics2d_rope_joint, create_physics2d_solver_config,
    create_physics2d_weld_joint, create_physics2d_wheel_joint, create_rigid_body2d,
};
use flight_physics2d_abi::contract::*;

use crate::support::defaults;

const MATERIAL: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.1,
};

struct Record<'a> {
    bytes: &'a [u8],
    byte_length: u32,
    kind: u32,
    object_id: u32,
    payload: usize,
    related_id: u32,
}

impl Record<'_> {
    fn f64_at(&self, at: usize) -> f64 {
        return f64::from_le_bytes(self.bytes[at..at + 8].try_into().unwrap());
    }

    fn i32_at(&self, at: usize) -> i32 {
        return i32::from_le_bytes(self.bytes[at..at + 4].try_into().unwrap());
    }

    fn u32_at(&self, at: usize) -> u32 {
        return u32::from_le_bytes(self.bytes[at..at + 4].try_into().unwrap());
    }
}

fn body() -> Ref<RigidBody2D> {
    let value = create_rigid_body2d(Physics2DBodyType::Dynamic, 3.0, -4.0, Some(0.5));
    {
        let mut body = value.write().unwrap();
        body.velocity_x = 1.0;
        body.velocity_y = 2.0;
        body.angular_velocity = 3.0;
    }
    return value;
}

fn collider(
    shape: CollisionShape2D,
    sensor: Option<bool>,
    filter: Option<&Physics2DCollisionFilter>,
) -> Ref<Physics2DCollider> {
    return create_physics2d_collider(&shape, &MATERIAL, sensor, filter);
}

fn joints(a: i32, b: i32) -> Physics2DJointOptions {
    return Physics2DJointOptions {
        body_a: a,
        body_b: b,
        ..defaults()
    };
}

fn record(buffer: &Physics2DAbiCommandBuffer) -> Record<'_> {
    let at = PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH;
    let word = |offset: usize| {
        u32::from_le_bytes(
            buffer.data[at + offset..at + offset + 4]
                .try_into()
                .unwrap(),
        )
    };
    return Record {
        bytes: &buffer.data,
        byte_length: word(4),
        kind: word(0),
        object_id: word(8),
        payload: at + PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH,
        related_id: word(12),
    };
}

mod get_physics2d_abi_set_collider_command_byte_length {
    use super::*;

    #[test]
    fn reports_the_exact_length_the_writer_will_consume_per_shape() {
        let shapes = [
            (
                "circle",
                CollisionShape2D::Circle(CollisionCircle2D {
                    x: 0.0,
                    y: 0.0,
                    radius: 1.0,
                }),
                3,
            ),
            (
                "aabb",
                CollisionShape2D::Aabb(CollisionAabb2D {
                    min_x: -1.0,
                    min_y: -1.0,
                    max_x: 1.0,
                    max_y: 1.0,
                }),
                4,
            ),
            (
                "obb",
                CollisionShape2D::Obb(CollisionObb2D {
                    x: 0.0,
                    y: 0.0,
                    half_w: 1.0,
                    half_h: 2.0,
                    rotation: 0.5,
                }),
                5,
            ),
            (
                "capsule",
                CollisionShape2D::Capsule(CollisionCapsule2D {
                    x0: -1.0,
                    y0: 0.0,
                    x1: 1.0,
                    y1: 0.0,
                    radius: 0.5,
                }),
                5,
            ),
            (
                "polygon",
                CollisionShape2D::Polygon(CollisionPolygon2D {
                    points: vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
                }),
                6,
            ),
            (
                "segment",
                CollisionShape2D::Segment(CollisionSegment2D {
                    x0: 0.0,
                    y0: 0.0,
                    x1: 1.0,
                    y1: 1.0,
                }),
                4,
            ),
            (
                "point",
                CollisionShape2D::Point(CollisionPoint2D { x: 2.0, y: 3.0 }),
                2,
            ),
        ];
        for (name, shape, scalar_count) in shapes {
            let value = collider(shape, None, None);
            let value = value.read().unwrap();
            let expected =
                PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_COLLIDER_MINIMUM + scalar_count * 8;
            assert_eq!(
                get_physics2d_abi_set_collider_command_byte_length(&value),
                expected as i64,
                "{}",
                name
            );

            let mut buffer = create_physics2d_abi_command_buffer(Some(1024));
            assert!(
                write_physics2d_abi_set_collider_command(&mut buffer, 1, 1, &value),
                "{}",
                name
            );
            assert_eq!(
                buffer.byte_length - PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH,
                expected,
                "{}",
                name
            );
        }
    }
}

mod write_physics2d_abi_apply_force_at_point_command {
    use super::*;

    #[test]
    fn carries_the_world_point_in_the_second_pair() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(256));
        assert!(write_physics2d_abi_apply_force_at_point_command(
            &mut buffer,
            2,
            5.0,
            6.0,
            7.0,
            8.0
        ));
        let written = record(&buffer);
        assert_eq!(
            written.kind,
            PHYSICS2D_ABI_COMMAND_KIND_APPLY_FORCE_AT_POINT
        );
        assert_eq!(written.f64_at(written.payload + 16), 7.0);
        assert_eq!(written.f64_at(written.payload + 24), 8.0);
    }
}

mod write_physics2d_abi_apply_force_command {
    use super::*;

    #[test]
    fn zeroes_the_point_slots_a_pointless_action_does_not_use() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(256));
        assert!(write_physics2d_abi_apply_force_command(
            &mut buffer,
            2,
            5.0,
            6.0
        ));
        let written = record(&buffer);
        assert_eq!(written.kind, PHYSICS2D_ABI_COMMAND_KIND_APPLY_FORCE);
        assert_eq!(written.f64_at(written.payload), 5.0);
        assert_eq!(written.f64_at(written.payload + 8), 6.0);
        assert_eq!(written.f64_at(written.payload + 16), 0.0);
        assert_eq!(written.f64_at(written.payload + 24), 0.0);
    }
}

mod write_physics2d_abi_apply_linear_impulse_at_point_command {
    use super::*;

    #[test]
    fn uses_its_own_discriminant_rather_than_the_pointless_one() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(256));
        assert!(write_physics2d_abi_apply_linear_impulse_at_point_command(
            &mut buffer,
            1,
            1.0,
            1.0,
            2.0,
            2.0
        ));
        assert_eq!(
            record(&buffer).kind,
            PHYSICS2D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE_AT_POINT
        );
    }
}

mod write_physics2d_abi_apply_linear_impulse_command {
    use super::*;

    #[test]
    fn uses_its_own_discriminant_rather_than_the_force_one() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(256));
        assert!(write_physics2d_abi_apply_linear_impulse_command(
            &mut buffer,
            1,
            1.0,
            1.0
        ));
        assert_eq!(
            record(&buffer).kind,
            PHYSICS2D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE
        );
    }
}

mod write_physics2d_abi_apply_torque_command {
    use super::*;

    #[test]
    fn leaves_the_three_unused_body_action_slots_zero() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(256));
        assert!(write_physics2d_abi_apply_torque_command(
            &mut buffer,
            1,
            12.0
        ));
        let written = record(&buffer);
        assert_eq!(written.f64_at(written.payload), 12.0);
        assert_eq!(written.f64_at(written.payload + 8), 0.0);
        assert_eq!(written.f64_at(written.payload + 16), 0.0);
        assert_eq!(written.f64_at(written.payload + 24), 0.0);
    }
}

mod write_physics2d_abi_destroy_body_command {
    use super::*;

    #[test]
    fn writes_a_header_only_record() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(256));
        assert!(write_physics2d_abi_destroy_body_command(&mut buffer, 3));
        assert_eq!(
            record(&buffer).byte_length as usize,
            PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
        );
        assert_eq!(record(&buffer).object_id, 3);
        assert_eq!(
            record(&buffer).kind,
            PHYSICS2D_ABI_COMMAND_KIND_DESTROY_BODY
        );
    }
}

mod write_physics2d_abi_destroy_collider_command {
    use super::*;

    #[test]
    fn writes_a_header_only_record() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(256));
        assert!(write_physics2d_abi_destroy_collider_command(&mut buffer, 4));
        assert_eq!(
            record(&buffer).kind,
            PHYSICS2D_ABI_COMMAND_KIND_DESTROY_COLLIDER
        );
        assert_eq!(
            record(&buffer).byte_length as usize,
            PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
        );
    }
}

mod write_physics2d_abi_destroy_joint_command {
    use super::*;

    #[test]
    fn writes_a_header_only_record() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(256));
        assert!(write_physics2d_abi_destroy_joint_command(&mut buffer, 5));
        assert_eq!(
            record(&buffer).kind,
            PHYSICS2D_ABI_COMMAND_KIND_DESTROY_JOINT
        );
        assert_eq!(
            record(&buffer).byte_length as usize,
            PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
        );
    }
}

mod write_physics2d_abi_set_body_command {
    use super::*;

    #[test]
    fn writes_a_fixed_length_record_carrying_the_seventeen_body_scalars() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(1024));
        assert!(write_physics2d_abi_set_body_command(
            &mut buffer,
            9,
            &body().read().unwrap()
        ));
        let written = record(&buffer);
        assert_eq!(written.kind, PHYSICS2D_ABI_COMMAND_KIND_SET_BODY);
        assert_eq!(
            written.byte_length as usize,
            PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_BODY
        );
        assert_eq!(written.object_id, 9);
        assert_eq!(written.related_id, 0);
        assert_eq!(written.f64_at(written.payload + 8), 3.0);
        assert_eq!(written.f64_at(written.payload + 16), -4.0);
        assert_eq!(written.f64_at(written.payload + 24), 0.5);
        assert_eq!(written.f64_at(written.payload + 32), 1.0);
        assert_eq!(written.f64_at(written.payload + 40), 2.0);
        assert_eq!(written.f64_at(written.payload + 48), 3.0);
    }

    #[test]
    fn refuses_an_id_outside_the_non_zero_uint32_range() {
        // TS also refuses 1.5; a u32 id cannot carry a fraction, leaving the zero sentinel.
        let mut buffer = create_physics2d_abi_command_buffer(Some(1024));
        assert!(!write_physics2d_abi_set_body_command(
            &mut buffer,
            0,
            &body().read().unwrap()
        ));
        assert_eq!(buffer.command_count, 0);
        assert_eq!(buffer.byte_length, PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH);
    }

    #[test]
    fn leaves_the_stream_untouched_when_the_record_does_not_fit() {
        let mut buffer =
            create_physics2d_abi_command_buffer(Some(PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH + 8));
        assert!(!write_physics2d_abi_set_body_command(
            &mut buffer,
            1,
            &body().read().unwrap()
        ));
        assert_eq!(buffer.byte_length, PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH);
        assert_eq!(buffer.command_count, 0);
    }
}

mod write_physics2d_abi_set_collider_command {
    use super::*;

    #[test]
    fn names_the_body_in_the_related_id_and_encodes_the_shape_inline() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(1024));
        let value = collider(
            CollisionShape2D::Circle(CollisionCircle2D {
                x: 1.0,
                y: 2.0,
                radius: 3.0,
            }),
            Some(true),
            Some(&Physics2DCollisionFilter {
                category_bits: 5,
                mask_bits: 6,
                group_index: -7,
            }),
        );
        assert!(write_physics2d_abi_set_collider_command(
            &mut buffer,
            4,
            8,
            &value.read().unwrap()
        ));
        let written = record(&buffer);
        assert_eq!(written.object_id, 4);
        assert_eq!(written.related_id, 8);
        assert_eq!(written.u32_at(written.payload), 1);
        assert_eq!(written.u32_at(written.payload + 4), 5);
        assert_eq!(written.u32_at(written.payload + 8), 6);
        assert_eq!(written.i32_at(written.payload + 12), -7);
        assert_eq!(written.f64_at(written.payload + 16), 1.0);
        let shape_at = written.payload + 40;
        assert_eq!(written.u32_at(shape_at), PHYSICS2D_ABI_SHAPE_KIND_CIRCLE);
        assert_eq!(written.u32_at(shape_at + 4), 3);
        assert_eq!(written.u32_at(shape_at + 8), 0);
        assert_eq!(
            written.f64_at(shape_at + PHYSICS2D_ABI_SHAPE_HEADER_BYTE_LENGTH),
            1.0
        );
    }

    #[test]
    fn carries_the_full_unsigned_filter_range_exactly() {
        // TS refuses a categoryBits of -1, which does not fit the uint32 field. Rust's filter is
        // already u32, so that value cannot be authored; the whole range round-trips instead.
        let mut buffer = create_physics2d_abi_command_buffer(Some(1024));
        let value = collider(
            CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0,
            }),
            None,
            Some(&Physics2DCollisionFilter {
                category_bits: u32::MAX,
                mask_bits: 0,
                group_index: i32::MIN,
            }),
        );
        assert!(write_physics2d_abi_set_collider_command(
            &mut buffer,
            1,
            1,
            &value.read().unwrap()
        ));
        let written = record(&buffer);
        assert_eq!(written.u32_at(written.payload), 0);
        assert_eq!(written.u32_at(written.payload + 4), u32::MAX);
        assert_eq!(written.u32_at(written.payload + 8), 0);
        assert_eq!(written.i32_at(written.payload + 12), i32::MIN);
    }
}

mod write_physics2d_abi_set_gravity_command {
    use super::*;

    #[test]
    fn carries_two_components_and_names_no_object() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(256));
        assert!(write_physics2d_abi_set_gravity_command(
            &mut buffer,
            1.0,
            -9.81
        ));
        let written = record(&buffer);
        assert_eq!(written.kind, PHYSICS2D_ABI_COMMAND_KIND_SET_GRAVITY);
        assert_eq!(written.object_id, 0);
        assert_eq!(written.f64_at(written.payload), 1.0);
        assert_eq!(written.f64_at(written.payload + 8), -9.81);
    }
}

mod write_physics2d_abi_set_joint_command {
    use super::*;

    fn write(joint: &dyn Physics2DJoint) -> (bool, Physics2DAbiCommandBuffer) {
        let mut buffer = create_physics2d_abi_command_buffer(Some(1024));
        let written = write_physics2d_abi_set_joint_command(&mut buffer, 1, 1, 2, joint);
        return (written, buffer);
    }

    #[test]
    fn encodes_every_built_in_kind_with_its_own_discriminant() {
        let cases: Vec<(Box<dyn Fn() -> (bool, Physics2DAbiCommandBuffer)>, u32)> = vec![
            (
                Box::new(|| {
                    write(
                        &*create_physics2d_distance_joint(&Physics2DDistanceJointOptions {
                            base: joints(0, 1),
                            length: 2.0,
                            ..defaults()
                        })
                        .read()
                        .unwrap(),
                    )
                }),
                PHYSICS2D_ABI_JOINT_KIND_DISTANCE,
            ),
            (
                Box::new(|| {
                    write(
                        &*create_physics2d_revolute_joint(&Physics2DRevoluteJointOptions {
                            base: joints(0, 1),
                            ..defaults()
                        })
                        .read()
                        .unwrap(),
                    )
                }),
                PHYSICS2D_ABI_JOINT_KIND_REVOLUTE,
            ),
            (
                Box::new(|| {
                    write(
                        &*create_physics2d_prismatic_joint(&Physics2DPrismaticJointOptions {
                            base: joints(0, 1),
                            ..defaults()
                        })
                        .read()
                        .unwrap(),
                    )
                }),
                PHYSICS2D_ABI_JOINT_KIND_PRISMATIC,
            ),
            (
                Box::new(|| {
                    write(
                        &*create_physics2d_weld_joint(&Physics2DWeldJointOptions {
                            base: joints(0, 1),
                            ..defaults()
                        })
                        .read()
                        .unwrap(),
                    )
                }),
                PHYSICS2D_ABI_JOINT_KIND_WELD,
            ),
            (
                Box::new(|| {
                    write(
                        &*create_physics2d_wheel_joint(&Physics2DWheelJointOptions {
                            base: joints(0, 1),
                            ..defaults()
                        })
                        .read()
                        .unwrap(),
                    )
                }),
                PHYSICS2D_ABI_JOINT_KIND_WHEEL,
            ),
            (
                Box::new(|| {
                    write(
                        &*create_physics2d_rope_joint(&Physics2DRopeJointOptions {
                            base: joints(0, 1),
                            max_length: 3.0,
                        })
                        .read()
                        .unwrap(),
                    )
                }),
                PHYSICS2D_ABI_JOINT_KIND_ROPE,
            ),
            (
                Box::new(|| {
                    write(
                        &*create_physics2d_mouse_joint(&Physics2DMouseJointOptions {
                            body: 0,
                            target_x: 1.0,
                            target_y: 2.0,
                            max_force: 10.0,
                            ..defaults()
                        })
                        .read()
                        .unwrap(),
                    )
                }),
                PHYSICS2D_ABI_JOINT_KIND_MOUSE,
            ),
            (
                Box::new(|| {
                    write(
                        &*create_physics2d_pulley_joint(&Physics2DPulleyJointOptions {
                            base: joints(0, 1),
                            ground_anchor_ax: 0.0,
                            ground_anchor_ay: 4.0,
                            ground_anchor_bx: 2.0,
                            ground_anchor_by: 4.0,
                            ratio: Some(1.0),
                            constant: 6.0,
                        })
                        .read()
                        .unwrap(),
                    )
                }),
                PHYSICS2D_ABI_JOINT_KIND_PULLEY,
            ),
            (
                Box::new(|| {
                    write(
                        &*create_physics2d_gear_joint(&Physics2DGearJointOptions {
                            base: joints(0, 1),
                            ratio: Some(2.0),
                            constant: 0.0,
                            coordinate_a: Physics2DGearCoordinateKind::Angular,
                            coordinate_b: Physics2DGearCoordinateKind::Angular,
                            ..defaults()
                        })
                        .read()
                        .unwrap(),
                    )
                }),
                PHYSICS2D_ABI_JOINT_KIND_GEAR,
            ),
        ];
        for (make, kind) in cases {
            let (ok, buffer) = make();
            assert!(ok, "kind {}", kind);
            let written = record(&buffer);
            assert_eq!(
                written.byte_length as usize, PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_JOINT,
                "kind {}",
                kind
            );
            assert_eq!(written.u32_at(written.payload), kind);
            assert_eq!(written.u32_at(written.payload + 4), 1, "kind {}", kind);
            assert_eq!(written.u32_at(written.payload + 8), 2, "kind {}", kind);
        }
    }

    #[test]
    fn refuses_a_kind_with_no_wire_discriminant_rather_than_writing_a_zero_one() {
        let joint = create_physics2d_distance_joint(&Physics2DDistanceJointOptions {
            base: joints(0, 1),
            length: 1.0,
            ..defaults()
        });
        let mut joint = joint.write().unwrap();
        joint.joint_fields_mut().kind = "acme.Conveyor".into();
        let (ok, buffer) = write(&*joint);
        assert!(!ok);
        assert_eq!(buffer.command_count, 0);
        assert_eq!(buffer.byte_length, PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH);
    }

    #[test]
    fn reads_a_gear_coordinate_pair_out_of_the_flags_it_shares_with_the_enable_bits() {
        let joint = create_physics2d_gear_joint(&Physics2DGearJointOptions {
            base: joints(0, 1),
            ratio: Some(1.0),
            constant: 0.0,
            coordinate_a: Physics2DGearCoordinateKind::Linear,
            coordinate_b: Physics2DGearCoordinateKind::Angular,
            ..defaults()
        });
        let (ok, buffer) = write(&*joint.read().unwrap());
        assert!(ok);
        let written = record(&buffer);
        let flags = written.u32_at(written.payload + 12);
        assert_eq!(
            flags & PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_A,
            PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_A
        );
        assert_eq!(flags & PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_B, 0);
    }
}

mod write_physics2d_abi_set_solver_config_command {
    use super::*;

    #[test]
    fn packs_the_three_booleans_into_flags_and_holds_the_substep_word_zero() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(256));
        let config = create_physics2d_solver_config(None);
        assert!(write_physics2d_abi_set_solver_config_command(
            &mut buffer,
            &config
        ));
        let written = record(&buffer);
        assert_eq!(
            written.byte_length as usize,
            PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_SOLVER_CONFIG
        );
        let mut flags = 0;
        if config.allow_sleeping {
            flags |= PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_ALLOW_SLEEPING;
        }
        if config.continuous_collision {
            flags |= PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_CONTINUOUS_COLLISION;
        }
        if config.warm_starting {
            flags |= PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_WARM_STARTING;
        }
        assert_eq!(written.u32_at(written.payload), flags);
        assert_eq!(written.u32_at(written.payload + 4), 0);
        assert_eq!(
            written.u32_at(written.payload + 16),
            config.velocity_iterations as u32
        );
        assert_eq!(
            written.u32_at(written.payload + 20),
            config.position_iterations as u32
        );
        // The wire double is the f32 config value widened exactly.
        assert_eq!(
            written.f64_at(written.payload + 32),
            f64::from(config.sleep_linear_threshold)
        );
    }

    #[test]
    fn refuses_an_iteration_count_that_is_not_a_uint32() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(256));
        let mut config = create_physics2d_solver_config(None);
        config.velocity_iterations = -1;
        assert!(!write_physics2d_abi_set_solver_config_command(
            &mut buffer,
            &config
        ));
        assert_eq!(buffer.command_count, 0);
    }
}

mod write_physics2d_abi_wake_body_command {
    use super::*;

    #[test]
    fn writes_a_header_only_record_and_rejects_a_zero_id() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(256));
        assert!(!write_physics2d_abi_wake_body_command(&mut buffer, 0));
        assert!(write_physics2d_abi_wake_body_command(&mut buffer, 6));
        assert_eq!(record(&buffer).kind, PHYSICS2D_ABI_COMMAND_KIND_WAKE_BODY);
        assert_eq!(buffer.command_count, 1);
    }
}

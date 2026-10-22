// flight-lint: allow-file(f64) D1: command scalars are the wire's IEEE doubles
use flight_collision::{CollisionColliderShape3D, CollisionShape3D, CollisionSphere3D};
use flight_physics3d::{Physics3DBodyType, create_physics_3d_solver_config};
use flight_physics3d_abi::contract::*;

use crate::support::*;

// A little-endian view of the published records, starting after the stream header (TS
// `commandView`).
struct CommandView<'a> {
    bytes: &'a [u8],
}

impl CommandView<'_> {
    fn f64_at(&self, at: usize) -> f64 {
        return f64::from_le_bytes(self.bytes[at..at + 8].try_into().unwrap());
    }

    fn u32_at(&self, at: usize) -> u32 {
        return u32::from_le_bytes(self.bytes[at..at + 4].try_into().unwrap());
    }
}

fn command_view(out: &Physics3DAbiCommandBuffer) -> CommandView<'_> {
    return CommandView {
        bytes: &out.data[PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH..out.byte_length],
    };
}

fn expect_body_action(
    write: impl FnOnce(&mut Physics3DAbiCommandBuffer, u32) -> bool,
    kind: u32,
    has_point: bool,
) {
    let mut out = create_physics3d_abi_command_buffer(None);
    assert!(write(&mut out, 42));
    let view = command_view(&out);
    assert_eq!(view.u32_at(0), kind);
    assert_eq!(
        view.u32_at(4) as usize,
        PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_BODY_ACTION
    );
    assert_eq!(view.u32_at(8), 42);
    let values: Vec<f64> = (0..6).map(|i| view.f64_at(16 + i * 8)).collect();
    let expected: [f64; 6] = if has_point {
        [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
    } else {
        [1.0, 2.0, 3.0, 0.0, 0.0, 0.0]
    };
    assert_eq!(values, expected);
}

// Checks a header-only record written after the same writer refused the zero id.
fn expect_empty_command(out: &Physics3DAbiCommandBuffer, refused: bool, written: bool, kind: u32) {
    assert!(!refused);
    assert!(written);
    let view = command_view(out);
    assert_eq!(view.u32_at(0), kind);
    assert_eq!(
        view.u32_at(4) as usize,
        PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
    );
    assert_eq!(view.u32_at(8), 55);
}

mod get_physics3d_abi_set_collider_command_byte_length {
    use super::*;

    #[test]
    fn matches_exactly_the_number_of_bytes_the_collider_writer_publishes() {
        let collider = physics3d_collider(
            &CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(CollisionSphere3D {
                x: 0.0,
                y: 0.0,
                z: 0.0,
                radius: 2.0,
            })),
            None,
        );
        let collider = collider.read().unwrap();
        let mut out = create_physics3d_abi_command_buffer(Some(1024));
        let before = out.byte_length;

        assert!(write_physics3d_abi_set_collider_command(
            &mut out, 4, 3, &collider
        ));
        assert_eq!(
            (out.byte_length - before) as i64,
            get_physics3d_abi_set_collider_command_byte_length(&collider)
        );
    }
}

mod write_physics3d_abi_apply_force_at_point_command {
    use super::*;

    #[test]
    fn writes_all_six_vector_components_into_one_body_action_record() {
        expect_body_action(
            |out, id| {
                write_physics3d_abi_apply_force_at_point_command(
                    out, id, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0,
                )
            },
            PHYSICS3D_ABI_COMMAND_KIND_APPLY_FORCE_AT_POINT,
            true,
        );
    }
}

mod write_physics3d_abi_apply_force_command {
    use super::*;

    #[test]
    fn writes_a_force_and_zeroes_the_unused_point_slots() {
        expect_body_action(
            |out, id| write_physics3d_abi_apply_force_command(out, id, 1.0, 2.0, 3.0),
            PHYSICS3D_ABI_COMMAND_KIND_APPLY_FORCE,
            false,
        );
    }
}

mod write_physics3d_abi_apply_linear_impulse_at_point_command {
    use super::*;

    #[test]
    fn writes_all_six_impulse_and_point_components() {
        expect_body_action(
            |out, id| {
                write_physics3d_abi_apply_linear_impulse_at_point_command(
                    out, id, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0,
                )
            },
            PHYSICS3D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE_AT_POINT,
            true,
        );
    }
}

mod write_physics3d_abi_apply_linear_impulse_command {
    use super::*;

    #[test]
    fn writes_an_impulse_and_zeroes_the_unused_point_slots() {
        expect_body_action(
            |out, id| write_physics3d_abi_apply_linear_impulse_command(out, id, 1.0, 2.0, 3.0),
            PHYSICS3D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE,
            false,
        );
    }
}

mod write_physics3d_abi_apply_torque_command {
    use super::*;

    #[test]
    fn writes_a_torque_and_zeroes_the_unused_point_slots() {
        expect_body_action(
            |out, id| write_physics3d_abi_apply_torque_command(out, id, 1.0, 2.0, 3.0),
            PHYSICS3D_ABI_COMMAND_KIND_APPLY_TORQUE,
            false,
        );
    }
}

mod write_physics3d_abi_destroy_body_command {
    use super::*;

    #[test]
    fn writes_an_empty_body_record_with_a_stable_caller_id() {
        let mut out = create_physics3d_abi_command_buffer(None);
        let refused = write_physics3d_abi_destroy_body_command(&mut out, 0);
        let written = write_physics3d_abi_destroy_body_command(&mut out, 55);
        expect_empty_command(
            &out,
            refused,
            written,
            PHYSICS3D_ABI_COMMAND_KIND_DESTROY_BODY,
        );
    }
}

mod write_physics3d_abi_destroy_collider_command {
    use super::*;

    #[test]
    fn writes_an_empty_collider_record_with_a_stable_caller_id() {
        let mut out = create_physics3d_abi_command_buffer(None);
        let refused = write_physics3d_abi_destroy_collider_command(&mut out, 0);
        let written = write_physics3d_abi_destroy_collider_command(&mut out, 55);
        expect_empty_command(
            &out,
            refused,
            written,
            PHYSICS3D_ABI_COMMAND_KIND_DESTROY_COLLIDER,
        );
    }
}

mod write_physics3d_abi_destroy_joint_command {
    use super::*;

    #[test]
    fn writes_an_empty_joint_record_with_a_stable_caller_id() {
        let mut out = create_physics3d_abi_command_buffer(None);
        let refused = write_physics3d_abi_destroy_joint_command(&mut out, 0);
        let written = write_physics3d_abi_destroy_joint_command(&mut out, 55);
        expect_empty_command(
            &out,
            refused,
            written,
            PHYSICS3D_ABI_COMMAND_KIND_DESTROY_JOINT,
        );
    }
}

mod write_physics3d_abi_set_body_command {
    use super::*;

    #[test]
    fn encodes_the_complete_authored_and_dynamic_body_record() {
        let body = rigid_body3d(Physics3DBodyType::Kinematic);
        {
            let mut body = body.write().unwrap();
            body.x = 3.0;
            body.velocity_z = -4.0;
            body.gravity_scale = 0.25;
            body.fixed_rotation = true;
        }
        let mut out = create_physics3d_abi_command_buffer(None);

        assert!(write_physics3d_abi_set_body_command(
            &mut out,
            9,
            &body.read().unwrap()
        ));

        let view = command_view(&out);
        assert_eq!(view.u32_at(0), PHYSICS3D_ABI_COMMAND_KIND_SET_BODY);
        assert_eq!(
            view.u32_at(4) as usize,
            PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_BODY
        );
        assert_eq!(view.u32_at(8), 9);
        assert_eq!(view.u32_at(16) & 0b11, PHYSICS3D_ABI_BODY_TYPE_KINEMATIC);
        assert_eq!(view.f64_at(24), 3.0);
        assert_eq!(view.f64_at(24 + 9 * 8), -4.0);
        assert_eq!(view.f64_at(24 + 31 * 8), 0.25);
    }

    #[test]
    fn does_not_publish_or_overwrite_bytes_when_the_record_does_not_fit() {
        let mut out =
            create_physics3d_abi_command_buffer(Some(PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH));
        let before = out.data.to_vec();

        assert!(!write_physics3d_abi_set_body_command(
            &mut out,
            1,
            &rigid_body3d(Physics3DBodyType::Dynamic).read().unwrap()
        ));
        assert_eq!(out.data.to_vec(), before);
        assert_eq!(out.command_count, 0);
    }
}

mod write_physics3d_abi_set_collider_command {
    use super::*;

    #[test]
    fn encodes_and_aligns_each_built_in_shape() {
        let codes = [
            PHYSICS3D_ABI_SHAPE_KIND_SPHERE,
            PHYSICS3D_ABI_SHAPE_KIND_AABB,
            PHYSICS3D_ABI_SHAPE_KIND_BOX,
            PHYSICS3D_ABI_SHAPE_KIND_CAPSULE,
            PHYSICS3D_ABI_SHAPE_KIND_CYLINDER,
            PHYSICS3D_ABI_SHAPE_KIND_CONE,
            PHYSICS3D_ABI_SHAPE_KIND_CONVEX,
            PHYSICS3D_ABI_SHAPE_KIND_TRIANGLE_MESH,
            PHYSICS3D_ABI_SHAPE_KIND_HEIGHTFIELD,
        ];
        for ((name, shape), code) in collider_shapes((1.0, 2.0, 3.0), 2, 3)
            .into_iter()
            .zip(codes)
        {
            let collider = physics3d_collider(&shape, None);
            let mut out = create_physics3d_abi_command_buffer(Some(16384));
            out.data.fill(0xff);
            clear_physics3d_abi_command_buffer(&mut out);

            assert!(
                write_physics3d_abi_set_collider_command(
                    &mut out,
                    12,
                    8,
                    &collider.read().unwrap()
                ),
                "{name}"
            );

            let view = command_view(&out);
            assert_eq!(
                view.u32_at(0),
                PHYSICS3D_ABI_COMMAND_KIND_SET_COLLIDER,
                "{name}"
            );
            assert_eq!(view.u32_at(8), 12, "{name}");
            assert_eq!(view.u32_at(12), 8, "{name}");
            assert_eq!(
                view.u32_at(
                    PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
                        + PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE
                ),
                code,
                "{name}"
            );
            assert_eq!(view.u32_at(4) % 8, 0, "{name}");
            assert_ne!(out.data[out.byte_length - 1], 0xff, "{name}");
        }
    }
}

mod write_physics3d_abi_set_gravity_command {
    use super::*;

    #[test]
    fn writes_three_little_endian_float64_components() {
        let mut out = create_physics3d_abi_command_buffer(None);
        assert!(write_physics3d_abi_set_gravity_command(
            &mut out, 1.5, -2.5, 3.5
        ));
        let view = command_view(&out);
        assert_eq!(view.u32_at(0), PHYSICS3D_ABI_COMMAND_KIND_SET_GRAVITY);
        assert_eq!(
            [view.f64_at(16), view.f64_at(24), view.f64_at(32)],
            [1.5, -2.5, 3.5]
        );
    }

    #[test]
    fn leaves_a_corrupted_stream_untouched_instead_of_appending_behind_an_invalid_header() {
        let mut out = create_physics3d_abi_command_buffer(None);
        out.data[0] = 0;
        let before = out.data.to_vec();
        assert!(!write_physics3d_abi_set_gravity_command(
            &mut out, 1.0, 2.0, 3.0
        ));
        assert_eq!(out.data.to_vec(), before);
    }
}

mod write_physics3d_abi_set_joint_command {
    use super::*;

    #[test]
    fn encodes_each_joint_under_its_fixed_wire_kind() {
        let codes = [
            PHYSICS3D_ABI_JOINT_KIND_BALL_AND_SOCKET,
            PHYSICS3D_ABI_JOINT_KIND_DISTANCE,
            PHYSICS3D_ABI_JOINT_KIND_FIXED,
            PHYSICS3D_ABI_JOINT_KIND_HINGE,
            PHYSICS3D_ABI_JOINT_KIND_SLIDER,
            PHYSICS3D_ABI_JOINT_KIND_CONE_TWIST,
            PHYSICS3D_ABI_JOINT_KIND_GENERIC_6_DOF,
        ];
        for ((name, joint), code) in joints().into_iter().zip(codes) {
            let mut out = create_physics3d_abi_command_buffer(None);
            assert!(
                write_physics3d_abi_set_joint_command(&mut out, 77, &*joint.read().unwrap()),
                "{name}"
            );
            let view = command_view(&out);
            assert_eq!(
                view.u32_at(0),
                PHYSICS3D_ABI_COMMAND_KIND_SET_JOINT,
                "{name}"
            );
            assert_eq!(view.u32_at(16), code, "{name}");
            assert_eq!(view.u32_at(20), 10, "{name}");
            assert_eq!(view.u32_at(24), 20, "{name}");
        }
    }
}

mod write_physics3d_abi_set_solver_config_command {
    use super::*;

    #[test]
    fn encodes_every_iteration_ccd_sleep_and_warm_start_setting() {
        let mut config = create_physics_3d_solver_config(None);
        config.substeps = 3;
        config.max_ccd_substeps = 7;
        config.max_ccd_rotation_substeps = 9;
        config.sequential_impulse.velocity_iterations = 11;
        config.sequential_impulse.position_iterations = 13;
        config.sequential_impulse.warm_starting = false;
        let mut out = create_physics3d_abi_command_buffer(None);

        assert!(write_physics3d_abi_set_solver_config_command(
            &mut out, &config
        ));

        let view = command_view(&out);
        assert_eq!(view.u32_at(20), 3);
        assert_eq!(view.u32_at(24), 7);
        assert_eq!(view.u32_at(28), 9);
        assert_eq!(view.u32_at(32), 11);
        assert_eq!(view.u32_at(36), 13);
        assert_eq!(view.u32_at(16) & (1 << 2), 0);
    }
}

mod write_physics3d_abi_wake_body_command {
    use super::*;

    #[test]
    fn writes_an_empty_wake_record() {
        let mut out = create_physics3d_abi_command_buffer(None);
        let refused = write_physics3d_abi_wake_body_command(&mut out, 0);
        let written = write_physics3d_abi_wake_body_command(&mut out, 55);
        expect_empty_command(&out, refused, written, PHYSICS3D_ABI_COMMAND_KIND_WAKE_BODY);
    }
}

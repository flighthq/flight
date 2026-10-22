use flight_collision::MAX_COLLISION_CONTACT_POINTS_3D;
use flight_physics3d_abi::contract::*;

// These constants ARE the wire contract. A test that recomputed them from the source would agree
// with any change, so every number here is written out literally: changing one has to be a
// deliberate edit in two places, which is what makes a version bump a decision.

// A dense index map: its indices are exactly 0..stride, so the stride is the largest index + 1.
fn assert_dense(indices: &[usize], stride: usize) {
    let expected: Vec<usize> = (0..indices.len()).collect();
    assert_eq!(indices, expected.as_slice());
    assert_eq!(indices.iter().max().unwrap() + 1, stride);
}

mod physics3d_abi_wire_layout {
    use super::*;

    #[test]
    fn locks_the_version_magic_bytes_and_record_framing() {
        assert_eq!(&PHYSICS3D_ABI_COMMAND_MAGIC.to_le_bytes(), b"P3DA");
        assert_eq!(PHYSICS3D_ABI_VERSION, 1);
        assert_eq!(PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH, 16);
        assert_eq!(PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH, 16);
    }

    #[test]
    fn locks_command_shape_and_joint_discriminants_independently() {
        assert_eq!(
            [
                PHYSICS3D_ABI_COMMAND_KIND_SET_GRAVITY,
                PHYSICS3D_ABI_COMMAND_KIND_SET_SOLVER_CONFIG,
                PHYSICS3D_ABI_COMMAND_KIND_SET_BODY,
                PHYSICS3D_ABI_COMMAND_KIND_DESTROY_BODY,
                PHYSICS3D_ABI_COMMAND_KIND_SET_COLLIDER,
                PHYSICS3D_ABI_COMMAND_KIND_DESTROY_COLLIDER,
                PHYSICS3D_ABI_COMMAND_KIND_SET_JOINT,
                PHYSICS3D_ABI_COMMAND_KIND_DESTROY_JOINT,
                PHYSICS3D_ABI_COMMAND_KIND_APPLY_FORCE,
                PHYSICS3D_ABI_COMMAND_KIND_APPLY_FORCE_AT_POINT,
                PHYSICS3D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE,
                PHYSICS3D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE_AT_POINT,
                PHYSICS3D_ABI_COMMAND_KIND_APPLY_TORQUE,
                PHYSICS3D_ABI_COMMAND_KIND_WAKE_BODY,
            ],
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
        );
        assert_eq!(
            [
                PHYSICS3D_ABI_SHAPE_KIND_SPHERE,
                PHYSICS3D_ABI_SHAPE_KIND_AABB,
                PHYSICS3D_ABI_SHAPE_KIND_BOX,
                PHYSICS3D_ABI_SHAPE_KIND_CAPSULE,
                PHYSICS3D_ABI_SHAPE_KIND_CYLINDER,
                PHYSICS3D_ABI_SHAPE_KIND_CONE,
                PHYSICS3D_ABI_SHAPE_KIND_CONVEX,
                PHYSICS3D_ABI_SHAPE_KIND_TRIANGLE_MESH,
                PHYSICS3D_ABI_SHAPE_KIND_HEIGHTFIELD,
            ],
            [1, 2, 3, 4, 5, 6, 7, 8, 9]
        );
        assert_eq!(
            [
                PHYSICS3D_ABI_JOINT_KIND_BALL_AND_SOCKET,
                PHYSICS3D_ABI_JOINT_KIND_DISTANCE,
                PHYSICS3D_ABI_JOINT_KIND_FIXED,
                PHYSICS3D_ABI_JOINT_KIND_HINGE,
                PHYSICS3D_ABI_JOINT_KIND_SLIDER,
                PHYSICS3D_ABI_JOINT_KIND_CONE_TWIST,
                PHYSICS3D_ABI_JOINT_KIND_GENERIC_6_DOF,
            ],
            [1, 2, 3, 4, 5, 6, 7]
        );
    }

    #[test]
    fn keeps_every_structure_of_arrays_index_map_dense_and_stride_terminated() {
        assert_dense(
            &[
                PHYSICS3D_ABI_BODY_VALUE_X,
                PHYSICS3D_ABI_BODY_VALUE_Y,
                PHYSICS3D_ABI_BODY_VALUE_Z,
                PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_X,
                PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_Y,
                PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_Z,
                PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_W,
                PHYSICS3D_ABI_BODY_VALUE_VELOCITY_X,
                PHYSICS3D_ABI_BODY_VALUE_VELOCITY_Y,
                PHYSICS3D_ABI_BODY_VALUE_VELOCITY_Z,
                PHYSICS3D_ABI_BODY_VALUE_ANGULAR_VELOCITY_X,
                PHYSICS3D_ABI_BODY_VALUE_ANGULAR_VELOCITY_Y,
                PHYSICS3D_ABI_BODY_VALUE_ANGULAR_VELOCITY_Z,
                PHYSICS3D_ABI_BODY_VALUE_FORCE_X,
                PHYSICS3D_ABI_BODY_VALUE_FORCE_Y,
                PHYSICS3D_ABI_BODY_VALUE_FORCE_Z,
                PHYSICS3D_ABI_BODY_VALUE_TORQUE_X,
                PHYSICS3D_ABI_BODY_VALUE_TORQUE_Y,
                PHYSICS3D_ABI_BODY_VALUE_TORQUE_Z,
                PHYSICS3D_ABI_BODY_VALUE_MASS,
                PHYSICS3D_ABI_BODY_VALUE_INERTIA_XX,
                PHYSICS3D_ABI_BODY_VALUE_INERTIA_YY,
                PHYSICS3D_ABI_BODY_VALUE_INERTIA_ZZ,
                PHYSICS3D_ABI_BODY_VALUE_INERTIA_XY,
                PHYSICS3D_ABI_BODY_VALUE_INERTIA_XZ,
                PHYSICS3D_ABI_BODY_VALUE_INERTIA_YZ,
                PHYSICS3D_ABI_BODY_VALUE_CENTER_X,
                PHYSICS3D_ABI_BODY_VALUE_CENTER_Y,
                PHYSICS3D_ABI_BODY_VALUE_CENTER_Z,
                PHYSICS3D_ABI_BODY_VALUE_LINEAR_DAMPING,
                PHYSICS3D_ABI_BODY_VALUE_ANGULAR_DAMPING,
                PHYSICS3D_ABI_BODY_VALUE_GRAVITY_SCALE,
                PHYSICS3D_ABI_BODY_VALUE_SLEEP_TIMER,
            ],
            PHYSICS3D_ABI_BODY_VALUE_STRIDE,
        );
        assert_dense(
            &[
                PHYSICS3D_ABI_CONTACT_ID_BODY_A,
                PHYSICS3D_ABI_CONTACT_ID_BODY_B,
                PHYSICS3D_ABI_CONTACT_ID_COLLIDER_A,
                PHYSICS3D_ABI_CONTACT_ID_COLLIDER_B,
            ],
            PHYSICS3D_ABI_CONTACT_ID_STRIDE,
        );
        assert_dense(
            &[
                PHYSICS3D_ABI_CONTACT_VALUE_NORMAL_X,
                PHYSICS3D_ABI_CONTACT_VALUE_NORMAL_Y,
                PHYSICS3D_ABI_CONTACT_VALUE_NORMAL_Z,
                PHYSICS3D_ABI_CONTACT_VALUE_FRICTION,
                PHYSICS3D_ABI_CONTACT_VALUE_RESTITUTION,
            ],
            PHYSICS3D_ABI_CONTACT_VALUE_STRIDE,
        );
        assert_dense(
            &[
                PHYSICS3D_ABI_CONTACT_POINT_VALUE_X,
                PHYSICS3D_ABI_CONTACT_POINT_VALUE_Y,
                PHYSICS3D_ABI_CONTACT_POINT_VALUE_Z,
                PHYSICS3D_ABI_CONTACT_POINT_VALUE_DEPTH,
                PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_AX,
                PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_AY,
                PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_AZ,
                PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_BX,
                PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_BY,
                PHYSICS3D_ABI_CONTACT_POINT_VALUE_RELATIVE_BZ,
            ],
            PHYSICS3D_ABI_CONTACT_POINT_VALUE_STRIDE,
        );
        assert_dense(
            &[
                PHYSICS3D_ABI_JOINT_VALUE_FORCE_X,
                PHYSICS3D_ABI_JOINT_VALUE_FORCE_Y,
                PHYSICS3D_ABI_JOINT_VALUE_FORCE_Z,
                PHYSICS3D_ABI_JOINT_VALUE_TORQUE_X,
                PHYSICS3D_ABI_JOINT_VALUE_TORQUE_Y,
                PHYSICS3D_ABI_JOINT_VALUE_TORQUE_Z,
            ],
            PHYSICS3D_ABI_JOINT_VALUE_STRIDE,
        );
        assert_dense(
            &[
                PHYSICS3D_ABI_QUERY_VALUE_FRACTION,
                PHYSICS3D_ABI_QUERY_VALUE_X,
                PHYSICS3D_ABI_QUERY_VALUE_Y,
                PHYSICS3D_ABI_QUERY_VALUE_Z,
                PHYSICS3D_ABI_QUERY_VALUE_NORMAL_X,
                PHYSICS3D_ABI_QUERY_VALUE_NORMAL_Y,
                PHYSICS3D_ABI_QUERY_VALUE_NORMAL_Z,
            ],
            PHYSICS3D_ABI_QUERY_VALUE_STRIDE,
        );
    }

    #[test]
    fn ties_variable_collider_framing_and_hook_capacity_to_their_structural_bounds() {
        assert_eq!(
            PHYSICS3D_ABI_COMMAND_BYTE_LENGTH_SET_COLLIDER_MINIMUM,
            PHYSICS3D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
                + PHYSICS3D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE
                + PHYSICS3D_ABI_SHAPE_HEADER_BYTE_LENGTH
        );
        assert_eq!(
            PHYSICS3D_ABI_MAX_CONTACT_POINTS,
            MAX_COLLISION_CONTACT_POINTS_3D
        );
    }
}

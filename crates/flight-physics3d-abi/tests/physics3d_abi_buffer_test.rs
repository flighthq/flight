use std::panic::{AssertUnwindSafe, catch_unwind};

use flight_entity::{FlightError, FlightErrorKind, get_entity_id};
use flight_physics3d_abi::contract::*;

// The first value past the largest capacity a TS caller can express (`Number.isSafeInteger`).
const UNSAFE_CAPACITY: usize = 1 << 53;

fn assert_range_error(run: impl FnOnce()) -> String {
    let payload = catch_unwind(AssertUnwindSafe(run)).expect_err("expected a RangeError");
    let error = payload
        .downcast_ref::<FlightError>()
        .expect("a FlightError");
    assert_eq!(error.kind, FlightErrorKind::RangeError);
    return error.message.clone();
}

fn read_header_word(buffer: &Physics3DAbiCommandBuffer, at: usize) -> u32 {
    return u32::from_le_bytes(buffer.data[at..at + 4].try_into().unwrap());
}

mod clear_physics3d_abi_command_buffer {
    use super::*;

    #[test]
    fn rewrites_the_canonical_little_endian_header_and_resets_the_published_stream() {
        let mut out = create_physics3d_abi_command_buffer(Some(64));
        out.data.fill(0xff);
        out.byte_length = 64;
        out.command_count = 3;

        clear_physics3d_abi_command_buffer(&mut out);

        assert_eq!(read_header_word(&out, 0), PHYSICS3D_ABI_COMMAND_MAGIC);
        assert_eq!(read_header_word(&out, 4), PHYSICS3D_ABI_VERSION);
        assert_eq!(
            read_header_word(&out, 8),
            PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH as u32
        );
        assert_eq!(read_header_word(&out, 12), 0);
        assert_eq!(out.byte_length, PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH);
        assert_eq!(out.command_count, 0);
    }
}

mod create_physics3d_abi_body_buffer {
    use super::*;

    #[test]
    fn allocates_the_documented_structure_of_arrays_capacity() {
        let out = create_physics3d_abi_body_buffer(3);
        assert_eq!(out.ids.len(), 3);
        assert_eq!(out.flags.len(), 3);
        assert_eq!(out.values.len(), 3 * PHYSICS3D_ABI_BODY_VALUE_STRIDE);
        assert_eq!((out.count, out.required_count), (0, 0));
    }
}

mod create_physics3d_abi_command_buffer {
    use super::*;

    #[test]
    fn allocates_only_through_an_explicit_byte_capacity() {
        let out = create_physics3d_abi_command_buffer(Some(80));
        assert_eq!(out.data.len(), 80);
        assert_eq!(out.byte_length, PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH);
    }

    #[test]
    fn rejects_a_capacity_that_cannot_hold_the_stream_header() {
        let message = assert_range_error(|| {
            create_physics3d_abi_command_buffer(Some(15));
        });
        assert_eq!(
            message,
            "Physics3D ABI command capacity must be at least 16"
        );
    }
}

mod create_physics3d_abi_contact_buffer {
    use super::*;

    #[test]
    fn allocates_contact_and_point_capacities_independently() {
        let out = create_physics3d_abi_contact_buffer(2, 5);
        assert_eq!(out.ids.len(), 2 * PHYSICS3D_ABI_CONTACT_ID_STRIDE);
        assert_eq!(out.values.len(), 2 * PHYSICS3D_ABI_CONTACT_VALUE_STRIDE);
        assert_eq!(out.point_feature_ids.len(), 5);
        assert_eq!(
            out.point_values.len(),
            5 * PHYSICS3D_ABI_CONTACT_POINT_VALUE_STRIDE
        );
    }
}

mod create_physics3d_abi_execution_result {
    use super::*;

    #[test]
    fn starts_at_a_complete_empty_stream_boundary() {
        let result = create_physics3d_abi_execution_result();
        assert_eq!(result.status, Physics3DAbiExecutionStatus::Complete);
        assert_eq!(result.command_index, 0);
        assert_eq!(result.byte_offset, PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH);
        assert_eq!(result.command_kind, 0);
    }
}

mod create_physics3d_abi_joint_buffer {
    use super::*;

    #[test]
    fn allocates_one_reaction_row_per_joint() {
        let out = create_physics3d_abi_joint_buffer(4);
        assert_eq!(out.ids.len(), 4);
        assert_eq!(out.flags.len(), 4);
        assert_eq!(out.values.len(), 4 * PHYSICS3D_ABI_JOINT_VALUE_STRIDE);
    }
}

mod create_physics3d_abi_query_buffer {
    use super::*;

    #[test]
    fn allocates_identity_and_geometry_rows_at_the_same_capacity() {
        let out = create_physics3d_abi_query_buffer(6);
        assert_eq!(out.body_ids.len(), 6);
        assert_eq!(out.collider_ids.len(), 6);
        assert_eq!(out.values.len(), 6 * PHYSICS3D_ABI_QUERY_VALUE_STRIDE);
    }

    #[test]
    fn rejects_negative_and_fractional_capacities() {
        // `usize` makes -1 and 1.5 unrepresentable; the safe-integer ceiling is what remains.
        let message = assert_range_error(|| {
            create_physics3d_abi_query_buffer(UNSAFE_CAPACITY);
        });
        assert_eq!(
            message,
            "Physics3D ABI query capacity must be a non-negative safe integer"
        );
    }
}

mod get_physics3d_abi_command_buffer_remaining_byte_length {
    use super::*;

    #[test]
    fn reports_capacity_after_the_published_prefix_without_going_negative() {
        let mut out = create_physics3d_abi_command_buffer(Some(64));
        assert_eq!(
            get_physics3d_abi_command_buffer_remaining_byte_length(&out),
            48
        );
        out.byte_length = 80;
        assert_eq!(
            get_physics3d_abi_command_buffer_remaining_byte_length(&out),
            0
        );
    }
}

mod initialize_physics3d_abi_body_buffer {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics3d_abi_body_buffer() {
        let mut buffer = create_physics3d_abi_body_buffer(1);
        let id = get_entity_id(&buffer);
        buffer.count = 1;
        buffer.required_count = 4;

        initialize_physics3d_abi_body_buffer(&mut buffer, 2);

        assert_eq!(buffer.ids.len(), 2);
        assert_eq!(buffer.values.len(), 2 * PHYSICS3D_ABI_BODY_VALUE_STRIDE);
        assert_eq!((buffer.count, buffer.required_count), (0, 0));
        assert_eq!(get_entity_id(&buffer), id);
    }
}

mod initialize_physics3d_abi_command_buffer {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics3d_abi_command_buffer() {
        let mut buffer = create_physics3d_abi_command_buffer(Some(64));
        let id = get_entity_id(&buffer);
        assert!(write_physics3d_abi_set_gravity_command(
            &mut buffer,
            1.0,
            2.0,
            3.0
        ));

        initialize_physics3d_abi_command_buffer(&mut buffer, Some(32));

        assert_eq!(buffer.data.len(), 32);
        assert_eq!(buffer.byte_length, PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH);
        assert_eq!(buffer.command_count, 0);
        assert_eq!(read_header_word(&buffer, 0), PHYSICS3D_ABI_COMMAND_MAGIC);
        assert_eq!(get_entity_id(&buffer), id);
    }
}

mod initialize_physics3d_abi_contact_buffer {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics3d_abi_contact_buffer() {
        let mut buffer = create_physics3d_abi_contact_buffer(1, 1);
        buffer.count = 1;
        buffer.point_count = 1;
        buffer.required_count = 3;
        buffer.required_point_count = 5;

        initialize_physics3d_abi_contact_buffer(&mut buffer, 3, 4);

        assert_eq!(buffer.flags.len(), 3);
        assert_eq!(buffer.point_feature_ids.len(), 4);
        assert_eq!(
            (
                buffer.count,
                buffer.point_count,
                buffer.required_count,
                buffer.required_point_count
            ),
            (0, 0, 0, 0)
        );
    }
}

mod initialize_physics3d_abi_execution_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics3d_abi_execution_result() {
        let mut result = create_physics3d_abi_execution_result();
        result.status = Physics3DAbiExecutionStatus::InvalidBuffer;
        result.command_index = 3;
        result.byte_offset = 99;
        result.command_kind = 7;

        initialize_physics3d_abi_execution_result(&mut result);

        assert_eq!(result.status, Physics3DAbiExecutionStatus::Complete);
        assert_eq!(result.byte_offset, PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH);
        assert_eq!((result.command_index, result.command_kind), (0, 0));
    }
}

mod initialize_physics3d_abi_joint_buffer {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics3d_abi_joint_buffer() {
        let mut buffer = create_physics3d_abi_joint_buffer(1);
        buffer.count = 1;
        buffer.required_count = 2;

        initialize_physics3d_abi_joint_buffer(&mut buffer, 5);

        assert_eq!(buffer.ids.len(), 5);
        assert_eq!(buffer.values.len(), 5 * PHYSICS3D_ABI_JOINT_VALUE_STRIDE);
        assert_eq!((buffer.count, buffer.required_count), (0, 0));
    }
}

mod initialize_physics3d_abi_query_buffer {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics3d_abi_query_buffer() {
        let mut buffer = create_physics3d_abi_query_buffer(1);
        buffer.count = 1;
        buffer.required_count = 2;

        initialize_physics3d_abi_query_buffer(&mut buffer, 6);

        assert_eq!(buffer.body_ids.len(), 6);
        assert_eq!(buffer.values.len(), 6 * PHYSICS3D_ABI_QUERY_VALUE_STRIDE);
        assert_eq!((buffer.count, buffer.required_count), (0, 0));
    }
}

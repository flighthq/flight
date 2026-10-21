use std::panic::{AssertUnwindSafe, catch_unwind};

use flight_entity::{FlightError, FlightErrorKind, get_entity_id};
use flight_physics2d_abi::contract::*;

// The first byte past the largest capacity a TS caller can express (`Number.isSafeInteger`).
const UNSAFE_CAPACITY: usize = 1 << 53;

fn assert_range_error(run: impl FnOnce()) -> String {
    let payload = catch_unwind(AssertUnwindSafe(run)).expect_err("expected a RangeError");
    let error = payload
        .downcast_ref::<FlightError>()
        .expect("a FlightError");
    assert_eq!(error.kind, FlightErrorKind::RangeError);
    return error.message.clone();
}

fn read_header_word(buffer: &Physics2DAbiCommandBuffer, at: usize) -> u32 {
    return u32::from_le_bytes(buffer.data[at..at + 4].try_into().unwrap());
}

mod clear_physics2d_abi_command_buffer {
    use super::*;

    #[test]
    fn rewrites_the_header_so_a_reused_buffer_cannot_carry_a_stale_count() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(256));
        assert!(write_physics2d_abi_set_gravity_command(
            &mut buffer,
            0.0,
            -9.81
        ));
        assert_eq!(buffer.command_count, 1);

        clear_physics2d_abi_command_buffer(&mut buffer);

        assert_eq!(buffer.command_count, 0);
        assert_eq!(buffer.byte_length, PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH);
        assert_eq!(read_header_word(&buffer, 0), PHYSICS2D_ABI_COMMAND_MAGIC);
        assert_eq!(read_header_word(&buffer, 4), PHYSICS2D_ABI_VERSION);
        assert_eq!(
            read_header_word(&buffer, 8),
            PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH as u32
        );
        assert_eq!(read_header_word(&buffer, 12), 0);
    }
}

mod create_physics2d_abi_body_buffer {
    use super::*;

    #[test]
    fn sizes_every_array_to_the_capacity_it_was_asked_for() {
        let buffer = create_physics2d_abi_body_buffer(3);
        assert_eq!(buffer.ids.len(), 3);
        assert_eq!(buffer.flags.len(), 3);
        assert_eq!(buffer.values.len(), 3 * PHYSICS2D_ABI_BODY_VALUE_STRIDE);
        assert_eq!(buffer.count, 0);
        assert_eq!(buffer.required_count, 0);
    }

    #[test]
    fn rejects_a_capacity_that_is_not_a_non_negative_safe_integer() {
        // TS also rejects -1 and 1.5; `usize` makes those unrepresentable, leaving the ceiling.
        let message = assert_range_error(|| {
            create_physics2d_abi_body_buffer(UNSAFE_CAPACITY);
        });
        assert_eq!(
            message,
            "Physics2D ABI body capacity must be a non-negative safe integer"
        );
    }
}

mod create_physics2d_abi_command_buffer {
    use super::*;

    #[test]
    fn starts_as_a_valid_empty_stream() {
        let buffer = create_physics2d_abi_command_buffer(Some(64));
        assert_eq!(buffer.data.len(), 64);
        assert_eq!(buffer.byte_length, PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH);
        assert_eq!(buffer.command_count, 0);
        assert_eq!(read_header_word(&buffer, 0), PHYSICS2D_ABI_COMMAND_MAGIC);
    }

    #[test]
    fn defaults_to_four_kibibytes() {
        assert_eq!(create_physics2d_abi_command_buffer(None).data.len(), 4096);
    }

    #[test]
    fn refuses_a_capacity_too_small_to_hold_the_header() {
        let message = assert_range_error(|| {
            create_physics2d_abi_command_buffer(Some(PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH - 1));
        });
        assert_eq!(
            message,
            "Physics2D ABI command capacity must be at least 16"
        );
    }
}

mod create_physics2d_abi_contact_buffer {
    use super::*;

    #[test]
    fn sizes_contact_rows_and_point_rows_independently() {
        let buffer = create_physics2d_abi_contact_buffer(2, 5);
        assert_eq!(buffer.ids.len(), 2 * PHYSICS2D_ABI_CONTACT_ID_STRIDE);
        assert_eq!(buffer.flags.len(), 2);
        assert_eq!(buffer.point_starts.len(), 2);
        assert_eq!(buffer.point_counts.len(), 2);
        assert_eq!(buffer.values.len(), 2 * PHYSICS2D_ABI_CONTACT_VALUE_STRIDE);
        assert_eq!(buffer.point_feature_ids.len(), 5);
        assert_eq!(
            buffer.point_values.len(),
            5 * PHYSICS2D_ABI_CONTACT_POINT_VALUE_STRIDE
        );
    }
}

mod create_physics2d_abi_execution_result {
    use super::*;

    #[test]
    fn starts_at_the_first_record_rather_than_at_zero() {
        let result = create_physics2d_abi_execution_result();
        assert_eq!(result.status, Physics2DAbiExecutionStatus::Complete);
        assert_eq!(result.byte_offset, PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH);
        assert_eq!(result.command_index, 0);
        assert_eq!(result.command_kind, 0);
    }
}

mod create_physics2d_abi_joint_buffer {
    use super::*;

    #[test]
    fn sizes_three_reaction_values_per_joint() {
        let buffer = create_physics2d_abi_joint_buffer(4);
        assert_eq!(buffer.ids.len(), 4);
        assert_eq!(buffer.flags.len(), 4);
        assert_eq!(buffer.values.len(), 4 * PHYSICS2D_ABI_JOINT_VALUE_STRIDE);
    }
}

mod create_physics2d_abi_query_buffer {
    use super::*;

    #[test]
    fn sizes_five_geometric_values_per_hit() {
        let buffer = create_physics2d_abi_query_buffer(4);
        assert_eq!(buffer.body_ids.len(), 4);
        assert_eq!(buffer.collider_ids.len(), 4);
        assert_eq!(buffer.values.len(), 4 * PHYSICS2D_ABI_QUERY_VALUE_STRIDE);
    }
}

mod get_physics2d_abi_command_buffer_remaining_byte_length {
    use super::*;

    #[test]
    fn shrinks_as_commands_are_written_and_never_goes_negative() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(64));
        let before = get_physics2d_abi_command_buffer_remaining_byte_length(&buffer);
        assert_eq!(before, 64 - PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH);
        assert!(write_physics2d_abi_set_gravity_command(
            &mut buffer,
            0.0,
            -9.81
        ));
        assert_eq!(
            get_physics2d_abi_command_buffer_remaining_byte_length(&buffer),
            before - 32
        );
        // A length the caller pushed past the data still reports zero, never an underflow.
        buffer.byte_length = buffer.data.len() + 8;
        assert_eq!(
            get_physics2d_abi_command_buffer_remaining_byte_length(&buffer),
            0
        );
    }
}

mod initialize_physics2d_abi_body_buffer {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_abi_body_buffer() {
        let mut buffer = create_physics2d_abi_body_buffer(1);
        let id = get_entity_id(&buffer);
        buffer.count = 1;
        buffer.required_count = 4;

        initialize_physics2d_abi_body_buffer(&mut buffer, 2);

        assert_eq!(buffer.ids.len(), 2);
        assert_eq!(buffer.values.len(), 2 * PHYSICS2D_ABI_BODY_VALUE_STRIDE);
        assert_eq!((buffer.count, buffer.required_count), (0, 0));
        assert_eq!(get_entity_id(&buffer), id);
    }
}

mod initialize_physics2d_abi_command_buffer {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_abi_command_buffer() {
        let mut buffer = create_physics2d_abi_command_buffer(Some(64));
        let id = get_entity_id(&buffer);
        assert!(write_physics2d_abi_set_gravity_command(
            &mut buffer,
            1.0,
            2.0
        ));

        initialize_physics2d_abi_command_buffer(&mut buffer, Some(32));

        assert_eq!(buffer.data.len(), 32);
        assert_eq!(buffer.byte_length, PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH);
        assert_eq!(buffer.command_count, 0);
        assert_eq!(read_header_word(&buffer, 0), PHYSICS2D_ABI_COMMAND_MAGIC);
        assert_eq!(get_entity_id(&buffer), id);
    }
}

mod initialize_physics2d_abi_contact_buffer {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_abi_contact_buffer() {
        let mut buffer = create_physics2d_abi_contact_buffer(1, 1);
        buffer.count = 1;
        buffer.point_count = 1;
        buffer.required_count = 3;
        buffer.required_point_count = 5;

        initialize_physics2d_abi_contact_buffer(&mut buffer, 3, 4);

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

    #[test]
    fn rejects_an_unsafe_point_capacity() {
        let message = assert_range_error(|| {
            create_physics2d_abi_contact_buffer(1, UNSAFE_CAPACITY);
        });
        assert_eq!(
            message,
            "Physics2D ABI contact point capacity must be a non-negative safe integer"
        );
    }
}

mod initialize_physics2d_abi_execution_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_abi_execution_result() {
        let mut result = create_physics2d_abi_execution_result();
        result.status = Physics2DAbiExecutionStatus::InvalidBuffer;
        result.command_index = 3;
        result.byte_offset = 99;
        result.command_kind = 7;

        initialize_physics2d_abi_execution_result(&mut result);

        assert_eq!(result.status, Physics2DAbiExecutionStatus::Complete);
        assert_eq!(result.byte_offset, PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH);
        assert_eq!((result.command_index, result.command_kind), (0, 0));
    }
}

mod initialize_physics2d_abi_joint_buffer {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_abi_joint_buffer() {
        let mut buffer = create_physics2d_abi_joint_buffer(1);
        buffer.count = 1;
        buffer.required_count = 2;

        initialize_physics2d_abi_joint_buffer(&mut buffer, 5);

        assert_eq!(buffer.ids.len(), 5);
        assert_eq!(buffer.values.len(), 5 * PHYSICS2D_ABI_JOINT_VALUE_STRIDE);
        assert_eq!((buffer.count, buffer.required_count), (0, 0));
    }
}

mod initialize_physics2d_abi_query_buffer {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_abi_query_buffer() {
        let mut buffer = create_physics2d_abi_query_buffer(1);
        buffer.count = 1;
        buffer.required_count = 2;

        initialize_physics2d_abi_query_buffer(&mut buffer, 6);

        assert_eq!(buffer.body_ids.len(), 6);
        assert_eq!(buffer.values.len(), 6 * PHYSICS2D_ABI_QUERY_VALUE_STRIDE);
        assert_eq!((buffer.count, buffer.required_count), (0, 0));
    }
}

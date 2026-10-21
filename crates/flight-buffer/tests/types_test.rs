use std::sync::Arc;

use flight_buffer::contract::*;
use flight_entity::Unknown;

const VIEW_KINDS: [(ArrayBufferViewKind, &str); 10] = [
    (ArrayBufferViewKind::Uint8Array, "Uint8Array"),
    (ArrayBufferViewKind::Uint8ClampedArray, "Uint8ClampedArray"),
    (ArrayBufferViewKind::Int8Array, "Int8Array"),
    (ArrayBufferViewKind::Uint16Array, "Uint16Array"),
    (ArrayBufferViewKind::Int16Array, "Int16Array"),
    (ArrayBufferViewKind::Uint32Array, "Uint32Array"),
    (ArrayBufferViewKind::Int32Array, "Int32Array"),
    (ArrayBufferViewKind::Float32Array, "Float32Array"),
    (ArrayBufferViewKind::Float64Array, "Float64Array"),
    (ArrayBufferViewKind::DataView, "DataView"),
];

mod create_array_buffer {
    use super::*;

    #[test]
    fn allocates_zeroed_fixed_length_storage_with_distinct_identity() {
        let first = create_array_buffer(4);
        let second = create_array_buffer(4);
        assert_eq!(get_array_buffer_byte_length(&first), 4);
        assert_eq!(
            &**get_array_buffer_storage(&first).read().unwrap(),
            &[0, 0, 0, 0]
        );
        assert!(!equals_array_buffer(&first, &second));
    }
}

mod create_array_buffer_from_bytes {
    use super::*;

    #[test]
    fn preserves_the_owned_fixed_length_bytes_without_vec_storage() {
        let buffer = create_array_buffer_from_bytes(Box::new([1, 2, 3]));
        assert_eq!(get_array_buffer_byte_length(&buffer), 3);
        assert_eq!(
            &**get_array_buffer_storage(&buffer).read().unwrap(),
            &[1, 2, 3]
        );
    }
}

mod create_array_buffer_view {
    use super::*;

    #[test]
    fn aliases_the_exact_offset_range_of_the_same_shared_storage() {
        let buffer = create_array_buffer_from_bytes(Box::new([1, 2, 3, 4]));
        let view =
            create_array_buffer_view(&buffer, 1, 2, ArrayBufferViewKind::Uint8Array).unwrap();
        assert!(equals_array_buffer(&buffer, &view.buffer));
        assert_eq!(view.byte_offset, 1);
        assert_eq!(view.byte_length, 2);
        get_array_buffer_storage(&view.buffer).write().unwrap()[2] = 9;
        assert_eq!(
            &**get_array_buffer_storage(&buffer).read().unwrap(),
            &[1, 2, 9, 4]
        );
    }

    #[test]
    fn rejects_overflow_and_ranges_past_the_fixed_allocation() {
        let buffer = create_array_buffer(4);
        assert!(create_array_buffer_view(&buffer, 3, 2, ArrayBufferViewKind::DataView).is_none());
        assert!(
            create_array_buffer_view(&buffer, usize::MAX, 2, ArrayBufferViewKind::DataView)
                .is_none()
        );
    }
}

mod create_blob {
    use super::*;

    #[test]
    fn shares_the_immutable_record_and_opaque_payload_identity() {
        let payload: Unknown = Some(Arc::new("provider payload".to_string()));
        let blob = create_blob("application/octet-stream".to_string(), 8, payload.clone());
        let alias = blob.clone();
        assert!(Arc::ptr_eq(&blob, &alias));
        assert_eq!(blob.mime_type, "application/octet-stream");
        assert_eq!(blob.size, 8);
        assert!(Arc::ptr_eq(
            blob.payload.as_ref().unwrap(),
            payload.as_ref().unwrap()
        ));
    }

    #[test]
    fn preserves_canonical_unknown_null_without_a_sentinel_payload() {
        let blob = create_blob(String::new(), 0, None);
        assert!(blob.payload.is_none());
    }
}

mod equals_array_buffer {
    use super::*;

    #[test]
    fn compares_shared_allocation_identity_not_equal_byte_contents() {
        let buffer = create_array_buffer_from_bytes(Box::new([1, 2]));
        let alias = buffer.clone();
        let equal_bytes = create_array_buffer_from_bytes(Box::new([1, 2]));
        assert!(equals_array_buffer(&buffer, &alias));
        assert!(!equals_array_buffer(&buffer, &equal_bytes));
    }
}

mod get_array_buffer_byte_length {
    use super::*;

    #[test]
    fn remains_fixed_across_storage_aliases() {
        let buffer = create_array_buffer(5);
        let alias = buffer.clone();
        assert_eq!(get_array_buffer_byte_length(&buffer), 5);
        assert_eq!(get_array_buffer_byte_length(&alias), 5);
    }
}

mod get_array_buffer_storage {
    use super::*;

    #[test]
    fn returns_the_same_storage_handle_on_every_call() {
        let buffer = create_array_buffer(1);
        let first = get_array_buffer_storage(&buffer);
        let second = get_array_buffer_storage(&buffer);
        assert!(Arc::ptr_eq(&first, &second));
    }
}

mod get_array_buffer_view_kind_string {
    use super::*;

    #[test]
    fn returns_the_exact_audited_javascript_constructor_names() {
        for (kind, name) in VIEW_KINDS {
            assert_eq!(get_array_buffer_view_kind_string(kind), name);
        }
    }
}

mod parse_array_buffer_view_kind {
    use super::*;

    #[test]
    fn parses_every_exact_audited_javascript_constructor_name() {
        for (kind, name) in VIEW_KINDS {
            assert_eq!(parse_array_buffer_view_kind(name), Some(kind));
        }
    }

    #[test]
    fn rejects_case_changes_and_unobserved_bigint_or_float16_expansions() {
        for name in [
            "uint8array",
            "BigInt64Array",
            "BigUint64Array",
            "Float16Array",
            "",
        ] {
            assert_eq!(parse_array_buffer_view_kind(name), None);
        }
    }
}

use std::sync::Arc;

use flight_snapshot::contract::*;

use crate::support::*;

mod create_snapshot_array {
    use super::*;

    #[test]
    fn creates_a_mutable_array_of_the_items() {
        let value = create_snapshot_array(vec![num(1.0), text("a")]);
        assert!(is_snapshot_array(&value));
        assert!(!is_snapshot_frozen(&value));
        assert_eq!(get_snapshot_length(&value), 2);
    }
}

mod create_snapshot_non_plain {
    use super::*;

    #[test]
    fn keeps_the_kind_and_the_original_value() {
        let inner: flight_entity::Unknown = Some(Arc::new(3_i32));
        let SnapshotValue::NonPlain(value) =
            create_snapshot_non_plain(SnapshotNonPlainKind::Set, inner.clone())
        else {
            panic!("expected a non-plain value");
        };
        assert_eq!(value.kind, SnapshotNonPlainKind::Set);
        assert!(Arc::ptr_eq(
            value.value.as_ref().unwrap(),
            inner.as_ref().unwrap()
        ));
    }
}

mod create_snapshot_object {
    use super::*;

    #[test]
    fn assigns_entries_in_js_key_order() {
        let value = create_snapshot_object(
            [
                ("b", num(1.0)),
                ("2", num(2.0)),
                ("a", num(3.0)),
                ("1", num(4.0)),
                ("b", num(5.0)),
            ]
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect(),
        );
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_snapshot_keys(&mut collected, &value);
                collected
            },
            vec!["1", "2", "b", "a"]
        );
        assert!(to_equal(&get_snapshot_value(&value, "b"), &num(5.0)));
    }
}

mod get_snapshot_keys {
    use super::*;

    #[test]
    fn clears_a_reused_out_for_a_value_without_keys() {
        let mut out = Vec::with_capacity(8);
        out.push("stale".to_string());

        get_snapshot_keys(&mut out, &num(1.0));

        assert!(out.is_empty());
        assert!(out.capacity() >= 8);
    }

    #[test]
    fn lists_indices_own_keys_or_nothing() {
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_snapshot_keys(&mut collected, &nums(&[1.0, 2.0]));
                collected
            },
            vec!["0", "1"]
        );
        assert!(
            {
                let mut collected = Vec::new();
                get_snapshot_keys(&mut collected, &num(1.0));
                collected
            }
            .is_empty()
        );
        assert!(
            {
                let mut collected = Vec::new();
                get_snapshot_keys(
                    &mut collected,
                    &create_snapshot_non_plain(SnapshotNonPlainKind::Map, None),
                );
                collected
            }
            .is_empty()
        );
    }
}

mod get_snapshot_length {
    use super::*;

    #[test]
    fn reports_an_array_length_and_zero_otherwise() {
        assert_eq!(get_snapshot_length(&nums(&[1.0, 2.0, 3.0])), 3);
        assert_eq!(get_snapshot_length(&obj(vec![("length", num(5.0))])), 0);
    }
}

mod get_snapshot_value {
    use super::*;

    #[test]
    fn reads_elements_and_properties_or_undefined() {
        assert!(to_equal(&get_snapshot_value(&nums(&[7.0]), "0"), &num(7.0)));
        assert!(matches!(
            get_snapshot_value(&nums(&[7.0]), "1"),
            SnapshotValue::Undefined
        ));
        assert!(matches!(
            get_snapshot_value(&nums(&[7.0]), "00"),
            SnapshotValue::Undefined
        ));
        assert!(matches!(
            get_snapshot_value(&obj(vec![]), "x"),
            SnapshotValue::Undefined
        ));
    }
}

mod is_snapshot_array {
    use super::*;

    #[test]
    fn is_true_only_for_arrays() {
        assert!(is_snapshot_array(&nums(&[])));
        assert!(!is_snapshot_array(&obj(vec![])));
    }
}

mod is_snapshot_frozen {
    use super::*;

    #[test]
    fn treats_primitives_as_frozen_and_containers_by_flag() {
        assert!(is_snapshot_frozen(&num(1.0)));
        assert!(!is_snapshot_frozen(&obj(vec![])));
        assert!(is_snapshot_frozen(&capture(&obj(vec![]))));
    }
}

mod set_snapshot_length {
    use super::*;

    #[test]
    fn truncates_or_extends_with_undefined() {
        let value = nums(&[1.0, 2.0, 3.0]);
        set_snapshot_length(&value, 1);
        assert!(to_equal(&value, &nums(&[1.0])));
        set_snapshot_length(&value, 2);
        assert!(matches!(
            get_snapshot_value(&value, "1"),
            SnapshotValue::Undefined
        ));
    }
}

mod set_snapshot_value {
    use super::*;

    #[test]
    fn writes_elements_extending_the_array_and_object_properties() {
        let array = nums(&[]);
        set_snapshot_value(&array, "2", num(9.0));
        assert_eq!(get_snapshot_length(&array), 3);
        let object = obj(vec![]);
        set_snapshot_value(&object, "k", text("v"));
        assert!(to_equal(&get_snapshot_value(&object, "k"), &text("v")));
    }

    #[test]
    fn throws_a_type_error_on_a_frozen_container() {
        let frozen = capture(&nums(&[1.0]));
        let written = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            set_snapshot_value(&frozen, "0", num(2.0))
        }));
        let error = written
            .unwrap_err()
            .downcast::<flight_entity::FlightError>()
            .unwrap();
        assert_eq!(error.kind, flight_entity::FlightErrorKind::TypeError);
    }
}

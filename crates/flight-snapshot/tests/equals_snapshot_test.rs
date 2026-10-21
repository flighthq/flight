use flight_snapshot::contract::*;

use crate::support::*;

fn state(x: f64, y: f64, items: &[f64]) -> SnapshotValue {
    return obj(vec![
        ("x", num(x)),
        ("nested", obj(vec![("y", num(y))])),
        ("items", nums(items)),
    ]);
}

fn deep(value: f64) -> SnapshotValue {
    return obj(vec![(
        "level1",
        obj(vec![(
            "level2",
            obj(vec![("level3", obj(vec![("value", num(value))]))]),
        )]),
    )]);
}

mod equals_snapshot {
    use super::*;

    #[test]
    fn is_true_for_deep_equal_snapshots() {
        assert!(equals_snapshot(
            &capture(&state(1.0, 2.0, &[3.0, 4.0])),
            &capture(&state(1.0, 2.0, &[3.0, 4.0]))
        ));
    }

    #[test]
    fn is_false_for_a_differing_leaf_value() {
        let a = capture(&obj(vec![
            ("x", num(1.0)),
            ("nested", obj(vec![("y", num(2.0))])),
        ]));
        let b = capture(&obj(vec![
            ("x", num(1.0)),
            ("nested", obj(vec![("y", num(3.0))])),
        ]));
        assert!(!equals_snapshot(&a, &b));
    }

    #[test]
    fn is_false_for_a_differing_shape() {
        let a = capture(&obj(vec![("x", num(1.0))]));
        let b = capture(&obj(vec![("x", num(1.0)), ("y", num(2.0))]));
        assert!(!equals_snapshot(&a, &b));
    }

    #[test]
    fn is_false_for_arrays_of_differing_length() {
        let a = capture(&obj(vec![("items", nums(&[1.0, 2.0]))]));
        let b = capture(&obj(vec![("items", nums(&[1.0, 2.0, 3.0]))]));
        assert!(!equals_snapshot(&a, &b));
    }

    #[test]
    fn is_true_for_two_empty_objects() {
        assert!(equals_snapshot(
            &capture(&obj(vec![])),
            &capture(&obj(vec![]))
        ));
    }

    #[test]
    fn is_false_for_an_array_compared_to_an_object_with_the_same_indexed_values() {
        let a = capture(&nums(&[1.0, 2.0]));
        let b = capture(&obj(vec![("0", num(1.0)), ("1", num(2.0))]));
        assert!(!equals_snapshot(&a, &b));
    }

    #[test]
    fn is_false_when_objects_differ_three_levels_deep() {
        assert!(!equals_snapshot(&capture(&deep(1.0)), &capture(&deep(2.0))));
    }

    #[test]
    fn is_true_when_objects_are_equal_three_levels_deep() {
        assert!(equals_snapshot(
            &capture(&deep(42.0)),
            &capture(&deep(42.0))
        ));
    }

    #[test]
    fn distinguishes_null_from_a_value_at_the_same_key() {
        let a = capture(&obj(vec![("tag", SnapshotValue::Null)]));
        let b = capture(&obj(vec![("tag", num(0.0))]));
        assert!(!equals_snapshot(&a, &b));
    }

    #[test]
    fn reports_two_nan_leaves_as_unequal_since_triple_equals_says_so() {
        assert!(!equals_snapshot(
            &capture(&obj(vec![("v", num(f64::NAN))])),
            &capture(&obj(vec![("v", num(f64::NAN))]))
        ));
    }

    #[test]
    fn reports_negative_and_positive_zero_as_equal_since_triple_equals_says_so() {
        assert!(equals_snapshot(
            &capture(&obj(vec![("v", num(-0.0))])),
            &capture(&obj(vec![("v", num(0.0))]))
        ));
    }

    #[test]
    fn treats_the_same_snapshot_as_equal_even_holding_a_nan() {
        let a = capture(&obj(vec![("v", num(f64::NAN))]));
        assert!(equals_snapshot(&a, &a.clone()));
    }

    #[test]
    fn compares_object_keys_as_own_keys_regardless_of_order() {
        let a = capture(&obj(vec![("x", num(1.0)), ("y", num(2.0))]));
        let b = capture(&obj(vec![("y", num(2.0)), ("x", num(1.0))]));
        assert!(equals_snapshot(&a, &b));
        let c = capture(&obj(vec![("x", num(1.0)), ("z", num(2.0))]));
        assert!(!equals_snapshot(&a, &c));
    }

    #[test]
    fn compares_distinct_non_plain_values_by_their_empty_own_keys_as_the_source_does() {
        // `Object.keys(new Map())` is empty, so the source's own-key walk reports two distinct Maps
        // equal; the same Map is equal by identity.
        let map = |entries: u8| {
            create_snapshot_non_plain(
                SnapshotNonPlainKind::Map,
                Some(std::sync::Arc::new(entries)),
            )
        };
        assert!(equals_snapshot(
            &capture(&obj(vec![("m", map(1))])),
            &capture(&obj(vec![("m", map(2))]))
        ));
        assert!(!equals_snapshot(
            &capture(&obj(vec![("m", map(1))])),
            &capture(&obj(vec![("m", nums(&[1.0]))]))
        ));
    }
}

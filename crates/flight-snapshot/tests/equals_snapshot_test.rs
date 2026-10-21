use std::collections::BTreeMap;

use flight_snapshot::contract::*;

use crate::support::*;

fn map(entries: &[(&str, f32)]) -> BTreeMap<String, f32> {
    return entries
        .iter()
        .map(|(key, value)| (key.to_string(), *value))
        .collect();
}

mod equals_snapshot {
    use super::*;

    #[test]
    fn is_true_for_deep_equal_snapshots() {
        let a = capture_snapshot(&guards(), &state(1.0, 2.0, &[3.0, 4.0]));
        let b = capture_snapshot(&guards(), &state(1.0, 2.0, &[3.0, 4.0]));
        assert!(equals_snapshot(&a, &b));
    }

    #[test]
    fn is_false_for_a_differing_leaf_value() {
        let a = capture_snapshot(&guards(), &state(1.0, 2.0, &[]));
        let b = capture_snapshot(&guards(), &state(1.0, 3.0, &[]));
        assert!(!equals_snapshot(&a, &b));
    }

    #[test]
    fn is_false_for_a_differing_shape() {
        let a = capture_snapshot(&guards(), &map(&[("x", 1.0)]));
        let b = capture_snapshot(&guards(), &map(&[("x", 1.0), ("y", 2.0)]));
        assert!(!equals_snapshot(&a, &b));
    }

    #[test]
    fn is_false_for_arrays_of_differing_length() {
        let a = capture_snapshot(&guards(), &state(0.0, 0.0, &[1.0, 2.0]));
        let b = capture_snapshot(&guards(), &state(0.0, 0.0, &[1.0, 2.0, 3.0]));
        assert!(!equals_snapshot(&a, &b));
    }

    #[test]
    fn is_true_for_two_empty_objects() {
        assert!(equals_snapshot(
            &capture_snapshot(&guards(), &map(&[])),
            &capture_snapshot(&guards(), &map(&[]))
        ));
    }

    #[test]
    fn compares_three_levels_deep() {
        #[derive(Clone, Debug, PartialEq)]
        struct Level3 {
            value: f32,
        }
        #[derive(Clone, Debug, PartialEq)]
        struct Level2 {
            level3: Level3,
        }
        #[derive(Clone, Debug, PartialEq)]
        struct Level1 {
            level2: Level2,
        }
        let deep = |value: f32| Level1 {
            level2: Level2 {
                level3: Level3 { value },
            },
        };
        let g = guards();
        assert!(!equals_snapshot(
            &capture_snapshot(&g, &deep(1.0)),
            &capture_snapshot(&g, &deep(2.0))
        ));
        assert!(equals_snapshot(
            &capture_snapshot(&g, &deep(42.0)),
            &capture_snapshot(&g, &deep(42.0))
        ));
    }

    #[test]
    fn distinguishes_null_from_a_value_at_the_same_key() {
        let a = capture_snapshot(&guards(), &None::<f32>);
        let b = capture_snapshot(&guards(), &Some(0.0_f32));
        assert!(!equals_snapshot(&a, &b));
    }

    #[test]
    fn reports_two_nan_leaves_as_unequal_since_triple_equals_says_so() {
        let a = capture_snapshot(&guards(), &state(f32::NAN, 0.0, &[]));
        let b = capture_snapshot(&guards(), &state(f32::NAN, 0.0, &[]));
        assert!(!equals_snapshot(&a, &b));
    }

    #[test]
    fn reports_negative_and_positive_zero_as_equal_since_triple_equals_says_so() {
        let a = capture_snapshot(&guards(), &state(-0.0, 0.0, &[]));
        let b = capture_snapshot(&guards(), &state(0.0, 0.0, &[]));
        assert!(equals_snapshot(&a, &b));
    }

    #[test]
    fn treats_the_same_capture_as_equal_even_with_a_nan_leaf() {
        // The source's `a === b` fast path runs before any leaf comparison.
        let a = capture_snapshot(&guards(), &state(f32::NAN, 0.0, &[]));
        assert!(equals_snapshot(&a, &a.clone()));
    }
}

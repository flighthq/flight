use flight_snapshot::contract::*;

use crate::support::*;

fn ids(values: &[&str]) -> SnapshotValue {
    return arr(values
        .iter()
        .map(|id| obj(vec![("id", text(id))]))
        .collect());
}

mod restore_snapshot {
    use super::*;

    #[test]
    fn writes_a_snapshot_back_into_a_live_target() {
        let snapshot = capture(&obj(vec![("x", num(1.0)), ("y", num(2.0))]));
        let target = obj(vec![("x", num(0.0)), ("y", num(0.0))]);
        restore_snapshot(&snapshot, &target);
        assert!(to_equal(
            &target,
            &obj(vec![("x", num(1.0)), ("y", num(2.0))])
        ));
    }

    #[test]
    fn restores_nested_objects_and_arrays() {
        let snapshot = capture(&obj(vec![
            ("nested", obj(vec![("a", num(1.0))])),
            ("items", nums(&[1.0, 2.0, 3.0])),
        ]));
        let target = obj(vec![
            ("nested", obj(vec![("a", num(0.0))])),
            ("items", nums(&[0.0])),
        ]);
        restore_snapshot(&snapshot, &target);
        assert!(to_equal(
            &get(&target, "nested"),
            &obj(vec![("a", num(1.0))])
        ));
        assert!(to_equal(&get(&target, "items"), &nums(&[1.0, 2.0, 3.0])));
    }

    #[test]
    fn is_a_no_op_for_a_primitive_top_level_snapshot() {
        let snapshot = capture(&num(42.0));
        let target = obj(vec![("x", num(1.0))]);
        restore_snapshot(&snapshot, &target);
        assert!(to_equal(&target, &obj(vec![("x", num(1.0))])));
    }

    #[test]
    fn keeps_the_target_object_identity_mutating_in_place() {
        let snapshot = capture(&obj(vec![("x", num(1.0))]));
        let target = obj(vec![("x", num(0.0))]);
        let before = target.clone();
        restore_snapshot(&snapshot, &target);
        assert!(same(&target, &before));
        assert!(to_equal(&get(&target, "x"), &num(1.0)));
    }

    #[test]
    fn reuses_a_compatible_nested_container_rather_than_replacing_it() {
        let snapshot = capture(&obj(vec![("nested", obj(vec![("a", num(1.0))]))]));
        let target = obj(vec![("nested", obj(vec![("a", num(0.0))]))]);
        let nested_before = get(&target, "nested");
        restore_snapshot(&snapshot, &target);
        assert!(same(&get(&target, "nested"), &nested_before));
        assert!(to_equal(&get(&target, "nested.a"), &num(1.0)));
    }

    #[test]
    fn leaves_the_restored_target_mutable_and_unaliased_from_the_frozen_snapshot() {
        let snapshot = capture(&obj(vec![("nested", obj(vec![("a", num(1.0))]))]));
        let target = obj(vec![("nested", obj(vec![("a", num(0.0))]))]);
        restore_snapshot(&snapshot, &target);
        set_snapshot_value(&get(&target, "nested"), "a", num(42.0));
        assert!(to_equal(&get(&target, "nested.a"), &num(42.0)));
        assert!(to_equal(&get(&snapshot, "nested.a"), &num(1.0)));
    }

    #[test]
    fn preserves_extra_keys_in_the_target_that_are_not_in_the_snapshot() {
        let snapshot = capture(&obj(vec![("x", num(10.0))]));
        let target = obj(vec![("x", num(0.0)), ("y", num(5.0)), ("z", num(99.0))]);
        restore_snapshot(&snapshot, &target);
        assert!(to_equal(
            &target,
            &obj(vec![("x", num(10.0)), ("y", num(5.0)), ("z", num(99.0))])
        ));
    }

    #[test]
    fn replaces_a_nested_container_when_the_type_changes_from_object_to_array() {
        let snapshot = capture(&obj(vec![("data", nums(&[1.0, 2.0, 3.0]))]));
        let target = obj(vec![("data", obj(vec![("a", num(1.0))]))]);
        restore_snapshot(&snapshot, &target);
        assert!(to_equal(&get(&target, "data"), &nums(&[1.0, 2.0, 3.0])));
        assert!(is_snapshot_array(&get(&target, "data")));
        assert!(!is_snapshot_frozen(&get(&target, "data")));
    }

    #[test]
    fn replaces_a_nested_container_when_the_type_changes_from_array_to_object() {
        let snapshot = capture(&obj(vec![("data", obj(vec![("a", num(1.0))]))]));
        let target = obj(vec![("data", nums(&[1.0, 2.0, 3.0]))]);
        restore_snapshot(&snapshot, &target);
        assert!(to_equal(&get(&target, "data"), &obj(vec![("a", num(1.0))])));
        assert!(!is_snapshot_array(&get(&target, "data")));
    }

    #[test]
    fn resizes_the_target_array_to_the_snapshot_array_length() {
        let snapshot = capture(&obj(vec![("items", nums(&[1.0, 2.0]))]));
        let target = obj(vec![("items", nums(&[9.0, 9.0, 9.0, 9.0]))]);
        restore_snapshot(&snapshot, &target);
        assert!(to_equal(&get(&target, "items"), &nums(&[1.0, 2.0])));
    }

    #[test]
    fn shrinks_a_nested_array_to_the_snapshot_length() {
        let snapshot = capture(&obj(vec![("items", ids(&["a"]))]));
        let live = obj(vec![("items", ids(&["x", "y", "z"]))]);
        restore_snapshot(&snapshot, &live);
        assert!(to_equal(&get(&live, "items"), &ids(&["a"])));
    }

    #[test]
    fn grows_a_nested_array_to_the_snapshot_length() {
        let snapshot = capture(&obj(vec![("items", ids(&["a", "b", "c"]))]));
        let live = obj(vec![("items", ids(&["x"]))]);
        restore_snapshot(&snapshot, &live);
        assert!(to_equal(&get(&live, "items"), &ids(&["a", "b", "c"])));
    }

    #[test]
    fn round_trips_capture_mutate_restore_without_aliasing_the_snapshot() {
        let live = obj(vec![("hp", num(10.0)), ("items", ids(&["a"]))]);
        let snapshot = capture(&live);
        set_snapshot_value(&live, "hp", num(99.0));
        push(&get(&live, "items"), obj(vec![("id", text("b"))]));
        restore_snapshot(&snapshot, &live);
        assert!(to_equal(
            &live,
            &obj(vec![("hp", num(10.0)), ("items", ids(&["a"]))])
        ));
        set_snapshot_value(&get(&live, "items.0"), "id", text("mutated"));
        assert!(to_equal(&get(&snapshot, "items.0.id"), &text("a")));
    }

    #[test]
    fn throws_a_type_error_when_restoring_into_a_frozen_target() {
        let snapshot = capture(&obj(vec![("x", num(1.0))]));
        let frozen = capture(&obj(vec![("x", num(0.0))]));
        let restored = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            restore_snapshot(&snapshot, &frozen)
        }));
        let error = restored
            .unwrap_err()
            .downcast::<flight_entity::FlightError>()
            .unwrap();
        assert_eq!(error.kind, flight_entity::FlightErrorKind::TypeError);
    }
}

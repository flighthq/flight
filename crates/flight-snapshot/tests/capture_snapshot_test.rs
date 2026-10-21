use std::sync::{Arc, Mutex};

use flight_snapshot::contract::*;

use crate::support::*;

fn sample() -> SnapshotValue {
    return obj(vec![
        ("x", num(1.0)),
        ("nested", obj(vec![("y", num(2.0))])),
        ("items", nums(&[3.0, 4.0])),
    ]);
}

mod capture_snapshot {
    use super::*;

    #[test]
    fn returns_a_deep_equal_copy_of_the_source() {
        let source = sample();
        assert!(to_equal(&capture(&source), &source));
    }

    #[test]
    fn deep_freezes_every_nested_object_and_array() {
        let snapshot = capture(&obj(vec![
            ("x", num(1.0)),
            (
                "nested",
                obj(vec![
                    ("y", num(2.0)),
                    ("points", arr(vec![obj(vec![("z", num(3.0))])])),
                ]),
            ),
        ]));
        assert!(is_snapshot_frozen(&snapshot));
        assert!(is_snapshot_frozen(&get(&snapshot, "nested")));
        assert!(is_snapshot_frozen(&get(&snapshot, "nested.points")));
        assert!(is_snapshot_frozen(&get(&snapshot, "nested.points.0")));
    }

    #[test]
    fn rejects_a_write_into_the_frozen_snapshot() {
        let snapshot = capture(&sample());
        let nested = get(&snapshot, "nested");
        let written = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            set_snapshot_value(&nested, "y", num(99.0))
        }));
        let error = written
            .unwrap_err()
            .downcast::<flight_entity::FlightError>()
            .unwrap();
        assert_eq!(error.kind, flight_entity::FlightErrorKind::TypeError);
        assert!(to_equal(&get(&snapshot, "nested.y"), &num(2.0)));
    }

    #[test]
    fn is_unaffected_by_mutating_the_source_after_capture() {
        let source = sample();
        let snapshot = capture(&source);
        set_snapshot_value(&source, "x", num(99.0));
        set_snapshot_value(&get(&source, "nested"), "y", num(99.0));
        push(&get(&source, "items"), num(5.0));
        assert!(to_equal(&get(&snapshot, "x"), &num(1.0)));
        assert!(to_equal(&get(&snapshot, "nested.y"), &num(2.0)));
        assert!(to_equal(&get(&snapshot, "items"), &nums(&[3.0, 4.0])));
    }

    #[test]
    fn copies_nested_arrays_rather_than_sharing_the_reference() {
        let source = obj(vec![("items", nums(&[1.0, 2.0, 3.0]))]);
        let snapshot = capture(&source);
        assert!(!same(&get(&snapshot, "items"), &get(&source, "items")));
        assert!(to_equal(&get(&snapshot, "items"), &nums(&[1.0, 2.0, 3.0])));
    }

    #[test]
    fn captures_an_empty_object() {
        let snapshot = capture(&obj(vec![]));
        assert!(to_equal(&snapshot, &obj(vec![])));
        assert!(is_snapshot_frozen(&snapshot));
    }

    #[test]
    fn captures_null_and_undefined_leaf_fields() {
        let snapshot = capture(&obj(vec![
            ("a", SnapshotValue::Null),
            ("b", SnapshotValue::Undefined),
            ("c", num(1.0)),
        ]));
        assert!(matches!(get(&snapshot, "a"), SnapshotValue::Null));
        assert!(matches!(get(&snapshot, "b"), SnapshotValue::Undefined));
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_snapshot_keys(&mut collected, &snapshot);
                collected
            },
            vec!["a", "b", "c"]
        );
        assert!(to_equal(&get(&snapshot, "c"), &num(1.0)));
    }

    #[test]
    fn captures_a_self_referencing_object_without_overflowing_the_stack() {
        let node = obj(vec![("name", text("root"))]);
        set_snapshot_value(&node, "self", node.clone());
        let snapshot = capture(&node);
        assert!(is_snapshot_frozen(&snapshot));
        assert!(same(&get(&snapshot, "self"), &snapshot));
        assert!(!same(&snapshot, &node));
    }

    #[test]
    fn captures_a_mutually_referencing_pair() {
        let a = obj(vec![("tag", text("a"))]);
        let b = obj(vec![("tag", text("b")), ("a", a.clone())]);
        set_snapshot_value(&a, "b", b);
        let snapshot = capture(&a);
        assert!(is_snapshot_frozen(&get(&snapshot, "b")));
        assert!(same(&get(&snapshot, "b.a"), &snapshot));
    }

    #[test]
    fn freezes_a_shared_subtree_reached_by_two_paths() {
        let shared = obj(vec![("v", num(1.0))]);
        let snapshot = capture(&obj(vec![
            ("left", shared.clone()),
            ("right", shared.clone()),
        ]));
        assert!(same(&get(&snapshot, "left"), &get(&snapshot, "right")));
        assert!(!same(&get(&snapshot, "left"), &shared));
        assert!(is_snapshot_frozen(&get(&snapshot, "left")));
    }

    #[test]
    fn keeps_a_non_plain_value_as_its_original_opaque_value() {
        let inner: flight_entity::Unknown = Some(Arc::new(7_u8));
        let source = obj(vec![(
            "when",
            create_snapshot_non_plain(SnapshotNonPlainKind::Date, inner.clone()),
        )]);
        let SnapshotValue::NonPlain(captured) = get(&capture(&source), "when") else {
            panic!("expected a non-plain value");
        };
        assert_eq!(captured.kind, SnapshotNonPlainKind::Date);
        assert!(Arc::ptr_eq(
            captured.value.as_ref().unwrap(),
            inner.as_ref().unwrap()
        ));
    }
}

mod create_snapshot_guard_state {
    use super::*;

    #[test]
    fn starts_with_no_guard_installed() {
        assert!(create_snapshot_guard_state().capture_guard.is_none());
    }
}

mod set_snapshot_capture_guard {
    use super::*;

    fn recording(seen: &Arc<Mutex<Vec<SnapshotValue>>>) -> SnapshotCaptureGuard {
        let seen = seen.clone();
        return Arc::new(move |source: &SnapshotValue| seen.lock().unwrap().push(source.clone()));
    }

    #[test]
    fn passes_the_capture_source_to_the_installed_guard() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let mut guards = guards();
        set_snapshot_capture_guard(&mut guards, Some(recording(&seen)));
        let source = obj(vec![("hp", num(1.0))]);
        capture_snapshot(&guards, &source);
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert!(same(&seen[0], &source));
    }

    #[test]
    fn runs_the_guard_against_the_source_rather_than_the_frozen_clone() {
        let was_frozen = Arc::new(Mutex::new(true));
        let flag = was_frozen.clone();
        let mut guards = guards();
        set_snapshot_capture_guard(
            &mut guards,
            Some(Arc::new(move |source: &SnapshotValue| {
                *flag.lock().unwrap() = is_snapshot_frozen(source)
            })),
        );
        capture_snapshot(&guards, &obj(vec![("hp", num(1.0))]));
        assert!(!*was_frozen.lock().unwrap());
    }

    #[test]
    fn stops_calling_the_guard_once_cleared_with_null() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let mut guards = guards();
        set_snapshot_capture_guard(&mut guards, Some(recording(&seen)));
        capture_snapshot(&guards, &obj(vec![("a", num(1.0))]));
        set_snapshot_capture_guard(&mut guards, None);
        capture_snapshot(&guards, &obj(vec![("a", num(2.0))]));
        assert_eq!(seen.lock().unwrap().len(), 1);
    }
}

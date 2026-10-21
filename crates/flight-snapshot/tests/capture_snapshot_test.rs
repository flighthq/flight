use std::any::Any;
use std::sync::{Arc, Mutex};

use flight_snapshot::contract::*;

use crate::support::*;

mod capture_snapshot {
    use super::*;

    #[test]
    fn returns_a_deep_equal_copy_of_the_source() {
        let source = state(1.0, 2.0, &[3.0, 4.0]);
        let snapshot = capture_snapshot(&guards(), &source);
        assert_eq!(*snapshot, source);
    }

    #[test]
    fn is_unaffected_by_mutating_the_source_after_capture() {
        let mut source = state(1.0, 2.0, &[3.0, 4.0]);
        let snapshot = capture_snapshot(&guards(), &source);
        source.x = 99.0;
        source.nested.y = 99.0;
        source.items.push(5.0);
        assert_eq!(snapshot.x, 1.0);
        assert_eq!(snapshot.nested.y, 2.0);
        assert_eq!(snapshot.items, vec![3.0, 4.0]);
    }

    #[test]
    fn copies_nested_arrays_rather_than_sharing_the_reference() {
        let source = state(0.0, 0.0, &[1.0, 2.0, 3.0]);
        let snapshot = capture_snapshot(&guards(), &source);
        assert_ne!(snapshot.items.as_ptr(), source.items.as_ptr());
        assert_eq!(snapshot.items, vec![1.0, 2.0, 3.0]);
    }

    #[test]
    fn captures_an_empty_object() {
        #[derive(Clone, Debug, PartialEq)]
        struct Empty {}
        let snapshot = capture_snapshot(&guards(), &Empty {});
        assert_eq!(*snapshot, Empty {});
    }

    #[test]
    fn captures_null_and_undefined_leaf_fields() {
        // TS `{ a: null, b: undefined, c: 1 }`: `None` inside is null; the outer `None` is undefined.
        #[derive(Clone, Debug, PartialEq)]
        struct Leaves {
            a: Option<Option<f32>>,
            b: Option<Option<f32>>,
            c: f32,
        }
        let snapshot = capture_snapshot(
            &guards(),
            &Leaves {
                a: Some(None),
                b: None,
                c: 1.0,
            },
        );
        assert_eq!(snapshot.a, Some(None));
        assert_eq!(snapshot.b, None);
        assert_eq!(snapshot.c, 1.0);
    }

    #[test]
    fn exposes_one_shared_immutable_capture() {
        // DeepReadonly is type-level here: `Snapshot<T>` derefs to `&T` only. A clone of the snapshot
        // is the same capture, and no clone can obtain write access while another exists.
        let mut snapshot = capture_snapshot(&guards(), &state(1.0, 2.0, &[]));
        let shared = snapshot.clone();
        assert!(Arc::ptr_eq(&snapshot, &shared));
        assert!(Arc::get_mut(&mut snapshot).is_none());
    }

    #[test]
    fn keeps_a_shared_immutable_subtree_shared() {
        // The source's diamond case (`{ left: shared, right: shared }` keeps `left === right`), for an
        // immutable `Arc` subtree; a shared mutable `Ref` subtree is outside the typed contract.
        #[derive(Clone, Debug, PartialEq)]
        struct Diamond {
            left: Arc<Nested>,
            right: Arc<Nested>,
        }
        let shared = Arc::new(Nested { y: 1.0 });
        let snapshot = capture_snapshot(
            &guards(),
            &Diamond {
                left: shared.clone(),
                right: shared,
            },
        );
        assert!(Arc::ptr_eq(&snapshot.left, &snapshot.right));
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

    fn recording(seen: &Arc<Mutex<Vec<usize>>>) -> SnapshotCaptureGuard {
        let seen = seen.clone();
        return Arc::new(move |source: &dyn Any| {
            let source = source.downcast_ref::<State>().expect("the capture source");
            seen.lock().unwrap().push(source as *const State as usize);
        });
    }

    #[test]
    fn passes_the_capture_source_to_the_installed_guard() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let mut guards = guards();
        set_snapshot_capture_guard(&mut guards, Some(recording(&seen)));
        let source = state(1.0, 0.0, &[]);
        capture_snapshot(&guards, &source);
        assert_eq!(
            *seen.lock().unwrap(),
            vec![&source as *const State as usize]
        );
    }

    #[test]
    fn runs_the_guard_against_the_source_rather_than_the_clone() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let mut guards = guards();
        set_snapshot_capture_guard(&mut guards, Some(recording(&seen)));
        let source = state(1.0, 0.0, &[]);
        let snapshot = capture_snapshot(&guards, &source);
        assert_ne!(seen.lock().unwrap()[0], Arc::as_ptr(&snapshot) as usize);
    }

    #[test]
    fn stops_calling_the_guard_once_cleared_with_null() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let mut guards = guards();
        set_snapshot_capture_guard(&mut guards, Some(recording(&seen)));
        capture_snapshot(&guards, &state(1.0, 0.0, &[]));
        set_snapshot_capture_guard(&mut guards, None);
        capture_snapshot(&guards, &state(2.0, 0.0, &[]));
        assert_eq!(seen.lock().unwrap().len(), 1);
    }
}

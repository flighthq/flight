use flight_snapshot::contract::*;

use crate::support::*;

#[derive(Clone, Debug, PartialEq)]
struct Item {
    id: String,
}

#[derive(Clone, Debug, PartialEq)]
struct Inventory {
    hp: f32,
    items: Vec<Item>,
}

fn items(ids: &[&str]) -> Vec<Item> {
    return ids.iter().map(|id| Item { id: id.to_string() }).collect();
}

mod restore_snapshot {
    use super::*;

    #[test]
    fn writes_a_snapshot_back_into_a_live_target() {
        let snapshot = capture_snapshot(&guards(), &Point { x: 1.0, y: 2.0 });
        let mut target = Point { x: 0.0, y: 0.0 };
        restore_snapshot(&snapshot, &mut target);
        assert_eq!(target, Point { x: 1.0, y: 2.0 });
    }

    #[test]
    fn restores_nested_objects_and_arrays() {
        let snapshot = capture_snapshot(&guards(), &state(0.0, 1.0, &[1.0, 2.0, 3.0]));
        let mut target = state(0.0, 0.0, &[0.0]);
        restore_snapshot(&snapshot, &mut target);
        assert_eq!(target.nested, Nested { y: 1.0 });
        assert_eq!(target.items, vec![1.0, 2.0, 3.0]);
    }

    #[test]
    fn keeps_the_target_identity_mutating_in_place() {
        let snapshot = capture_snapshot(&guards(), &Point { x: 1.0, y: 0.0 });
        let mut target = Point { x: 0.0, y: 0.0 };
        let before = &target as *const Point;
        restore_snapshot(&snapshot, &mut target);
        assert_eq!(&target as *const Point, before);
        assert_eq!(target.x, 1.0);
    }

    #[test]
    fn reuses_a_compatible_container_rather_than_replacing_it() {
        // `Vec::clone_from` keeps the target buffer when its capacity suffices, as the source keeps a
        // compatible container's identity.
        let snapshot = capture_snapshot(&guards(), &vec![1.0_f32, 2.0]);
        let mut target = vec![0.0_f32, 0.0, 0.0];
        let buffer = target.as_ptr();
        restore_snapshot(&snapshot, &mut target);
        assert_eq!(target.as_ptr(), buffer);
        assert_eq!(target, vec![1.0, 2.0]);
    }

    #[test]
    fn replaces_containers_nested_in_a_derived_clone_struct() {
        // DIVERGENCE (reported): a derived `Clone` has no field-wise `clone_from`, so a struct restores
        // by whole assignment and its nested containers are fresh buffers, where the source reuses
        // them. A type that needs reuse implements `clone_from` field by field.
        let snapshot = capture_snapshot(&guards(), &state(0.0, 1.0, &[1.0, 2.0]));
        let mut target = state(0.0, 0.0, &[0.0, 0.0, 0.0]);
        let buffer = target.items.as_ptr();
        restore_snapshot(&snapshot, &mut target);
        assert_ne!(target.items.as_ptr(), buffer);
        assert_eq!(target, *snapshot);
    }

    #[test]
    fn leaves_the_restored_target_mutable_and_unaliased_from_the_snapshot() {
        let snapshot = capture_snapshot(&guards(), &state(0.0, 1.0, &[1.0]));
        let mut target = state(0.0, 0.0, &[]);
        restore_snapshot(&snapshot, &mut target);
        target.nested.y = 42.0;
        target.items[0] = 42.0;
        assert_eq!(target.nested.y, 42.0);
        assert_eq!(snapshot.nested.y, 1.0);
        assert_eq!(snapshot.items, vec![1.0]);
        assert_ne!(target.items.as_ptr(), snapshot.items.as_ptr());
    }

    #[test]
    fn resizes_the_target_array_to_the_snapshot_array_length() {
        let snapshot = capture_snapshot(&guards(), &state(0.0, 0.0, &[1.0, 2.0]));
        let mut target = state(0.0, 0.0, &[9.0, 9.0, 9.0, 9.0]);
        restore_snapshot(&snapshot, &mut target);
        assert_eq!(target.items, vec![1.0, 2.0]);
    }

    #[test]
    fn shrinks_a_nested_array_to_the_snapshot_length() {
        let snapshot = capture_snapshot(&guards(), &items(&["a"]));
        let mut live = items(&["x", "y", "z"]);
        restore_snapshot(&snapshot, &mut live);
        assert_eq!(live, items(&["a"]));
    }

    #[test]
    fn grows_a_nested_array_to_the_snapshot_length() {
        let snapshot = capture_snapshot(&guards(), &items(&["a", "b", "c"]));
        let mut live = items(&["x"]);
        restore_snapshot(&snapshot, &mut live);
        assert_eq!(live, items(&["a", "b", "c"]));
    }

    #[test]
    fn round_trips_capture_mutate_restore_without_aliasing_the_snapshot() {
        let mut live = Inventory {
            hp: 10.0,
            items: items(&["a"]),
        };
        let snapshot = capture_snapshot(&guards(), &live);
        live.hp = 99.0;
        live.items.push(Item {
            id: "b".to_string(),
        });
        restore_snapshot(&snapshot, &mut live);
        assert_eq!(
            live,
            Inventory {
                hp: 10.0,
                items: items(&["a"]),
            }
        );
        live.items[0].id = "mutated".to_string();
        assert_eq!(snapshot.items[0].id, "a");
    }
}

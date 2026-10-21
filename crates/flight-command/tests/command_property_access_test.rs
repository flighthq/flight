use std::sync::Arc;

use flight_command::contract::*;
use flight_entity::Unknown;

use crate::support::*;

fn value(number: i32) -> Unknown {
    return Some(Arc::new(number));
}

mod create_command_property_access {
    use super::*;

    #[test]
    fn starts_empty() {
        let access = create_command_property_access();
        assert!(get_command_property_access(&access, "test.CommandTarget", "x").is_none());
    }
}

mod get_command_property_access {
    use super::*;

    #[test]
    fn finds_the_registered_entry_and_none_for_another_property() {
        let store = property_store();
        let access = property_access("test.CommandTarget", "x", &store);
        assert!(get_command_property_access(&access, "test.CommandTarget", "x").is_some());
        assert!(get_command_property_access(&access, "test.CommandTarget", "y").is_none());
        assert!(get_command_property_access(&access, "other.Kind", "x").is_none());
    }
}

mod read_command_property {
    use super::*;

    #[test]
    fn returns_none_when_no_accessor_is_registered_and_the_stored_value_otherwise() {
        let store = property_store();
        let empty = create_command_property_access();
        let target = node();
        store_set(&store, &target, "x", Some(value(5)));
        assert!(read_command_property(&empty, &target, "x").is_none());
        let access = property_access("test.CommandTarget", "x", &store);
        assert_eq!(
            read_command_property(&access, &target, "x")
                .unwrap()
                .as_ref()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&5)
        );
    }
}

mod register_command_property_access {
    use super::*;

    #[test]
    fn replaces_with_the_latest_accessor_for_the_same_kind_and_property() {
        let first_store = property_store();
        let second_store = property_store();
        let access = create_command_property_access();
        let first = get_command_property_access(
            &property_access("test.CommandTarget", "x", &first_store),
            "test.CommandTarget",
            "x",
        )
        .expect("first accessor");
        let second = get_command_property_access(
            &property_access("test.CommandTarget", "x", &second_store),
            "test.CommandTarget",
            "x",
        )
        .expect("second accessor");
        register_command_property_access(&access, "test.CommandTarget", "x", first);
        register_command_property_access(&access, "test.CommandTarget", "x", second);
        let target = node();
        store_set(&second_store, &target, "x", Some(value(9)));
        let resolved = get_command_property_access(&access, "test.CommandTarget", "x")
            .expect("accessor resolves");
        assert_eq!(
            (resolved.read)(&target)
                .unwrap()
                .as_ref()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&9)
        );
    }
}

mod write_command_property {
    use super::*;

    #[test]
    fn writes_through_the_registered_accessor_and_no_ops_without_one() {
        let store = property_store();
        let empty = create_command_property_access();
        let target = node();
        store_set(&store, &target, "x", Some(value(5)));
        write_command_property(&empty, &target, "x", Some(value(100)));
        assert_eq!(
            store_get(&store, &target, "x")
                .unwrap()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&5)
        );
        let access = property_access("test.CommandTarget", "x", &store);
        write_command_property(&access, &target, "x", Some(value(100)));
        assert_eq!(
            store_get(&store, &target, "x")
                .unwrap()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&100)
        );
    }
}

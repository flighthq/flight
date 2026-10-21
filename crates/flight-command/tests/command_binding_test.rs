use std::sync::{Arc, Mutex};

use flight_command::contract::*;
use flight_node::contract::{add_node_child, get_node_child_count, get_node_child_index};

use crate::support::*;

mod create_command_binding_table {
    use super::*;

    #[test]
    fn starts_empty_so_nothing_dispatches_until_registered() {
        let history = create_command_history(None);
        history.write().unwrap().bindings = create_command_binding_table();
        assert!(!has_command_binding(
            &history,
            SET_NODE_PROPERTY_COMMAND_KIND
        ));
    }
}

mod get_command_binding {
    use super::*;

    #[test]
    fn returns_none_for_an_unregistered_kind_rather_than_throwing() {
        assert!(get_command_binding(&create_command_history(None), "acme.Nothing").is_none());
    }
}

mod has_command_binding {
    use super::*;

    #[test]
    fn reports_a_registered_kind() {
        let history = create_command_history(None);
        let access = create_command_property_access();
        register_default_command_bindings(&history, &access);
        assert!(has_command_binding(&history, ADD_NODE_CHILD_COMMAND_KIND));
    }
}

mod register_command_binding {
    use super::*;

    #[test]
    fn accepts_a_caller_defined_vendor_prefixed_kind() {
        let history = create_command_history(None);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let executed = seen.clone();
        let undone = seen.clone();
        let binding = Arc::new(CommandBinding {
            execute: Arc::new(move |_command: &dyn Command| {
                executed.lock().unwrap().push("execute")
            }),
            merge: None,
            undo: Arc::new(move |_command: &dyn Command| undone.lock().unwrap().push("undo")),
        });
        register_command_binding(&history, "acme.Custom", binding);
        assert!(execute_command(&history, &command("acme.Custom", "Custom")));
        assert!(undo_command(&history));
        assert_eq!(*seen.lock().unwrap(), vec!["execute", "undo"]);
    }

    #[test]
    fn overrides_an_earlier_binding_for_the_same_kind() {
        let history = create_command_history(None);
        let first = inert_binding();
        let second = inert_binding();
        register_command_binding(&history, "acme.Custom", first);
        register_command_binding(&history, "acme.Custom", second.clone());
        assert!(Arc::ptr_eq(
            &get_command_binding(&history, "acme.Custom").expect("binding"),
            &second
        ));
    }
}

mod register_default_command_bindings {
    use super::*;

    #[test]
    fn applies_and_reverses_an_added_child_restoring_membership() {
        let history = history_with_defaults();
        let parent = node();
        let child = node();
        assert!(execute_command(
            &history,
            &erased(create_add_node_child_command("Add", &parent, &child, None))
        ));
        assert_eq!(get_node_child_count(&parent), 1);
        assert!(undo_command(&history));
        assert_eq!(get_node_child_count(&parent), 0);
    }

    #[test]
    fn restores_a_removed_child_to_the_index_it_came_from() {
        let history = history_with_defaults();
        let parent = node();
        let first = node();
        let second = node();
        let third = node();
        add_node_child(&parent, &first);
        add_node_child(&parent, &second);
        add_node_child(&parent, &third);
        assert!(execute_command(
            &history,
            &erased(create_remove_node_child_command("Delete", &parent, &second))
        ));
        assert_eq!(get_node_child_count(&parent), 2);
        assert!(undo_command(&history));
        assert_eq!(get_node_child_index(&parent, &second), 1);
    }

    #[test]
    fn applies_and_reverses_a_reorder() {
        let history = history_with_defaults();
        let parent = node();
        let first = node();
        let second = node();
        add_node_child(&parent, &first);
        add_node_child(&parent, &second);
        assert!(execute_command(
            &history,
            &erased(create_reorder_node_child_command(
                "Front", &parent, &second, 0
            ))
        ));
        assert_eq!(get_node_child_index(&parent, &second), 0);
        assert!(undo_command(&history));
        assert_eq!(get_node_child_index(&parent, &second), 1);
    }

    #[test]
    fn runs_composite_children_in_order_and_reverses_them_in_reverse_order() {
        let history = history_with_defaults();
        let parent = node();
        let child = node();
        let grandchild = node();
        assert!(execute_command(
            &history,
            &erased(create_composite_command(
                "Add two",
                &[
                    create_add_node_child_command("Add child", &parent, &child, None),
                    create_add_node_child_command("Add grandchild", &child, &grandchild, None),
                ]
            ))
        ));
        assert_eq!(get_node_child_count(&parent), 1);
        assert_eq!(get_node_child_count(&child), 1);
        assert!(undo_command(&history));
        assert_eq!(get_node_child_count(&parent), 0);
        assert_eq!(get_node_child_count(&child), 0);
    }
}

mod set_node_property_binding {
    use std::sync::Arc;

    use flight_entity::{Ref, Unknown};

    use super::*;

    fn value(number: i32) -> Unknown {
        return Some(Arc::new(number));
    }

    fn setup() -> (
        TestPropertyStore,
        CommandPropertyAccessRef,
        Ref<CommandHistory>,
    ) {
        let store = property_store();
        let access = property_access("test.CommandTarget", "x", &store);
        register_property(&access, "test.CommandTarget", "y", &store);
        let history = history_with_property_access(&access);
        return (store, access, history);
    }

    #[test]
    fn applies_and_reverses_a_property_write() {
        let (store, access, history) = setup();
        let target = node();
        store_set(&store, &target, "x", Some(value(5)));
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Move",
                &target,
                "x",
                Some(value(100)),
                None,
                None,
                &access
            ))
        ));
        assert_eq!(
            store_get(&store, &target, "x")
                .unwrap()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&100)
        );
        assert!(undo_command(&history));
        assert_eq!(
            store_get(&store, &target, "x")
                .unwrap()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&5)
        );
    }

    #[test]
    fn runs_composite_children_in_order_and_reverses_them_in_reverse_order() {
        // Adapted from the source's undefined-before case: an absent `before` (TS undefined) is
        // non-representable as a write under the typed carrier, so the representable form captures 0.
        let (store, access, history) = setup();
        let parent = node();
        let child = node();
        store_set(&store, &child, "x", Some(value(0)));
        assert!(execute_command(
            &history,
            &erased(create_composite_command(
                "Add and move",
                &[
                    create_add_node_child_command("Add", &parent, &child, None),
                    create_set_node_property_command(
                        "Move",
                        &child,
                        "x",
                        Some(value(10)),
                        None,
                        None,
                        &access
                    ),
                ]
            ))
        ));
        assert_eq!(flight_node::contract::get_node_child_count(&parent), 1);
        assert_eq!(
            store_get(&store, &child, "x")
                .unwrap()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&10)
        );
        assert!(undo_command(&history));
        assert_eq!(flight_node::contract::get_node_child_count(&parent), 0);
        assert_eq!(
            store_get(&store, &child, "x")
                .unwrap()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&0)
        );
    }

    #[test]
    fn merges_same_target_same_property_writes_inside_the_window_into_one_reversible_entry() {
        let (store, access, history) = setup();
        let target = node();
        store_set(&store, &target, "x", Some(value(0)));
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Drag",
                &target,
                "x",
                Some(value(10)),
                Some(300.0),
                Some(0.0),
                &access
            ))
        ));
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Drag",
                &target,
                "x",
                Some(value(20)),
                Some(300.0),
                Some(100.0),
                &access
            ))
        ));
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Drag",
                &target,
                "x",
                Some(value(30)),
                Some(300.0),
                Some(200.0),
                &access
            ))
        ));
        let mut entries = Vec::new();
        get_command_history_entries(&mut entries, &history);
        assert_eq!(entries.len(), 1);
        assert_eq!(
            store_get(&store, &target, "x")
                .unwrap()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&30)
        );
        assert!(undo_command(&history));
        assert_eq!(
            store_get(&store, &target, "x")
                .unwrap()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&0)
        );
    }

    #[test]
    fn does_not_merge_once_the_window_has_elapsed() {
        let (store, access, history) = setup();
        let target = node();
        store_set(&store, &target, "x", Some(value(0)));
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Drag",
                &target,
                "x",
                Some(value(10)),
                Some(300.0),
                Some(0.0),
                &access
            ))
        ));
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Drag",
                &target,
                "x",
                Some(value(20)),
                Some(300.0),
                Some(1000.0),
                &access
            ))
        ));
        let mut entries = Vec::new();
        get_command_history_entries(&mut entries, &history);
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn does_not_merge_writes_to_a_different_property_of_the_same_node() {
        let (_store, access, history) = setup();
        let target = node();
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Move",
                &target,
                "x",
                Some(value(10)),
                Some(300.0),
                Some(0.0),
                &access
            ))
        ));
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Move",
                &target,
                "y",
                Some(value(20)),
                Some(300.0),
                Some(10.0),
                &access
            ))
        ));
        let mut entries = Vec::new();
        get_command_history_entries(&mut entries, &history);
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn does_not_merge_when_no_window_is_given_which_is_the_default() {
        let (_store, access, history) = setup();
        let target = node();
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Move",
                &target,
                "x",
                Some(value(10)),
                None,
                None,
                &access
            ))
        ));
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Move",
                &target,
                "x",
                Some(value(20)),
                None,
                None,
                &access
            ))
        ));
        let mut entries = Vec::new();
        get_command_history_entries(&mut entries, &history);
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn keeps_the_original_before_value_in_the_merged_command() {
        let (store, access, history) = setup();
        let target = node();
        store_set(&store, &target, "x", Some(value(7)));
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Drag",
                &target,
                "x",
                Some(value(10)),
                Some(300.0),
                Some(0.0),
                &access
            ))
        ));
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Drag",
                &target,
                "x",
                Some(value(20)),
                Some(300.0),
                Some(50.0),
                &access
            ))
        ));
        let mut entries = Vec::new();
        get_command_history_entries(&mut entries, &history);
        let merged = entries[0]
            .read()
            .unwrap()
            .as_any()
            .downcast_ref::<SetNodePropertyCommand>()
            .expect("merged set-property command")
            .entries[0]
            .clone();
        assert_eq!(
            merged
                .before
                .as_ref()
                .unwrap()
                .as_ref()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&7)
        );
        assert_eq!(
            merged
                .after
                .as_ref()
                .unwrap()
                .as_ref()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&20)
        );
    }

    #[test]
    fn treats_an_absent_accessor_write_as_a_no_op() {
        let store = property_store();
        let empty = create_command_property_access();
        let history = history_with_property_access(&empty);
        let target = node();
        store_set(&store, &target, "x", Some(value(5)));
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Move",
                &target,
                "x",
                Some(value(100)),
                None,
                None,
                &empty
            ))
        ));
        assert_eq!(
            store_get(&store, &target, "x")
                .unwrap()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&5)
        );
    }
}

mod set_node_property_undefined_carrier {
    use std::sync::Arc;

    use flight_entity::{Ref, Unknown};

    use super::*;

    fn value(number: i32) -> Unknown {
        return Some(Arc::new(number));
    }

    fn setup() -> (
        TestPropertyStore,
        CommandPropertyAccessRef,
        Ref<CommandHistory>,
    ) {
        let store = property_store();
        let access = property_access("test.CommandTarget", "x", &store);
        let history = history_with_property_access(&access);
        return (store, access, history);
    }

    fn entries_of(command: &CommandRef) -> Vec<CommandPropertyEntry> {
        return command
            .read()
            .unwrap()
            .as_any()
            .downcast_ref::<SetNodePropertyCommand>()
            .expect("set-property command")
            .entries
            .clone();
    }

    #[test]
    fn captures_an_absent_property_as_undefined_and_undo_restores_undefined_not_null() {
        let (store, access, history) = setup();
        let target = node();
        let command = erased(create_set_node_property_command(
            "Move",
            &target,
            "x",
            Some(value(100)),
            None,
            None,
            &access,
        ));
        assert!(entries_of(&command)[0].before.is_none());
        assert!(execute_command(&history, &command));
        assert_eq!(
            store_get(&store, &target, "x")
                .expect("written value")
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&100)
        );
        assert!(undo_command(&history));
        assert!(store_get(&store, &target, "x").is_none());
    }

    #[test]
    fn captures_an_explicit_null_before_and_undo_restores_null() {
        let (store, access, history) = setup();
        let target = node();
        store_set(&store, &target, "x", Some(Unknown::None));
        let command = erased(create_set_node_property_command(
            "Move",
            &target,
            "x",
            Some(value(100)),
            None,
            None,
            &access,
        ));
        let before = entries_of(&command)[0].before.clone();
        assert!(matches!(before, Some(None)));
        assert!(execute_command(&history, &command));
        assert!(undo_command(&history));
        assert!(matches!(store_get(&store, &target, "x"), Some(None)));
    }

    #[test]
    fn applies_and_undoes_an_undefined_after_value() {
        let (store, access, history) = setup();
        let target = node();
        store_set(&store, &target, "x", Some(value(5)));
        let command = erased(create_set_node_property_command(
            "Move", &target, "x", None, None, None, &access,
        ));
        assert!(entries_of(&command)[0].after.is_none());
        assert!(execute_command(&history, &command));
        assert!(store_get(&store, &target, "x").is_none());
        assert!(undo_command(&history));
        assert_eq!(
            store_get(&store, &target, "x")
                .expect("restored value")
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&5)
        );
    }

    #[test]
    fn applies_and_undoes_an_explicit_null_after_value() {
        let (store, access, history) = setup();
        let target = node();
        store_set(&store, &target, "x", Some(value(5)));
        let command = erased(create_set_node_property_command(
            "Move",
            &target,
            "x",
            Some(Unknown::None),
            None,
            None,
            &access,
        ));
        assert!(matches!(entries_of(&command)[0].after, Some(None)));
        assert!(execute_command(&history, &command));
        assert!(matches!(store_get(&store, &target, "x"), Some(None)));
        assert!(undo_command(&history));
        assert_eq!(
            store_get(&store, &target, "x")
                .expect("restored value")
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&5)
        );
    }

    #[test]
    fn redo_reapplies_undefined_and_null_exactly() {
        let (store, access, history) = setup();
        let target = node();
        store_set(&store, &target, "x", Some(value(5)));
        let undefined = erased(create_set_node_property_command(
            "Move", &target, "x", None, None, None, &access,
        ));
        assert!(execute_command(&history, &undefined));
        assert!(undo_command(&history));
        assert!(redo_command(&history));
        assert!(store_get(&store, &target, "x").is_none());

        let null = erased(create_set_node_property_command(
            "Move",
            &target,
            "x",
            Some(Unknown::None),
            None,
            None,
            &access,
        ));
        assert!(execute_command(&history, &null));
        assert!(undo_command(&history));
        assert!(redo_command(&history));
        assert!(matches!(store_get(&store, &target, "x"), Some(None)));
    }

    #[test]
    fn resolves_a_late_registered_accessor_at_call_time() {
        let store = property_store();
        let access = create_command_property_access();
        let history = history_with_property_access(&access);
        let target = node();
        store_set(&store, &target, "x", Some(value(5)));
        let command = erased(create_set_node_property_command(
            "Move",
            &target,
            "x",
            Some(value(100)),
            None,
            None,
            &access,
        ));
        assert!(entries_of(&command)[0].before.is_none());
        register_property(&access, "test.CommandTarget", "x", &store);
        assert!(execute_command(&history, &command));
        assert_eq!(
            store_get(&store, &target, "x")
                .expect("late accessor write")
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&100)
        );
        assert!(undo_command(&history));
        assert!(store_get(&store, &target, "x").is_none());
    }

    #[test]
    fn retains_the_original_target_and_command_identity() {
        let (_store, access, history) = setup();
        let target = node();
        let command = erased(create_set_node_property_command(
            "Move",
            &target,
            "x",
            Some(value(100)),
            None,
            None,
            &access,
        ));
        assert!(Arc::ptr_eq(&entries_of(&command)[0].target, &target));
        assert!(execute_command(&history, &command));
        let mut entries = Vec::new();
        get_command_history_entries(&mut entries, &history);
        assert!(Arc::ptr_eq(&entries[0], &command));
    }
}

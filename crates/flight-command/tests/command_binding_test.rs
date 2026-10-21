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
        register_default_command_bindings(&history);
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

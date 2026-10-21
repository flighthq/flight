use std::sync::{Arc, Mutex};

use flight_command::contract::*;
use flight_entity::allocate_entity;
use flight_node::contract::get_node_child_count;
use flight_signals::connect_signal;

use crate::support::*;

fn counting(max_size: Option<i32>) -> flight_entity::Ref<CommandHistory> {
    let history = create_command_history(max_size);
    register_command_binding(&history, "test.Counter", inert_binding());
    return history;
}

mod can_redo_command {
    use super::*;

    #[test]
    fn is_false_until_something_has_been_undone() {
        let history = counting(None);
        assert!(!can_redo_command(&history));
        assert!(execute_command(&history, &command("test.Counter", "One")));
        assert!(!can_redo_command(&history));
        assert!(undo_command(&history));
        assert!(can_redo_command(&history));
    }
}

mod can_undo_command {
    use super::*;

    #[test]
    fn is_false_on_an_empty_history_and_true_once_something_is_applied() {
        let history = counting(None);
        assert!(!can_undo_command(&history));
        assert!(execute_command(&history, &command("test.Counter", "One")));
        assert!(can_undo_command(&history));
    }
}

mod clear_command_history {
    use super::*;

    #[test]
    fn drops_entries_without_undoing_them() {
        let history = history_with_defaults();
        let parent = node();
        assert!(execute_command(
            &history,
            &erased(create_add_node_child_command("Add", &parent, &node(), None))
        ));
        clear_command_history(&history);
        assert_eq!(get_command_history_entries(&history).len(), 0);
        assert_eq!(get_command_history_index(&history), 0);
        assert_eq!(get_node_child_count(&parent), 1);
    }

    #[test]
    fn emits_nothing_when_there_was_nothing_to_forget() {
        let history = counting(None);
        let changes = Arc::new(Mutex::new(0));
        let counter = changes.clone();
        let _slot = connect_signal(
            &enable_command_history_signals(&history),
            Arc::new(move |_value: &()| *counter.lock().unwrap() += 1),
            None,
        );
        clear_command_history(&history);
        assert_eq!(*changes.lock().unwrap(), 0);
    }
}

mod create_command_history {
    use super::*;

    #[test]
    fn starts_empty_with_no_bindings_and_no_signal_allocated() {
        let history = create_command_history(None);
        let guard = history.read().unwrap();
        assert!(guard.entries.is_empty());
        assert_eq!(guard.index, 0);
        assert_eq!(guard.max_size, 0);
        assert!(guard.on_change.is_none());
    }
}

mod execute_command {
    use super::*;

    #[test]
    fn refuses_an_unregistered_kind_rather_than_pushing_an_entry_undo_would_skip() {
        let history = create_command_history(None);
        assert!(!execute_command(&history, &command("acme.Unbound", "Nope")));
        assert_eq!(get_command_history_entries(&history).len(), 0);
    }

    #[test]
    fn discards_the_redo_branch_when_a_new_command_arrives_after_an_undo() {
        let history = counting(None);
        assert!(execute_command(&history, &command("test.Counter", "One")));
        assert!(execute_command(&history, &command("test.Counter", "Two")));
        assert!(undo_command(&history));
        assert!(execute_command(&history, &command("test.Counter", "Three")));
        let labels: Vec<String> = get_command_history_entries(&history)
            .iter()
            .map(|entry| entry.read().unwrap().command_fields().label.clone())
            .collect();
        assert_eq!(labels, vec!["One", "Three"]);
        assert!(!can_redo_command(&history));
    }

    #[test]
    fn trims_from_the_oldest_end_at_max_size_keeping_the_most_recent_history() {
        let history = counting(Some(2));
        assert!(execute_command(&history, &command("test.Counter", "One")));
        assert!(execute_command(&history, &command("test.Counter", "Two")));
        assert!(execute_command(&history, &command("test.Counter", "Three")));
        let labels: Vec<String> = get_command_history_entries(&history)
            .iter()
            .map(|entry| entry.read().unwrap().command_fields().label.clone())
            .collect();
        assert_eq!(labels, vec!["Two", "Three"]);
        assert_eq!(get_command_history_index(&history), 2);
    }
}

mod get_command_history_entries {
    use super::*;

    #[test]
    fn includes_the_reversed_entries_ahead_of_the_cursor() {
        let history = counting(None);
        assert!(execute_command(&history, &command("test.Counter", "One")));
        assert!(undo_command(&history));
        assert_eq!(get_command_history_entries(&history).len(), 1);
        assert_eq!(get_command_history_index(&history), 0);
    }
}

mod get_command_history_index {
    use super::*;

    #[test]
    fn counts_applied_entries() {
        let history = counting(None);
        assert!(execute_command(&history, &command("test.Counter", "One")));
        assert!(execute_command(&history, &command("test.Counter", "Two")));
        assert_eq!(get_command_history_index(&history), 2);
    }
}

mod get_command_history_redo_label {
    use super::*;

    #[test]
    fn names_the_entry_redo_would_reapply_and_is_none_with_nothing_to_redo() {
        let history = counting(None);
        assert_eq!(get_command_history_redo_label(&history), None);
        assert!(execute_command(&history, &command("test.Counter", "One")));
        assert!(undo_command(&history));
        assert_eq!(
            get_command_history_redo_label(&history),
            Some(String::from("One"))
        );
    }
}

mod get_command_history_undo_label {
    use super::*;

    #[test]
    fn names_the_entry_undo_would_reverse_and_is_none_with_nothing_to_undo() {
        let history = counting(None);
        assert_eq!(get_command_history_undo_label(&history), None);
        assert!(execute_command(&history, &command("test.Counter", "One")));
        assert_eq!(
            get_command_history_undo_label(&history),
            Some(String::from("One"))
        );
    }
}

mod initialize_command_history {
    use super::*;

    #[test]
    fn initializes_the_same_defaults_as_the_factory() {
        let mut direct: CommandHistory = allocate_entity();
        initialize_command_history(&mut direct, Some(5));
        assert!(direct.entries.is_empty());
        assert_eq!(direct.index, 0);
        assert_eq!(direct.max_size, 5);
        assert!(direct.on_change.is_none());
    }
}

mod notify_command_history_changed {
    use super::*;

    #[test]
    fn is_inert_when_no_signal_was_enabled() {
        notify_command_history_changed(&create_command_history(None));
    }
}

mod redo_command {
    use super::*;

    #[test]
    fn reapplies_through_the_registered_execute_and_returns_false_with_nothing_to_redo() {
        let history = create_command_history(None);
        let state = Arc::new(Mutex::new(Vec::new()));
        let executed = state.clone();
        let undone = state.clone();
        let binding = Arc::new(CommandBinding {
            execute: Arc::new(move |_command: &dyn Command| {
                executed.lock().unwrap().push("execute")
            }),
            merge: None,
            undo: Arc::new(move |_command: &dyn Command| undone.lock().unwrap().push("undo")),
        });
        register_command_binding(&history, "test.Ordered", binding);
        assert!(execute_command(&history, &command("test.Ordered", "One")));
        assert!(undo_command(&history));
        assert!(redo_command(&history));
        assert!(!redo_command(&history));
        assert_eq!(*state.lock().unwrap(), vec!["execute", "undo", "execute"]);
    }

    #[test]
    fn re_applies_the_recorded_effect_and_then_reports_nothing_left_to_redo() {
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
        assert!(redo_command(&history));
        assert_eq!(get_node_child_count(&parent), 1);
        assert!(!redo_command(&history));
    }
}

mod redo_command_property {
    use std::sync::Arc;

    use flight_entity::Unknown;

    use super::*;

    fn value(number: i32) -> Unknown {
        return Some(Arc::new(number));
    }

    #[test]
    fn re_applies_through_the_registered_execute_and_returns_false_with_nothing_to_redo() {
        let store = property_store();
        let access = property_access("test.CommandTarget", "x", &store);
        let history = history_with_property_access(&access);
        let target = node();
        store_set(&store, &target, "x", value(0));
        assert!(execute_command(
            &history,
            &erased(create_set_node_property_command(
                "Move",
                &target,
                "x",
                value(100),
                None,
                None,
                &access
            ))
        ));
        assert!(undo_command(&history));
        assert!(redo_command(&history));
        assert_eq!(
            store_get(&store, &target, "x")
                .unwrap()
                .unwrap()
                .downcast_ref::<i32>(),
            Some(&100)
        );
        assert!(!redo_command(&history));
    }
}

mod undo_command {
    use super::*;

    #[test]
    fn returns_false_with_nothing_to_undo() {
        assert!(!undo_command(&create_command_history(None)));
    }

    #[test]
    fn reverses_entries_newest_first() {
        let history = create_command_history(None);
        let order = Arc::new(Mutex::new(Vec::new()));
        let recorded = order.clone();
        let binding = Arc::new(CommandBinding {
            execute: Arc::new(|_command: &dyn Command| {}),
            merge: None,
            undo: Arc::new(move |command: &dyn Command| {
                recorded
                    .lock()
                    .unwrap()
                    .push(command.command_fields().label.clone())
            }),
        });
        register_command_binding(&history, "test.Ordered", binding);
        assert!(execute_command(&history, &command("test.Ordered", "One")));
        assert!(execute_command(&history, &command("test.Ordered", "Two")));
        assert!(undo_command(&history));
        assert!(undo_command(&history));
        assert_eq!(*order.lock().unwrap(), vec!["Two", "One"]);
    }
}

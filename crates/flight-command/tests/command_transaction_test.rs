use flight_command::contract::*;
use flight_node::contract::get_node_child_count;

use crate::support::*;

mod abort_command_transaction {
    use super::*;

    #[test]
    fn returns_false_when_no_bracket_is_open() {
        assert!(!abort_command_transaction(&create_command_history(None)));
    }

    #[test]
    fn unwinds_every_command_executed_since_begin_and_leaves_no_entry() {
        let history = history_with_defaults();
        let parent = node();
        let other = node();
        begin_command_transaction(&history, "Paste");
        assert!(execute_command(
            &history,
            &erased(create_add_node_child_command("Add", &parent, &node(), None))
        ));
        assert!(execute_command(
            &history,
            &erased(create_add_node_child_command(
                "Add other",
                &other,
                &node(),
                None
            ))
        ));
        assert!(abort_command_transaction(&history));
        assert_eq!(get_node_child_count(&parent), 0);
        assert_eq!(get_node_child_count(&other), 0);
        assert_eq!(get_command_history_entries(&history).len(), 0);
        assert!(!is_command_transaction_open(&history));
    }

    #[test]
    fn leaves_entries_recorded_before_the_bracket_alone() {
        let history = history_with_defaults();
        let parent = node();
        assert!(execute_command(
            &history,
            &erased(create_add_node_child_command(
                "Before",
                &parent,
                &node(),
                None
            ))
        ));
        begin_command_transaction(&history, "Paste");
        assert!(execute_command(
            &history,
            &erased(create_add_node_child_command(
                "Inside",
                &parent,
                &node(),
                None
            ))
        ));
        assert!(abort_command_transaction(&history));
        let labels: Vec<String> = get_command_history_entries(&history)
            .iter()
            .map(|entry| entry.read().unwrap().command_fields().label.clone())
            .collect();
        assert_eq!(labels, vec!["Before"]);
        assert_eq!(get_node_child_count(&parent), 1);
    }
}

mod begin_command_transaction {
    use super::*;

    #[test]
    fn opens_a_bracket() {
        let history = history_with_defaults();
        begin_command_transaction(&history, "Paste");
        assert!(is_command_transaction_open(&history));
    }

    #[test]
    fn counts_nesting_so_only_the_outermost_close_folds() {
        let history = history_with_defaults();
        let parent = node();
        begin_command_transaction(&history, "Outer");
        begin_command_transaction(&history, "Inner");
        assert!(execute_command(
            &history,
            &erased(create_add_node_child_command("One", &parent, &node(), None))
        ));
        assert!(end_command_transaction(&history));
        assert!(is_command_transaction_open(&history));
        assert!(execute_command(
            &history,
            &erased(create_add_node_child_command("Two", &parent, &node(), None))
        ));
        assert!(end_command_transaction(&history));
        assert_eq!(get_command_history_entries(&history).len(), 1);
        assert_eq!(
            get_command_history_undo_label(&history),
            Some(String::from("Outer"))
        );
    }
}

mod end_command_transaction {
    use super::*;

    #[test]
    fn returns_false_when_no_bracket_is_open() {
        assert!(!end_command_transaction(&create_command_history(None)));
    }

    #[test]
    fn folds_several_commands_into_one_composite_entry_carrying_the_bracket_label() {
        let history = history_with_defaults();
        let parent = node();
        let other = node();
        begin_command_transaction(&history, "Transform");
        assert!(execute_command(
            &history,
            &erased(create_add_node_child_command("One", &parent, &node(), None))
        ));
        assert!(execute_command(
            &history,
            &erased(create_add_node_child_command("Two", &other, &node(), None))
        ));
        assert!(end_command_transaction(&history));
        let entries = get_command_history_entries(&history);
        assert_eq!(entries.len(), 1);
        let borrowed = entries[0].read().unwrap();
        assert_eq!(borrowed.command_fields().kind, COMPOSITE_COMMAND_KIND);
        assert_eq!(borrowed.command_fields().label, "Transform");
        assert_eq!(
            borrowed.as_composite().expect("composite").children.len(),
            2
        );
        drop(borrowed);
        assert!(undo_command(&history));
        assert_eq!(get_node_child_count(&parent), 0);
        assert_eq!(get_node_child_count(&other), 0);
    }

    #[test]
    fn leaves_a_single_collected_command_unwrapped_keeping_its_own_label() {
        let history = history_with_defaults();
        begin_command_transaction(&history, "Transform");
        assert!(execute_command(
            &history,
            &erased(create_add_node_child_command(
                "Move x",
                &node(),
                &node(),
                None
            ))
        ));
        assert!(end_command_transaction(&history));
        let entries = get_command_history_entries(&history);
        assert_eq!(entries.len(), 1);
        let borrowed = entries[0].read().unwrap();
        assert_ne!(borrowed.command_fields().kind, COMPOSITE_COMMAND_KIND);
        assert_eq!(borrowed.command_fields().label, "Move x");
    }

    #[test]
    fn records_nothing_when_the_bracket_collected_nothing() {
        let history = history_with_defaults();
        begin_command_transaction(&history, "Empty");
        assert!(end_command_transaction(&history));
        assert_eq!(get_command_history_entries(&history).len(), 0);
    }
}

mod is_command_transaction_open {
    use super::*;

    #[test]
    fn is_false_on_a_fresh_history() {
        assert!(!is_command_transaction_open(&create_command_history(None)));
    }
}

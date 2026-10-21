use std::sync::{Arc, Mutex};

use flight_entity::{get_entity_uid, set_entity_uid};
use flight_selection::contract::*;
use flight_signals::connect_signal;

use crate::support::*;

mod add_node_to_selection {
    use super::*;

    #[test]
    fn adds_in_order_makes_the_new_node_active_and_ignores_duplicates() {
        let first = create_test_node("first");
        let second = create_test_node("second");
        let selection = create_selection_state();

        add_node_to_selection(&selection, &first);
        add_node_to_selection(&selection, &second);
        add_node_to_selection(&selection, &first);

        assert!(same_nodes(
            &selected_nodes_of(&selection),
            &[first, second.clone()]
        ));
        assert!(same_node(&get_active_node(&selection).unwrap(), &second));
    }
}

mod clear_selection {
    use super::*;

    #[test]
    fn empties_the_selected_set_and_clears_the_active_node() {
        let selection = create_selection_state();
        select_node(&selection, &create_test_node("node"));

        clear_selection(&selection);

        assert!(selected_nodes_of(&selection).is_empty());
        assert!(get_active_node(&selection).is_none());
    }
}

mod create_selection_state {
    use super::*;

    #[test]
    fn creates_empty_state_that_accepts_any_hierarchy_graph_family() {
        let selection = create_selection_state();
        let bare = create_test_node("bare");
        let bounded = create_bounded_node(
            "bounded",
            &flight_geometry::create_rectangle(0.0, 0.0, 1.0, 1.0),
            true,
            true,
        );

        select_all_nodes(&selection, &[bare.clone(), bounded.clone()]);

        assert!(same_nodes(&selected_nodes_of(&selection), &[bare, bounded]));
    }

    #[test]
    fn creates_an_entity_with_one_stable_uid_slot() {
        let mut selection = create_selection_state();
        set_entity_uid(&mut selection, "selection-state".to_string());
        assert_eq!(get_entity_uid(&mut selection), "selection-state");
    }
}

mod get_active_node {
    use super::*;

    #[test]
    fn returns_the_most_recently_selected_remaining_node() {
        let first = create_test_node("first");
        let second = create_test_node("second");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[first.clone(), second.clone()]);

        remove_node_from_selection(&selection, &second);

        assert!(same_node(&get_active_node(&selection).unwrap(), &first));
    }
}

mod get_selected_nodes {
    use super::*;

    #[test]
    fn clears_a_reused_out_and_keeps_its_capacity() {
        let first = create_test_node("first");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[first.clone()]);
        let mut out = Vec::with_capacity(8);
        out.push(create_test_node("stale"));

        get_selected_nodes(&mut out, &selection);

        assert!(same_nodes(&out, &[first]));
        assert!(out.capacity() >= 8);
    }

    #[test]
    fn returns_the_ordered_selected_identities() {
        let first = create_test_node("first");
        let second = create_test_node("second");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[second.clone(), first.clone()]);

        assert!(same_nodes(&selected_nodes_of(&selection), &[second, first]));
    }
}

mod get_selection_count {
    use super::*;

    #[test]
    fn returns_the_selected_identity_count() {
        let selection = create_selection_state();
        select_all_nodes(
            &selection,
            &[create_test_node("first"), create_test_node("second")],
        );

        assert_eq!(get_selection_count(&selection), 2);
    }
}

mod get_selection_signals {
    use super::*;

    #[test]
    fn emits_finalized_snapshots_in_source_order_and_suppresses_no_ops() {
        let first = create_test_node("first");
        let second = create_test_node("second");
        let selection = create_selection_state();
        let changes: Arc<Mutex<Vec<Vec<String>>>> = Arc::new(Mutex::new(Vec::new()));
        let active: Arc<Mutex<Vec<Option<String>>>> = Arc::new(Mutex::new(Vec::new()));
        let signals = get_selection_signals(&selection);
        let change_log = changes.clone();
        connect_signal(
            &signals.on_change,
            Arc::new(move |selected| {
                change_log
                    .lock()
                    .unwrap()
                    .push(selected.iter().map(node_name).collect());
            }),
            None,
        );
        let active_log = active.clone();
        connect_signal(
            &signals.on_active_change,
            Arc::new(move |selected| {
                active_log
                    .lock()
                    .unwrap()
                    .push(selected.as_ref().map(node_name));
            }),
            None,
        );

        add_node_to_selection(&selection, &first);
        add_node_to_selection(&selection, &first);
        add_node_to_selection(&selection, &second);
        remove_node_from_selection(&selection, &first);
        clear_selection(&selection);
        clear_selection(&selection);

        assert_eq!(
            *changes.lock().unwrap(),
            vec![
                vec!["first".to_string()],
                vec!["first".to_string(), "second".to_string()],
                vec!["second".to_string()],
                Vec::<String>::new(),
            ]
        );
        assert_eq!(
            *active.lock().unwrap(),
            vec![Some("first".to_string()), Some("second".to_string()), None,]
        );
    }

    #[test]
    fn keeps_signals_opt_in_until_a_slot_is_connected() {
        let selection = create_selection_state();
        let signals = get_selection_signals(&selection);
        assert!(signals.on_change.data.read().unwrap().is_none());
        assert!(signals.on_active_change.data.read().unwrap().is_none());

        select_node(&selection, &create_test_node("node"));

        assert!(signals.on_change.data.read().unwrap().is_none());
        assert!(signals.on_active_change.data.read().unwrap().is_none());
    }

    #[test]
    fn preserves_reentrant_snapshot_and_active_emission_semantics() {
        let selection = Arc::new(create_selection_state());
        let first = create_test_node("first");
        let second = create_test_node("second");
        let calls: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let reentered = Arc::new(Mutex::new(false));
        let signals = get_selection_signals(&selection);
        let change_calls = calls.clone();
        let reentrant_state = selection.clone();
        let reentrant_node = second.clone();
        let reentrant_flag = reentered.clone();
        connect_signal(
            &signals.on_change,
            Arc::new(move |selected| {
                change_calls.lock().unwrap().push(format!(
                    "change:{}",
                    selected.iter().map(node_name).collect::<Vec<_>>().join(",")
                ));
                let mut reentered = reentrant_flag.lock().unwrap();
                if !*reentered {
                    *reentered = true;
                    drop(reentered);
                    add_node_to_selection(&reentrant_state, &reentrant_node);
                }
            }),
            None,
        );
        let active_calls = calls.clone();
        connect_signal(
            &signals.on_active_change,
            Arc::new(move |selected| {
                active_calls.lock().unwrap().push(format!(
                    "active:{}",
                    selected.as_ref().map(node_name).unwrap_or_default()
                ));
            }),
            None,
        );

        add_node_to_selection(&selection, &first);

        assert_eq!(
            *calls.lock().unwrap(),
            vec![
                "change:first".to_string(),
                "change:first,second".to_string(),
                "active:second".to_string(),
                "active:second".to_string(),
            ]
        );
        assert!(same_nodes(&selected_nodes_of(&selection), &[first, second]));
    }
}

mod has_selection {
    use super::*;

    #[test]
    fn reports_whether_any_identity_is_selected() {
        let selection = create_selection_state();
        assert!(!has_selection(&selection));

        select_node(&selection, &create_test_node("node"));
        assert!(has_selection(&selection));
    }
}

mod initialize_selection_state {
    use super::*;

    #[test]
    fn restores_fresh_empty_runtime_state() {
        let node = create_test_node("node");
        let mut selection = create_selection_state();
        select_node(&selection, &node);

        initialize_selection_state(&mut selection);

        assert!(selected_nodes_of(&selection).is_empty());
        assert!(get_active_node(&selection).is_none());
    }
}

mod is_node_selected {
    use super::*;

    #[test]
    fn checks_selection_by_node_identity() {
        let selected = create_test_node("selected");
        let unselected = create_test_node("unselected");
        let selection = create_selection_state();
        select_node(&selection, &selected);

        assert!(is_node_selected(&selection, &selected));
        assert!(!is_node_selected(&selection, &unselected));
    }
}

mod remove_node_from_selection {
    use super::*;

    #[test]
    fn preserves_an_unrelated_active_node_and_ignores_absent_identities() {
        let first = create_test_node("first");
        let second = create_test_node("second");
        let absent = create_test_node("absent");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[first.clone(), second.clone()]);

        remove_node_from_selection(&selection, &first);
        remove_node_from_selection(&selection, &absent);

        assert!(same_nodes(
            &selected_nodes_of(&selection),
            &[second.clone()]
        ));
        assert!(same_node(&get_active_node(&selection).unwrap(), &second));
    }
}

mod select_all_nodes {
    use super::*;

    #[test]
    fn de_duplicates_candidates_in_caller_order_and_makes_the_last_unique_node_active() {
        let first = create_test_node("first");
        let second = create_test_node("second");
        let selection = create_selection_state();

        select_all_nodes(&selection, &[second.clone(), first.clone(), second.clone()]);

        assert!(same_nodes(
            &selected_nodes_of(&selection),
            &[second, first.clone()]
        ));
        assert!(same_node(&get_active_node(&selection).unwrap(), &first));
    }

    #[test]
    fn replaces_the_selection_without_retaining_the_source_array() {
        let first = create_test_node("first");
        let second = create_test_node("second");
        let selection = create_selection_state();
        let mut candidates = vec![first.clone()];

        select_all_nodes(&selection, &candidates);
        candidates[0] = second;

        assert!(same_nodes(&selected_nodes_of(&selection), &[first]));
    }
}

mod select_node {
    use super::*;

    #[test]
    fn replaces_selection_without_recursively_selecting_descendants() {
        let group = create_test_node("group");
        let child = create_test_node("child");
        flight_node::add_node_child(&group, &child);
        let selection = create_selection_state();
        select_node(&selection, &child);

        select_node(&selection, &group);

        assert!(same_nodes(&selected_nodes_of(&selection), &[group]));
        assert!(!is_node_selected(&selection, &child));
    }
}

mod toggle_node_selection {
    use super::*;

    #[test]
    fn adds_an_absent_identity_and_removes_a_selected_identity() {
        let node = create_test_node("node");
        let selection = create_selection_state();

        toggle_node_selection(&selection, &node);
        assert!(is_node_selected(&selection, &node));
        toggle_node_selection(&selection, &node);
        assert!(!is_node_selected(&selection, &node));
    }
}

//! flight-compiler: nullable-options

use std::sync::{Arc, Mutex};

use flight_entity::{get_entity_uid, set_entity_uid};
use flight_geometry::create_rectangle;
use flight_selection::contract::*;
use flight_signals::connect_signal;

fn modifiers(
    alt_key: bool,
    ctrl_key: bool,
    meta_key: bool,
    shift_key: bool,
) -> SelectionModifierState {
    return SelectionModifierState {
        alt_key,
        ctrl_key,
        meta_key,
        shift_key,
    };
}

mod add_lasso_selection_point {
    use super::*;

    #[test]
    fn appends_line_points_only_during_an_active_gesture() {
        let mut lasso = create_lasso_selection();
        add_lasso_selection_point(&mut lasso, 99.0, 99.0);
        begin_lasso_selection(&mut lasso, 1.0, 2.0);
        add_lasso_selection_point(&mut lasso, 3.0, 4.0);
        end_lasso_selection(&mut lasso);
        add_lasso_selection_point(&mut lasso, 5.0, 6.0);

        assert_eq!(
            get_lasso_selection_path(&lasso).data,
            vec![1.0, 2.0, 3.0, 4.0]
        );
    }
}

mod add_node_to_selection {
    use super::*;

    #[test]
    fn adds_in_order_makes_the_new_node_active_and_ignores_duplicates() {
        let first = crate::create_test_node("first");
        let second = crate::create_test_node("second");
        let selection = create_selection_state();

        add_node_to_selection(&selection, &first);
        add_node_to_selection(&selection, &second);
        add_node_to_selection(&selection, &first);

        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[first, second.clone()]
        ));
        assert!(crate::same_node(
            &get_active_node(&selection).unwrap(),
            &second
        ));
    }
}

mod apply_pointer_selection_policy {
    use super::*;

    #[test]
    fn adds_or_removes_with_shift_and_toggles_with_ctrl_or_command() {
        let first = crate::create_test_node("first");
        let second = crate::create_test_node("second");
        let selection = create_selection_state();

        apply_pointer_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, false, true),
        );
        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[first.clone()]
        ));
        apply_pointer_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, false, true),
        );
        assert!(crate::selected_nodes_of(&selection).is_empty());

        apply_pointer_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, true, false, false),
        );
        apply_pointer_selection_policy(
            &selection,
            Some(&second),
            &modifiers(false, false, true, false),
        );
        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[first.clone(), second.clone()]
        ));
        apply_pointer_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, true, false),
        );
        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[second.clone()]
        ));

        apply_pointer_selection_policy(&selection, None, &modifiers(false, true, false, false));
        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[second]
        ));
    }

    #[test]
    fn applies_unmodified_hit_and_empty_space_behavior() {
        let first = crate::create_test_node("first");
        let second = crate::create_test_node("second");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[first.clone(), second.clone()]);

        apply_pointer_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, false, false),
        );
        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[first.clone(), second]
        ));

        let third = crate::create_test_node("third");
        apply_pointer_selection_policy(
            &selection,
            Some(&third),
            &modifiers(false, false, false, false),
        );
        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[third]
        ));

        apply_pointer_selection_policy(&selection, None, &modifiers(false, false, false, false));
        assert!(crate::selected_nodes_of(&selection).is_empty());
    }

    #[test]
    fn leaves_alt_gestures_available_for_caller_defined_alternate_pick_behavior() {
        let first = crate::create_test_node("first");
        let second = crate::create_test_node("second");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[first.clone()]);

        apply_pointer_selection_policy(
            &selection,
            Some(&second),
            &modifiers(true, false, false, false),
        );
        apply_pointer_selection_policy(&selection, None, &modifiers(true, false, false, false));

        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[first]
        ));
    }
}

mod apply_pointer_up_selection_policy {
    use super::*;

    #[test]
    fn narrows_an_already_selected_hit_only_on_unmodified_pointer_up_without_a_drag() {
        let first = crate::create_test_node("first");
        let second = crate::create_test_node("second");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[first.clone(), second.clone()]);

        apply_pointer_up_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, false, false),
            true,
        );
        apply_pointer_up_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, false, true),
            false,
        );
        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[first.clone(), second]
        ));

        apply_pointer_up_selection_policy(
            &selection,
            Some(&first),
            &modifiers(false, false, false, false),
            false,
        );
        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[first]
        ));
    }
}

mod begin_lasso_selection {
    use super::*;

    #[test]
    fn resets_the_reused_path_and_starts_it_with_a_move_command() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 1.0, 2.0);
        add_lasso_selection_point(&mut lasso, 3.0, 4.0);
        end_lasso_selection(&mut lasso);

        begin_lasso_selection(&mut lasso, 10.0, 11.0);

        assert!(crate::has_only_move_command(get_lasso_selection_path(
            &lasso
        )));
        assert_eq!(get_lasso_selection_path(&lasso).data, vec![10.0, 11.0]);
    }
}

mod begin_marquee_selection {
    use super::*;

    #[test]
    fn starts_a_new_zero_area_rectangle_at_the_pointer_location() {
        let mut marquee = create_marquee_selection();
        begin_marquee_selection(&mut marquee, 10.0, 20.0);

        assert_eq!(
            get_marquee_rectangle(&marquee),
            &create_rectangle(10.0, 20.0, 0.0, 0.0)
        );
    }
}

mod clear_selection {
    use super::*;

    #[test]
    fn empties_the_selected_set_and_clears_the_active_node() {
        let selection = create_selection_state();
        select_node(&selection, &crate::create_test_node("node"));

        clear_selection(&selection);

        assert!(crate::selected_nodes_of(&selection).is_empty());
        assert!(get_active_node(&selection).is_none());
    }
}

mod create_lasso_selection {
    use super::*;

    #[test]
    fn creates_an_empty_even_odd_path() {
        let lasso = create_lasso_selection();
        let path = get_lasso_selection_path(&lasso);

        assert!(path.commands.is_empty());
        assert!(path.data.is_empty());
        assert!(crate::has_even_odd_winding(path));
    }
}

mod create_marquee_selection {
    use super::*;

    #[test]
    fn creates_an_inactive_marquee_with_an_empty_rectangle() {
        let mut marquee = create_marquee_selection();

        update_marquee_selection(&mut marquee, 100.0, 100.0);

        assert_eq!(
            get_marquee_rectangle(&marquee),
            &create_rectangle(0.0, 0.0, 0.0, 0.0)
        );
    }
}

mod create_selection_state {
    use super::*;

    #[test]
    fn creates_empty_state_that_accepts_any_hierarchy_graph_family() {
        let selection = create_selection_state();
        let bare = crate::create_test_node("bare");
        let bounded = crate::create_bounded_node(
            "bounded",
            &flight_geometry::create_rectangle(0.0, 0.0, 1.0, 1.0),
            true,
            true,
        );

        select_all_nodes(&selection, &[bare.clone(), bounded.clone()]);

        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[bare, bounded]
        ));
    }

    /// flight-compiler: rust-only — the target-native Entity identity probe lives beside the adapter.
    #[test]
    fn creates_an_entity_with_one_stable_uid_slot() {
        let mut selection = create_selection_state();
        set_entity_uid(&mut selection, "selection-state".to_string());
        assert_eq!(get_entity_uid(&mut selection), "selection-state");
    }
}

mod end_lasso_selection {
    use super::*;

    #[test]
    fn closes_an_active_path_once_and_returns_the_live_path_object() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 1.0, 2.0);
        add_lasso_selection_point(&mut lasso, 3.0, 4.0);

        let returned = end_lasso_selection(&mut lasso) as *const _;
        end_lasso_selection(&mut lasso);

        assert!(crate::same_path(returned, get_lasso_selection_path(&lasso)));
        assert!(crate::has_move_line_close_commands(
            get_lasso_selection_path(&lasso)
        ));
    }
}

mod end_marquee_selection {
    use super::*;

    #[test]
    fn returns_the_live_rectangle_and_makes_later_updates_inert() {
        let mut marquee = create_marquee_selection();
        begin_marquee_selection(&mut marquee, 1.0, 2.0);
        update_marquee_selection(&mut marquee, 3.0, 4.0);

        let returned = end_marquee_selection(&mut marquee) as *const _;
        update_marquee_selection(&mut marquee, 50.0, 50.0);

        assert!(crate::same_rectangle(
            returned,
            get_marquee_rectangle(&marquee)
        ));
        assert_eq!(
            get_marquee_rectangle(&marquee),
            &create_rectangle(1.0, 2.0, 2.0, 2.0)
        );
    }
}

mod find_nodes_in_lasso_selection {
    use super::*;

    /// flight-compiler: rust-only — JavaScript arrays expose no allocation capacity.
    #[test]
    fn clears_a_reused_out_and_keeps_its_capacity() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 0.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 10.0);
        add_lasso_selection_point(&mut lasso, 0.0, 10.0);
        end_lasso_selection(&mut lasso);
        let inside =
            crate::create_bounded_node("inside", &create_rectangle(4.0, 4.0, 2.0, 2.0), true, true);
        let mut out = Vec::with_capacity(8);
        out.push(crate::create_test_node("stale"));

        find_nodes_in_lasso_selection(&mut out, &lasso, &[inside.clone()]);

        assert!(crate::same_nodes(&out, &[inside]));
        assert!(out.capacity() >= 8);
    }

    #[test]
    fn includes_degenerate_boundary_edges_without_changing_even_odd_fill() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 0.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 10.0);
        add_lasso_selection_point(&mut lasso, 0.0, 10.0);
        end_lasso_selection(&mut lasso);
        let boundary = crate::create_bounded_node(
            "boundary",
            &create_rectangle(10.0, 0.0, 0.0, 0.0),
            true,
            true,
        );

        assert!(crate::same_nodes(
            &crate::lasso_matches(&lasso, &[boundary.clone()]),
            &[boundary]
        ));
    }

    #[test]
    fn selects_bounds_centers_inside_or_on_the_lasso_boundary_in_caller_order() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 0.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 10.0);
        add_lasso_selection_point(&mut lasso, 0.0, 10.0);
        end_lasso_selection(&mut lasso);
        let inside =
            crate::create_bounded_node("inside", &create_rectangle(4.0, 4.0, 2.0, 2.0), true, true);
        let boundary = crate::create_bounded_node(
            "boundary",
            &create_rectangle(9.0, 4.0, 2.0, 2.0),
            true,
            true,
        );
        let outside = crate::create_bounded_node(
            "outside",
            &create_rectangle(11.0, 11.0, 2.0, 2.0),
            true,
            true,
        );

        assert!(crate::same_nodes(
            &crate::lasso_matches(&lasso, &[outside, boundary.clone(), inside.clone()]),
            &[boundary, inside]
        ));
    }

    #[test]
    fn tests_the_bounds_center_rather_than_rectangle_overlap() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 0.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 10.0);
        add_lasso_selection_point(&mut lasso, 0.0, 10.0);
        end_lasso_selection(&mut lasso);
        let overlaps_with_center_outside = crate::create_bounded_node(
            "overlap",
            &create_rectangle(9.0, 9.0, 10.0, 10.0),
            true,
            true,
        );

        assert!(crate::lasso_matches(&lasso, &[overlaps_with_center_outside]).is_empty());
    }

    #[test]
    fn returns_no_candidates_for_a_path_with_fewer_than_three_points() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 0.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        end_lasso_selection(&mut lasso);
        let candidate =
            crate::create_bounded_node("node", &create_rectangle(0.0, 0.0, 1.0, 1.0), true, true);

        assert!(crate::lasso_matches(&lasso, &[candidate]).is_empty());
    }
}

mod find_nodes_in_marquee_selection {
    use super::*;

    /// flight-compiler: rust-only — JavaScript arrays expose no allocation capacity.
    #[test]
    fn clears_a_reused_out_and_keeps_its_capacity() {
        let mut marquee = create_marquee_selection();
        begin_marquee_selection(&mut marquee, 0.0, 0.0);
        update_marquee_selection(&mut marquee, 10.0, 10.0);
        let inside =
            crate::create_bounded_node("inside", &create_rectangle(2.0, 2.0, 2.0, 2.0), true, true);
        let mut out = Vec::with_capacity(8);
        out.push(crate::create_test_node("stale"));

        find_nodes_in_marquee_selection(&mut out, &marquee, &[inside.clone()], None);

        assert!(crate::same_nodes(&out, &[inside]));
        assert!(out.capacity() >= 8);
    }

    #[test]
    fn finds_intersecting_or_fully_contained_bounds_in_caller_order() {
        let mut marquee = create_marquee_selection();
        begin_marquee_selection(&mut marquee, 0.0, 0.0);
        update_marquee_selection(&mut marquee, 10.0, 10.0);
        let contained = crate::create_bounded_node(
            "contained",
            &create_rectangle(2.0, 2.0, 2.0, 2.0),
            true,
            true,
        );
        let overlapping = crate::create_bounded_node(
            "overlapping",
            &create_rectangle(8.0, 8.0, 5.0, 5.0),
            true,
            true,
        );
        let outside = crate::create_bounded_node(
            "outside",
            &create_rectangle(20.0, 20.0, 1.0, 1.0),
            true,
            true,
        );
        let candidates = vec![overlapping.clone(), outside, contained.clone()];

        assert!(crate::same_nodes(
            &crate::marquee_matches(&marquee, &candidates, None),
            &[overlapping.clone(), contained.clone()]
        ));
        assert!(crate::same_nodes(
            &crate::marquee_matches(&marquee, &candidates, Some(crate::contain_marquee_mode())),
            &[contained]
        ));
    }

    #[test]
    fn uses_local_bounds_without_filtering_disabled_or_hidden_candidates() {
        let mut marquee = create_marquee_selection();
        begin_marquee_selection(&mut marquee, 0.0, 0.0);
        update_marquee_selection(&mut marquee, 10.0, 10.0);
        let disabled = crate::create_bounded_node(
            "disabled",
            &create_rectangle(1.0, 1.0, 1.0, 1.0),
            false,
            true,
        );
        let hidden = crate::create_bounded_node(
            "hidden",
            &create_rectangle(2.0, 2.0, 1.0, 1.0),
            true,
            false,
        );

        assert!(crate::same_nodes(
            &crate::marquee_matches(&marquee, &[disabled.clone(), hidden.clone()], None),
            &[disabled, hidden]
        ));
    }
}

mod get_active_node {
    use super::*;

    #[test]
    fn returns_the_most_recently_selected_remaining_node() {
        let first = crate::create_test_node("first");
        let second = crate::create_test_node("second");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[first.clone(), second.clone()]);

        remove_node_from_selection(&selection, &second);

        assert!(crate::same_node(
            &get_active_node(&selection).unwrap(),
            &first
        ));
    }
}

mod get_lasso_selection_path {
    use super::*;

    #[test]
    fn exposes_the_same_path_throughout_a_gesture() {
        let mut lasso = create_lasso_selection();
        let original = get_lasso_selection_path(&lasso) as *const _;

        begin_lasso_selection(&mut lasso, 1.0, 2.0);

        assert!(crate::same_path(original, get_lasso_selection_path(&lasso)));
    }
}

mod get_marquee_rectangle {
    use super::*;

    #[test]
    fn exposes_the_same_rectangle_throughout_a_gesture() {
        let mut marquee = create_marquee_selection();
        let original = get_marquee_rectangle(&marquee) as *const _;

        begin_marquee_selection(&mut marquee, 4.0, 5.0);

        assert!(crate::same_rectangle(
            original,
            get_marquee_rectangle(&marquee)
        ));
    }
}

mod get_marquee_selection_mode_string {
    use super::*;

    /// flight-compiler: rust-only — the exact-string helper is native-contract-only.
    #[test]
    fn returns_the_exact_source_strings() {
        assert_eq!(
            get_marquee_selection_mode_string(MarqueeSelectionMode::Contain),
            "contain"
        );
        assert_eq!(
            get_marquee_selection_mode_string(MarqueeSelectionMode::Intersect),
            "intersect"
        );
    }
}

mod get_selected_nodes {
    use super::*;

    /// flight-compiler: rust-only — JavaScript arrays expose no allocation capacity.
    #[test]
    fn clears_a_reused_out_and_keeps_its_capacity() {
        let first = crate::create_test_node("first");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[first.clone()]);
        let mut out = Vec::with_capacity(8);
        out.push(crate::create_test_node("stale"));

        get_selected_nodes(&mut out, &selection);

        assert!(crate::same_nodes(&out, &[first]));
        assert!(out.capacity() >= 8);
    }

    #[test]
    fn returns_the_ordered_selected_identities() {
        let first = crate::create_test_node("first");
        let second = crate::create_test_node("second");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[second.clone(), first.clone()]);

        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[second, first]
        ));
    }
}

mod get_selection_count {
    use super::*;

    #[test]
    fn returns_the_selected_identity_count() {
        let selection = create_selection_state();
        select_all_nodes(
            &selection,
            &[
                crate::create_test_node("first"),
                crate::create_test_node("second"),
            ],
        );

        assert_eq!(get_selection_count(&selection), 2);
    }
}

mod get_selection_signals {
    use super::*;

    #[test]
    fn emits_finalized_snapshots_in_source_order_and_suppresses_no_ops() {
        let first = crate::create_test_node("first");
        let second = crate::create_test_node("second");
        let selection = create_selection_state();
        let changes: Arc<Mutex<Vec<Vec<String>>>> = Arc::new(Mutex::new(Vec::new()));
        let active: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let signals = get_selection_signals(&selection);
        let change_log = changes.clone();
        connect_signal(
            &signals.on_change,
            Arc::new(move |selected| {
                change_log
                    .lock()
                    .unwrap()
                    .push(selected.iter().map(crate::node_name).collect());
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
                    .push(crate::optional_node_name(selected));
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
            vec!["first".to_string(), "second".to_string(), String::new(),]
        );
    }

    #[test]
    fn keeps_signals_opt_in_until_a_slot_is_connected() {
        let selection = create_selection_state();
        let signals = get_selection_signals(&selection);
        assert!(crate::signal_is_inert(&signals.on_change));
        assert!(crate::signal_is_inert(&signals.on_active_change));

        select_node(&selection, &crate::create_test_node("node"));

        assert!(crate::signal_is_inert(&signals.on_change));
        assert!(crate::signal_is_inert(&signals.on_active_change));
    }

    #[test]
    fn preserves_reentrant_snapshot_and_active_emission_semantics() {
        let selection = Arc::new(create_selection_state());
        let first = crate::create_test_node("first");
        let second = crate::create_test_node("second");
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
                change_calls
                    .lock()
                    .unwrap()
                    .push(format!("change:{}", crate::joined_node_names(selected)));
                if crate::take_reentrant_flag(&reentrant_flag) {
                    add_node_to_selection(&reentrant_state, &reentrant_node);
                }
            }),
            None,
        );
        let active_calls = calls.clone();
        connect_signal(
            &signals.on_active_change,
            Arc::new(move |selected| {
                active_calls
                    .lock()
                    .unwrap()
                    .push(format!("active:{}", crate::optional_node_name(selected)));
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
        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[first, second]
        ));
    }
}

mod has_selection {
    use super::*;

    #[test]
    fn reports_whether_any_identity_is_selected() {
        let selection = create_selection_state();
        assert!(!has_selection(&selection));

        select_node(&selection, &crate::create_test_node("node"));
        assert!(has_selection(&selection));
    }
}

mod initialize_lasso_selection {
    use super::*;

    #[test]
    fn restores_an_empty_even_odd_path() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 1.0, 2.0);
        initialize_lasso_selection(&mut lasso);

        let path = get_lasso_selection_path(&lasso);
        assert!(path.commands.is_empty());
        assert!(path.data.is_empty());
        assert!(crate::has_even_odd_winding(path));
    }
}

mod initialize_marquee_selection {
    use super::*;

    /// flight-compiler: rust-only — target construction is internal to the generated core.
    #[test]
    fn restores_inactive_empty_gesture_state() {
        let mut marquee = create_marquee_selection();
        begin_marquee_selection(&mut marquee, 1.0, 2.0);
        update_marquee_selection(&mut marquee, 3.0, 4.0);

        initialize_marquee_selection(&mut marquee);
        update_marquee_selection(&mut marquee, 10.0, 10.0);

        assert_eq!(
            get_marquee_rectangle(&marquee),
            &create_rectangle(0.0, 0.0, 0.0, 0.0)
        );
    }
}

mod initialize_selection_state {
    use super::*;

    /// flight-compiler: rust-only — target construction is internal to the generated core.
    #[test]
    fn restores_fresh_empty_runtime_state() {
        let node = crate::create_test_node("node");
        let mut selection = create_selection_state();
        select_node(&selection, &node);

        initialize_selection_state(&mut selection);

        assert!(crate::selected_nodes_of(&selection).is_empty());
        assert!(get_active_node(&selection).is_none());
    }
}

mod is_node_selected {
    use super::*;

    #[test]
    fn checks_selection_by_node_identity() {
        let selected = crate::create_test_node("selected");
        let unselected = crate::create_test_node("unselected");
        let selection = create_selection_state();
        select_node(&selection, &selected);

        assert!(is_node_selected(&selection, &selected));
        assert!(!is_node_selected(&selection, &unselected));
    }
}

mod parse_marquee_selection_mode {
    use super::*;

    /// flight-compiler: rust-only — the exact-string helper is native-contract-only.
    #[test]
    fn accepts_only_the_exact_source_strings() {
        assert_eq!(
            parse_marquee_selection_mode("contain"),
            Some(MarqueeSelectionMode::Contain)
        );
        assert_eq!(
            parse_marquee_selection_mode("intersect"),
            Some(MarqueeSelectionMode::Intersect)
        );
        assert_eq!(parse_marquee_selection_mode("Contain"), None);
    }
}

mod remove_node_from_selection {
    use super::*;

    #[test]
    fn preserves_an_unrelated_active_node_and_ignores_absent_identities() {
        let first = crate::create_test_node("first");
        let second = crate::create_test_node("second");
        let absent = crate::create_test_node("absent");
        let selection = create_selection_state();
        select_all_nodes(&selection, &[first.clone(), second.clone()]);

        remove_node_from_selection(&selection, &first);
        remove_node_from_selection(&selection, &absent);

        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[second.clone()]
        ));
        assert!(crate::same_node(
            &get_active_node(&selection).unwrap(),
            &second
        ));
    }
}

mod select_all_nodes {
    use super::*;

    #[test]
    fn de_duplicates_candidates_in_caller_order_and_makes_the_last_unique_node_active() {
        let first = crate::create_test_node("first");
        let second = crate::create_test_node("second");
        let selection = create_selection_state();

        select_all_nodes(&selection, &[second.clone(), first.clone(), second.clone()]);

        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[second, first.clone()]
        ));
        assert!(crate::same_node(
            &get_active_node(&selection).unwrap(),
            &first
        ));
    }

    #[test]
    fn replaces_the_selection_without_retaining_the_source_array() {
        let first = crate::create_test_node("first");
        let second = crate::create_test_node("second");
        let selection = create_selection_state();
        let mut candidates = vec![first.clone()];

        select_all_nodes(&selection, &candidates);
        candidates[0] = second;

        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[first]
        ));
    }
}

mod select_node {
    use super::*;

    #[test]
    fn replaces_selection_without_recursively_selecting_descendants() {
        let group = crate::create_test_node("group");
        let child = crate::create_test_node("child");
        flight_node::add_node_child(&group, &child);
        let selection = create_selection_state();
        select_node(&selection, &child);

        select_node(&selection, &group);

        assert!(crate::same_nodes(
            &crate::selected_nodes_of(&selection),
            &[group]
        ));
        assert!(!is_node_selected(&selection, &child));
    }
}

mod toggle_node_selection {
    use super::*;

    #[test]
    fn adds_an_absent_identity_and_removes_a_selected_identity() {
        let node = crate::create_test_node("node");
        let selection = create_selection_state();

        toggle_node_selection(&selection, &node);
        assert!(is_node_selected(&selection, &node));
        toggle_node_selection(&selection, &node);
        assert!(!is_node_selected(&selection, &node));
    }
}

mod update_marquee_selection {
    use super::*;

    #[test]
    fn normalizes_a_reverse_drag_into_positive_rectangle_dimensions() {
        let mut marquee = create_marquee_selection();
        begin_marquee_selection(&mut marquee, 10.0, 20.0);

        update_marquee_selection(&mut marquee, 2.0, 5.0);

        assert_eq!(
            get_marquee_rectangle(&marquee),
            &create_rectangle(2.0, 5.0, 8.0, 15.0)
        );
    }
}

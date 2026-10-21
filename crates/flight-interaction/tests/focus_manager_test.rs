use std::sync::{Arc, RwLock};

use flight_node::add_node_child;

use crate::interaction_fixture;
use flight_interaction::focus_manager::*;
use flight_interaction::types::{
    FocusDirection, FocusNavigationInput, FocusNavigationOptions, create_focus_manager_options,
};

mod clear_focus {
    use super::*;

    #[test]
    fn resets_to_none() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        add_node_child(&root, &a);
        let mut mgr = create_focus_manager(root, &create_focus_manager_options());
        focus_next_node(&mut mgr);
        assert!(get_focused_node(&mgr).is_some());
        clear_focus(&mut mgr);
        assert!(get_focused_node(&mgr).is_none());
    }
}

mod connect_focus_navigation {
    use super::*;
    use flight_interaction::types::KeyboardEventData;

    fn key_event(key: &str, shift: bool) -> KeyboardEventData {
        return KeyboardEventData {
            alt_key: false,
            ctrl_key: false,
            key: key.to_string(),
            key_code: 0,
            meta_key: false,
            shift_key: shift,
        };
    }

    #[test]
    fn tab_advances_focus() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        let b = interaction_fixture::focusable_node(1);
        flight_node::add_node_child(&root, &a);
        flight_node::add_node_child(&root, &b);
        let input = FocusNavigationInput {
            on_key_down: flight_signals::create_signal(),
        };
        let mgr = Arc::new(RwLock::new(create_focus_manager(root, &create_focus_manager_options())));
        let _dispose = connect_focus_navigation(&input, mgr.clone(), &FocusNavigationOptions { arrow_keys: None });
        flight_signals::emit_signal(&input.on_key_down, &key_event("Tab", false));
        let focused = get_focused_node(&mgr.read().unwrap());
        assert!(focused.is_some());
        assert!(Arc::ptr_eq(&focused.unwrap(), &a));
    }

    #[test]
    fn shift_tab_goes_backward() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        let b = interaction_fixture::focusable_node(1);
        flight_node::add_node_child(&root, &a);
        flight_node::add_node_child(&root, &b);
        let input = FocusNavigationInput {
            on_key_down: flight_signals::create_signal(),
        };
        let mgr = Arc::new(RwLock::new(create_focus_manager(root, &create_focus_manager_options())));
        let _dispose = connect_focus_navigation(&input, mgr.clone(), &FocusNavigationOptions { arrow_keys: None });
        flight_signals::emit_signal(&input.on_key_down, &key_event("Tab", true));
        let focused = get_focused_node(&mgr.read().unwrap());
        assert!(focused.is_some());
        assert!(Arc::ptr_eq(&focused.unwrap(), &b));
    }

    #[test]
    fn dispose_disconnects_signal() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        flight_node::add_node_child(&root, &a);
        let input = FocusNavigationInput {
            on_key_down: flight_signals::create_signal(),
        };
        let mgr = Arc::new(RwLock::new(create_focus_manager(root, &create_focus_manager_options())));
        let dispose = connect_focus_navigation(&input, mgr.clone(), &FocusNavigationOptions { arrow_keys: None });
        dispose();
        flight_signals::emit_signal(&input.on_key_down, &key_event("Tab", false));
        assert!(get_focused_node(&mgr.read().unwrap()).is_none());
    }

    #[test]
    fn arrow_keys_ignored_when_disabled() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        flight_node::add_node_child(&root, &a);
        let input = FocusNavigationInput {
            on_key_down: flight_signals::create_signal(),
        };
        let mgr = Arc::new(RwLock::new(create_focus_manager(root, &create_focus_manager_options())));
        let _dispose = connect_focus_navigation(&input, mgr.clone(), &FocusNavigationOptions { arrow_keys: Some(false) });
        flight_signals::emit_signal(&input.on_key_down, &key_event("Tab", false));
        flight_signals::emit_signal(&input.on_key_down, &key_event("ArrowDown", false));
        let focused = get_focused_node(&mgr.read().unwrap());
        assert!(focused.is_some());
        assert!(Arc::ptr_eq(&focused.unwrap(), &a));
    }
}

mod create_focus_manager {
    use super::*;

    #[test]
    fn defaults() {
        let root = interaction_fixture::node();
        let mgr = create_focus_manager(root, &create_focus_manager_options());
        assert!(mgr.wrap);
        assert!(get_focused_node(&mgr).is_none());
    }
}

mod focus_next_node {
    use super::*;

    #[test]
    fn cycles_through_nodes() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        let b = interaction_fixture::focusable_node(1);
        add_node_child(&root, &a);
        add_node_child(&root, &b);
        let mut mgr = create_focus_manager(root, &create_focus_manager_options());
        let first = focus_next_node(&mut mgr);
        assert!(first.is_some());
        assert!(Arc::ptr_eq(&first.unwrap(), &a));
        let second = focus_next_node(&mut mgr);
        assert!(second.is_some());
        assert!(Arc::ptr_eq(&second.unwrap(), &b));
    }
}

mod focus_node_in_direction {
    use super::*;

    #[test]
    fn returns_none_for_empty_tree() {
        let root = interaction_fixture::node();
        let mut mgr = create_focus_manager(root, &create_focus_manager_options());
        let result = focus_node_in_direction(&mut mgr, FocusDirection::Down);
        assert!(result.is_none());
    }
}

mod focus_previous_node {
    use super::*;

    #[test]
    fn wraps_to_last() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        let b = interaction_fixture::focusable_node(1);
        add_node_child(&root, &a);
        add_node_child(&root, &b);
        let mut mgr = create_focus_manager(root, &create_focus_manager_options());
        let last = focus_previous_node(&mut mgr);
        assert!(last.is_some());
        assert!(Arc::ptr_eq(&last.unwrap(), &b));
    }
}

mod get_focus_order {
    use super::*;

    #[test]
    fn empty_tree_returns_empty() {
        let root = interaction_fixture::node();
        let mgr = create_focus_manager(root, &create_focus_manager_options());
        let order = get_focus_order(&mgr);
        assert!(order.is_empty());
    }

    #[test]
    fn with_focusable_children_returns_sorted() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(1);
        let b = interaction_fixture::focusable_node(0);
        add_node_child(&root, &a);
        add_node_child(&root, &b);
        let mgr = create_focus_manager(root, &create_focus_manager_options());
        let order = get_focus_order(&mgr);
        assert_eq!(order.len(), 2);
        assert!(Arc::ptr_eq(&order[0], &b));
        assert!(Arc::ptr_eq(&order[1], &a));
    }
}

mod get_focused_node {
    use super::*;

    #[test]
    fn returns_none_initially() {
        let root = interaction_fixture::node();
        let mgr = create_focus_manager(root, &create_focus_manager_options());
        assert!(get_focused_node(&mgr).is_none());
    }
}

mod initialize_focus_manager {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::node();
        let mut mgr = create_focus_manager(root.clone(), &create_focus_manager_options());
        initialize_focus_manager(&mut mgr, root, &create_focus_manager_options());
    }
}

mod is_node_focused {
    use super::*;

    #[test]
    fn checks_identity() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        let b = interaction_fixture::focusable_node(1);
        add_node_child(&root, &a);
        add_node_child(&root, &b);
        let mut mgr = create_focus_manager(root, &create_focus_manager_options());
        focus_next_node(&mut mgr);
        assert!(is_node_focused(&mgr, &a));
        assert!(!is_node_focused(&mgr, &b));
    }
}

mod set_focused_node {
    use super::*;

    #[test]
    fn unfocusable_returns_false() {
        let root = interaction_fixture::node();
        let child = interaction_fixture::node();
        add_node_child(&root, &child);
        let mut mgr = create_focus_manager(root, &create_focus_manager_options());
        assert!(!set_focused_node(&mut mgr, Some(child)));
    }
}

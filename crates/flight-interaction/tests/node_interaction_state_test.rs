use crate::interaction_fixture;
use flight_interaction::node_interaction_state::*;

mod are_node_children_hit_test_enabled {
    use super::*;

    #[test]
    fn defaults_to_true() {
        let node = interaction_fixture::node();
        assert!(are_node_children_hit_test_enabled(&node));
        enable_node_interaction_state(&node);
        assert!(are_node_children_hit_test_enabled(&node));
    }
}

mod create_node_interaction_state {
    use super::*;

    #[test]
    fn defaults() {
        let state = create_node_interaction_state();
        assert!(state.children_hit_test_enabled);
        assert!(!state.hit_test_enabled);
        assert!(!state.focusable);
        assert_eq!(state.tab_index, -1);
    }
}

mod enable_node_interaction_state {
    use super::*;

    #[test]
    fn creates_state_on_node() {
        let node = interaction_fixture::node();
        assert!(get_node_interaction_state(&node).is_none());
        enable_node_interaction_state(&node);
        assert!(get_node_interaction_state(&node).is_some());
    }

    #[test]
    fn returns_same_ref_on_second_call() {
        let node = interaction_fixture::node();
        let a = enable_node_interaction_state(&node);
        let b = enable_node_interaction_state(&node);
        assert!(std::sync::Arc::ptr_eq(&a, &b));
    }
}

mod get_node_cursor {
    use super::*;

    #[test]
    fn defaults_to_none() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        assert!(get_node_cursor(&node).is_none());
    }
}

mod get_node_hit_area {
    use super::*;

    #[test]
    fn returns_none_without_hit_area() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        assert!(get_node_hit_area(&node).is_none());
    }
}

mod get_node_hit_area_is_some {
    use super::*;

    #[test]
    fn defaults_to_false() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        assert!(!get_node_hit_area_is_some(&node));
    }
}

mod get_node_interaction_state {
    use super::*;

    #[test]
    fn returns_none_without_enable() {
        let node = interaction_fixture::node();
        assert!(get_node_interaction_state(&node).is_none());
    }
}

mod get_node_tab_index {
    use super::*;

    #[test]
    fn defaults_to_negative_one() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        assert_eq!(get_node_tab_index(&node), -1);
    }
}

mod initialize_node_interaction_state {
    use super::*;

    #[test]
    fn does_not_panic() {
        let mut state = create_node_interaction_state();
        initialize_node_interaction_state(&mut state);
    }
}

mod is_node_focusable {
    use super::*;

    #[test]
    fn defaults_to_false() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        assert!(!is_node_focusable(&node));
    }
}

mod is_node_hit_test_enabled {
    use super::*;

    #[test]
    fn defaults_to_false() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        assert!(!is_node_hit_test_enabled(&node));
    }
}

mod is_node_pointer_double_click_enabled {
    use super::*;

    #[test]
    fn defaults_to_false() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        assert!(!is_node_pointer_double_click_enabled(&node));
    }
}

mod set_node_children_hit_test_enabled {
    use super::*;

    #[test]
    fn disables_children() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        set_node_children_hit_test_enabled(&node, false);
        assert!(!are_node_children_hit_test_enabled(&node));
    }
}

mod set_node_cursor {
    use super::*;

    #[test]
    fn sets_cursor() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        set_node_cursor(&node, Some("pointer".to_string()));
        assert_eq!(get_node_cursor(&node).unwrap(), "pointer");
    }
}

mod set_node_focusable {
    use super::*;

    #[test]
    fn enables_focusable() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        set_node_focusable(&node, true);
        assert!(is_node_focusable(&node));
    }
}

mod set_node_hit_area {
    use super::*;

    #[test]
    fn set_none_does_not_panic() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        set_node_hit_area(&node, None);
        assert!(!get_node_hit_area_is_some(&node));
    }
}

mod set_node_hit_test_enabled {
    use super::*;

    #[test]
    fn enables_hit_test() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        set_node_hit_test_enabled(&node, true);
        assert!(is_node_hit_test_enabled(&node));
    }
}

mod set_node_pointer_double_click_enabled {
    use super::*;

    #[test]
    fn enables_double_click() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        set_node_pointer_double_click_enabled(&node, true);
        assert!(is_node_pointer_double_click_enabled(&node));
    }
}

mod set_node_tab_index {
    use super::*;

    #[test]
    fn sets_value() {
        let node = interaction_fixture::node();
        enable_node_interaction_state(&node);
        set_node_tab_index(&node, 5);
        assert_eq!(get_node_tab_index(&node), 5);
    }
}

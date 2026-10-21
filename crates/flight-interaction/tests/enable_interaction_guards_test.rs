use crate::interaction_fixture;
use flight_interaction::enable_interaction_guards::*;

mod disable_interaction_guards {
    use super::*;

    #[test]
    fn does_not_panic_after_enable() {
        enable_interaction_guards();
        disable_interaction_guards();
    }
}

mod enable_interaction_guards {
    use super::*;

    #[test]
    fn does_not_panic() {
        enable_interaction_guards();
    }
}

mod explain_interaction_hit_eligibility {
    use super::*;

    #[test]
    fn uninitialised_node_not_eligible() {
        let node = interaction_fixture::node();
        let result = explain_interaction_hit_eligibility(&node);
        assert!(!result.eligible);
        assert!(!result.has_eligible_in_subtree);
    }

    #[test]
    fn enabled_node_is_eligible() {
        let node = interaction_fixture::interactive_node();
        let result = explain_interaction_hit_eligibility(&node);
        assert!(result.eligible);
    }
}

mod set_interaction_connect_guard {
    use super::*;

    #[test]
    fn set_none_does_not_panic() {
        set_interaction_connect_guard(None);
    }
}

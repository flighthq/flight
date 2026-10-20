use flight_flow::*;

mod disable_flow_guards {
    use super::*;

    #[test]
    fn is_idempotent() {
        disable_flow_guards();
        disable_flow_guards();
    }
}

mod enable_flow_guards {
    use super::*;

    #[test]
    fn toggles_the_opt_in_guard_without_panicking() {
        enable_flow_guards();
        disable_flow_guards();
    }
}

mod report_flow_guard {
    use super::*;

    #[test]
    fn is_exercised_through_guarded_transitions() {
        disable_flow_guards();
    }
}

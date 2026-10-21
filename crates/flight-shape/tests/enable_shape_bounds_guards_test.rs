use flight_shape::contract::*;

use crate::support::*;

mod are_shape_bounds_guards_enabled {
    use super::*;

    #[test]
    fn reports_whether_a_guard_is_installed() {
        let state = create_shape_bounds_state();
        assert!(!are_shape_bounds_guards_enabled(&state));
        enable_shape_bounds_guards(&state, &log_state(), 0.0);
        assert!(are_shape_bounds_guards_enabled(&state));
    }
}

mod disable_shape_bounds_guards {
    use super::*;

    #[test]
    fn removes_the_installed_guard() {
        let state = create_shape_bounds_state();
        enable_shape_bounds_guards(&state, &log_state(), 0.0);
        disable_shape_bounds_guards(&state);
        assert!(!are_shape_bounds_guards_enabled(&state));
    }
}

mod enable_shape_bounds_guards {
    use super::*;

    #[test]
    fn installs_a_guard_with_the_injected_log_state() {
        let state = create_shape_bounds_state();
        enable_shape_bounds_guards(&state, &log_state(), 0.0);
        assert!(are_shape_bounds_guards_enabled(&state));
    }
}

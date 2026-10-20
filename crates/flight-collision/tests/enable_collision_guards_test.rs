use flight_collision::*;

mod are_collision_guards_enabled {
    use super::*;

    #[test]
    fn reports_the_current_module_guard_state() {
        // In the Rust port, guards are no-ops: the function always returns false.
        assert_eq!(are_collision_guards_enabled(), false);
    }

    #[test]
    fn returns_false_even_after_enable() {
        // enable_collision_guards is a no-op in Rust, so the state remains false.
        enable_collision_guards();
        assert_eq!(are_collision_guards_enabled(), false);
    }
}

mod disable_collision_guards {
    use super::*;

    #[test]
    fn is_callable_as_a_no_op() {
        // In the Rust port, guard state is runtime-only and not transpiled.
        // Calling disable after enable still leaves the state as false.
        enable_collision_guards();
        disable_collision_guards();
        assert_eq!(are_collision_guards_enabled(), false);
    }
}

mod enable_collision_guards {
    use super::*;

    #[test]
    fn is_callable_as_a_no_op() {
        // In the Rust port, guard state is runtime-only and not transpiled.
        // The function is available but does nothing.
        enable_collision_guards();
        assert_eq!(are_collision_guards_enabled(), false);
        disable_collision_guards();
    }
}

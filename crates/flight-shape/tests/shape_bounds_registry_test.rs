use flight_shape::contract::*;

mod clear_shape_bounds_commands {
    use super::*;

    #[test]
    fn removes_every_registered_command_and_bumps_the_revision() {
        let state = create_shape_bounds_state();
        register_default_shape_bounds_commands(&state);
        clear_shape_bounds_commands(&state);
        assert!(get_shape_bounds_command(&state, "moveTo").is_none());
        assert!(get_shape_bounds_command_registry_revision(&state) > 0);
    }
}

mod create_shape_bounds_state {
    use super::*;

    #[test]
    fn starts_empty_at_revision_zero() {
        let state = create_shape_bounds_state();
        assert_eq!(get_shape_bounds_command_registry_revision(&state), 0);
        assert!(get_shape_bounds_command(&state, "moveTo").is_none());
    }
}

mod get_shape_bounds_command {
    use super::*;

    #[test]
    fn returns_the_registered_record() {
        let state = create_shape_bounds_state();
        register_shape_bounds_command(
            &state,
            ShapeBoundsCommand {
                fill_bounds: None,
                key: String::from("custom"),
                stroke_bounds: None,
            },
        );
        assert!(get_shape_bounds_command(&state, "custom").is_some());
    }
}

mod get_shape_bounds_command_registry_revision {
    use super::*;

    #[test]
    fn advances_on_each_registration() {
        let state = create_shape_bounds_state();
        register_default_shape_bounds_commands(&state);
        assert!(get_shape_bounds_command_registry_revision(&state) > 0);
    }
}

mod register_shape_bounds_command {
    use super::*;

    #[test]
    fn last_write_wins_for_a_key() {
        let state = create_shape_bounds_state();
        register_shape_bounds_command(
            &state,
            ShapeBoundsCommand {
                fill_bounds: None,
                key: String::from("custom"),
                stroke_bounds: None,
            },
        );
        register_shape_bounds_command(
            &state,
            ShapeBoundsCommand {
                fill_bounds: Some(std::sync::Arc::new(
                    |_context: &mut dyn ShapeBoundsContext,
                     _command: &dyn ShapeCommandArgumentCursor| {},
                )),
                key: String::from("custom"),
                stroke_bounds: None,
            },
        );
        assert!(
            get_shape_bounds_command(&state, "custom")
                .unwrap()
                .fill_bounds
                .is_some()
        );
    }
}

mod set_shape_bounds_guard {
    use super::*;

    #[test]
    fn installs_and_clears_a_guard() {
        let state = create_shape_bounds_state();
        let guard: ShapeBoundsGuard = std::sync::Arc::new(
            |_node: &dyn flight_node::contract::Node, _mode: ShapeBoundsMode, _key: &str| {},
        );
        set_shape_bounds_guard(&state, Some(guard));
        assert!(are_shape_bounds_guards_enabled(&state));
        set_shape_bounds_guard(&state, None);
        assert!(!are_shape_bounds_guards_enabled(&state));
    }
}

mod unregister_shape_bounds_command {
    use super::*;

    #[test]
    fn removes_only_the_named_command() {
        let state = create_shape_bounds_state();
        register_default_shape_bounds_commands(&state);
        unregister_shape_bounds_command(&state, "moveTo");
        assert!(get_shape_bounds_command(&state, "moveTo").is_none());
        assert!(get_shape_bounds_command(&state, "lineTo").is_some());
    }
}

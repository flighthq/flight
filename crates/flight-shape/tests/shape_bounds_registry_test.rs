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

mod registry_source_parity {
    use super::*;
    use crate::support::*;
    use flight_node::contract::{NodeRef, get_node_local_bounds_rectangle};

    fn no_handler() -> ShapeBoundsCommandHandler {
        return std::sync::Arc::new(
            |_context: &mut dyn ShapeBoundsContext, _command: &dyn ShapeCommandArgumentCursor| {},
        );
    }

    #[test]
    fn clear_removes_all_commands_and_bumps_the_revision_once() {
        let state = create_shape_bounds_state();
        register_default_shape_bounds_commands(&state);
        let revision = get_shape_bounds_command_registry_revision(&state);
        assert!(get_shape_bounds_command(&state, "moveTo").is_some());
        clear_shape_bounds_commands(&state);
        assert!(get_shape_bounds_command(&state, "moveTo").is_none());
        assert_eq!(
            get_shape_bounds_command_registry_revision(&state),
            revision + 1
        );
    }

    #[test]
    fn distinguishes_an_absent_key_from_an_explicitly_geometry_free_command() {
        let state = create_shape_bounds_state();
        assert!(get_shape_bounds_command(&state, "__test.null-bounds__").is_none());
        register_shape_bounds_command(
            &state,
            ShapeBoundsCommand {
                fill_bounds: None,
                key: String::from("__test.null-bounds__"),
                stroke_bounds: None,
            },
        );
        let command = get_shape_bounds_command(&state, "__test.null-bounds__").expect("command");
        assert!(command.fill_bounds.is_none());
        assert!(command.stroke_bounds.is_none());
        assert_eq!(command.key, "__test.null-bounds__");
    }

    #[test]
    fn registry_revision_invalidates_an_already_cached_shape_when_a_missing_key_becomes_bound() {
        let state = create_shape_bounds_state();
        register_default_shape_bounds_commands(&state);
        let shape = shape_with_state(
            state.clone(),
            vec![
                string("__test.late-bounds__"),
                number(2.0),
                number(10.0),
                number(20.0),
            ],
        );
        let node: NodeRef = shape.clone();
        let before = get_node_local_bounds_rectangle(&node);
        assert_eq!(rect_values(&before), (0.0, 0.0, 0.0, 0.0));
        register_shape_bounds_command(
            &state,
            ShapeBoundsCommand {
                fill_bounds: Some(std::sync::Arc::new(
                    |context: &mut dyn ShapeBoundsContext,
                     command: &dyn ShapeCommandArgumentCursor| {
                        let x = match ShapeCommandArgumentCursor::get_argument(command, 0) {
                            Some(ShapeCommandToken::Number(value)) => *value,
                            _ => 0.0,
                        };
                        let y = match ShapeCommandArgumentCursor::get_argument(command, 1) {
                            Some(ShapeCommandToken::Number(value)) => *value,
                            _ => 0.0,
                        };
                        ShapeBoundsContext::expand_point(context, x, y);
                    },
                )),
                key: String::from("__test.late-bounds__"),
                stroke_bounds: None,
            },
        );
        let after = get_node_local_bounds_rectangle(&node);
        assert_eq!(rect_values(&after), (10.0, 20.0, 0.0, 0.0));
    }

    #[test]
    fn does_not_bump_when_the_same_key_is_rebound_to_the_same_callbacks() {
        let state = create_shape_bounds_state();
        let handler = no_handler();
        let command = ShapeBoundsCommand {
            fill_bounds: Some(handler.clone()),
            key: String::from("__test.stable-bounds__"),
            stroke_bounds: None,
        };
        register_shape_bounds_command(&state, command.clone());
        let revision = get_shape_bounds_command_registry_revision(&state);
        register_shape_bounds_command(&state, command);
        assert_eq!(get_shape_bounds_command_registry_revision(&state), revision);
    }

    #[test]
    fn bumps_the_revision_when_the_callbacks_bound_to_a_key_change() {
        let state = create_shape_bounds_state();
        register_shape_bounds_command(
            &state,
            ShapeBoundsCommand {
                fill_bounds: Some(no_handler()),
                key: String::from("__test.replace-bounds__"),
                stroke_bounds: None,
            },
        );
        let revision = get_shape_bounds_command_registry_revision(&state);
        register_shape_bounds_command(
            &state,
            ShapeBoundsCommand {
                fill_bounds: Some(no_handler()),
                key: String::from("__test.replace-bounds__"),
                stroke_bounds: None,
            },
        );
        assert_eq!(
            get_shape_bounds_command_registry_revision(&state),
            revision + 1
        );
    }

    #[test]
    fn unregister_bumps_only_when_a_binding_was_removed() {
        let state = create_shape_bounds_state();
        register_shape_bounds_command(
            &state,
            ShapeBoundsCommand {
                fill_bounds: None,
                key: String::from("__test.unregister-bounds__"),
                stroke_bounds: None,
            },
        );
        let revision = get_shape_bounds_command_registry_revision(&state);
        unregister_shape_bounds_command(&state, "__test.unregister-bounds__");
        assert_eq!(
            get_shape_bounds_command_registry_revision(&state),
            revision + 1
        );
        unregister_shape_bounds_command(&state, "__test.unregister-bounds__");
        assert_eq!(
            get_shape_bounds_command_registry_revision(&state),
            revision + 1
        );
    }

    #[test]
    fn shape_commands_are_not_registered_on_import_and_defaults_install_idempotently() {
        let state = create_shape_bounds_state();
        let keys = [
            "beginTextureFill",
            "beginFill",
            "beginGradientFill",
            "cubicCurveTo",
            "drawCircle",
            "drawEllipse",
            "drawPath",
            "drawRectangle",
            "drawRoundedRectangle",
            "endFill",
            "lineTextureStyle",
            "lineGradientStyle",
            "lineStyle",
            "lineTo",
            "moveTo",
            "quadraticCurveTo",
        ];
        for key in keys {
            assert!(
                get_shape_bounds_command(&state, key).is_none(),
                "{} registered on import",
                key
            );
        }
        register_default_shape_bounds_commands(&state);
        for key in keys {
            assert!(
                get_shape_bounds_command(&state, key).is_some(),
                "{} missing after install",
                key
            );
        }
        for key in ["lineTextureStyle", "lineGradientStyle"] {
            let command = get_shape_bounds_command(&state, key).expect("command");
            assert!(command.fill_bounds.is_none());
            assert!(command.stroke_bounds.is_none());
        }
        for key in [
            "beginFill",
            "beginTextureFill",
            "beginGradientFill",
            "endFill",
        ] {
            let command = get_shape_bounds_command(&state, key).expect("command");
            assert!(command.fill_bounds.is_some());
            assert!(command.stroke_bounds.is_some());
        }
        let revision = get_shape_bounds_command_registry_revision(&state);
        register_default_shape_bounds_commands(&state);
        assert_eq!(get_shape_bounds_command_registry_revision(&state), revision);
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

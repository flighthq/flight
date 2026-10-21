use flight_shape::contract::*;

mod register_default_shape_bounds_commands {
    use super::*;

    #[test]
    fn installs_the_default_command_set() {
        let state = create_shape_bounds_state();
        register_default_shape_bounds_commands(&state);
        assert!(get_shape_bounds_command(&state, "moveTo").is_some());
        assert!(get_shape_bounds_command(&state, "drawRectangle").is_some());
    }
}

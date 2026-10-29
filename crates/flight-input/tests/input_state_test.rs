use flight_entity::Ref;
use flight_input::contract::*;
use flight_signals::emit_signal;

fn keyboard_data(key_code: i32) -> InputKeyboardData {
    return InputKeyboardData {
        alt_key: false,
        caps_lock: false,
        code: String::new(),
        ctrl_key: false,
        key: String::new(),
        key_code,
        location: 0,
        meta_key: false,
        modifier: 0,
        num_lock: false,
        repeat: false,
        shift_key: false,
        time_stamp: 0.0,
    };
}

fn pointer_data(pointer_id: i32, button: i32) -> InputPointerData {
    return InputPointerData {
        alt_key: false,
        button,
        buttons: 0,
        ctrl_key: false,
        delta_x: 0.0,
        delta_y: 0.0,
        height: 1.0,
        is_primary: true,
        meta_key: false,
        pointer_id,
        pointer_type: PointerType::Mouse,
        pressure: 0.0,
        shift_key: false,
        tilt_x: 0.0,
        tilt_y: 0.0,
        time_stamp: 0.0,
        twist: 0.0,
        wheel_mode: MouseWheelMode::Unknown,
        width: 1.0,
        x: 0.0,
        y: 0.0,
    };
}

fn gamepad_button(gamepad: i32, button: i32, value: f32) -> InputGamepadButtonData {
    return InputGamepadButtonData {
        button,
        gamepad,
        time_stamp: 0.0,
        value,
    };
}

fn gamepad_connect(gamepad: i32) -> InputGamepadConnectData {
    return InputGamepadConnectData {
        gamepad,
        id: "Pad".to_string(),
        mapping: GamepadMappingKind::Standard,
    };
}

fn connected() -> (Ref<InputState>, Ref<InputManager>, InputDisposer) {
    let manager = create_input_manager();
    let state = create_input_state();
    let disposer = connect_input_state_to_input_manager(&state, &manager);
    return (state, manager, disposer);
}

mod connect_input_state_to_input_manager {
    use super::*;

    #[test]
    fn tracks_held_keys() {
        let (state, manager, _disposer) = connected();
        let data = keyboard_data(65);
        emit_signal(&manager.read().unwrap().on_key_down.clone(), &data);
        assert!(is_input_key_down(&state, 65));
        emit_signal(&manager.read().unwrap().on_key_up.clone(), &data);
        assert!(!is_input_key_down(&state, 65));
    }

    #[test]
    fn tracks_held_pointer_buttons_and_clears_on_cancel() {
        let (state, manager, _disposer) = connected();
        let data = pointer_data(1, 0);
        emit_signal(&manager.read().unwrap().on_pointer_down.clone(), &data);
        assert!(is_input_pointer_button_down(&state, 1, 0));
        emit_signal(&manager.read().unwrap().on_pointer_up.clone(), &data);
        assert!(!is_input_pointer_button_down(&state, 1, 0));
        emit_signal(&manager.read().unwrap().on_pointer_down.clone(), &data);
        emit_signal(&manager.read().unwrap().on_pointer_cancel.clone(), &data);
        assert!(!is_input_pointer_button_down(&state, 1, 0));
    }

    #[test]
    fn tracks_gamepad_buttons_and_axes_and_clears_on_connect() {
        let (state, manager, _disposer) = connected();
        emit_signal(
            &manager.read().unwrap().on_gamepad_button_down.clone(),
            &gamepad_button(2, 3, 1.0),
        );
        emit_signal(
            &manager.read().unwrap().on_gamepad_axis_move.clone(),
            &InputGamepadAxisData {
                axis: 1,
                gamepad: 2,
                time_stamp: 0.0,
                value: 0.75,
            },
        );
        assert!(is_input_gamepad_button_down(&state, 2, 3));
        assert_eq!(get_input_gamepad_axis(&state, 2, 1), 0.75);
        emit_signal(
            &manager.read().unwrap().on_gamepad_connect.clone(),
            &gamepad_connect(2),
        );
        assert!(!is_input_gamepad_button_down(&state, 2, 3));
        assert_eq!(get_input_gamepad_axis(&state, 2, 1), 0.0);
    }

    #[test]
    fn records_edges_only_for_genuine_transitions() {
        let (state, manager, _disposer) = connected();
        let data = gamepad_button(0, 1, 1.0);
        emit_signal(
            &manager.read().unwrap().on_gamepad_button_down.clone(),
            &data,
        );
        assert!(was_input_gamepad_button_pressed(&state, 0, 1));
        end_input_state_frame(&state);
        emit_signal(
            &manager.read().unwrap().on_gamepad_button_down.clone(),
            &data,
        );
        assert!(!was_input_gamepad_button_pressed(&state, 0, 1));
        assert!(is_input_gamepad_button_down(&state, 0, 1));
    }

    #[test]
    fn keeps_a_press_and_release_in_the_same_frame() {
        let (state, manager, _disposer) = connected();
        let data = keyboard_data(65);
        emit_signal(&manager.read().unwrap().on_key_down.clone(), &data);
        emit_signal(&manager.read().unwrap().on_key_up.clone(), &data);
        assert!(was_input_key_pressed(&state, 65));
        assert!(was_input_key_released(&state, 65));
        assert!(!is_input_key_down(&state, 65));
    }

    #[test]
    fn ignores_the_auto_repeat_keydown_of_a_held_key() {
        let (state, manager, _disposer) = connected();
        let data = keyboard_data(65);
        emit_signal(&manager.read().unwrap().on_key_down.clone(), &data);
        end_input_state_frame(&state);
        let mut repeat = data.clone();
        repeat.repeat = true;
        emit_signal(&manager.read().unwrap().on_key_down.clone(), &repeat);
        assert!(!was_input_key_pressed(&state, 65));
        assert!(is_input_key_down(&state, 65));
    }

    #[test]
    fn records_a_release_then_press_again_in_the_same_frame() {
        let (state, manager, _disposer) = connected();
        let data = keyboard_data(65);
        emit_signal(&manager.read().unwrap().on_key_down.clone(), &data);
        end_input_state_frame(&state);
        emit_signal(&manager.read().unwrap().on_key_up.clone(), &data);
        emit_signal(&manager.read().unwrap().on_key_down.clone(), &data);
        assert!(was_input_key_pressed(&state, 65));
        assert!(was_input_key_released(&state, 65));
        assert!(is_input_key_down(&state, 65));
    }

    #[test]
    fn the_disposer_stops_tracking() {
        let (state, manager, disposer) = connected();
        let data = keyboard_data(65);
        emit_signal(&manager.read().unwrap().on_key_down.clone(), &data);
        assert!(is_input_key_down(&state, 65));
        disposer();
        emit_signal(&manager.read().unwrap().on_key_up.clone(), &data);
        assert!(is_input_key_down(&state, 65));
    }

    #[test]
    fn every_button_of_one_pointer_is_tracked_independently() {
        let (state, manager, _disposer) = connected();
        emit_signal(
            &manager.read().unwrap().on_pointer_down.clone(),
            &pointer_data(1, 0),
        );
        emit_signal(
            &manager.read().unwrap().on_pointer_down.clone(),
            &pointer_data(1, 1),
        );
        assert!(is_input_pointer_button_down(&state, 1, 0));
        assert!(is_input_pointer_button_down(&state, 1, 1));
        emit_signal(
            &manager.read().unwrap().on_pointer_up.clone(),
            &pointer_data(1, 0),
        );
        assert!(!is_input_pointer_button_down(&state, 1, 0));
        assert!(is_input_pointer_button_down(&state, 1, 1));
    }
}

mod create_input_state {
    use super::*;

    #[test]
    fn starts_with_empty_maps_and_sets() {
        let state = create_input_state();
        let borrowed = state.read().unwrap();
        assert!(borrowed.keys_down.is_empty());
        assert!(borrowed.pointer_buttons_down.is_empty());
        assert!(borrowed.gamepad_buttons_down.is_empty());
        assert!(borrowed.axis_values.is_empty());
        assert!(borrowed.just_pressed_keys.is_empty());
        assert!(borrowed.just_released_keys.is_empty());
        assert!(borrowed.just_pressed_gamepad_buttons.is_empty());
        assert!(borrowed.just_released_gamepad_buttons.is_empty());
    }
}

mod end_input_state_frame {
    use super::*;

    fn mark_edges(state: &Ref<InputState>) {
        let borrowed: &mut InputState = &mut state.write().unwrap();
        borrowed.just_pressed_keys.insert(1);
        borrowed.just_released_keys.insert(2);
        borrowed.just_pressed_gamepad_buttons.insert(3);
        borrowed.just_released_gamepad_buttons.insert(4);
    }

    #[test]
    fn clears_all_four_edge_sets() {
        let state = create_input_state();
        mark_edges(&state);
        end_input_state_frame(&state);
        let borrowed: &InputState = &state.read().unwrap();
        assert!(borrowed.just_pressed_keys.is_empty());
        assert!(borrowed.just_released_keys.is_empty());
        assert!(borrowed.just_pressed_gamepad_buttons.is_empty());
        assert!(borrowed.just_released_gamepad_buttons.is_empty());
    }
}

mod get_input_gamepad_axis {
    use super::*;

    #[test]
    fn returns_zero_for_an_unknown_combination() {
        let state = create_input_state();
        assert_eq!(get_input_gamepad_axis(&state, 0, 0), 0.0);
    }
}

mod initialize_input_state {
    use super::*;

    fn press_key(state: &Ref<InputState>, key_code: i32) {
        let borrowed: &mut InputState = &mut state.write().unwrap();
        borrowed.keys_down.insert(key_code);
    }

    #[test]
    fn replaces_the_state_with_empty_structures() {
        let state = create_input_state();
        press_key(&state, 65);
        let raw = create_input_state();
        initialize_input_state(&mut raw.write().unwrap());
        let held: &InputState = &state.read().unwrap();
        let cleared: &InputState = &raw.read().unwrap();
        assert!(held.keys_down.contains(&65));
        assert!(cleared.keys_down.is_empty());
    }
}

mod is_input_gamepad_button_down {
    use super::*;

    #[test]
    fn returns_false_for_an_unknown_combination() {
        let state = create_input_state();
        assert!(!is_input_gamepad_button_down(&state, 0, 0));
    }
}

mod is_input_key_down {
    use super::*;

    #[test]
    fn returns_false_when_no_keys_are_held() {
        let state = create_input_state();
        assert!(!is_input_key_down(&state, 65));
    }
}

mod is_input_pointer_button_down {
    use super::*;

    #[test]
    fn returns_false_when_no_buttons_are_held() {
        let state = create_input_state();
        assert!(!is_input_pointer_button_down(&state, 0, 0));
    }
}

mod was_input_gamepad_button_pressed {
    use super::*;

    #[test]
    fn returns_true_when_a_button_was_pressed_this_frame() {
        let (state, manager, _disposer) = connected();
        emit_signal(
            &manager.read().unwrap().on_gamepad_button_down.clone(),
            &gamepad_button(0, 0, 1.0),
        );
        assert!(was_input_gamepad_button_pressed(&state, 0, 0));
    }
}

mod was_input_gamepad_button_released {
    use super::*;

    #[test]
    fn returns_true_when_a_button_was_released_this_frame() {
        let (state, manager, _disposer) = connected();
        emit_signal(
            &manager.read().unwrap().on_gamepad_button_down.clone(),
            &gamepad_button(0, 0, 1.0),
        );
        end_input_state_frame(&state);
        emit_signal(
            &manager.read().unwrap().on_gamepad_button_up.clone(),
            &gamepad_button(0, 0, 0.0),
        );
        assert!(was_input_gamepad_button_released(&state, 0, 0));
    }
}

mod was_input_key_pressed {
    use super::*;

    #[test]
    fn returns_false_before_any_event_and_after_the_frame_ends() {
        let state = create_input_state();
        assert!(!was_input_key_pressed(&state, 65));
        let (state, manager, _disposer) = connected();
        emit_signal(
            &manager.read().unwrap().on_key_down.clone(),
            &keyboard_data(65),
        );
        assert!(was_input_key_pressed(&state, 65));
        end_input_state_frame(&state);
        assert!(!was_input_key_pressed(&state, 65));
    }
}

mod was_input_key_released {
    use super::*;

    #[test]
    fn returns_true_only_for_a_release_this_frame() {
        let state = create_input_state();
        assert!(!was_input_key_released(&state, 65));
        let (state, manager, _disposer) = connected();
        emit_signal(
            &manager.read().unwrap().on_key_down.clone(),
            &keyboard_data(65),
        );
        emit_signal(
            &manager.read().unwrap().on_key_up.clone(),
            &keyboard_data(65),
        );
        assert!(was_input_key_released(&state, 65));
        end_input_state_frame(&state);
        assert!(!was_input_key_released(&state, 65));
    }
}

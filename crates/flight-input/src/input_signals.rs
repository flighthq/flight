use flight_entity::{Ref, allocate_entity};
use flight_signals::create_signal;
use std::sync::{Arc, RwLock};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn manager_new_matches_create_input_manager() {
        let method_manager = InputManager::new();
        let free_manager = create_input_manager();
        assert_eq!(
            method_manager.read().unwrap().enabled,
            free_manager.read().unwrap().enabled
        );
        assert_eq!(
            method_manager
                .read()
                .unwrap()
                .on_key_down
                .data
                .read()
                .unwrap()
                .is_none(),
            free_manager
                .read()
                .unwrap()
                .on_key_down
                .data
                .read()
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn signals_new_matches_create_input_signals() {
        let method_signals = InputSignals::new();
        let free_signals = create_input_signals();
        assert_eq!(
            method_signals
                .read()
                .unwrap()
                .on_text_input
                .data
                .read()
                .unwrap()
                .is_none(),
            free_signals
                .read()
                .unwrap()
                .on_text_input
                .data
                .read()
                .unwrap()
                .is_none()
        );
    }
}

/// Allocates an input manager with every signal and `enabled` true (TS `createInputManager`).
pub fn create_input_manager() -> Ref<InputManager> {
    let mut out: InputManager = allocate_entity();
    initialize_input_manager(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Allocates the full event signal group (TS `createInputSignals`).
pub fn create_input_signals() -> Ref<InputSignals> {
    let mut out: InputSignals = allocate_entity();
    initialize_input_signals(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Gives a manager under construction its enabled flag and signals (TS `initializeInputManager`).
pub fn initialize_input_manager(out: &mut InputManager) {
    let signals = create_input_signals();
    let borrowed = signals.read().unwrap();
    out.enabled = true;
    out.on_gamepad_axis_move = borrowed.on_gamepad_axis_move.clone();
    out.on_gamepad_button_down = borrowed.on_gamepad_button_down.clone();
    out.on_gamepad_button_up = borrowed.on_gamepad_button_up.clone();
    out.on_gamepad_connect = borrowed.on_gamepad_connect.clone();
    out.on_gamepad_disconnect = borrowed.on_gamepad_disconnect.clone();
    out.on_key_down = borrowed.on_key_down.clone();
    out.on_key_up = borrowed.on_key_up.clone();
    out.on_pointer_cancel = borrowed.on_pointer_cancel.clone();
    out.on_pointer_down = borrowed.on_pointer_down.clone();
    out.on_pointer_move = borrowed.on_pointer_move.clone();
    out.on_pointer_move_relative = borrowed.on_pointer_move_relative.clone();
    out.on_pointer_up = borrowed.on_pointer_up.clone();
    out.on_text_edit = borrowed.on_text_edit.clone();
    out.on_text_input = borrowed.on_text_input.clone();
    out.on_wheel = borrowed.on_wheel.clone();
}

/// Gives a signal group under construction all 15 inert signals (TS `initializeInputSignals`).
pub fn initialize_input_signals(out: &mut InputSignals) {
    out.on_gamepad_axis_move = create_signal();
    out.on_gamepad_button_down = create_signal();
    out.on_gamepad_button_up = create_signal();
    out.on_gamepad_connect = create_signal();
    out.on_gamepad_disconnect = create_signal();
    out.on_key_down = create_signal();
    out.on_key_up = create_signal();
    out.on_pointer_cancel = create_signal();
    out.on_pointer_down = create_signal();
    out.on_pointer_move = create_signal();
    out.on_pointer_move_relative = create_signal();
    out.on_pointer_up = create_signal();
    out.on_text_edit = create_signal();
    out.on_text_input = create_signal();
    out.on_wheel = create_signal();
}

// ============================================================================
// D18 sugar: constructors delegate to the create functions
// ============================================================================

impl InputManager {
    pub fn new() -> Ref<InputManager> {
        return create_input_manager();
    }
}

impl InputSignals {
    pub fn new() -> Ref<InputSignals> {
        return create_input_signals();
    }
}

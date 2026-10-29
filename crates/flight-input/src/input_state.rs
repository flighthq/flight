use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_signals::{SignalSlot, SlotId, connect_signal, disconnect_signal};

use crate::types::*;

const MAX_GAMEPAD_AXES: i32 = 32;
const MAX_GAMEPAD_BUTTONS: i32 = 64;

/// Allocates an empty held-state snapshot (TS `createInputState`).
pub fn create_input_state() -> Ref<InputState> {
    let mut out: InputState = allocate_entity();
    initialize_input_state(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Gives a state under construction empty maps and sets (TS `initializeInputState`).
pub fn initialize_input_state(out: &mut InputState) {
    out.axis_values = HashMap::new();
    out.gamepad_buttons_down = HashSet::new();
    out.just_pressed_gamepad_buttons = HashSet::new();
    out.just_pressed_keys = HashSet::new();
    out.just_released_gamepad_buttons = HashSet::new();
    out.just_released_keys = HashSet::new();
    out.keys_down = HashSet::new();
    out.pointer_buttons_down = HashMap::new();
}

fn clear_gamepad_state(state: &mut InputState, gamepad: i32) {
    for button in 0..MAX_GAMEPAD_BUTTONS {
        let key = gamepad * MAX_GAMEPAD_BUTTONS + button;
        state.gamepad_buttons_down.remove(&key);
        state.just_pressed_gamepad_buttons.remove(&key);
        state.just_released_gamepad_buttons.remove(&key);
    }
    for axis in 0..MAX_GAMEPAD_AXES {
        state
            .axis_values
            .remove(&(gamepad * MAX_GAMEPAD_AXES + axis));
    }
}

/// Subscribes a state to every manager signal and returns a disposer (TS
/// `connectInputStateToInputManager`). Edge sets record transitions, so a held key's auto-repeat
/// does not count as a new press and a press plus release in one frame both survive.
pub fn connect_input_state_to_input_manager(
    state: &Ref<InputState>,
    manager: &Ref<InputManager>,
) -> InputDisposer {
    let (
        key_down_signal,
        key_up_signal,
        pointer_down_signal,
        pointer_up_signal,
        pointer_cancel_signal,
        gamepad_button_down_signal,
        gamepad_button_up_signal,
        gamepad_axis_move_signal,
        gamepad_connect_signal,
        gamepad_disconnect_signal,
    ) = {
        let locked = manager.read().unwrap();
        (
            locked.on_key_down.clone(),
            locked.on_key_up.clone(),
            locked.on_pointer_down.clone(),
            locked.on_pointer_up.clone(),
            locked.on_pointer_cancel.clone(),
            locked.on_gamepad_button_down.clone(),
            locked.on_gamepad_button_up.clone(),
            locked.on_gamepad_axis_move.clone(),
            locked.on_gamepad_connect.clone(),
            locked.on_gamepad_disconnect.clone(),
        )
    };

    let on_key_down: SignalSlot<InputKeyboardData> = Arc::new({
        let state = state.clone();
        move |data: &InputKeyboardData| {
            let mut locked = state.write().unwrap();
            if !locked.keys_down.contains(&data.key_code) {
                locked.just_pressed_keys.insert(data.key_code);
            }
            locked.keys_down.insert(data.key_code);
        }
    });
    let on_key_up: SignalSlot<InputKeyboardData> = Arc::new({
        let state = state.clone();
        move |data: &InputKeyboardData| {
            let mut locked = state.write().unwrap();
            locked.keys_down.remove(&data.key_code);
            locked.just_released_keys.insert(data.key_code);
        }
    });
    let on_pointer_down: SignalSlot<InputPointerData> = Arc::new({
        let state = state.clone();
        move |data: &InputPointerData| {
            let mut locked = state.write().unwrap();
            let previous = *locked
                .pointer_buttons_down
                .get(&data.pointer_id)
                .unwrap_or(&0);
            let bit = 1u32.wrapping_shl(data.button as u32);
            locked
                .pointer_buttons_down
                .insert(data.pointer_id, previous | bit);
        }
    });
    let on_pointer_up: SignalSlot<InputPointerData> = Arc::new({
        let state = state.clone();
        move |data: &InputPointerData| {
            let mut locked = state.write().unwrap();
            let previous = *locked
                .pointer_buttons_down
                .get(&data.pointer_id)
                .unwrap_or(&0);
            let bit = 1u32.wrapping_shl(data.button as u32);
            let next = previous & !bit;
            if next == 0 {
                locked.pointer_buttons_down.remove(&data.pointer_id);
            } else {
                locked.pointer_buttons_down.insert(data.pointer_id, next);
            }
        }
    });
    let on_pointer_cancel: SignalSlot<InputPointerData> = Arc::new({
        let state = state.clone();
        move |data: &InputPointerData| {
            state
                .write()
                .unwrap()
                .pointer_buttons_down
                .remove(&data.pointer_id);
        }
    });
    let on_gamepad_button_down: SignalSlot<InputGamepadButtonData> = Arc::new({
        let state = state.clone();
        move |data: &InputGamepadButtonData| {
            let key = data.gamepad * MAX_GAMEPAD_BUTTONS + data.button;
            let mut locked = state.write().unwrap();
            if !locked.gamepad_buttons_down.contains(&key) {
                locked.just_pressed_gamepad_buttons.insert(key);
            }
            locked.gamepad_buttons_down.insert(key);
        }
    });
    let on_gamepad_button_up: SignalSlot<InputGamepadButtonData> = Arc::new({
        let state = state.clone();
        move |data: &InputGamepadButtonData| {
            let key = data.gamepad * MAX_GAMEPAD_BUTTONS + data.button;
            let mut locked = state.write().unwrap();
            locked.gamepad_buttons_down.remove(&key);
            locked.just_released_gamepad_buttons.insert(key);
        }
    });
    let on_gamepad_axis_move: SignalSlot<InputGamepadAxisData> = Arc::new({
        let state = state.clone();
        move |data: &InputGamepadAxisData| {
            let key = data.gamepad * MAX_GAMEPAD_AXES + data.axis;
            state.write().unwrap().axis_values.insert(key, data.value);
        }
    });
    let on_gamepad_connect: SignalSlot<InputGamepadConnectData> = Arc::new({
        let state = state.clone();
        move |data: &InputGamepadConnectData| {
            let mut locked = state.write().unwrap();
            clear_gamepad_state(&mut locked, data.gamepad);
        }
    });
    let on_gamepad_disconnect: SignalSlot<InputGamepadConnectData> = Arc::new({
        let state = state.clone();
        move |data: &InputGamepadConnectData| {
            let mut locked = state.write().unwrap();
            clear_gamepad_state(&mut locked, data.gamepad);
        }
    });

    let ids: (
        SlotId,
        SlotId,
        SlotId,
        SlotId,
        SlotId,
        SlotId,
        SlotId,
        SlotId,
        SlotId,
        SlotId,
    ) = (
        connect_signal(&key_down_signal, on_key_down, None),
        connect_signal(&key_up_signal, on_key_up, None),
        connect_signal(&pointer_down_signal, on_pointer_down, None),
        connect_signal(&pointer_up_signal, on_pointer_up, None),
        connect_signal(&pointer_cancel_signal, on_pointer_cancel, None),
        connect_signal(&gamepad_button_down_signal, on_gamepad_button_down, None),
        connect_signal(&gamepad_button_up_signal, on_gamepad_button_up, None),
        connect_signal(&gamepad_axis_move_signal, on_gamepad_axis_move, None),
        connect_signal(&gamepad_connect_signal, on_gamepad_connect, None),
        connect_signal(&gamepad_disconnect_signal, on_gamepad_disconnect, None),
    );

    return Arc::new(move || {
        disconnect_signal(&key_down_signal, ids.0);
        disconnect_signal(&key_up_signal, ids.1);
        disconnect_signal(&pointer_down_signal, ids.2);
        disconnect_signal(&pointer_up_signal, ids.3);
        disconnect_signal(&pointer_cancel_signal, ids.4);
        disconnect_signal(&gamepad_button_down_signal, ids.5);
        disconnect_signal(&gamepad_button_up_signal, ids.6);
        disconnect_signal(&gamepad_axis_move_signal, ids.7);
        disconnect_signal(&gamepad_connect_signal, ids.8);
        disconnect_signal(&gamepad_disconnect_signal, ids.9);
    });
}

/// Clears the four per-frame edge sets (TS `endInputStateFrame`).
pub fn end_input_state_frame(state: &Ref<InputState>) {
    let mut locked = state.write().unwrap();
    locked.just_pressed_keys.clear();
    locked.just_released_keys.clear();
    locked.just_pressed_gamepad_buttons.clear();
    locked.just_released_gamepad_buttons.clear();
}

/// Returns the current gamepad axis value, or 0 when not recorded (TS `getInputGamepadAxis`).
pub fn get_input_gamepad_axis(state: &Ref<InputState>, gamepad: i32, axis: i32) -> f32 {
    return state
        .read()
        .unwrap()
        .axis_values
        .get(&(gamepad * MAX_GAMEPAD_AXES + axis))
        .copied()
        .unwrap_or(0.0);
}

/// Returns whether the gamepad button is held (TS `isInputGamepadButtonDown`).
pub fn is_input_gamepad_button_down(state: &Ref<InputState>, gamepad: i32, button: i32) -> bool {
    return state
        .read()
        .unwrap()
        .gamepad_buttons_down
        .contains(&(gamepad * MAX_GAMEPAD_BUTTONS + button));
}

/// Returns whether the key code is held (TS `isInputKeyDown`).
pub fn is_input_key_down(state: &Ref<InputState>, key_code: i32) -> bool {
    return state.read().unwrap().keys_down.contains(&key_code);
}

/// Returns whether the pointer button is held for that pointer (TS `isInputPointerButtonDown`).
pub fn is_input_pointer_button_down(state: &Ref<InputState>, pointer_id: i32, button: i32) -> bool {
    let locked = state.read().unwrap();
    let bits = *locked.pointer_buttons_down.get(&pointer_id).unwrap_or(&0);
    return (bits & 1u32.wrapping_shl(button as u32)) != 0;
}

/// Returns whether the gamepad button transitioned up -> down this frame (TS
/// `wasInputGamepadButtonPressed`).
pub fn was_input_gamepad_button_pressed(
    state: &Ref<InputState>,
    gamepad: i32,
    button: i32,
) -> bool {
    return state
        .read()
        .unwrap()
        .just_pressed_gamepad_buttons
        .contains(&(gamepad * MAX_GAMEPAD_BUTTONS + button));
}

/// Returns whether the gamepad button transitioned down -> up this frame (TS
/// `wasInputGamepadButtonReleased`).
pub fn was_input_gamepad_button_released(
    state: &Ref<InputState>,
    gamepad: i32,
    button: i32,
) -> bool {
    return state
        .read()
        .unwrap()
        .just_released_gamepad_buttons
        .contains(&(gamepad * MAX_GAMEPAD_BUTTONS + button));
}

/// Returns whether the key transitioned up -> down this frame (TS `wasInputKeyPressed`).
pub fn was_input_key_pressed(state: &Ref<InputState>, key_code: i32) -> bool {
    return state.read().unwrap().just_pressed_keys.contains(&key_code);
}

/// Returns whether the key transitioned down -> up this frame (TS `wasInputKeyReleased`).
pub fn was_input_key_released(state: &Ref<InputState>, key_code: i32) -> bool {
    return state.read().unwrap().just_released_keys.contains(&key_code);
}

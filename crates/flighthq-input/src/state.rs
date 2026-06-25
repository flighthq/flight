//! Live held-input state tracking.
//!
//! [`InputState`] is a passive snapshot of currently-held keys, pointer
//! buttons, gamepad buttons, and axis values, plus per-frame edge sets. Connect
//! it to an [`InputManager`] with [`connect_input_state_to_input_manager`] and
//! roll the edge sets once per frame with [`end_input_state_frame`].

use std::sync::{Arc, Mutex};

use flighthq_signals::{SignalConnectOptions, SlotGuard, connect_signal};
use flighthq_types::input::{
    InputGamepadAxisData, InputGamepadButtonData, InputGamepadConnectData, InputKeyboardData,
    InputPointerData,
};

pub use flighthq_types::input_state::InputState;

use crate::manager::InputManager;

// Maximum axis and button counts used for the compact gamepad-state encoding.
// Encoded key: gamepad * MAX_GAMEPAD_AXES + axis (axes) or
//              gamepad * MAX_GAMEPAD_BUTTONS + button (buttons).
const MAX_GAMEPAD_AXES: u32 = 32;
const MAX_GAMEPAD_BUTTONS: u32 = 64;

/// Allocates a fresh [`InputState`] with empty held-state collections and empty
/// per-frame edge sets.
///
/// Connect it to an [`InputManager`] via
/// [`connect_input_state_to_input_manager`], and call [`end_input_state_frame`]
/// once per logical frame to roll the edge sets.
pub fn create_input_state() -> InputState {
    InputState::default()
}

/// Subscribes `state` to all signals on `manager` to maintain a live held-state
/// snapshot. Also tracks per-frame edge sets (`just_pressed_keys`,
/// `just_released_keys`, `just_pressed_gamepad_buttons`,
/// `just_released_gamepad_buttons`) that accumulate until
/// [`end_input_state_frame`] is called.
///
/// The signal callbacks must be `Send + Sync`, so `state` is shared through an
/// `Arc<Mutex<InputState>>` rather than a borrow — the TS port closes over the
/// `InputState` object directly, which has no Rust equivalent under the signal
/// callback bound. Query the state through the `InputState` accessors after
/// locking, or clone the `Arc` for the caller's own access.
///
/// Returns an [`InputStateConnection`]; dropping it disconnects every
/// subscription (the analogue of the TS disposer closure).
pub fn connect_input_state_to_input_manager(
    state: &Arc<Mutex<InputState>>,
    manager: &InputManager,
) -> InputStateConnection {
    let opts = SignalConnectOptions::default;
    let s = &manager.signals;

    let st = Arc::clone(state);
    let on_key_down = connect_signal(
        &s.on_key_down,
        Arc::new(move |data: &InputKeyboardData| {
            let mut st = st.lock().unwrap();
            st.keys_down.insert(data.key_code);
            st.just_pressed_keys.insert(data.key_code);
            st.just_released_keys.remove(&data.key_code);
        }),
        opts(),
    );

    let st = Arc::clone(state);
    let on_key_up = connect_signal(
        &s.on_key_up,
        Arc::new(move |data: &InputKeyboardData| {
            let mut st = st.lock().unwrap();
            st.keys_down.remove(&data.key_code);
            st.just_released_keys.insert(data.key_code);
            st.just_pressed_keys.remove(&data.key_code);
        }),
        opts(),
    );

    let st = Arc::clone(state);
    let on_pointer_down = connect_signal(
        &s.on_pointer_down,
        Arc::new(move |data: &InputPointerData| {
            let mut st = st.lock().unwrap();
            let prev = st
                .pointer_buttons_down
                .get(&data.pointer_id)
                .copied()
                .unwrap_or(0);
            st.pointer_buttons_down
                .insert(data.pointer_id, prev | (1 << data.button));
        }),
        opts(),
    );

    let st = Arc::clone(state);
    let on_pointer_up = connect_signal(
        &s.on_pointer_up,
        Arc::new(move |data: &InputPointerData| {
            let mut st = st.lock().unwrap();
            let prev = st
                .pointer_buttons_down
                .get(&data.pointer_id)
                .copied()
                .unwrap_or(0);
            let next = prev & !(1 << data.button);
            if next == 0 {
                st.pointer_buttons_down.remove(&data.pointer_id);
            } else {
                st.pointer_buttons_down.insert(data.pointer_id, next);
            }
        }),
        opts(),
    );

    let st = Arc::clone(state);
    let on_pointer_cancel = connect_signal(
        &s.on_pointer_cancel,
        Arc::new(move |data: &InputPointerData| {
            let mut st = st.lock().unwrap();
            st.pointer_buttons_down.remove(&data.pointer_id);
        }),
        opts(),
    );

    let st = Arc::clone(state);
    let on_gamepad_button_down = connect_signal(
        &s.on_gamepad_button_down,
        Arc::new(move |data: &InputGamepadButtonData| {
            let key = data.gamepad * MAX_GAMEPAD_BUTTONS + data.button;
            let mut st = st.lock().unwrap();
            st.gamepad_buttons_down.insert(key);
            st.just_pressed_gamepad_buttons.insert(key);
            st.just_released_gamepad_buttons.remove(&key);
        }),
        opts(),
    );

    let st = Arc::clone(state);
    let on_gamepad_button_up = connect_signal(
        &s.on_gamepad_button_up,
        Arc::new(move |data: &InputGamepadButtonData| {
            let key = data.gamepad * MAX_GAMEPAD_BUTTONS + data.button;
            let mut st = st.lock().unwrap();
            st.gamepad_buttons_down.remove(&key);
            st.just_released_gamepad_buttons.insert(key);
            st.just_pressed_gamepad_buttons.remove(&key);
        }),
        opts(),
    );

    let st = Arc::clone(state);
    let on_gamepad_axis_move = connect_signal(
        &s.on_gamepad_axis_move,
        Arc::new(move |data: &InputGamepadAxisData| {
            let mut st = st.lock().unwrap();
            st.axis_values
                .insert(data.gamepad * MAX_GAMEPAD_AXES + data.axis, data.value);
        }),
        opts(),
    );

    let st = Arc::clone(state);
    let on_gamepad_connect = connect_signal(
        &s.on_gamepad_connect,
        Arc::new(move |data: &InputGamepadConnectData| {
            let mut st = st.lock().unwrap();
            clear_gamepad_slots(&mut st, data.gamepad);
        }),
        opts(),
    );

    let st = Arc::clone(state);
    let on_gamepad_disconnect = connect_signal(
        &s.on_gamepad_disconnect,
        Arc::new(move |data: &InputGamepadConnectData| {
            let mut st = st.lock().unwrap();
            clear_gamepad_slots(&mut st, data.gamepad);
        }),
        opts(),
    );

    InputStateConnection {
        _on_key_down: on_key_down,
        _on_key_up: on_key_up,
        _on_pointer_down: on_pointer_down,
        _on_pointer_up: on_pointer_up,
        _on_pointer_cancel: on_pointer_cancel,
        _on_gamepad_button_down: on_gamepad_button_down,
        _on_gamepad_button_up: on_gamepad_button_up,
        _on_gamepad_axis_move: on_gamepad_axis_move,
        _on_gamepad_connect: on_gamepad_connect,
        _on_gamepad_disconnect: on_gamepad_disconnect,
    }
}

/// Rolls the per-frame edge sets on `state`, clearing `just_pressed_keys`,
/// `just_released_keys`, `just_pressed_gamepad_buttons`, and
/// `just_released_gamepad_buttons`. Call once at the end of each logical frame
/// to prepare the edge sets for the next frame. Held-state collections are
/// untouched.
pub fn end_input_state_frame(state: &mut InputState) {
    state.just_pressed_keys.clear();
    state.just_released_keys.clear();
    state.just_pressed_gamepad_buttons.clear();
    state.just_released_gamepad_buttons.clear();
}

/// Returns the current value of a gamepad axis from `state`, or `0.0` if not
/// recorded. `gamepad` is the gamepad index; `axis` is the axis index.
pub fn get_input_gamepad_axis(state: &InputState, gamepad: u32, axis: u32) -> f32 {
    state
        .axis_values
        .get(&(gamepad * MAX_GAMEPAD_AXES + axis))
        .copied()
        .unwrap_or(0.0)
}

/// Returns `true` if the gamepad button at `gamepad`/`button` is currently held.
pub fn is_input_gamepad_button_down(state: &InputState, gamepad: u32, button: u32) -> bool {
    state
        .gamepad_buttons_down
        .contains(&(gamepad * MAX_GAMEPAD_BUTTONS + button))
}

/// Returns `true` if `key_code` (from `key_code`) is currently held.
pub fn is_input_key_down(state: &InputState, key_code: u32) -> bool {
    state.keys_down.contains(&key_code)
}

/// Returns `true` if `button` is currently held for `pointer_id`. `button`
/// corresponds to `MouseEvent.button` (0 = primary, 1 = middle, 2 = secondary).
pub fn is_input_pointer_button_down(state: &InputState, pointer_id: i32, button: i32) -> bool {
    (state
        .pointer_buttons_down
        .get(&pointer_id)
        .copied()
        .unwrap_or(0)
        & (1 << button))
        != 0
}

/// Returns `true` if the gamepad button at `gamepad`/`button` was pressed this
/// frame (up → down since the last [`end_input_state_frame`]).
pub fn was_input_gamepad_button_pressed(state: &InputState, gamepad: u32, button: u32) -> bool {
    state
        .just_pressed_gamepad_buttons
        .contains(&(gamepad * MAX_GAMEPAD_BUTTONS + button))
}

/// Returns `true` if the gamepad button at `gamepad`/`button` was released this
/// frame (down → up since the last [`end_input_state_frame`]).
pub fn was_input_gamepad_button_released(state: &InputState, gamepad: u32, button: u32) -> bool {
    state
        .just_released_gamepad_buttons
        .contains(&(gamepad * MAX_GAMEPAD_BUTTONS + button))
}

/// Returns `true` if `key_code` was pressed this frame (up → down since the
/// last [`end_input_state_frame`]).
pub fn was_input_key_pressed(state: &InputState, key_code: u32) -> bool {
    state.just_pressed_keys.contains(&key_code)
}

/// Returns `true` if `key_code` was released this frame (down → up since the
/// last [`end_input_state_frame`]).
pub fn was_input_key_released(state: &InputState, key_code: u32) -> bool {
    state.just_released_keys.contains(&key_code)
}

fn clear_gamepad_slots(state: &mut InputState, gamepad: u32) {
    for b in 0..MAX_GAMEPAD_BUTTONS {
        let key = gamepad * MAX_GAMEPAD_BUTTONS + b;
        state.gamepad_buttons_down.remove(&key);
        state.just_pressed_gamepad_buttons.remove(&key);
        state.just_released_gamepad_buttons.remove(&key);
    }
    for a in 0..MAX_GAMEPAD_AXES {
        state.axis_values.remove(&(gamepad * MAX_GAMEPAD_AXES + a));
    }
}

/// The set of signal subscriptions created by
/// [`connect_input_state_to_input_manager`]. Dropping it disconnects every
/// subscription — the analogue of the TS disposer closure.
pub struct InputStateConnection {
    _on_key_down: SlotGuard<InputKeyboardData>,
    _on_key_up: SlotGuard<InputKeyboardData>,
    _on_pointer_down: SlotGuard<InputPointerData>,
    _on_pointer_up: SlotGuard<InputPointerData>,
    _on_pointer_cancel: SlotGuard<InputPointerData>,
    _on_gamepad_button_down: SlotGuard<InputGamepadButtonData>,
    _on_gamepad_button_up: SlotGuard<InputGamepadButtonData>,
    _on_gamepad_axis_move: SlotGuard<InputGamepadAxisData>,
    _on_gamepad_connect: SlotGuard<InputGamepadConnectData>,
    _on_gamepad_disconnect: SlotGuard<InputGamepadConnectData>,
}

#[cfg(test)]
mod tests {
    use super::*;

    use flighthq_types::input::key_code;

    use crate::gamepad::{dispatch_gamepad_axis_event, dispatch_gamepad_button_down_event};
    use crate::keyboard::dispatch_keyboard_event;
    use crate::manager::create_input_manager;
    use crate::pointer::{
        dispatch_pointer_cancel_event, dispatch_pointer_down_event, dispatch_pointer_up_event,
    };

    fn key_event(code: u32) -> InputKeyboardData {
        InputKeyboardData {
            key_code: code,
            ..Default::default()
        }
    }

    #[test]
    fn connect_input_state_to_input_manager_tracks_held_keys() {
        let mut m = create_input_manager();
        let state = Arc::new(Mutex::new(create_input_state()));
        let _conn = connect_input_state_to_input_manager(&state, &m);

        dispatch_keyboard_event(&mut m, key_event(key_code::A), true);
        assert!(is_input_key_down(&state.lock().unwrap(), key_code::A));
        assert!(was_input_key_pressed(&state.lock().unwrap(), key_code::A));

        dispatch_keyboard_event(&mut m, key_event(key_code::A), false);
        assert!(!is_input_key_down(&state.lock().unwrap(), key_code::A));
        assert!(was_input_key_released(&state.lock().unwrap(), key_code::A));
    }

    #[test]
    fn create_input_state_starts_empty() {
        let state = create_input_state();
        assert_eq!(state.keys_down.len(), 0);
        assert_eq!(state.pointer_buttons_down.len(), 0);
        assert_eq!(state.gamepad_buttons_down.len(), 0);
        assert_eq!(state.axis_values.len(), 0);
        assert_eq!(state.just_pressed_keys.len(), 0);
        assert_eq!(state.just_released_keys.len(), 0);
        assert_eq!(state.just_pressed_gamepad_buttons.len(), 0);
        assert_eq!(state.just_released_gamepad_buttons.len(), 0);
    }

    #[test]
    fn tracks_held_pointer_buttons() {
        let mut m = create_input_manager();
        let state = Arc::new(Mutex::new(create_input_state()));
        let _conn = connect_input_state_to_input_manager(&state, &m);

        dispatch_pointer_down_event(
            &mut m,
            InputPointerData {
                pointer_id: 1,
                button: 0,
                buttons: 1,
                ..Default::default()
            },
        );
        assert!(is_input_pointer_button_down(&state.lock().unwrap(), 1, 0));

        dispatch_pointer_up_event(
            &mut m,
            InputPointerData {
                pointer_id: 1,
                button: 0,
                buttons: 0,
                ..Default::default()
            },
        );
        assert!(!is_input_pointer_button_down(&state.lock().unwrap(), 1, 0));
    }

    #[test]
    fn clears_pointer_state_on_cancel() {
        let mut m = create_input_manager();
        let state = Arc::new(Mutex::new(create_input_state()));
        let _conn = connect_input_state_to_input_manager(&state, &m);

        dispatch_pointer_down_event(
            &mut m,
            InputPointerData {
                pointer_id: 2,
                button: 0,
                buttons: 1,
                ..Default::default()
            },
        );
        assert!(is_input_pointer_button_down(&state.lock().unwrap(), 2, 0));

        dispatch_pointer_cancel_event(
            &mut m,
            InputPointerData {
                pointer_id: 2,
                button: 0,
                buttons: 0,
                ..Default::default()
            },
        );
        assert!(!is_input_pointer_button_down(&state.lock().unwrap(), 2, 0));
    }

    #[test]
    fn tracks_gamepad_button_and_axis() {
        let mut m = create_input_manager();
        let state = Arc::new(Mutex::new(create_input_state()));
        let _conn = connect_input_state_to_input_manager(&state, &m);

        dispatch_gamepad_button_down_event(
            &mut m,
            InputGamepadButtonData {
                button: 0,
                gamepad: 0,
                value: 1.0,
                ..Default::default()
            },
        );
        assert!(is_input_gamepad_button_down(&state.lock().unwrap(), 0, 0));
        assert!(was_input_gamepad_button_pressed(
            &state.lock().unwrap(),
            0,
            0
        ));

        dispatch_gamepad_axis_event(
            &mut m,
            InputGamepadAxisData {
                axis: 0,
                gamepad: 0,
                value: 0.75,
                ..Default::default()
            },
        );
        assert_eq!(get_input_gamepad_axis(&state.lock().unwrap(), 0, 0), 0.75);
    }

    #[test]
    fn connection_drop_stops_tracking() {
        let mut m = create_input_manager();
        let state = Arc::new(Mutex::new(create_input_state()));
        {
            let _conn = connect_input_state_to_input_manager(&state, &m);
            dispatch_gamepad_button_down_event(
                &mut m,
                InputGamepadButtonData {
                    button: 1,
                    gamepad: 0,
                    value: 1.0,
                    ..Default::default()
                },
            );
            assert!(is_input_gamepad_button_down(&state.lock().unwrap(), 0, 1));
        }
        // After the connection drops, further events should not update state.
        dispatch_gamepad_button_down_event(
            &mut m,
            InputGamepadButtonData {
                button: 2,
                gamepad: 0,
                value: 1.0,
                ..Default::default()
            },
        );
        assert!(!is_input_gamepad_button_down(&state.lock().unwrap(), 0, 2));
    }

    #[test]
    fn end_input_state_frame_clears_edges_keeps_held() {
        let mut m = create_input_manager();
        let state = Arc::new(Mutex::new(create_input_state()));
        let _conn = connect_input_state_to_input_manager(&state, &m);

        dispatch_gamepad_button_down_event(
            &mut m,
            InputGamepadButtonData {
                button: 0,
                gamepad: 0,
                value: 1.0,
                ..Default::default()
            },
        );
        assert_eq!(state.lock().unwrap().just_pressed_gamepad_buttons.len(), 1);

        end_input_state_frame(&mut state.lock().unwrap());
        let st = state.lock().unwrap();
        assert_eq!(st.just_pressed_gamepad_buttons.len(), 0);
        assert_eq!(st.just_released_gamepad_buttons.len(), 0);
        assert_eq!(st.just_pressed_keys.len(), 0);
        assert_eq!(st.just_released_keys.len(), 0);
        // Held state is preserved across the frame roll.
        assert!(is_input_gamepad_button_down(&st, 0, 0));
    }

    #[test]
    fn was_input_gamepad_button_released_after_release() {
        let mut m = create_input_manager();
        let state = Arc::new(Mutex::new(create_input_state()));
        let _conn = connect_input_state_to_input_manager(&state, &m);

        dispatch_gamepad_button_down_event(
            &mut m,
            InputGamepadButtonData {
                button: 0,
                gamepad: 0,
                value: 1.0,
                ..Default::default()
            },
        );
        end_input_state_frame(&mut state.lock().unwrap());

        crate::gamepad::dispatch_gamepad_button_up_event(
            &mut m,
            InputGamepadButtonData {
                button: 0,
                gamepad: 0,
                value: 0.0,
                ..Default::default()
            },
        );
        assert!(was_input_gamepad_button_released(
            &state.lock().unwrap(),
            0,
            0
        ));
    }

    #[test]
    fn empty_state_query_defaults() {
        let state = create_input_state();
        assert!(!is_input_key_down(&state, key_code::A));
        assert!(!is_input_pointer_button_down(&state, 0, 0));
        assert!(!is_input_gamepad_button_down(&state, 0, 0));
        assert_eq!(get_input_gamepad_axis(&state, 0, 0), 0.0);
        assert!(!was_input_key_pressed(&state, key_code::A));
        assert!(!was_input_key_released(&state, key_code::A));
    }
}

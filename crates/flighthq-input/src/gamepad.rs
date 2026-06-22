//! Gamepad event dispatch and polling.

use std::collections::HashMap;

use flighthq_signals::emit_signal;
use flighthq_types::input::{
    InputGamepadAxisData, InputGamepadButtonData, InputGamepadConnectData,
};

use crate::manager::InputManager;

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

/// Dispatches a gamepad axis-move event, emitting
/// `signals.on_gamepad_axis_move`.
///
/// Does nothing when `manager.enabled` is `false`.
pub fn dispatch_gamepad_axis_event(manager: &mut InputManager, data: InputGamepadAxisData) {
    if !manager.enabled {
        return;
    }
    emit_signal(&manager.signals.on_gamepad_axis_move, &data);
}

/// Dispatches a gamepad button-down event, emitting
/// `signals.on_gamepad_button_down`.
///
/// Does nothing when `manager.enabled` is `false`.
pub fn dispatch_gamepad_button_down_event(
    manager: &mut InputManager,
    data: InputGamepadButtonData,
) {
    if !manager.enabled {
        return;
    }
    emit_signal(&manager.signals.on_gamepad_button_down, &data);
}

/// Dispatches a gamepad button-up event, emitting
/// `signals.on_gamepad_button_up`.
///
/// Does nothing when `manager.enabled` is `false`.
pub fn dispatch_gamepad_button_up_event(manager: &mut InputManager, data: InputGamepadButtonData) {
    if !manager.enabled {
        return;
    }
    emit_signal(&manager.signals.on_gamepad_button_up, &data);
}

/// Dispatches a gamepad connect event, emitting `signals.on_gamepad_connect`.
///
/// Does nothing when `manager.enabled` is `false`.
pub fn dispatch_gamepad_connect_event(manager: &mut InputManager, data: InputGamepadConnectData) {
    if !manager.enabled {
        return;
    }
    emit_signal(&manager.signals.on_gamepad_connect, &data);
}

/// Dispatches a gamepad disconnect event, emitting
/// `signals.on_gamepad_disconnect`.
///
/// Does nothing when `manager.enabled` is `false`.
pub fn dispatch_gamepad_disconnect_event(
    manager: &mut InputManager,
    data: InputGamepadConnectData,
) {
    if !manager.enabled {
        return;
    }
    emit_signal(&manager.signals.on_gamepad_disconnect, &data);
}

// ---------------------------------------------------------------------------
// polling
// ---------------------------------------------------------------------------

/// Polls all connected gamepads and emits axis-move and button signals for
/// any state changes since the last call.
///
/// Must be called once per frame (before input processing) on platforms that
/// do not deliver gamepad state via push events.
///
/// Does nothing when `manager.enabled` is `false`.
pub fn poll_gamepad_input(manager: &mut InputManager) {
    if !manager.enabled {
        return;
    }
    // No portable gamepad backend exists in this crate. The web port reads
    // `navigator.getGamepads()` and diffs against per-manager poll state; here
    // there is no source to read, so polling produces no events. Platforms with
    // a gamepad device feed it instead through `dispatch_gamepad_*` functions,
    // which carry the same normalized payloads. The diffing helpers below keep
    // that logic available for a future backend seam.
    // TODO(wave-N): wire a portable gamepad-snapshot backend so polling can diff
    // raw device state and emit axis/button transitions directly.
    let _ = manager;
}

/// Diffs `current` gamepad snapshots against `previous` poll state and emits
/// axis-move and button transition signals for any changes, updating
/// `previous` in place. Exposed for a future gamepad-snapshot backend that
/// feeds [`poll_gamepad_input`]; mirrors the per-pad diff in the web port.
pub fn poll_gamepad_snapshots(
    manager: &mut InputManager,
    previous: &mut GamepadPollState,
    current: &[GamepadSnapshot],
) {
    if !manager.enabled {
        return;
    }
    for pad in current {
        let prev_axes = previous.axes.entry(pad.index).or_default();
        for (i, &value) in pad.axes.iter().enumerate() {
            let changed = match prev_axes.get(i) {
                Some(&p) => p != value,
                None => true,
            };
            if changed {
                if i < prev_axes.len() {
                    prev_axes[i] = value;
                } else {
                    prev_axes.resize(i + 1, 0.0);
                    prev_axes[i] = value;
                }
                emit_signal(
                    &manager.signals.on_gamepad_axis_move,
                    &InputGamepadAxisData { axis: i as u32, gamepad: pad.index, value },
                );
            }
        }
        let prev_buttons = previous.buttons.entry(pad.index).or_default();
        for (i, btn) in pad.buttons.iter().enumerate() {
            let was_pressed = prev_buttons.get(i).copied().unwrap_or(false);
            if btn.pressed != was_pressed {
                if i < prev_buttons.len() {
                    prev_buttons[i] = btn.pressed;
                } else {
                    prev_buttons.resize(i + 1, false);
                    prev_buttons[i] = btn.pressed;
                }
                let data =
                    InputGamepadButtonData { button: i as u32, gamepad: pad.index, value: btn.value };
                if btn.pressed {
                    emit_signal(&manager.signals.on_gamepad_button_down, &data);
                } else {
                    emit_signal(&manager.signals.on_gamepad_button_up, &data);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// snapshot / poll-state value types
// ---------------------------------------------------------------------------

/// A single button reading within a [`GamepadSnapshot`].
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct GamepadButtonSnapshot {
    pub pressed: bool,
    pub value: f32,
}

/// A point-in-time reading of one gamepad's axes and buttons.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct GamepadSnapshot {
    pub index: u32,
    pub axes: Vec<f32>,
    pub buttons: Vec<GamepadButtonSnapshot>,
}

/// Per-manager retained gamepad state used to diff successive snapshots.
#[derive(Clone, Debug, Default)]
pub struct GamepadPollState {
    pub axes: HashMap<u32, Vec<f32>>,
    pub buttons: HashMap<u32, Vec<bool>>,
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU32, Ordering};

    use flighthq_signals::{SignalConnectOptions, connect_signal};

    use super::*;
    use crate::manager::create_input_manager;

    #[test]
    fn dispatch_gamepad_axis_event_emits_when_enabled() {
        let mut m = create_input_manager();
        let seen = Arc::new(AtomicU32::new(u32::MAX));
        let seen2 = Arc::clone(&seen);
        let _g = connect_signal(
            &m.signals.on_gamepad_axis_move,
            Arc::new(move |d: &InputGamepadAxisData| seen2.store(d.axis, Ordering::SeqCst)),
            SignalConnectOptions::default(),
        );
        dispatch_gamepad_axis_event(
            &mut m,
            InputGamepadAxisData { axis: 2, gamepad: 0, value: 0.5 },
        );
        assert_eq!(seen.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn dispatch_gamepad_connect_event_emits_id() {
        let mut m = create_input_manager();
        let fired = Arc::new(AtomicU32::new(0));
        let fired2 = Arc::clone(&fired);
        let _g = connect_signal(
            &m.signals.on_gamepad_connect,
            Arc::new(move |d: &InputGamepadConnectData| fired2.store(d.gamepad, Ordering::SeqCst)),
            SignalConnectOptions::default(),
        );
        dispatch_gamepad_connect_event(
            &mut m,
            InputGamepadConnectData { gamepad: 3, id: "Xbox Controller".into() },
        );
        assert_eq!(fired.load(Ordering::SeqCst), 3);
    }

    #[test]
    fn dispatch_gamepad_connect_event_respects_enabled() {
        let mut m = create_input_manager();
        m.enabled = false;
        let fired = Arc::new(AtomicU32::new(0));
        let fired2 = Arc::clone(&fired);
        let _g = connect_signal(
            &m.signals.on_gamepad_connect,
            Arc::new(move |_d: &InputGamepadConnectData| {
                fired2.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        dispatch_gamepad_connect_event(
            &mut m,
            InputGamepadConnectData { gamepad: 0, id: "Pad".into() },
        );
        assert_eq!(fired.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn poll_gamepad_input_disabled_no_panic() {
        let mut m = create_input_manager();
        m.enabled = false;
        poll_gamepad_input(&mut m);
    }

    #[test]
    fn poll_gamepad_snapshots_emits_button_down_on_transition() {
        let mut m = create_input_manager();
        let mut state = GamepadPollState::default();
        let snapshot = vec![GamepadSnapshot {
            index: 0,
            axes: vec![],
            buttons: vec![GamepadButtonSnapshot { pressed: true, value: 1.0 }],
        }];

        let button = Arc::new(AtomicU32::new(u32::MAX));
        let button2 = Arc::clone(&button);
        let _g = connect_signal(
            &m.signals.on_gamepad_button_down,
            Arc::new(move |d: &InputGamepadButtonData| button2.store(d.button, Ordering::SeqCst)),
            SignalConnectOptions::default(),
        );

        poll_gamepad_snapshots(&mut m, &mut state, &snapshot);
        assert_eq!(button.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn poll_gamepad_snapshots_does_not_emit_when_unchanged() {
        let mut m = create_input_manager();
        let mut state = GamepadPollState::default();
        let snapshot = vec![GamepadSnapshot {
            index: 0,
            axes: vec![],
            buttons: vec![GamepadButtonSnapshot { pressed: true, value: 1.0 }],
        }];

        poll_gamepad_snapshots(&mut m, &mut state, &snapshot);

        let fired = Arc::new(AtomicU32::new(0));
        let fired2 = Arc::clone(&fired);
        let _g = connect_signal(
            &m.signals.on_gamepad_button_down,
            Arc::new(move |_d: &InputGamepadButtonData| {
                fired2.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        poll_gamepad_snapshots(&mut m, &mut state, &snapshot);
        assert_eq!(fired.load(Ordering::SeqCst), 0);
    }
}

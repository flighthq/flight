//! Gamepad event dispatch and polling.

use std::collections::HashMap;

use flighthq_signals::emit_signal;
use flighthq_types::gamepad_kind::{gamepad_axis_kind, gamepad_button_kind};
use flighthq_types::input::{
    InputGamepadAxisData, InputGamepadButtonData, InputGamepadConnectData,
};

use crate::manager::InputManager;

// ---------------------------------------------------------------------------
// dead zone
// ---------------------------------------------------------------------------

/// Filters a single gamepad axis value through a simple dead zone.
///
/// Values within `[-dead_zone, dead_zone]` map to `0`; values outside are
/// rescaled linearly to `[-1, 1]` so the live range stays continuous.
/// `dead_zone` must be in `[0, 1)`.
pub fn apply_gamepad_axis_dead_zone(value: f32, dead_zone: f32) -> f32 {
    if dead_zone <= 0.0 {
        return value;
    }
    let abs = if value < 0.0 { -value } else { value };
    if abs <= dead_zone {
        return 0.0;
    }
    let sign = if value < 0.0 { -1.0 } else { 1.0 };
    sign * ((abs - dead_zone) / (1.0 - dead_zone))
}

/// Filters a 2-D stick (left or right) through a **radial** dead zone.
///
/// The magnitude of `(x, y)` is compared against `dead_zone`; within the dead
/// zone the output is `(0, 0)`, otherwise the input direction is preserved and
/// the magnitude is rescaled linearly to `[0, 1]`. Writes the filtered X and Y
/// into `out_x`/`out_y`. Alias-safe: inputs are read into locals before any
/// output is written, so passing the same variables as both input and output is
/// valid. `dead_zone` must be in `[0, 1)`.
pub fn apply_gamepad_stick_dead_zone(
    out_x: &mut f32,
    out_y: &mut f32,
    x: f32,
    y: f32,
    dead_zone: f32,
) {
    if dead_zone <= 0.0 {
        *out_x = x;
        *out_y = y;
        return;
    }
    let mag = (x * x + y * y).sqrt();
    if mag <= dead_zone {
        *out_x = 0.0;
        *out_y = 0.0;
        return;
    }
    let scale = (mag - dead_zone) / ((1.0 - dead_zone) * mag);
    *out_x = x * scale;
    *out_y = y * scale;
}

// ---------------------------------------------------------------------------
// standard-mapping names
// ---------------------------------------------------------------------------

/// Returns the semantic axis name (a `GamepadAxisKind` string) for `index` in
/// the standard gamepad mapping, or `None` if `mapping` is not `"standard"` or
/// `index` is out of the standard range.
pub fn get_gamepad_axis_name(mapping: &str, index: usize) -> Option<&'static str> {
    if mapping != "standard" {
        return None;
    }
    STANDARD_AXIS_NAMES.get(index).copied()
}

/// Returns the semantic button name (a `GamepadButtonKind` string) for `index`
/// in the standard gamepad mapping, or `None` if `mapping` is not `"standard"`
/// or `index` is out of the standard range.
pub fn get_gamepad_button_name(mapping: &str, index: usize) -> Option<&'static str> {
    if mapping != "standard" {
        return None;
    }
    STANDARD_BUTTON_NAMES.get(index).copied()
}

// Standard gamepad mapping: button index → GamepadButtonKind string.
const STANDARD_BUTTON_NAMES: [&str; 18] = [
    gamepad_button_kind::BUTTON_SOUTH,   // 0
    gamepad_button_kind::BUTTON_EAST,    // 1
    gamepad_button_kind::BUTTON_WEST,    // 2
    gamepad_button_kind::BUTTON_NORTH,   // 3
    gamepad_button_kind::SHOULDER_LEFT,  // 4
    gamepad_button_kind::SHOULDER_RIGHT, // 5
    gamepad_button_kind::TRIGGER_LEFT,   // 6
    gamepad_button_kind::TRIGGER_RIGHT,  // 7
    gamepad_button_kind::SELECT,         // 8
    gamepad_button_kind::START,          // 9
    gamepad_button_kind::STICK_LEFT,     // 10
    gamepad_button_kind::STICK_RIGHT,    // 11
    gamepad_button_kind::DPAD_UP,        // 12
    gamepad_button_kind::DPAD_DOWN,      // 13
    gamepad_button_kind::DPAD_LEFT,      // 14
    gamepad_button_kind::DPAD_RIGHT,     // 15
    gamepad_button_kind::HOME,           // 16
    gamepad_button_kind::TOUCHPAD,       // 17
];

// Standard gamepad mapping: axis index → GamepadAxisKind string.
const STANDARD_AXIS_NAMES: [&str; 4] = [
    gamepad_axis_kind::STICK_LEFT_X,  // 0
    gamepad_axis_kind::STICK_LEFT_Y,  // 1
    gamepad_axis_kind::STICK_RIGHT_X, // 2
    gamepad_axis_kind::STICK_RIGHT_Y, // 3
];

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
                    &InputGamepadAxisData {
                        axis: i as u32,
                        gamepad: pad.index,
                        time_stamp: 0.0,
                        value,
                    },
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
                let data = InputGamepadButtonData {
                    button: i as u32,
                    gamepad: pad.index,
                    time_stamp: 0.0,
                    value: btn.value,
                };
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
    fn apply_gamepad_axis_dead_zone_zeroes_within_zone() {
        assert_eq!(apply_gamepad_axis_dead_zone(0.1, 0.2), 0.0);
        assert_eq!(apply_gamepad_axis_dead_zone(-0.1, 0.2), 0.0);
    }

    #[test]
    fn apply_gamepad_axis_dead_zone_rescales_full_deflection() {
        assert!((apply_gamepad_axis_dead_zone(1.0, 0.2) - 1.0).abs() < 1e-6);
        assert!((apply_gamepad_axis_dead_zone(-1.0, 0.2) + 1.0).abs() < 1e-6);
    }

    #[test]
    fn apply_gamepad_axis_dead_zone_passes_through_when_zero() {
        assert_eq!(apply_gamepad_axis_dead_zone(0.5, 0.0), 0.5);
    }

    #[test]
    fn apply_gamepad_axis_dead_zone_midpoint_in_range() {
        let mid = apply_gamepad_axis_dead_zone(0.6, 0.2);
        assert!(mid > 0.0 && mid < 1.0);
    }

    #[test]
    fn apply_gamepad_stick_dead_zone_zeroes_within_zone() {
        let mut x = 0.0;
        let mut y = 0.0;
        apply_gamepad_stick_dead_zone(&mut x, &mut y, 0.1, 0.1, 0.2);
        assert_eq!(x, 0.0);
        assert_eq!(y, 0.0);
    }

    #[test]
    fn apply_gamepad_stick_dead_zone_rescales_full_deflection() {
        let mut x = 0.0;
        let mut y = 0.0;
        apply_gamepad_stick_dead_zone(&mut x, &mut y, 1.0, 0.0, 0.2);
        assert!((x - 1.0).abs() < 1e-6);
        assert!(y.abs() < 1e-6);
    }

    #[test]
    fn apply_gamepad_stick_dead_zone_alias_safe() {
        // out and input are the same storage: read inputs to locals first.
        let mut x = 0.8;
        let mut y = 0.0;
        let ix = x;
        let iy = y;
        apply_gamepad_stick_dead_zone(&mut x, &mut y, ix, iy, 0.2);
        assert!(x > 0.0);
        assert!(y.abs() < 1e-6);
    }

    #[test]
    fn apply_gamepad_stick_dead_zone_passes_through_when_zero() {
        let mut x = 0.0;
        let mut y = 0.0;
        apply_gamepad_stick_dead_zone(&mut x, &mut y, 0.3, 0.4, 0.0);
        assert_eq!(x, 0.3);
        assert_eq!(y, 0.4);
    }

    #[test]
    fn get_gamepad_axis_name_standard_mapping() {
        assert_eq!(get_gamepad_axis_name("standard", 0), Some("STICK_LEFT_X"));
        assert_eq!(get_gamepad_axis_name("standard", 1), Some("STICK_LEFT_Y"));
        assert_eq!(get_gamepad_axis_name("standard", 2), Some("STICK_RIGHT_X"));
        assert_eq!(get_gamepad_axis_name("standard", 3), Some("STICK_RIGHT_Y"));
    }

    #[test]
    fn get_gamepad_axis_name_non_standard_is_none() {
        assert_eq!(get_gamepad_axis_name("raw", 0), None);
        assert_eq!(get_gamepad_axis_name("", 0), None);
    }

    #[test]
    fn get_gamepad_axis_name_out_of_range_is_none() {
        assert_eq!(get_gamepad_axis_name("standard", 99), None);
    }

    #[test]
    fn get_gamepad_button_name_standard_mapping() {
        assert_eq!(get_gamepad_button_name("standard", 0), Some("BUTTON_SOUTH"));
        assert_eq!(get_gamepad_button_name("standard", 12), Some("DPAD_UP"));
        assert_eq!(get_gamepad_button_name("standard", 16), Some("HOME"));
    }

    #[test]
    fn get_gamepad_button_name_non_standard_is_none() {
        assert_eq!(get_gamepad_button_name("raw", 0), None);
        assert_eq!(get_gamepad_button_name("", 0), None);
    }

    #[test]
    fn get_gamepad_button_name_out_of_range_is_none() {
        assert_eq!(get_gamepad_button_name("standard", 99), None);
    }

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
            InputGamepadAxisData {
                axis: 2,
                gamepad: 0,
                value: 0.5,
                ..Default::default()
            },
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
            InputGamepadConnectData {
                gamepad: 3,
                id: "Xbox Controller".into(),
                ..Default::default()
            },
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
            InputGamepadConnectData {
                gamepad: 0,
                id: "Pad".into(),
                ..Default::default()
            },
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
            buttons: vec![GamepadButtonSnapshot {
                pressed: true,
                value: 1.0,
            }],
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
            buttons: vec![GamepadButtonSnapshot {
                pressed: true,
                value: 1.0,
            }],
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

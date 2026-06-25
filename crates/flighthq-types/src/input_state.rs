//! Live held-input snapshot and key-repeat options.
//!
//! `InputState` is a passive snapshot of currently-held keys, pointer buttons,
//! gamepad buttons, and axis values, plus per-frame edge sets that record what
//! transitioned this frame. `flighthq-input` subscribes it to an `InputManager`
//! and rolls the edge sets once per frame.

use std::collections::{HashMap, HashSet};

/// Snapshot of currently-held input plus per-frame edge sets.
///
/// Held-state collections (`keys_down`, `pointer_buttons_down`,
/// `gamepad_buttons_down`, `axis_values`) persist until the corresponding
/// release. Edge sets (`just_pressed_*`, `just_released_*`) accumulate within a
/// frame and are cleared by `end_input_state_frame`.
///
/// Gamepad buttons and axes are stored under a compact encoded key:
/// `gamepad * MAX_GAMEPAD_BUTTONS + button` for buttons and
/// `gamepad * MAX_GAMEPAD_AXES + axis` for axes.
#[derive(Clone, Debug, Default)]
pub struct InputState {
    /// Encoded gamepad-axis key → current axis value.
    pub axis_values: HashMap<u32, f32>,
    /// Encoded gamepad-button keys currently held.
    pub gamepad_buttons_down: HashSet<u32>,
    /// Encoded gamepad-button keys pressed this frame.
    pub just_pressed_gamepad_buttons: HashSet<u32>,
    /// Key codes pressed this frame.
    pub just_pressed_keys: HashSet<u32>,
    /// Encoded gamepad-button keys released this frame.
    pub just_released_gamepad_buttons: HashSet<u32>,
    /// Key codes released this frame.
    pub just_released_keys: HashSet<u32>,
    /// Key codes currently held.
    pub keys_down: HashSet<u32>,
    /// Pointer id → bitmask of held buttons (bit `b` = button `b`).
    pub pointer_buttons_down: HashMap<i32, u32>,
}

/// Timing for a software key-repeat timer (gamepad d-pad, virtual keys, native
/// backends that do not auto-repeat).
///
/// On press the callback fires immediately, then again after `delay` ms, then
/// every `interval` ms until stopped.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct InputKeyRepeatOptions {
    /// Milliseconds before the first repeat after the initial press.
    pub delay: f64,
    /// Milliseconds between subsequent repeats.
    pub interval: f64,
}

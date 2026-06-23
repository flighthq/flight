//! SDL event translation into `flighthq-input` data.
//!
//! These functions are deliberately split into two layers:
//!
//! * Pure builders (`build_sdl_pointer_data`, `build_sdl_wheel_data`,
//!   `build_sdl_keyboard_data`) that take plain scalars and produce the
//!   normalized `flighthq-types` input structs. They have no SDL dependency and
//!   are unit-tested on CPU with no window or driver.
//! * Thin adapters (`dispatch_sdl_event`) that read fields off a live
//!   `sdl3::event::Event` and forward them through the builders into an
//!   `InputManager`. These run only inside a real SDL event loop.

use flighthq_input::{
    dispatch_keyboard_event, dispatch_pointer_down_event, dispatch_pointer_move_event,
    dispatch_pointer_up_event, dispatch_wheel_event, get_key_code_from_key_name,
};
use flighthq_types::input::{InputKeyboardData, InputPointerData, MouseWheelMode, PointerType};

// ---------------------------------------------------------------------------
// Pure builders (CPU-testable; no SDL types)
// ---------------------------------------------------------------------------

/// Builds normalized keyboard data from a key name and modifier flags.
///
/// `key_name` follows the same naming the input crate expects (`"ArrowUp"`,
/// `"Escape"`, or a single printable character); it is resolved to a key code
/// via `get_key_code_from_key_name`.
pub fn build_sdl_keyboard_data(
    key_name: &str,
    shift: bool,
    ctrl: bool,
    alt: bool,
    meta: bool,
    repeat: bool,
) -> InputKeyboardData {
    InputKeyboardData {
        alt_key: alt,
        caps_lock: false,
        code: key_name.to_string(),
        ctrl_key: ctrl,
        key: key_name.to_string(),
        key_code: get_key_code_from_key_name(key_name),
        location: 0,
        meta_key: meta,
        modifier: 0,
        num_lock: false,
        repeat,
        shift_key: shift,
    }
}

/// Builds normalized pointer data from a window-space position and SDL mouse
/// button index (`1 = left`, `2 = middle`, `3 = right`).
///
/// SDL's 1-based button index is mapped to the DOM-style 0-based `button`
/// (`0 = left`, `1 = middle`, `2 = right`) the input crate uses, with the
/// matching `buttons` bitmask bit set.
pub fn build_sdl_pointer_data(x: f32, y: f32, sdl_button: u8) -> InputPointerData {
    let button = sdl_button_to_dom_button(sdl_button);
    let buttons = if button >= 0 { 1u32 << button } else { 0 };
    InputPointerData {
        button,
        buttons,
        is_primary: true,
        pointer_id: 1,
        pointer_type: PointerType::Mouse,
        x,
        y,
        ..Default::default()
    }
}

/// Builds normalized wheel data. SDL reports wheel motion in discrete lines,
/// so the mode is always `MouseWheelMode::Lines`.
pub fn build_sdl_wheel_data(x: f32, y: f32, delta_x: f32, delta_y: f32) -> InputPointerData {
    InputPointerData {
        delta_x,
        delta_y,
        is_primary: true,
        pointer_id: 1,
        pointer_type: PointerType::Mouse,
        wheel_mode: MouseWheelMode::Lines,
        x,
        y,
        ..Default::default()
    }
}

/// Maps an SDL 1-based mouse button index to a DOM-style 0-based button index,
/// returning `-1` for an unrecognized button.
pub fn sdl_button_to_dom_button(sdl_button: u8) -> i32 {
    match sdl_button {
        1 => 0, // left
        2 => 1, // middle
        3 => 2, // right
        4 => 3, // x1
        5 => 4, // x2
        _ => -1,
    }
}

// ---------------------------------------------------------------------------
// Live SDL adapter
// ---------------------------------------------------------------------------

/// Translates a single live `sdl3::event::Event` into the matching
/// `flighthq-input` dispatch call against `manager`.
///
/// Returns `true` if the event was a recognized input event and was
/// dispatched, `false` otherwise (the caller may handle window/quit events).
///
/// SDL3 reports mouse positions and wheel deltas as `f32` (SDL2 used `i32`),
/// and `mouse_btn` is the `MouseButton` enum rather than a raw integer. The
/// enum is `#[repr(u8)]` with `Left = 1`, `Middle = 2`, `Right = 3`, `X1 = 4`,
/// `X2 = 5`, so `as u8` yields the same 1-based index `build_sdl_pointer_data`
/// expects.
pub fn dispatch_sdl_event(
    manager: &mut flighthq_input::InputManager,
    event: &sdl3::event::Event,
) -> bool {
    use sdl3::event::Event;
    use sdl3::keyboard::Keycode;

    match event {
        Event::MouseButtonDown {
            x, y, mouse_btn, ..
        } => {
            let data = build_sdl_pointer_data(*x, *y, *mouse_btn as u8);
            dispatch_pointer_down_event(manager, data);
            true
        }
        Event::MouseButtonUp {
            x, y, mouse_btn, ..
        } => {
            let data = build_sdl_pointer_data(*x, *y, *mouse_btn as u8);
            dispatch_pointer_up_event(manager, data);
            true
        }
        Event::MouseMotion { x, y, .. } => {
            let data = build_sdl_pointer_data(*x, *y, 0);
            dispatch_pointer_move_event(manager, data);
            true
        }
        Event::MouseWheel { x, y, .. } => {
            let data = build_sdl_wheel_data(0.0, 0.0, *x, *y);
            dispatch_wheel_event(manager, 0.0, 0.0, *x, *y, MouseWheelMode::Lines, data);
            true
        }
        Event::KeyDown {
            keycode, repeat, ..
        } => {
            let name = keycode.map(|k: Keycode| k.name()).unwrap_or_default();
            let data = build_sdl_keyboard_data(&name, false, false, false, false, *repeat);
            dispatch_keyboard_event(manager, data, true);
            true
        }
        Event::KeyUp { keycode, .. } => {
            let name = keycode.map(|k: Keycode| k.name()).unwrap_or_default();
            let data = build_sdl_keyboard_data(&name, false, false, false, false, false);
            dispatch_keyboard_event(manager, data, false);
            true
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_sdl_keyboard_data_resolves_named_key() {
        let data = build_sdl_keyboard_data("Escape", false, true, false, false, true);
        assert_eq!(data.code, "Escape");
        assert!(data.ctrl_key);
        assert!(data.repeat);
        assert_ne!(data.key_code, flighthq_types::input::key_code::UNKNOWN);
    }

    #[test]
    fn build_sdl_pointer_data_maps_left_button() {
        let data = build_sdl_pointer_data(12.0, 34.0, 1);
        assert_eq!(data.x, 12.0);
        assert_eq!(data.y, 34.0);
        assert_eq!(data.button, 0);
        assert_eq!(data.buttons, 1);
        assert_eq!(data.pointer_type, PointerType::Mouse);
    }

    #[test]
    fn build_sdl_pointer_data_maps_right_button() {
        let data = build_sdl_pointer_data(0.0, 0.0, 3);
        assert_eq!(data.button, 2);
        assert_eq!(data.buttons, 1 << 2);
    }

    #[test]
    fn build_sdl_wheel_data_uses_line_mode() {
        let data = build_sdl_wheel_data(0.0, 0.0, 0.0, -2.0);
        assert_eq!(data.delta_y, -2.0);
        assert_eq!(data.wheel_mode, MouseWheelMode::Lines);
    }

    #[test]
    fn sdl_button_to_dom_button_maps_known_and_unknown() {
        assert_eq!(sdl_button_to_dom_button(1), 0);
        assert_eq!(sdl_button_to_dom_button(2), 1);
        assert_eq!(sdl_button_to_dom_button(3), 2);
        assert_eq!(sdl_button_to_dom_button(0), -1);
        assert_eq!(sdl_button_to_dom_button(99), -1);
    }
}

//! Pure winit -> flighthq-input translation.
//!
//! These functions are CPU-only and hold no GPU or window state, so they are
//! the unit-tested seam of this host: every other module drives an OS event
//! loop that cannot run headlessly. They convert winit's input value types into
//! the normalized `flighthq_types::input` structs that `flighthq-input`'s
//! `dispatch_*` functions consume.

use flighthq_types::input::{InputKeyboardData, InputPointerData, MouseButton, PointerType};

use winit::event::{ElementState, MouseButton as WinitMouseButton, MouseScrollDelta};
use winit::keyboard::{Key, KeyLocation, NamedKey};

/// Builds an [`InputPointerData`] for a pointer at logical window position
/// `(x, y)` with the given pressed-buttons bitmask. The pointer is treated as a
/// primary mouse pointer; touch/pen hosts override `pointer_type` after.
pub fn build_winit_pointer_data(x: f32, y: f32, buttons: u32) -> InputPointerData {
    InputPointerData {
        x,
        y,
        buttons,
        button: -1,
        pointer_id: 0,
        pointer_type: PointerType::Mouse,
        is_primary: true,
        ..Default::default()
    }
}

/// Maps a winit [`MouseScrollDelta`] to `(delta_x, delta_y)` in flighthq's
/// sign convention plus whether the delta is line- or pixel-based. Line deltas
/// map to `MouseWheelMode::Lines`, pixel deltas to `MouseWheelMode::Pixels`.
pub fn translate_winit_scroll_delta(
    delta: MouseScrollDelta,
) -> (f32, f32, flighthq_types::input::MouseWheelMode) {
    use flighthq_types::input::MouseWheelMode;
    match delta {
        MouseScrollDelta::LineDelta(x, y) => (x, y, MouseWheelMode::Lines),
        MouseScrollDelta::PixelDelta(p) => (p.x as f32, p.y as f32, MouseWheelMode::Pixels),
    }
}

/// Returns `true` when the element state is a press. Thin wrapper kept so the
/// event loop reads as `is_winit_press(state)` rather than matching inline.
pub fn is_winit_press(state: ElementState) -> bool {
    matches!(state, ElementState::Pressed)
}

/// Maps a winit [`MouseButton`](WinitMouseButton) to a flighthq
/// [`MouseButton`]. Back/Forward/Other have no flighthq equivalent and return
/// `None` (the host should ignore the event).
pub fn translate_winit_mouse_button(button: WinitMouseButton) -> Option<MouseButton> {
    match button {
        WinitMouseButton::Left => Some(MouseButton::Left),
        WinitMouseButton::Middle => Some(MouseButton::Middle),
        WinitMouseButton::Right => Some(MouseButton::Right),
        WinitMouseButton::Back | WinitMouseButton::Forward | WinitMouseButton::Other(_) => None,
    }
}

/// Returns the DOM-style `buttons` bitmask bit for a flighthq [`MouseButton`],
/// matching the `InputPointerData::buttons` convention (1 = left, 2 = right,
/// 4 = middle).
pub fn winit_mouse_button_mask(button: MouseButton) -> u32 {
    match button {
        MouseButton::Left => 1,
        MouseButton::Right => 2,
        MouseButton::Middle => 4,
    }
}

/// Returns the DOM-style `key` / `code` name string for a winit
/// [`NamedKey`], matching the names `flighthq_input::get_key_code_from_key_name`
/// recognizes (e.g. `NamedKey::ArrowUp` -> `"ArrowUp"`, `NamedKey::Enter` ->
/// `"Enter"`). Unmapped named keys return `""`.
pub fn translate_winit_named_key(key: NamedKey) -> &'static str {
    match key {
        NamedKey::Alt => "Alt",
        NamedKey::AltGraph => "AltRight",
        NamedKey::ArrowDown => "ArrowDown",
        NamedKey::ArrowLeft => "ArrowLeft",
        NamedKey::ArrowRight => "ArrowRight",
        NamedKey::ArrowUp => "ArrowUp",
        NamedKey::Backspace => "Backspace",
        NamedKey::CapsLock => "CapsLock",
        NamedKey::Control => "Control",
        NamedKey::Delete => "Delete",
        NamedKey::End => "End",
        NamedKey::Enter => "Enter",
        NamedKey::Escape => "Escape",
        NamedKey::F1 => "F1",
        NamedKey::F2 => "F2",
        NamedKey::F3 => "F3",
        NamedKey::F4 => "F4",
        NamedKey::F5 => "F5",
        NamedKey::F6 => "F6",
        NamedKey::F7 => "F7",
        NamedKey::F8 => "F8",
        NamedKey::F9 => "F9",
        NamedKey::F10 => "F10",
        NamedKey::F11 => "F11",
        NamedKey::F12 => "F12",
        NamedKey::Home => "Home",
        NamedKey::Insert => "Insert",
        NamedKey::Meta | NamedKey::Super => "Meta",
        NamedKey::PageDown => "PageDown",
        NamedKey::PageUp => "PageUp",
        NamedKey::Shift => "Shift",
        NamedKey::Space => "Space",
        NamedKey::Tab => "Tab",
        _ => "",
    }
}

/// Returns the flighthq key-name string for a winit logical [`Key`], suitable
/// for `flighthq_input::get_key_code_from_key_name`: named keys map through
/// [`translate_winit_named_key`]; character keys yield their text; anything else
/// yields `""` (an unrecognized key).
pub fn winit_key_name(key: &Key) -> String {
    match key {
        Key::Named(named) => translate_winit_named_key(*named).to_string(),
        Key::Character(text) => text.to_string(),
        _ => String::new(),
    }
}

/// Builds an [`InputKeyboardData`] from a winit logical key, its resolved
/// flighthq key code, the active modifier bitmask, the key location, the typed
/// text (if any), and the repeat flag. The host resolves `key_code` and
/// `modifier` through `flighthq-input` before calling this.
pub fn build_winit_keyboard_data(
    key: &Key,
    key_code: u32,
    modifier: u32,
    location: KeyLocation,
    text: Option<&str>,
    repeat: bool,
) -> InputKeyboardData {
    let shift = modifier & flighthq_types::input::key_modifier::SHIFT != 0;
    let ctrl = modifier & flighthq_types::input::key_modifier::CTRL != 0;
    let alt = modifier & flighthq_types::input::key_modifier::ALT != 0;
    let meta = modifier & flighthq_types::input::key_modifier::META != 0;
    let caps_lock = modifier & flighthq_types::input::key_modifier::CAPS_LOCK != 0;
    let num_lock = modifier & flighthq_types::input::key_modifier::NUM_LOCK != 0;
    InputKeyboardData {
        key: text
            .map(str::to_string)
            .unwrap_or_else(|| winit_key_name(key)),
        code: winit_key_name(key),
        key_code,
        location: winit_key_location_index(location),
        modifier,
        repeat,
        shift_key: shift,
        ctrl_key: ctrl,
        alt_key: alt,
        meta_key: meta,
        caps_lock,
        num_lock,
        time_stamp: 0.0,
    }
}

/// Maps a winit [`KeyLocation`] to the DOM `KeyboardEvent.location` index
/// convention (0 standard, 1 left, 2 right, 3 numpad).
pub fn winit_key_location_index(location: KeyLocation) -> u32 {
    match location {
        KeyLocation::Standard => 0,
        KeyLocation::Left => 1,
        KeyLocation::Right => 2,
        KeyLocation::Numpad => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::input::{MouseWheelMode, key_code, key_modifier};

    #[test]
    fn build_winit_keyboard_data_decodes_modifier_flags() {
        let key = Key::Named(NamedKey::Enter);
        let data = build_winit_keyboard_data(
            &key,
            key_code::RETURN,
            key_modifier::LEFT_CTRL | key_modifier::LEFT_SHIFT,
            KeyLocation::Standard,
            None,
            false,
        );
        assert!(data.ctrl_key);
        assert!(data.shift_key);
        assert!(!data.alt_key);
        assert_eq!(data.key_code, key_code::RETURN);
        assert_eq!(data.code, "Enter");
    }

    #[test]
    fn build_winit_pointer_data_carries_position_and_buttons() {
        let data = build_winit_pointer_data(12.0, 34.0, 1);
        assert_eq!(data.x, 12.0);
        assert_eq!(data.y, 34.0);
        assert_eq!(data.buttons, 1);
        assert!(data.is_primary);
        assert_eq!(data.pointer_type, PointerType::Mouse);
    }

    #[test]
    fn is_winit_press_distinguishes_states() {
        assert!(is_winit_press(ElementState::Pressed));
        assert!(!is_winit_press(ElementState::Released));
    }

    #[test]
    fn translate_winit_mouse_button_maps_primary_three() {
        assert_eq!(
            translate_winit_mouse_button(WinitMouseButton::Left),
            Some(MouseButton::Left)
        );
        assert_eq!(
            translate_winit_mouse_button(WinitMouseButton::Right),
            Some(MouseButton::Right)
        );
        assert_eq!(
            translate_winit_mouse_button(WinitMouseButton::Middle),
            Some(MouseButton::Middle)
        );
        assert_eq!(translate_winit_mouse_button(WinitMouseButton::Back), None);
        assert_eq!(
            translate_winit_mouse_button(WinitMouseButton::Other(7)),
            None
        );
    }

    #[test]
    fn translate_winit_named_key_maps_common_keys() {
        assert_eq!(translate_winit_named_key(NamedKey::ArrowUp), "ArrowUp");
        assert_eq!(translate_winit_named_key(NamedKey::Escape), "Escape");
        assert_eq!(translate_winit_named_key(NamedKey::Space), "Space");
        assert_eq!(translate_winit_named_key(NamedKey::F5), "F5");
        assert_eq!(translate_winit_named_key(NamedKey::Super), "Meta");
        assert_eq!(translate_winit_named_key(NamedKey::Pause), "");
    }

    #[test]
    fn translate_winit_scroll_delta_maps_line_and_pixel() {
        let (x, y, mode) = translate_winit_scroll_delta(MouseScrollDelta::LineDelta(1.0, -2.0));
        assert_eq!((x, y), (1.0, -2.0));
        assert_eq!(mode, MouseWheelMode::Lines);

        let (x, y, mode) = translate_winit_scroll_delta(MouseScrollDelta::PixelDelta(
            winit::dpi::PhysicalPosition::new(3.0, 4.0),
        ));
        assert_eq!((x, y), (3.0, 4.0));
        assert_eq!(mode, MouseWheelMode::Pixels);
    }

    #[test]
    fn winit_key_location_index_maps_locations() {
        assert_eq!(winit_key_location_index(KeyLocation::Standard), 0);
        assert_eq!(winit_key_location_index(KeyLocation::Left), 1);
        assert_eq!(winit_key_location_index(KeyLocation::Right), 2);
        assert_eq!(winit_key_location_index(KeyLocation::Numpad), 3);
    }

    #[test]
    fn winit_key_name_uses_character_text() {
        assert_eq!(winit_key_name(&Key::Character("a".into())), "a");
        assert_eq!(winit_key_name(&Key::Named(NamedKey::Tab)), "Tab");
    }

    #[test]
    fn winit_mouse_button_mask_matches_dom_bits() {
        assert_eq!(winit_mouse_button_mask(MouseButton::Left), 1);
        assert_eq!(winit_mouse_button_mask(MouseButton::Right), 2);
        assert_eq!(winit_mouse_button_mask(MouseButton::Middle), 4);
    }
}

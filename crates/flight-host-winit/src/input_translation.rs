//! Pure translation from winit 0.30 input values to Flight ingress records.

// flight-lint: allow-file(contract-vocabulary, f64) Native winit event values are translated at the platform boundary, and input coordinates and timestamps follow Flight's f64 records

use flight_input::{
    InputKeyboardData, InputPointerData, InputTextData, MouseWheelMode, PointerType,
};
use winit::event::{ElementState, MouseButton, MouseScrollDelta, Touch, TouchPhase};
use winit::keyboard::{Key, KeyCode, KeyLocation, ModifiersState, NamedKey, PhysicalKey};

/// The DOM-compatible button number and `buttons` bit for one winit button.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WinitPointerButton {
    pub button: i32,
    pub mask: u32,
}

/// Builds the normalized Flight keyboard record for a winit key event.
pub fn build_winit_keyboard_data(
    logical_key: &Key,
    physical_key: PhysicalKey,
    location: KeyLocation,
    modifiers: ModifiersState,
    repeat: bool,
    time_stamp: f64,
) -> InputKeyboardData {
    let (code, key_code) = translate_winit_physical_key(physical_key);
    return InputKeyboardData {
        alt_key: modifiers.alt_key(),
        caps_lock: false,
        code,
        ctrl_key: modifiers.control_key(),
        key: translate_winit_key(logical_key),
        key_code,
        location: translate_winit_key_location(location),
        meta_key: modifiers.super_key(),
        modifier: modifier_bits(modifiers),
        num_lock: false,
        repeat,
        shift_key: modifiers.shift_key(),
        time_stamp,
    };
}

/// Builds a primary mouse-pointer record.
pub fn build_winit_pointer_data(
    x: f64,
    y: f64,
    buttons: u32,
    modifiers: ModifiersState,
    time_stamp: f64,
) -> InputPointerData {
    return InputPointerData {
        alt_key: modifiers.alt_key(),
        buttons,
        ctrl_key: modifiers.control_key(),
        is_primary: true,
        meta_key: modifiers.super_key(),
        pointer_id: 0,
        pointer_type: PointerType::Mouse,
        shift_key: modifiers.shift_key(),
        time_stamp,
        x,
        y,
        ..InputPointerData::default()
    };
}

/// Builds committed or composing text ingress.
pub fn build_winit_text_data(text: &str, is_composing: bool) -> InputTextData {
    return InputTextData {
        is_composing,
        text: text.to_string(),
    };
}

/// Builds a touch pointer record, preserving winit's stable touch id and optional pressure.
pub fn build_winit_touch_data(
    touch: &Touch,
    modifiers: ModifiersState,
    time_stamp: f64,
) -> InputPointerData {
    let pressure = touch.force.map_or(0.0, |force| match force {
        winit::event::Force::Calibrated {
            force,
            max_possible_force,
            ..
        } => (force / max_possible_force).clamp(0.0, 1.0) as f32,
        winit::event::Force::Normalized(value) => value.clamp(0.0, 1.0) as f32,
    });
    return InputPointerData {
        alt_key: modifiers.alt_key(),
        button: 0,
        buttons: if matches!(touch.phase, TouchPhase::Started | TouchPhase::Moved) {
            1
        } else {
            0
        },
        ctrl_key: modifiers.control_key(),
        is_primary: touch.id == 0,
        meta_key: modifiers.super_key(),
        pointer_id: i32::try_from(touch.id).unwrap_or(i32::MAX),
        pointer_type: PointerType::Touch,
        pressure,
        shift_key: modifiers.shift_key(),
        time_stamp,
        x: touch.location.x,
        y: touch.location.y,
        ..InputPointerData::default()
    };
}

/// Returns whether an element-state transition is a press.
pub fn is_winit_press(state: ElementState) -> bool {
    return state == ElementState::Pressed;
}

fn modifier_bits(modifiers: ModifiersState) -> i32 {
    let mut bits = 0;
    if modifiers.shift_key() {
        bits |= 1;
    }
    if modifiers.control_key() {
        bits |= 2;
    }
    if modifiers.alt_key() {
        bits |= 4;
    }
    if modifiers.super_key() {
        bits |= 8;
    }
    return bits;
}

/// Returns a DOM logical-key string.
pub fn translate_winit_key(key: &Key) -> String {
    return match key {
        Key::Named(named) => translate_winit_named_key(*named).to_string(),
        Key::Character(text) => text.to_string(),
        _ => "Unidentified".to_string(),
    };
}

/// Maps a winit key location to the DOM location number.
pub fn translate_winit_key_location(location: KeyLocation) -> i32 {
    return match location {
        KeyLocation::Standard => 0,
        KeyLocation::Left => 1,
        KeyLocation::Right => 2,
        KeyLocation::Numpad => 3,
    };
}

/// Maps every winit mouse button, including Back and Forward, to DOM-compatible values.
pub fn translate_winit_mouse_button(button: MouseButton) -> WinitPointerButton {
    return match button {
        MouseButton::Left => WinitPointerButton { button: 0, mask: 1 },
        MouseButton::Right => WinitPointerButton { button: 2, mask: 2 },
        MouseButton::Middle => WinitPointerButton { button: 1, mask: 4 },
        MouseButton::Back => WinitPointerButton { button: 3, mask: 8 },
        MouseButton::Forward => WinitPointerButton {
            button: 4,
            mask: 16,
        },
        MouseButton::Other(value) => {
            let button = i32::from(value);
            let mask = 1_u32.checked_shl(u32::from(value).min(31)).unwrap_or(0);
            WinitPointerButton { button, mask }
        }
    };
}

/// Maps winit's logical named keys to DOM key names used by Flight.
pub fn translate_winit_named_key(key: NamedKey) -> &'static str {
    return match key {
        NamedKey::Alt => "Alt",
        NamedKey::AltGraph => "AltGraph",
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
        NamedKey::Space => " ",
        NamedKey::Tab => "Tab",
        _ => "Unidentified",
    };
}

/// Maps a physical key to its DOM `code` and Flight numeric key code.
pub fn translate_winit_physical_key(key: PhysicalKey) -> (String, i32) {
    let PhysicalKey::Code(code) = key else {
        return ("Unidentified".to_string(), 0);
    };
    let ordinal = code as i32;
    let flight_code = if (KeyCode::KeyA as i32..=KeyCode::KeyZ as i32).contains(&ordinal) {
        flight_input::KEY_CODE_A + (ordinal - KeyCode::KeyA as i32)
    } else if (KeyCode::Digit0 as i32..=KeyCode::Digit9 as i32).contains(&ordinal) {
        flight_input::KEY_CODE_NUMBER_0 + (ordinal - KeyCode::Digit0 as i32)
    } else if (KeyCode::F1 as i32..=KeyCode::F12 as i32).contains(&ordinal) {
        flight_input::KEY_CODE_F1 + (ordinal - KeyCode::F1 as i32)
    } else if code == KeyCode::Numpad0 {
        flight_input::KEY_CODE_NUMPAD_0
    } else if (KeyCode::Numpad1 as i32..=KeyCode::Numpad9 as i32).contains(&ordinal) {
        flight_input::KEY_CODE_NUMPAD_1 + (ordinal - KeyCode::Numpad1 as i32)
    } else {
        match code {
            KeyCode::ArrowDown => flight_input::KEY_CODE_DOWN,
            KeyCode::ArrowLeft => flight_input::KEY_CODE_LEFT,
            KeyCode::ArrowRight => flight_input::KEY_CODE_RIGHT,
            KeyCode::ArrowUp => flight_input::KEY_CODE_UP,
            KeyCode::Backspace => flight_input::KEY_CODE_BACKSPACE,
            KeyCode::CapsLock => flight_input::KEY_CODE_CAPS_LOCK,
            KeyCode::Delete => flight_input::KEY_CODE_DELETE,
            KeyCode::End => flight_input::KEY_CODE_END,
            KeyCode::Enter => flight_input::KEY_CODE_RETURN,
            KeyCode::Escape => flight_input::KEY_CODE_ESCAPE,
            KeyCode::Home => flight_input::KEY_CODE_HOME,
            KeyCode::Insert => flight_input::KEY_CODE_INSERT,
            KeyCode::NumpadEnter => flight_input::KEY_CODE_NUMPAD_ENTER,
            KeyCode::PageDown => flight_input::KEY_CODE_PAGE_DOWN,
            KeyCode::PageUp => flight_input::KEY_CODE_PAGE_UP,
            KeyCode::Space => flight_input::KEY_CODE_SPACE,
            KeyCode::Tab => flight_input::KEY_CODE_TAB,
            KeyCode::AltLeft => flight_input::KEY_CODE_LEFT_ALT,
            KeyCode::AltRight => flight_input::KEY_CODE_RIGHT_ALT,
            KeyCode::ControlLeft => flight_input::KEY_CODE_LEFT_CTRL,
            KeyCode::ControlRight => flight_input::KEY_CODE_RIGHT_CTRL,
            KeyCode::ShiftLeft => flight_input::KEY_CODE_LEFT_SHIFT,
            KeyCode::ShiftRight => flight_input::KEY_CODE_RIGHT_SHIFT,
            KeyCode::SuperLeft => flight_input::KEY_CODE_LEFT_META,
            KeyCode::SuperRight => flight_input::KEY_CODE_RIGHT_META,
            _ => 0,
        }
    };
    return (format!("{code:?}"), flight_code);
}

/// Maps a line or pixel wheel delta without changing winit's sign convention.
pub fn translate_winit_scroll_delta(delta: &MouseScrollDelta) -> (f64, f64, MouseWheelMode) {
    return match delta {
        MouseScrollDelta::LineDelta(x, y) => (f64::from(*x), f64::from(*y), MouseWheelMode::Lines),
        MouseScrollDelta::PixelDelta(position) => (position.x, position.y, MouseWheelMode::Pixels),
    };
}

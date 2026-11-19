//! Pure translation from SDL3 input values to Flight ingress records.

// flight-lint: allow-file(contract-vocabulary, f64) Native SDL event values are translated at the platform boundary, and input coordinates and timestamps follow Flight's f64 records

use std::collections::BTreeMap;

use flight_input::{
    GamepadAxisKind, GamepadButtonKind, InputGamepadAxisData, InputGamepadButtonData,
    InputKeyboardData, InputPointerData, InputTextData, MouseWheelMode, PointerType,
};
use sdl3::gamepad::{Axis, Button};
use sdl3::joystick::JoystickId;
use sdl3::keyboard::{Keycode, Mod, Scancode};
use sdl3::mouse::{MouseButton, MouseWheelDirection};

/// Flight's normalized modifier state for one SDL keyboard event.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SdlModifiers {
    pub alt_key: bool,
    pub caps_lock: bool,
    pub ctrl_key: bool,
    pub meta_key: bool,
    pub modifier: i32,
    pub num_lock: bool,
    pub shift_key: bool,
}

/// The DOM-compatible button number and `buttons` bit for one SDL button.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SdlPointerButton {
    pub button: i32,
    pub mask: u32,
}

/// DOM physical-key information derived from an SDL scancode.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SdlPhysicalKey {
    pub code: String,
    pub key_code: i32,
    pub location: i32,
}

/// Dense Flight gamepad identities retained independently of SDL's unsigned joystick IDs.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SdlGamepadIdMap {
    by_flight: BTreeMap<i32, JoystickId>,
    by_sdl: BTreeMap<JoystickId, i32>,
}

/// Creates an empty dense gamepad identity map.
pub fn create_sdl_gamepad_id_map() -> SdlGamepadIdMap {
    return SdlGamepadIdMap::default();
}

/// Builds one normalized Flight gamepad-axis event for an SDL stick axis.
pub fn build_sdl_gamepad_axis_data(
    gamepad: i32,
    axis: Axis,
    value: i16,
    timestamp_ns: u64,
) -> Option<InputGamepadAxisData> {
    let axis = translate_sdl_gamepad_axis(axis)?;
    return Some(InputGamepadAxisData {
        axis: axis as i32,
        gamepad,
        time_stamp: sdl_timestamp_milliseconds(timestamp_ns),
        value: normalize_sdl_gamepad_stick(value),
    });
}

/// Builds one normalized Flight gamepad-button event for an SDL button.
pub fn build_sdl_gamepad_button_data(
    gamepad: i32,
    button: Button,
    pressed: bool,
    timestamp_ns: u64,
) -> Option<InputGamepadButtonData> {
    let button = translate_sdl_gamepad_button(button)?;
    return Some(InputGamepadButtonData {
        button: button as i32,
        gamepad,
        time_stamp: sdl_timestamp_milliseconds(timestamp_ns),
        value: if pressed { 1.0 } else { 0.0 },
    });
}

/// Builds a normalized keyboard record without using SDL's display-name strings.
pub fn build_sdl_keyboard_data(
    keycode: Option<Keycode>,
    scancode: Option<Scancode>,
    keymod: Mod,
    repeat: bool,
    timestamp_ns: u64,
) -> InputKeyboardData {
    let modifiers = translate_sdl_modifiers(keymod);
    let physical = translate_sdl_scancode(scancode);
    return InputKeyboardData {
        alt_key: modifiers.alt_key,
        caps_lock: modifiers.caps_lock,
        code: physical.code,
        ctrl_key: modifiers.ctrl_key,
        key: translate_sdl_key(keycode, keymod),
        key_code: physical.key_code,
        location: physical.location,
        meta_key: modifiers.meta_key,
        modifier: modifiers.modifier,
        num_lock: modifiers.num_lock,
        repeat,
        shift_key: modifiers.shift_key,
        time_stamp: sdl_timestamp_milliseconds(timestamp_ns),
    };
}

/// Builds one normalized absolute or relative mouse-pointer record.
pub fn build_sdl_pointer_data(
    x: f32,
    y: f32,
    delta_x: f32,
    delta_y: f32,
    buttons: u32,
    keymod: Mod,
    timestamp_ns: u64,
) -> InputPointerData {
    let modifiers = translate_sdl_modifiers(keymod);
    return InputPointerData {
        alt_key: modifiers.alt_key,
        buttons,
        ctrl_key: modifiers.ctrl_key,
        delta_x: f64::from(delta_x),
        delta_y: f64::from(delta_y),
        is_primary: true,
        meta_key: modifiers.meta_key,
        pointer_id: 0,
        pointer_type: PointerType::Mouse,
        shift_key: modifiers.shift_key,
        time_stamp: sdl_timestamp_milliseconds(timestamp_ns),
        x: f64::from(x),
        y: f64::from(y),
        ..InputPointerData::default()
    };
}

/// Builds committed or composing text ingress.
pub fn build_sdl_text_data(text: &str, is_composing: bool) -> InputTextData {
    return InputTextData {
        is_composing,
        text: text.to_string(),
    };
}

/// Builds one normalized touch-pointer record from SDL's normalized coordinates.
#[allow(clippy::too_many_arguments)]
pub fn build_sdl_touch_data(
    pointer_id: i32,
    x: f32,
    y: f32,
    delta_x: f32,
    delta_y: f32,
    pressure: f32,
    logical_width: f64,
    logical_height: f64,
    is_primary: bool,
    active: bool,
    keymod: Mod,
    timestamp_ns: u64,
) -> InputPointerData {
    let modifiers = translate_sdl_modifiers(keymod);
    return InputPointerData {
        alt_key: modifiers.alt_key,
        button: 0,
        buttons: if active { 1 } else { 0 },
        ctrl_key: modifiers.ctrl_key,
        delta_x: f64::from(delta_x) * logical_width,
        delta_y: f64::from(delta_y) * logical_height,
        is_primary,
        meta_key: modifiers.meta_key,
        pointer_id,
        pointer_type: PointerType::Touch,
        pressure: pressure.clamp(0.0, 1.0),
        shift_key: modifiers.shift_key,
        time_stamp: sdl_timestamp_milliseconds(timestamp_ns),
        x: f64::from(x) * logical_width,
        y: f64::from(y) * logical_height,
        ..InputPointerData::default()
    };
}

/// Builds a trigger update using Flight's button event representation.
pub fn build_sdl_trigger_data(
    gamepad: i32,
    axis: Axis,
    value: i16,
    timestamp_ns: u64,
) -> Option<InputGamepadButtonData> {
    let button = match axis {
        Axis::TriggerLeft => GamepadButtonKind::TriggerLeft,
        Axis::TriggerRight => GamepadButtonKind::TriggerRight,
        _ => return None,
    };
    return Some(InputGamepadButtonData {
        button: button as i32,
        gamepad,
        time_stamp: sdl_timestamp_milliseconds(timestamp_ns),
        value: normalize_sdl_gamepad_trigger(value),
    });
}

/// Builds a line-mode wheel record at SDL's event-provided pointer position.
#[allow(clippy::too_many_arguments)]
pub fn build_sdl_wheel_data(
    x: f32,
    y: f32,
    delta_x: f32,
    delta_y: f32,
    direction: MouseWheelDirection,
    buttons: u32,
    keymod: Mod,
    timestamp_ns: u64,
) -> InputPointerData {
    let mut data = build_sdl_pointer_data(x, y, 0.0, 0.0, buttons, keymod, timestamp_ns);
    let sign = if direction == MouseWheelDirection::Flipped {
        -1.0
    } else {
        1.0
    };
    data.delta_x = f64::from(delta_x) * sign;
    data.delta_y = f64::from(delta_y) * sign;
    data.wheel_mode = MouseWheelMode::Lines;
    return data;
}

/// Allocates or returns the dense nonnegative Flight ID for an SDL joystick.
pub fn connect_sdl_gamepad_id(map: &mut SdlGamepadIdMap, joystick: JoystickId) -> i32 {
    if let Some(id) = map.by_sdl.get(&joystick) {
        return *id;
    }
    let mut id = 0;
    while map.by_flight.contains_key(&id) {
        id += 1;
    }
    map.by_sdl.insert(joystick, id);
    map.by_flight.insert(id, joystick);
    return id;
}

/// Removes both directions of one SDL-to-Flight gamepad identity.
pub fn disconnect_sdl_gamepad_id(map: &mut SdlGamepadIdMap, joystick: JoystickId) -> Option<i32> {
    let id = map.by_sdl.remove(&joystick)?;
    map.by_flight.remove(&id);
    return Some(id);
}

/// Returns the Flight ID for a connected SDL joystick.
pub fn get_sdl_gamepad_id(map: &SdlGamepadIdMap, joystick: JoystickId) -> Option<i32> {
    return map.by_sdl.get(&joystick).copied();
}

/// Normalizes SDL's asymmetric signed stick range exactly to `[-1, 1]`.
pub fn normalize_sdl_gamepad_stick(value: i16) -> f32 {
    return if value < 0 {
        f32::from(value) / 32_768.0
    } else {
        f32::from(value) / 32_767.0
    };
}

/// Normalizes SDL's trigger range to `[0, 1]`.
pub fn normalize_sdl_gamepad_trigger(value: i16) -> f32 {
    return f32::from(value.max(0)) / 32_767.0;
}

/// Converts SDL3's nanosecond event timestamp to Flight milliseconds.
pub fn sdl_timestamp_milliseconds(timestamp_ns: u64) -> f64 {
    return timestamp_ns as f64 / 1_000_000.0;
}

/// Maps SDL's normalized gamepad stick axes into Flight semantics.
pub fn translate_sdl_gamepad_axis(axis: Axis) -> Option<GamepadAxisKind> {
    return match axis {
        Axis::LeftX => Some(GamepadAxisKind::StickLeftX),
        Axis::LeftY => Some(GamepadAxisKind::StickLeftY),
        Axis::RightX => Some(GamepadAxisKind::StickRightX),
        Axis::RightY => Some(GamepadAxisKind::StickRightY),
        Axis::TriggerLeft | Axis::TriggerRight => None,
    };
}

/// Maps every representable SDL gamepad button and ignores extras Flight cannot name.
pub fn translate_sdl_gamepad_button(button: Button) -> Option<GamepadButtonKind> {
    return match button {
        Button::South => Some(GamepadButtonKind::ButtonSouth),
        Button::East => Some(GamepadButtonKind::ButtonEast),
        Button::West => Some(GamepadButtonKind::ButtonWest),
        Button::North => Some(GamepadButtonKind::ButtonNorth),
        Button::Back => Some(GamepadButtonKind::Select),
        Button::Guide => Some(GamepadButtonKind::Home),
        Button::Start => Some(GamepadButtonKind::Start),
        Button::LeftStick => Some(GamepadButtonKind::StickLeft),
        Button::RightStick => Some(GamepadButtonKind::StickRight),
        Button::LeftShoulder => Some(GamepadButtonKind::ShoulderLeft),
        Button::RightShoulder => Some(GamepadButtonKind::ShoulderRight),
        Button::DPadUp => Some(GamepadButtonKind::DpadUp),
        Button::DPadDown => Some(GamepadButtonKind::DpadDown),
        Button::DPadLeft => Some(GamepadButtonKind::DpadLeft),
        Button::DPadRight => Some(GamepadButtonKind::DpadRight),
        Button::Touchpad => Some(GamepadButtonKind::Touchpad),
        Button::Misc1
        | Button::Misc2
        | Button::Misc3
        | Button::Misc4
        | Button::Misc5
        | Button::Misc6
        | Button::RightPaddle1
        | Button::LeftPaddle1
        | Button::RightPaddle2
        | Button::LeftPaddle2 => None,
    };
}

/// Maps SDL keycodes to DOM logical-key names without passing through `Keycode::name()`.
pub fn translate_sdl_key(keycode: Option<Keycode>, keymod: Mod) -> String {
    let Some(keycode) = keycode else {
        return "Unidentified".to_string();
    };
    let named = match keycode {
        Keycode::Return | Keycode::KpEnter | Keycode::Return2 => Some("Enter"),
        Keycode::Escape => Some("Escape"),
        Keycode::Backspace | Keycode::KpBackspace => Some("Backspace"),
        Keycode::Tab | Keycode::KpTab => Some("Tab"),
        Keycode::Space | Keycode::KpSpace => Some(" "),
        Keycode::Delete => Some("Delete"),
        Keycode::Insert => Some("Insert"),
        Keycode::Home => Some("Home"),
        Keycode::End => Some("End"),
        Keycode::PageUp => Some("PageUp"),
        Keycode::PageDown => Some("PageDown"),
        Keycode::Left => Some("ArrowLeft"),
        Keycode::Right => Some("ArrowRight"),
        Keycode::Up => Some("ArrowUp"),
        Keycode::Down => Some("ArrowDown"),
        Keycode::CapsLock => Some("CapsLock"),
        Keycode::NumLockClear => Some("NumLock"),
        Keycode::LCtrl | Keycode::RCtrl => Some("Control"),
        Keycode::LShift | Keycode::RShift => Some("Shift"),
        Keycode::LAlt | Keycode::RAlt => Some("Alt"),
        Keycode::LGui | Keycode::RGui => Some("Meta"),
        _ => None,
    };
    if let Some(named) = named {
        return named.to_string();
    }
    let raw = keycode as u32;
    if (Keycode::F1 as u32..=Keycode::F12 as u32).contains(&raw) {
        return format!("F{}", raw - Keycode::F1 as u32 + 1);
    }
    if (Keycode::F13 as u32..=Keycode::F24 as u32).contains(&raw) {
        return format!("F{}", raw - Keycode::F13 as u32 + 13);
    }
    let printable = match keycode {
        Keycode::Kp0 => Some('0'),
        Keycode::Kp1 => Some('1'),
        Keycode::Kp2 => Some('2'),
        Keycode::Kp3 => Some('3'),
        Keycode::Kp4 => Some('4'),
        Keycode::Kp5 => Some('5'),
        Keycode::Kp6 => Some('6'),
        Keycode::Kp7 => Some('7'),
        Keycode::Kp8 => Some('8'),
        Keycode::Kp9 => Some('9'),
        Keycode::KpPeriod => Some('.'),
        Keycode::KpDivide => Some('/'),
        Keycode::KpMultiply => Some('*'),
        Keycode::KpMinus => Some('-'),
        Keycode::KpPlus => Some('+'),
        _ if raw < Keycode::ScancodeMask as u32 => char::from_u32(raw),
        _ => None,
    };
    let Some(mut printable) = printable.filter(|value| !value.is_control()) else {
        return "Unidentified".to_string();
    };
    if keymod.intersects(Mod::LSHIFTMOD | Mod::RSHIFTMOD) && printable.is_ascii_lowercase() {
        printable = printable.to_ascii_uppercase();
    }
    return printable.to_string();
}

/// Maps SDL modifier flags to booleans and Flight's stable modifier mask.
pub fn translate_sdl_modifiers(keymod: Mod) -> SdlModifiers {
    let shift_key = keymod.intersects(Mod::LSHIFTMOD | Mod::RSHIFTMOD);
    let ctrl_key = keymod.intersects(Mod::LCTRLMOD | Mod::RCTRLMOD);
    let alt_key = keymod.intersects(Mod::LALTMOD | Mod::RALTMOD);
    let meta_key = keymod.intersects(Mod::LGUIMOD | Mod::RGUIMOD);
    return SdlModifiers {
        alt_key,
        caps_lock: keymod.contains(Mod::CAPSMOD),
        ctrl_key,
        meta_key,
        modifier: i32::from(shift_key)
            | (i32::from(ctrl_key) << 1)
            | (i32::from(alt_key) << 2)
            | (i32::from(meta_key) << 3),
        num_lock: keymod.contains(Mod::NUMMOD),
        shift_key,
    };
}

/// Maps SDL's five named mouse buttons to DOM button numbers and persistent masks.
pub fn translate_sdl_mouse_button(button: MouseButton) -> SdlPointerButton {
    return match button {
        MouseButton::Left => SdlPointerButton { button: 0, mask: 1 },
        MouseButton::Right => SdlPointerButton { button: 2, mask: 2 },
        MouseButton::Middle => SdlPointerButton { button: 1, mask: 4 },
        MouseButton::X1 => SdlPointerButton { button: 3, mask: 8 },
        MouseButton::X2 => SdlPointerButton {
            button: 4,
            mask: 16,
        },
        MouseButton::Unknown => SdlPointerButton {
            button: -1,
            mask: 0,
        },
    };
}

/// Maps an SDL physical scancode to DOM `code`, Flight key code, and DOM location.
pub fn translate_sdl_scancode(scancode: Option<Scancode>) -> SdlPhysicalKey {
    let Some(scancode) = scancode else {
        return unidentified_physical_key();
    };
    let raw = scancode as i32;
    if (Scancode::A as i32..=Scancode::Z as i32).contains(&raw) {
        let offset = raw - Scancode::A as i32;
        return SdlPhysicalKey {
            code: format!("Key{}", char::from(b'A' + offset as u8)),
            key_code: flight_input::KEY_CODE_A + offset,
            location: 0,
        };
    }
    if (Scancode::_1 as i32..=Scancode::_9 as i32).contains(&raw) {
        let offset = raw - Scancode::_1 as i32;
        return SdlPhysicalKey {
            code: format!("Digit{}", offset + 1),
            key_code: flight_input::KEY_CODE_NUMBER_1 + offset,
            location: 0,
        };
    }
    if scancode == Scancode::_0 {
        return SdlPhysicalKey {
            code: "Digit0".to_string(),
            key_code: flight_input::KEY_CODE_NUMBER_0,
            location: 0,
        };
    }
    if (Scancode::F1 as i32..=Scancode::F12 as i32).contains(&raw) {
        let offset = raw - Scancode::F1 as i32;
        return SdlPhysicalKey {
            code: format!("F{}", offset + 1),
            key_code: flight_input::KEY_CODE_F1 + offset,
            location: 0,
        };
    }
    if (Scancode::F13 as i32..=Scancode::F24 as i32).contains(&raw) {
        let offset = raw - Scancode::F13 as i32;
        return SdlPhysicalKey {
            code: format!("F{}", offset + 13),
            key_code: flight_input::KEY_CODE_F13 + offset,
            location: 0,
        };
    }
    if (Scancode::Kp1 as i32..=Scancode::Kp9 as i32).contains(&raw) {
        let offset = raw - Scancode::Kp1 as i32;
        return SdlPhysicalKey {
            code: format!("Numpad{}", offset + 1),
            key_code: flight_input::KEY_CODE_NUMPAD_1 + offset,
            location: 3,
        };
    }
    let (code, key_code, location) = match scancode {
        Scancode::Return => ("Enter", flight_input::KEY_CODE_RETURN, 0),
        Scancode::Escape => ("Escape", flight_input::KEY_CODE_ESCAPE, 0),
        Scancode::Backspace => ("Backspace", flight_input::KEY_CODE_BACKSPACE, 0),
        Scancode::Tab => ("Tab", flight_input::KEY_CODE_TAB, 0),
        Scancode::Space => ("Space", flight_input::KEY_CODE_SPACE, 0),
        Scancode::Minus => ("Minus", flight_input::KEY_CODE_MINUS, 0),
        Scancode::Equals => ("Equal", flight_input::KEY_CODE_EQUALS, 0),
        Scancode::LeftBracket => ("BracketLeft", flight_input::KEY_CODE_LEFT_BRACKET, 0),
        Scancode::RightBracket => ("BracketRight", flight_input::KEY_CODE_RIGHT_BRACKET, 0),
        Scancode::Backslash => ("Backslash", flight_input::KEY_CODE_BACKSLASH, 0),
        Scancode::Semicolon => ("Semicolon", flight_input::KEY_CODE_SEMICOLON, 0),
        Scancode::Apostrophe => ("Quote", flight_input::KEY_CODE_SINGLE_QUOTE, 0),
        Scancode::Grave => ("Backquote", flight_input::KEY_CODE_GRAVE, 0),
        Scancode::Comma => ("Comma", flight_input::KEY_CODE_COMMA, 0),
        Scancode::Period => ("Period", flight_input::KEY_CODE_PERIOD, 0),
        Scancode::Slash => ("Slash", flight_input::KEY_CODE_SLASH, 0),
        Scancode::CapsLock => ("CapsLock", flight_input::KEY_CODE_CAPS_LOCK, 0),
        Scancode::PrintScreen => ("PrintScreen", flight_input::KEY_CODE_PRINT_SCREEN, 0),
        Scancode::ScrollLock => ("ScrollLock", flight_input::KEY_CODE_SCROLL_LOCK, 0),
        Scancode::Pause => ("Pause", flight_input::KEY_CODE_PAUSE, 0),
        Scancode::Insert => ("Insert", flight_input::KEY_CODE_INSERT, 0),
        Scancode::Home => ("Home", flight_input::KEY_CODE_HOME, 0),
        Scancode::PageUp => ("PageUp", flight_input::KEY_CODE_PAGE_UP, 0),
        Scancode::Delete => ("Delete", flight_input::KEY_CODE_DELETE, 0),
        Scancode::End => ("End", flight_input::KEY_CODE_END, 0),
        Scancode::PageDown => ("PageDown", flight_input::KEY_CODE_PAGE_DOWN, 0),
        Scancode::Right => ("ArrowRight", flight_input::KEY_CODE_RIGHT, 0),
        Scancode::Left => ("ArrowLeft", flight_input::KEY_CODE_LEFT, 0),
        Scancode::Down => ("ArrowDown", flight_input::KEY_CODE_DOWN, 0),
        Scancode::Up => ("ArrowUp", flight_input::KEY_CODE_UP, 0),
        Scancode::NumLockClear => ("NumLock", flight_input::KEY_CODE_NUM_LOCK, 3),
        Scancode::KpDivide => ("NumpadDivide", flight_input::KEY_CODE_NUMPAD_DIVIDE, 3),
        Scancode::KpMultiply => ("NumpadMultiply", flight_input::KEY_CODE_NUMPAD_MULTIPLY, 3),
        Scancode::KpMinus => ("NumpadSubtract", flight_input::KEY_CODE_NUMPAD_MINUS, 3),
        Scancode::KpPlus => ("NumpadAdd", flight_input::KEY_CODE_NUMPAD_PLUS, 3),
        Scancode::KpEnter => ("NumpadEnter", flight_input::KEY_CODE_NUMPAD_ENTER, 3),
        Scancode::Kp0 => ("Numpad0", flight_input::KEY_CODE_NUMPAD_0, 3),
        Scancode::KpPeriod => ("NumpadDecimal", flight_input::KEY_CODE_NUMPAD_PERIOD, 3),
        Scancode::LCtrl => ("ControlLeft", flight_input::KEY_CODE_LEFT_CTRL, 1),
        Scancode::LShift => ("ShiftLeft", flight_input::KEY_CODE_LEFT_SHIFT, 1),
        Scancode::LAlt => ("AltLeft", flight_input::KEY_CODE_LEFT_ALT, 1),
        Scancode::LGui => ("MetaLeft", flight_input::KEY_CODE_LEFT_META, 1),
        Scancode::RCtrl => ("ControlRight", flight_input::KEY_CODE_RIGHT_CTRL, 2),
        Scancode::RShift => ("ShiftRight", flight_input::KEY_CODE_RIGHT_SHIFT, 2),
        Scancode::RAlt => ("AltRight", flight_input::KEY_CODE_RIGHT_ALT, 2),
        Scancode::RGui => ("MetaRight", flight_input::KEY_CODE_RIGHT_META, 2),
        _ => return unidentified_physical_key(),
    };
    return SdlPhysicalKey {
        code: code.to_string(),
        key_code,
        location,
    };
}

fn unidentified_physical_key() -> SdlPhysicalKey {
    return SdlPhysicalKey {
        code: "Unidentified".to_string(),
        key_code: flight_input::KEY_CODE_UNKNOWN,
        location: 0,
    };
}

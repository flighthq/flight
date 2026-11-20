//! Pure translation from winit 0.30 input values to Flight ingress records.

// flight-lint: allow-file(contract-vocabulary, f64) Native winit event values are translated at the platform boundary, and input coordinates and timestamps follow Flight's f64 records

use flight_input::{
    InputIngressSink, InputKeyboardData, InputPointerData, InputTextData, MouseWheelMode,
    PointerType,
};
use winit::event::{ElementState, Ime, MouseButton, MouseScrollDelta, Touch, TouchPhase};
use winit::keyboard::{Key, KeyCode, KeyLocation, ModifiersState, NamedKey, PhysicalKey};

/// The DOM-compatible button number and `buttons` bit for one winit button.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WinitPointerButton {
    pub button: i32,
    pub mask: u32,
}

/// Builds committed or composing text ingress from a winit IME event; enable/disable carry no text.
pub fn build_winit_ime_text_data(ime: &Ime) -> Option<InputTextData> {
    return match ime {
        Ime::Preedit(text, _) => Some(build_winit_text_data(text, true)),
        Ime::Commit(text) => Some(build_winit_text_data(text, false)),
        Ime::Enabled | Ime::Disabled => None,
    };
}

/// Builds the normalized Flight keyboard record for a winit key event. `modifiers` is the state for
/// this event (see [`get_winit_key_event_modifiers`]); winit 0.30 reports no lock state, so
/// `caps_lock` and `num_lock` are always false.
pub fn build_winit_keyboard_data(
    logical_key: &Key,
    physical_key: PhysicalKey,
    location: KeyLocation,
    modifiers: ModifiersState,
    repeat: bool,
    time_stamp: f64,
) -> InputKeyboardData {
    let code = translate_winit_physical_key(physical_key);
    let key = translate_winit_key(logical_key);
    let location = translate_winit_key_location(location);
    return InputKeyboardData {
        alt_key: modifiers.alt_key(),
        caps_lock: false,
        key_code: translate_winit_key_code(&code, &key, location),
        code,
        ctrl_key: modifiers.control_key(),
        key,
        location,
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

/// Builds a wheel record at the pointer position with DOM `deltaX`/`deltaY` signs.
pub fn build_winit_wheel_data(
    x: f64,
    y: f64,
    buttons: u32,
    modifiers: ModifiersState,
    delta: &MouseScrollDelta,
    time_stamp: f64,
) -> InputPointerData {
    let mut data = build_winit_pointer_data(x, y, buttons, modifiers, time_stamp);
    (data.delta_x, data.delta_y, data.wheel_mode) = translate_winit_scroll_delta(delta);
    return data;
}

/// Delivers text to the sink slot its kind belongs to: composing text to `text_edit`, committed
/// text to `text_input`.
pub fn dispatch_winit_text(sink: &InputIngressSink, data: &InputTextData) {
    if data.is_composing {
        (sink.text_edit)(data);
    } else {
        (sink.text_input)(data);
    }
}

fn get_flight_key_code_for_code(code: &str) -> i32 {
    return match code {
        "Again" => flight_input::KEY_CODE_AGAIN,
        "AltLeft" => flight_input::KEY_CODE_LEFT_ALT,
        "AltRight" => flight_input::KEY_CODE_RIGHT_ALT,
        "ArrowDown" => flight_input::KEY_CODE_DOWN,
        "ArrowLeft" => flight_input::KEY_CODE_LEFT,
        "ArrowRight" => flight_input::KEY_CODE_RIGHT,
        "ArrowUp" => flight_input::KEY_CODE_UP,
        "AudioVolumeDown" => flight_input::KEY_CODE_AUDIO_MUTE,
        "Backspace" => flight_input::KEY_CODE_BACKSPACE,
        "BrowserBack" => flight_input::KEY_CODE_APP_CONTROL_BACK,
        "BrowserBookmarks" => flight_input::KEY_CODE_APP_CONTROL_BOOKMARKS,
        "BrowserForward" => flight_input::KEY_CODE_APP_CONTROL_FORWARD,
        "BrowserHome" => flight_input::KEY_CODE_APP_CONTROL_HOME,
        "BrowserRefresh" => flight_input::KEY_CODE_APP_CONTROL_REFRESH,
        "BrowserSearch" => flight_input::KEY_CODE_APP_CONTROL_SEARCH,
        "BrowserStop" => flight_input::KEY_CODE_APP_CONTROL_STOP,
        "CapsLock" => flight_input::KEY_CODE_CAPS_LOCK,
        "ContextMenu" => flight_input::KEY_CODE_APPLICATION,
        "ControlLeft" => flight_input::KEY_CODE_LEFT_CTRL,
        "ControlRight" => flight_input::KEY_CODE_RIGHT_CTRL,
        "Convert" => 0,
        "Copy" => flight_input::KEY_CODE_COPY,
        "Cut" => flight_input::KEY_CODE_CUT,
        "Delete" => flight_input::KEY_CODE_DELETE,
        "Eject" => flight_input::KEY_CODE_EJECT,
        "End" => flight_input::KEY_CODE_END,
        "Enter" => flight_input::KEY_CODE_RETURN,
        "Escape" => flight_input::KEY_CODE_ESCAPE,
        "F1" => flight_input::KEY_CODE_F1,
        "F2" => flight_input::KEY_CODE_F2,
        "F3" => flight_input::KEY_CODE_F3,
        "F4" => flight_input::KEY_CODE_F4,
        "F5" => flight_input::KEY_CODE_F5,
        "F6" => flight_input::KEY_CODE_F6,
        "F7" => flight_input::KEY_CODE_F7,
        "F8" => flight_input::KEY_CODE_F8,
        "F9" => flight_input::KEY_CODE_F9,
        "F10" => flight_input::KEY_CODE_F10,
        "F11" => flight_input::KEY_CODE_F11,
        "F12" => flight_input::KEY_CODE_F12,
        "F13" => flight_input::KEY_CODE_F13,
        "F14" => flight_input::KEY_CODE_F14,
        "F15" => flight_input::KEY_CODE_F15,
        "F16" => flight_input::KEY_CODE_F16,
        "F17" => flight_input::KEY_CODE_F17,
        "F18" => flight_input::KEY_CODE_F18,
        "F19" => flight_input::KEY_CODE_F19,
        "F20" => flight_input::KEY_CODE_F20,
        "F21" => flight_input::KEY_CODE_F21,
        "F22" => flight_input::KEY_CODE_F22,
        "F23" => flight_input::KEY_CODE_F23,
        "F24" => flight_input::KEY_CODE_F24,
        "Find" => flight_input::KEY_CODE_FIND,
        "Help" => flight_input::KEY_CODE_HELP,
        "Home" => flight_input::KEY_CODE_HOME,
        "Insert" => flight_input::KEY_CODE_INSERT,
        "IntlBackslash" => flight_input::KEY_CODE_BACKSLASH,
        "LaunchApp1" => flight_input::KEY_CODE_COMPUTER,
        "LaunchApp2" => flight_input::KEY_CODE_CALCULATOR,
        "LaunchMail" => flight_input::KEY_CODE_MAIL,
        "LaunchMediaPlayer" => flight_input::KEY_CODE_MEDIA_SELECT,
        "MediaPlayPause" => flight_input::KEY_CODE_AUDIO_PLAY,
        "MediaStop" => flight_input::KEY_CODE_AUDIO_STOP,
        "MediaTrackNext" => flight_input::KEY_CODE_AUDIO_NEXT,
        "MediaTrackPrevious" => flight_input::KEY_CODE_AUDIO_PREVIOUS,
        "MetaLeft" => flight_input::KEY_CODE_LEFT_META,
        "MetaRight" => flight_input::KEY_CODE_RIGHT_META,
        "NonConvert" => 0,
        "NumLock" => flight_input::KEY_CODE_NUM_LOCK,
        "PageDown" => flight_input::KEY_CODE_PAGE_DOWN,
        "PageUp" => flight_input::KEY_CODE_PAGE_UP,
        "Paste" => flight_input::KEY_CODE_PASTE,
        "Pause" => flight_input::KEY_CODE_PAUSE,
        "Power" => flight_input::KEY_CODE_POWER,
        "PrintScreen" => flight_input::KEY_CODE_PRINT_SCREEN,
        "ScrollLock" => flight_input::KEY_CODE_SCROLL_LOCK,
        "Select" => flight_input::KEY_CODE_SELECT,
        "ShiftLeft" => flight_input::KEY_CODE_LEFT_SHIFT,
        "ShiftRight" => flight_input::KEY_CODE_RIGHT_SHIFT,
        "Sleep" => flight_input::KEY_CODE_SLEEP,
        "Space" => flight_input::KEY_CODE_SPACE,
        "Tab" => flight_input::KEY_CODE_TAB,
        "Undo" => flight_input::KEY_CODE_UNDO,
        "VolumeDown" => flight_input::KEY_CODE_VOLUME_DOWN,
        "VolumeMute" => flight_input::KEY_CODE_AUDIO_MUTE,
        "VolumeUp" => flight_input::KEY_CODE_VOLUME_UP,
        "WakeUp" => 0,
        "WWW" => flight_input::KEY_CODE_WWW,
        _ => 0,
    };
}

fn get_flight_key_code_for_key(key: &str) -> i32 {
    return match key {
        "Alt" => flight_input::KEY_CODE_LEFT_ALT,
        "ArrowDown" => flight_input::KEY_CODE_DOWN,
        "ArrowLeft" => flight_input::KEY_CODE_LEFT,
        "ArrowRight" => flight_input::KEY_CODE_RIGHT,
        "ArrowUp" => flight_input::KEY_CODE_UP,
        "Backspace" => flight_input::KEY_CODE_BACKSPACE,
        "CapsLock" => flight_input::KEY_CODE_CAPS_LOCK,
        "Control" => flight_input::KEY_CODE_LEFT_CTRL,
        "Delete" => flight_input::KEY_CODE_DELETE,
        "End" => flight_input::KEY_CODE_END,
        "Enter" => flight_input::KEY_CODE_RETURN,
        "Escape" => flight_input::KEY_CODE_ESCAPE,
        "Home" => flight_input::KEY_CODE_HOME,
        "Insert" => flight_input::KEY_CODE_INSERT,
        "Meta" => flight_input::KEY_CODE_LEFT_META,
        "NumLock" => flight_input::KEY_CODE_NUM_LOCK,
        "PageDown" => flight_input::KEY_CODE_PAGE_DOWN,
        "PageUp" => flight_input::KEY_CODE_PAGE_UP,
        "Pause" => flight_input::KEY_CODE_PAUSE,
        "PrintScreen" => flight_input::KEY_CODE_PRINT_SCREEN,
        "ScrollLock" => flight_input::KEY_CODE_SCROLL_LOCK,
        "Shift" => flight_input::KEY_CODE_LEFT_SHIFT,
        "Tab" => flight_input::KEY_CODE_TAB,
        "F1" => flight_input::KEY_CODE_F1,
        "F2" => flight_input::KEY_CODE_F2,
        "F3" => flight_input::KEY_CODE_F3,
        "F4" => flight_input::KEY_CODE_F4,
        "F5" => flight_input::KEY_CODE_F5,
        "F6" => flight_input::KEY_CODE_F6,
        "F7" => flight_input::KEY_CODE_F7,
        "F8" => flight_input::KEY_CODE_F8,
        "F9" => flight_input::KEY_CODE_F9,
        "F10" => flight_input::KEY_CODE_F10,
        "F11" => flight_input::KEY_CODE_F11,
        "F12" => flight_input::KEY_CODE_F12,
        "F13" => flight_input::KEY_CODE_F13,
        "F14" => flight_input::KEY_CODE_F14,
        "F15" => flight_input::KEY_CODE_F15,
        "F16" => flight_input::KEY_CODE_F16,
        "F17" => flight_input::KEY_CODE_F17,
        "F18" => flight_input::KEY_CODE_F18,
        "F19" => flight_input::KEY_CODE_F19,
        "F20" => flight_input::KEY_CODE_F20,
        "F21" => flight_input::KEY_CODE_F21,
        "F22" => flight_input::KEY_CODE_F22,
        "F23" => flight_input::KEY_CODE_F23,
        "F24" => flight_input::KEY_CODE_F24,
        "AudioVolumeDown" => flight_input::KEY_CODE_VOLUME_DOWN,
        "AudioVolumeMute" => flight_input::KEY_CODE_AUDIO_MUTE,
        "AudioVolumeUp" => flight_input::KEY_CODE_VOLUME_UP,
        "MediaPlayPause" => flight_input::KEY_CODE_AUDIO_PLAY,
        "MediaStop" => flight_input::KEY_CODE_AUDIO_STOP,
        "MediaTrackNext" => flight_input::KEY_CODE_AUDIO_NEXT,
        "MediaTrackPrevious" => flight_input::KEY_CODE_AUDIO_PREVIOUS,
        "BrowserBack" => flight_input::KEY_CODE_APP_CONTROL_BACK,
        "BrowserBookmarks" => flight_input::KEY_CODE_APP_CONTROL_BOOKMARKS,
        "BrowserForward" => flight_input::KEY_CODE_APP_CONTROL_FORWARD,
        "BrowserHome" => flight_input::KEY_CODE_APP_CONTROL_HOME,
        "BrowserRefresh" => flight_input::KEY_CODE_APP_CONTROL_REFRESH,
        "BrowserSearch" => flight_input::KEY_CODE_APP_CONTROL_SEARCH,
        "BrowserStop" => flight_input::KEY_CODE_APP_CONTROL_STOP,
        "ContextMenu" => flight_input::KEY_CODE_APPLICATION,
        "Copy" => flight_input::KEY_CODE_COPY,
        "Cut" => flight_input::KEY_CODE_CUT,
        "Find" => flight_input::KEY_CODE_FIND,
        "Help" => flight_input::KEY_CODE_HELP,
        "Paste" => flight_input::KEY_CODE_PASTE,
        "Select" => flight_input::KEY_CODE_SELECT,
        "Undo" => flight_input::KEY_CODE_UNDO,
        _ => 0,
    };
}

fn get_flight_key_code_for_numpad_code(code: &str) -> i32 {
    return match code {
        "Enter" => flight_input::KEY_CODE_NUMPAD_ENTER,
        "Numpad0" => flight_input::KEY_CODE_NUMPAD_0,
        "Numpad1" => flight_input::KEY_CODE_NUMPAD_1,
        "Numpad2" => flight_input::KEY_CODE_NUMPAD_2,
        "Numpad3" => flight_input::KEY_CODE_NUMPAD_3,
        "Numpad4" => flight_input::KEY_CODE_NUMPAD_4,
        "Numpad5" => flight_input::KEY_CODE_NUMPAD_5,
        "Numpad6" => flight_input::KEY_CODE_NUMPAD_6,
        "Numpad7" => flight_input::KEY_CODE_NUMPAD_7,
        "Numpad8" => flight_input::KEY_CODE_NUMPAD_8,
        "Numpad9" => flight_input::KEY_CODE_NUMPAD_9,
        "NumpadAdd" => flight_input::KEY_CODE_NUMPAD_PLUS,
        "NumpadBackspace" => flight_input::KEY_CODE_NUMPAD_BACKSPACE,
        "NumpadClear" => flight_input::KEY_CODE_NUMPAD_CLEAR,
        "NumpadClearEntry" => flight_input::KEY_CODE_NUMPAD_CLEAR_ENTRY,
        "NumpadComma" => flight_input::KEY_CODE_NUMPAD_COMMA,
        "NumpadDecimal" => flight_input::KEY_CODE_NUMPAD_PERIOD,
        "NumpadDivide" => flight_input::KEY_CODE_NUMPAD_DIVIDE,
        "NumpadEqual" => flight_input::KEY_CODE_NUMPAD_EQUALS,
        "NumpadHash" => flight_input::KEY_CODE_NUMPAD_HASH,
        "NumpadMemoryAdd" => flight_input::KEY_CODE_NUMPAD_MEM_ADD,
        "NumpadMemoryClear" => flight_input::KEY_CODE_NUMPAD_MEM_CLEAR,
        "NumpadMemoryRecall" => flight_input::KEY_CODE_NUMPAD_MEM_RECALL,
        "NumpadMemoryStore" => flight_input::KEY_CODE_NUMPAD_MEM_STORE,
        "NumpadMemorySubtract" => flight_input::KEY_CODE_NUMPAD_MEM_SUBTRACT,
        "NumpadMultiply" => flight_input::KEY_CODE_NUMPAD_MULTIPLY,
        "NumpadParenLeft" => flight_input::KEY_CODE_NUMPAD_LEFT_PARENTHESIS,
        "NumpadParenRight" => flight_input::KEY_CODE_NUMPAD_RIGHT_PARENTHESIS,
        "NumpadSubtract" => flight_input::KEY_CODE_NUMPAD_MINUS,
        _ => 0,
    };
}

/// Returns the modifier state DOM reports for a key event: a modifier key's own keydown includes
/// that modifier and its keyup excludes it, which winit's `ModifiersChanged` reports only after the
/// key event.
pub fn get_winit_key_event_modifiers(
    modifiers: ModifiersState,
    physical_key: PhysicalKey,
    pressed: bool,
) -> ModifiersState {
    let PhysicalKey::Code(code) = physical_key else {
        return modifiers;
    };
    let flag = match code {
        KeyCode::ShiftLeft | KeyCode::ShiftRight => ModifiersState::SHIFT,
        KeyCode::ControlLeft | KeyCode::ControlRight => ModifiersState::CONTROL,
        KeyCode::AltLeft | KeyCode::AltRight => ModifiersState::ALT,
        KeyCode::SuperLeft | KeyCode::SuperRight => ModifiersState::SUPER,
        _ => return modifiers,
    };
    let mut result = modifiers;
    result.set(flag, pressed);
    return result;
}

/// Returns whether a key event's text is committed text input. Control characters and Ctrl or Meta
/// shortcuts are not text; Ctrl+Alt (AltGr on Windows) still produces text.
pub fn is_winit_committed_key_text(text: &str, modifiers: ModifiersState) -> bool {
    if text.is_empty() || text.chars().any(char::is_control) {
        return false;
    }
    if modifiers.super_key() {
        return false;
    }
    return !modifiers.control_key() || modifiers.alt_key();
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
        Key::Named(named) => translate_winit_named_key(*named),
        Key::Character(text) => text.to_string(),
        Key::Dead(_) => "Dead".to_string(),
        Key::Unidentified(_) => "Unidentified".to_string(),
    };
}

/// Derives Flight's numeric key code exactly as the web host does: the physical `code` table
/// (numpad table first for numpad-located keys), then a single character's lower-case code, then the
/// logical `key` table; 0 when none applies.
pub fn translate_winit_key_code(code: &str, key: &str, location: i32) -> i32 {
    if location == 3 {
        let numpad = get_flight_key_code_for_numpad_code(code);
        if numpad != 0 {
            return numpad;
        }
    }
    let by_code = get_flight_key_code_for_code(code);
    if by_code != 0 {
        return by_code;
    }
    let mut units = key.encode_utf16();
    if let (Some(unit), None) = (units.next(), units.next()) {
        let lower = char::from_u32(u32::from(unit))
            .and_then(|value| value.to_lowercase().next())
            .map_or(u32::from(unit), u32::from);
        return lower as i32;
    }
    return get_flight_key_code_for_key(key);
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

/// Maps a winit named key to its DOM key value. winit names `NamedKey` variants after the W3C key
/// values, so the variant name is the DOM value except Space (`" "`) and the legacy Super (`"Meta"`).
pub fn translate_winit_named_key(key: NamedKey) -> String {
    return match key {
        NamedKey::Space => " ".to_string(),
        NamedKey::Super => "Meta".to_string(),
        _ => format!("{key:?}"),
    };
}

/// Maps a physical key to its DOM `code`. winit names `KeyCode` variants after the W3C code values
/// except the Meta keys, which it calls Super.
pub fn translate_winit_physical_key(key: PhysicalKey) -> String {
    return match key {
        PhysicalKey::Code(KeyCode::SuperLeft) => "MetaLeft".to_string(),
        PhysicalKey::Code(KeyCode::SuperRight) => "MetaRight".to_string(),
        PhysicalKey::Code(code) => format!("{code:?}"),
        PhysicalKey::Unidentified(_) => "Unidentified".to_string(),
    };
}

/// Maps a line or pixel wheel delta to DOM signs. winit reports positive values for content moving
/// right/down (wheel up); DOM `deltaY` is positive for wheel down.
pub fn translate_winit_scroll_delta(delta: &MouseScrollDelta) -> (f64, f64, MouseWheelMode) {
    return match delta {
        MouseScrollDelta::LineDelta(x, y) => {
            (-f64::from(*x), -f64::from(*y), MouseWheelMode::Lines)
        }
        MouseScrollDelta::PixelDelta(position) => {
            (-position.x, -position.y, MouseWheelMode::Pixels)
        }
    };
}

/// Returns the persistent DOM `buttons` mask after one button transition.
pub fn update_winit_pointer_buttons(
    buttons: u32,
    button: WinitPointerButton,
    pressed: bool,
) -> u32 {
    return if pressed {
        buttons | button.mask
    } else {
        buttons & !button.mask
    };
}

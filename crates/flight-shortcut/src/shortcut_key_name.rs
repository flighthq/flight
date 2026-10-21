use crate::types::*;

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS ShortcutDigitKeyName literal subset
pub fn get_shortcut_digit_key_name_string(value: ShortcutDigitKeyName) -> &'static str {
    return match value {
        ShortcutDigitKeyName::Digit0 => "0",
        ShortcutDigitKeyName::Digit1 => "1",
        ShortcutDigitKeyName::Digit2 => "2",
        ShortcutDigitKeyName::Digit3 => "3",
        ShortcutDigitKeyName::Digit4 => "4",
        ShortcutDigitKeyName::Digit5 => "5",
        ShortcutDigitKeyName::Digit6 => "6",
        ShortcutDigitKeyName::Digit7 => "7",
        ShortcutDigitKeyName::Digit8 => "8",
        ShortcutDigitKeyName::Digit9 => "9",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS ShortcutEditingKeyName literal subset
pub fn get_shortcut_editing_key_name_string(value: ShortcutEditingKeyName) -> &'static str {
    return match value {
        ShortcutEditingKeyName::Backspace => "Backspace",
        ShortcutEditingKeyName::Delete => "Delete",
        ShortcutEditingKeyName::Escape => "Escape",
        ShortcutEditingKeyName::Insert => "Insert",
        ShortcutEditingKeyName::Return => "Return",
        ShortcutEditingKeyName::Space => "Space",
        ShortcutEditingKeyName::Tab => "Tab",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS ShortcutFunctionKeyName literal subset
pub fn get_shortcut_function_key_name_string(value: ShortcutFunctionKeyName) -> &'static str {
    return match value {
        ShortcutFunctionKeyName::F1 => "F1",
        ShortcutFunctionKeyName::F2 => "F2",
        ShortcutFunctionKeyName::F3 => "F3",
        ShortcutFunctionKeyName::F4 => "F4",
        ShortcutFunctionKeyName::F5 => "F5",
        ShortcutFunctionKeyName::F6 => "F6",
        ShortcutFunctionKeyName::F7 => "F7",
        ShortcutFunctionKeyName::F8 => "F8",
        ShortcutFunctionKeyName::F9 => "F9",
        ShortcutFunctionKeyName::F10 => "F10",
        ShortcutFunctionKeyName::F11 => "F11",
        ShortcutFunctionKeyName::F12 => "F12",
        ShortcutFunctionKeyName::F13 => "F13",
        ShortcutFunctionKeyName::F14 => "F14",
        ShortcutFunctionKeyName::F15 => "F15",
        ShortcutFunctionKeyName::F16 => "F16",
        ShortcutFunctionKeyName::F17 => "F17",
        ShortcutFunctionKeyName::F18 => "F18",
        ShortcutFunctionKeyName::F19 => "F19",
        ShortcutFunctionKeyName::F20 => "F20",
        ShortcutFunctionKeyName::F21 => "F21",
        ShortcutFunctionKeyName::F22 => "F22",
        ShortcutFunctionKeyName::F23 => "F23",
        ShortcutFunctionKeyName::F24 => "F24",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS ShortcutLetterKeyName literal subset
pub fn get_shortcut_letter_key_name_string(value: ShortcutLetterKeyName) -> &'static str {
    return match value {
        ShortcutLetterKeyName::A => "A",
        ShortcutLetterKeyName::B => "B",
        ShortcutLetterKeyName::C => "C",
        ShortcutLetterKeyName::D => "D",
        ShortcutLetterKeyName::E => "E",
        ShortcutLetterKeyName::F => "F",
        ShortcutLetterKeyName::G => "G",
        ShortcutLetterKeyName::H => "H",
        ShortcutLetterKeyName::I => "I",
        ShortcutLetterKeyName::J => "J",
        ShortcutLetterKeyName::K => "K",
        ShortcutLetterKeyName::L => "L",
        ShortcutLetterKeyName::M => "M",
        ShortcutLetterKeyName::N => "N",
        ShortcutLetterKeyName::O => "O",
        ShortcutLetterKeyName::P => "P",
        ShortcutLetterKeyName::Q => "Q",
        ShortcutLetterKeyName::R => "R",
        ShortcutLetterKeyName::S => "S",
        ShortcutLetterKeyName::T => "T",
        ShortcutLetterKeyName::U => "U",
        ShortcutLetterKeyName::V => "V",
        ShortcutLetterKeyName::W => "W",
        ShortcutLetterKeyName::X => "X",
        ShortcutLetterKeyName::Y => "Y",
        ShortcutLetterKeyName::Z => "Z",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS ShortcutLockKeyName literal subset
pub fn get_shortcut_lock_key_name_string(value: ShortcutLockKeyName) -> &'static str {
    return match value {
        ShortcutLockKeyName::CapsLock => "CapsLock",
        ShortcutLockKeyName::NumLock => "NumLock",
        ShortcutLockKeyName::PrintScreen => "PrintScreen",
        ShortcutLockKeyName::ScrollLock => "ScrollLock",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS ShortcutMediaKeyName literal subset
pub fn get_shortcut_media_key_name_string(value: ShortcutMediaKeyName) -> &'static str {
    return match value {
        ShortcutMediaKeyName::MediaNextTrack => "MediaNextTrack",
        ShortcutMediaKeyName::MediaPlayPause => "MediaPlayPause",
        ShortcutMediaKeyName::MediaPreviousTrack => "MediaPreviousTrack",
        ShortcutMediaKeyName::MediaStop => "MediaStop",
        ShortcutMediaKeyName::VolumeDown => "VolumeDown",
        ShortcutMediaKeyName::VolumeMute => "VolumeMute",
        ShortcutMediaKeyName::VolumeUp => "VolumeUp",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS ShortcutNavigationKeyName literal subset
pub fn get_shortcut_navigation_key_name_string(value: ShortcutNavigationKeyName) -> &'static str {
    return match value {
        ShortcutNavigationKeyName::ArrowDown => "ArrowDown",
        ShortcutNavigationKeyName::ArrowLeft => "ArrowLeft",
        ShortcutNavigationKeyName::ArrowRight => "ArrowRight",
        ShortcutNavigationKeyName::ArrowUp => "ArrowUp",
        ShortcutNavigationKeyName::End => "End",
        ShortcutNavigationKeyName::Home => "Home",
        ShortcutNavigationKeyName::PageDown => "PageDown",
        ShortcutNavigationKeyName::PageUp => "PageUp",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS ShortcutNumpadKeyName literal subset
pub fn get_shortcut_numpad_key_name_string(value: ShortcutNumpadKeyName) -> &'static str {
    return match value {
        ShortcutNumpadKeyName::Numpad0 => "Numpad0",
        ShortcutNumpadKeyName::Numpad1 => "Numpad1",
        ShortcutNumpadKeyName::Numpad2 => "Numpad2",
        ShortcutNumpadKeyName::Numpad3 => "Numpad3",
        ShortcutNumpadKeyName::Numpad4 => "Numpad4",
        ShortcutNumpadKeyName::Numpad5 => "Numpad5",
        ShortcutNumpadKeyName::Numpad6 => "Numpad6",
        ShortcutNumpadKeyName::Numpad7 => "Numpad7",
        ShortcutNumpadKeyName::Numpad8 => "Numpad8",
        ShortcutNumpadKeyName::Numpad9 => "Numpad9",
        ShortcutNumpadKeyName::NumpadAdd => "NumpadAdd",
        ShortcutNumpadKeyName::NumpadDecimal => "NumpadDecimal",
        ShortcutNumpadKeyName::NumpadDivide => "NumpadDivide",
        ShortcutNumpadKeyName::NumpadEnter => "NumpadEnter",
        ShortcutNumpadKeyName::NumpadMultiply => "NumpadMultiply",
        ShortcutNumpadKeyName::NumpadSubtract => "NumpadSubtract",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS ShortcutPunctuationKeyName literal subset
pub fn get_shortcut_punctuation_key_name_string(value: ShortcutPunctuationKeyName) -> &'static str {
    return match value {
        ShortcutPunctuationKeyName::Backquote => "Backquote",
        ShortcutPunctuationKeyName::Backslash => "Backslash",
        ShortcutPunctuationKeyName::BracketLeft => "BracketLeft",
        ShortcutPunctuationKeyName::BracketRight => "BracketRight",
        ShortcutPunctuationKeyName::Comma => "Comma",
        ShortcutPunctuationKeyName::Equal => "Equal",
        ShortcutPunctuationKeyName::Minus => "Minus",
        ShortcutPunctuationKeyName::Period => "Period",
        ShortcutPunctuationKeyName::Plus => "Plus",
        ShortcutPunctuationKeyName::Quote => "Quote",
        ShortcutPunctuationKeyName::Semicolon => "Semicolon",
        ShortcutPunctuationKeyName::Slash => "Slash",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS ShortcutDigitKeyName literal subset
pub fn parse_shortcut_digit_key_name(value: &str) -> Option<ShortcutDigitKeyName> {
    return match value {
        "0" => Some(ShortcutDigitKeyName::Digit0),
        "1" => Some(ShortcutDigitKeyName::Digit1),
        "2" => Some(ShortcutDigitKeyName::Digit2),
        "3" => Some(ShortcutDigitKeyName::Digit3),
        "4" => Some(ShortcutDigitKeyName::Digit4),
        "5" => Some(ShortcutDigitKeyName::Digit5),
        "6" => Some(ShortcutDigitKeyName::Digit6),
        "7" => Some(ShortcutDigitKeyName::Digit7),
        "8" => Some(ShortcutDigitKeyName::Digit8),
        "9" => Some(ShortcutDigitKeyName::Digit9),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS ShortcutEditingKeyName literal subset
pub fn parse_shortcut_editing_key_name(value: &str) -> Option<ShortcutEditingKeyName> {
    return match value {
        "Backspace" => Some(ShortcutEditingKeyName::Backspace),
        "Delete" => Some(ShortcutEditingKeyName::Delete),
        "Escape" => Some(ShortcutEditingKeyName::Escape),
        "Insert" => Some(ShortcutEditingKeyName::Insert),
        "Return" => Some(ShortcutEditingKeyName::Return),
        "Space" => Some(ShortcutEditingKeyName::Space),
        "Tab" => Some(ShortcutEditingKeyName::Tab),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS ShortcutFunctionKeyName literal subset
pub fn parse_shortcut_function_key_name(value: &str) -> Option<ShortcutFunctionKeyName> {
    return match value {
        "F1" => Some(ShortcutFunctionKeyName::F1),
        "F2" => Some(ShortcutFunctionKeyName::F2),
        "F3" => Some(ShortcutFunctionKeyName::F3),
        "F4" => Some(ShortcutFunctionKeyName::F4),
        "F5" => Some(ShortcutFunctionKeyName::F5),
        "F6" => Some(ShortcutFunctionKeyName::F6),
        "F7" => Some(ShortcutFunctionKeyName::F7),
        "F8" => Some(ShortcutFunctionKeyName::F8),
        "F9" => Some(ShortcutFunctionKeyName::F9),
        "F10" => Some(ShortcutFunctionKeyName::F10),
        "F11" => Some(ShortcutFunctionKeyName::F11),
        "F12" => Some(ShortcutFunctionKeyName::F12),
        "F13" => Some(ShortcutFunctionKeyName::F13),
        "F14" => Some(ShortcutFunctionKeyName::F14),
        "F15" => Some(ShortcutFunctionKeyName::F15),
        "F16" => Some(ShortcutFunctionKeyName::F16),
        "F17" => Some(ShortcutFunctionKeyName::F17),
        "F18" => Some(ShortcutFunctionKeyName::F18),
        "F19" => Some(ShortcutFunctionKeyName::F19),
        "F20" => Some(ShortcutFunctionKeyName::F20),
        "F21" => Some(ShortcutFunctionKeyName::F21),
        "F22" => Some(ShortcutFunctionKeyName::F22),
        "F23" => Some(ShortcutFunctionKeyName::F23),
        "F24" => Some(ShortcutFunctionKeyName::F24),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS ShortcutLetterKeyName literal subset
pub fn parse_shortcut_letter_key_name(value: &str) -> Option<ShortcutLetterKeyName> {
    return match value {
        "A" => Some(ShortcutLetterKeyName::A),
        "B" => Some(ShortcutLetterKeyName::B),
        "C" => Some(ShortcutLetterKeyName::C),
        "D" => Some(ShortcutLetterKeyName::D),
        "E" => Some(ShortcutLetterKeyName::E),
        "F" => Some(ShortcutLetterKeyName::F),
        "G" => Some(ShortcutLetterKeyName::G),
        "H" => Some(ShortcutLetterKeyName::H),
        "I" => Some(ShortcutLetterKeyName::I),
        "J" => Some(ShortcutLetterKeyName::J),
        "K" => Some(ShortcutLetterKeyName::K),
        "L" => Some(ShortcutLetterKeyName::L),
        "M" => Some(ShortcutLetterKeyName::M),
        "N" => Some(ShortcutLetterKeyName::N),
        "O" => Some(ShortcutLetterKeyName::O),
        "P" => Some(ShortcutLetterKeyName::P),
        "Q" => Some(ShortcutLetterKeyName::Q),
        "R" => Some(ShortcutLetterKeyName::R),
        "S" => Some(ShortcutLetterKeyName::S),
        "T" => Some(ShortcutLetterKeyName::T),
        "U" => Some(ShortcutLetterKeyName::U),
        "V" => Some(ShortcutLetterKeyName::V),
        "W" => Some(ShortcutLetterKeyName::W),
        "X" => Some(ShortcutLetterKeyName::X),
        "Y" => Some(ShortcutLetterKeyName::Y),
        "Z" => Some(ShortcutLetterKeyName::Z),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS ShortcutLockKeyName literal subset
pub fn parse_shortcut_lock_key_name(value: &str) -> Option<ShortcutLockKeyName> {
    return match value {
        "CapsLock" => Some(ShortcutLockKeyName::CapsLock),
        "NumLock" => Some(ShortcutLockKeyName::NumLock),
        "PrintScreen" => Some(ShortcutLockKeyName::PrintScreen),
        "ScrollLock" => Some(ShortcutLockKeyName::ScrollLock),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS ShortcutMediaKeyName literal subset
pub fn parse_shortcut_media_key_name(value: &str) -> Option<ShortcutMediaKeyName> {
    return match value {
        "MediaNextTrack" => Some(ShortcutMediaKeyName::MediaNextTrack),
        "MediaPlayPause" => Some(ShortcutMediaKeyName::MediaPlayPause),
        "MediaPreviousTrack" => Some(ShortcutMediaKeyName::MediaPreviousTrack),
        "MediaStop" => Some(ShortcutMediaKeyName::MediaStop),
        "VolumeDown" => Some(ShortcutMediaKeyName::VolumeDown),
        "VolumeMute" => Some(ShortcutMediaKeyName::VolumeMute),
        "VolumeUp" => Some(ShortcutMediaKeyName::VolumeUp),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS ShortcutNavigationKeyName literal subset
pub fn parse_shortcut_navigation_key_name(value: &str) -> Option<ShortcutNavigationKeyName> {
    return match value {
        "ArrowDown" => Some(ShortcutNavigationKeyName::ArrowDown),
        "ArrowLeft" => Some(ShortcutNavigationKeyName::ArrowLeft),
        "ArrowRight" => Some(ShortcutNavigationKeyName::ArrowRight),
        "ArrowUp" => Some(ShortcutNavigationKeyName::ArrowUp),
        "End" => Some(ShortcutNavigationKeyName::End),
        "Home" => Some(ShortcutNavigationKeyName::Home),
        "PageDown" => Some(ShortcutNavigationKeyName::PageDown),
        "PageUp" => Some(ShortcutNavigationKeyName::PageUp),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS ShortcutNumpadKeyName literal subset
pub fn parse_shortcut_numpad_key_name(value: &str) -> Option<ShortcutNumpadKeyName> {
    return match value {
        "Numpad0" => Some(ShortcutNumpadKeyName::Numpad0),
        "Numpad1" => Some(ShortcutNumpadKeyName::Numpad1),
        "Numpad2" => Some(ShortcutNumpadKeyName::Numpad2),
        "Numpad3" => Some(ShortcutNumpadKeyName::Numpad3),
        "Numpad4" => Some(ShortcutNumpadKeyName::Numpad4),
        "Numpad5" => Some(ShortcutNumpadKeyName::Numpad5),
        "Numpad6" => Some(ShortcutNumpadKeyName::Numpad6),
        "Numpad7" => Some(ShortcutNumpadKeyName::Numpad7),
        "Numpad8" => Some(ShortcutNumpadKeyName::Numpad8),
        "Numpad9" => Some(ShortcutNumpadKeyName::Numpad9),
        "NumpadAdd" => Some(ShortcutNumpadKeyName::NumpadAdd),
        "NumpadDecimal" => Some(ShortcutNumpadKeyName::NumpadDecimal),
        "NumpadDivide" => Some(ShortcutNumpadKeyName::NumpadDivide),
        "NumpadEnter" => Some(ShortcutNumpadKeyName::NumpadEnter),
        "NumpadMultiply" => Some(ShortcutNumpadKeyName::NumpadMultiply),
        "NumpadSubtract" => Some(ShortcutNumpadKeyName::NumpadSubtract),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS ShortcutPunctuationKeyName literal subset
pub fn parse_shortcut_punctuation_key_name(value: &str) -> Option<ShortcutPunctuationKeyName> {
    return match value {
        "Backquote" => Some(ShortcutPunctuationKeyName::Backquote),
        "Backslash" => Some(ShortcutPunctuationKeyName::Backslash),
        "BracketLeft" => Some(ShortcutPunctuationKeyName::BracketLeft),
        "BracketRight" => Some(ShortcutPunctuationKeyName::BracketRight),
        "Comma" => Some(ShortcutPunctuationKeyName::Comma),
        "Equal" => Some(ShortcutPunctuationKeyName::Equal),
        "Minus" => Some(ShortcutPunctuationKeyName::Minus),
        "Period" => Some(ShortcutPunctuationKeyName::Period),
        "Plus" => Some(ShortcutPunctuationKeyName::Plus),
        "Quote" => Some(ShortcutPunctuationKeyName::Quote),
        "Semicolon" => Some(ShortcutPunctuationKeyName::Semicolon),
        "Slash" => Some(ShortcutPunctuationKeyName::Slash),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for TS union assignment from the digit subset to ShortcutKeyName
pub fn shortcut_digit_key_name_to_key_name(value: ShortcutDigitKeyName) -> ShortcutKeyName {
    return match value {
        ShortcutDigitKeyName::Digit0 => ShortcutKeyName::Digit0,
        ShortcutDigitKeyName::Digit1 => ShortcutKeyName::Digit1,
        ShortcutDigitKeyName::Digit2 => ShortcutKeyName::Digit2,
        ShortcutDigitKeyName::Digit3 => ShortcutKeyName::Digit3,
        ShortcutDigitKeyName::Digit4 => ShortcutKeyName::Digit4,
        ShortcutDigitKeyName::Digit5 => ShortcutKeyName::Digit5,
        ShortcutDigitKeyName::Digit6 => ShortcutKeyName::Digit6,
        ShortcutDigitKeyName::Digit7 => ShortcutKeyName::Digit7,
        ShortcutDigitKeyName::Digit8 => ShortcutKeyName::Digit8,
        ShortcutDigitKeyName::Digit9 => ShortcutKeyName::Digit9,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for TS union assignment from the editing subset to ShortcutKeyName
pub fn shortcut_editing_key_name_to_key_name(value: ShortcutEditingKeyName) -> ShortcutKeyName {
    return match value {
        ShortcutEditingKeyName::Backspace => ShortcutKeyName::Backspace,
        ShortcutEditingKeyName::Delete => ShortcutKeyName::Delete,
        ShortcutEditingKeyName::Escape => ShortcutKeyName::Escape,
        ShortcutEditingKeyName::Insert => ShortcutKeyName::Insert,
        ShortcutEditingKeyName::Return => ShortcutKeyName::Return,
        ShortcutEditingKeyName::Space => ShortcutKeyName::Space,
        ShortcutEditingKeyName::Tab => ShortcutKeyName::Tab,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for TS union assignment from the function-key subset to ShortcutKeyName
pub fn shortcut_function_key_name_to_key_name(value: ShortcutFunctionKeyName) -> ShortcutKeyName {
    return match value {
        ShortcutFunctionKeyName::F1 => ShortcutKeyName::F1,
        ShortcutFunctionKeyName::F2 => ShortcutKeyName::F2,
        ShortcutFunctionKeyName::F3 => ShortcutKeyName::F3,
        ShortcutFunctionKeyName::F4 => ShortcutKeyName::F4,
        ShortcutFunctionKeyName::F5 => ShortcutKeyName::F5,
        ShortcutFunctionKeyName::F6 => ShortcutKeyName::F6,
        ShortcutFunctionKeyName::F7 => ShortcutKeyName::F7,
        ShortcutFunctionKeyName::F8 => ShortcutKeyName::F8,
        ShortcutFunctionKeyName::F9 => ShortcutKeyName::F9,
        ShortcutFunctionKeyName::F10 => ShortcutKeyName::F10,
        ShortcutFunctionKeyName::F11 => ShortcutKeyName::F11,
        ShortcutFunctionKeyName::F12 => ShortcutKeyName::F12,
        ShortcutFunctionKeyName::F13 => ShortcutKeyName::F13,
        ShortcutFunctionKeyName::F14 => ShortcutKeyName::F14,
        ShortcutFunctionKeyName::F15 => ShortcutKeyName::F15,
        ShortcutFunctionKeyName::F16 => ShortcutKeyName::F16,
        ShortcutFunctionKeyName::F17 => ShortcutKeyName::F17,
        ShortcutFunctionKeyName::F18 => ShortcutKeyName::F18,
        ShortcutFunctionKeyName::F19 => ShortcutKeyName::F19,
        ShortcutFunctionKeyName::F20 => ShortcutKeyName::F20,
        ShortcutFunctionKeyName::F21 => ShortcutKeyName::F21,
        ShortcutFunctionKeyName::F22 => ShortcutKeyName::F22,
        ShortcutFunctionKeyName::F23 => ShortcutKeyName::F23,
        ShortcutFunctionKeyName::F24 => ShortcutKeyName::F24,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for narrowing ShortcutKeyName to the TS digit subset
pub fn shortcut_key_name_to_digit_key_name(value: ShortcutKeyName) -> Option<ShortcutDigitKeyName> {
    return match value {
        ShortcutKeyName::Digit0 => Some(ShortcutDigitKeyName::Digit0),
        ShortcutKeyName::Digit1 => Some(ShortcutDigitKeyName::Digit1),
        ShortcutKeyName::Digit2 => Some(ShortcutDigitKeyName::Digit2),
        ShortcutKeyName::Digit3 => Some(ShortcutDigitKeyName::Digit3),
        ShortcutKeyName::Digit4 => Some(ShortcutDigitKeyName::Digit4),
        ShortcutKeyName::Digit5 => Some(ShortcutDigitKeyName::Digit5),
        ShortcutKeyName::Digit6 => Some(ShortcutDigitKeyName::Digit6),
        ShortcutKeyName::Digit7 => Some(ShortcutDigitKeyName::Digit7),
        ShortcutKeyName::Digit8 => Some(ShortcutDigitKeyName::Digit8),
        ShortcutKeyName::Digit9 => Some(ShortcutDigitKeyName::Digit9),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for narrowing ShortcutKeyName to the TS editing subset
pub fn shortcut_key_name_to_editing_key_name(
    value: ShortcutKeyName,
) -> Option<ShortcutEditingKeyName> {
    return match value {
        ShortcutKeyName::Backspace => Some(ShortcutEditingKeyName::Backspace),
        ShortcutKeyName::Delete => Some(ShortcutEditingKeyName::Delete),
        ShortcutKeyName::Escape => Some(ShortcutEditingKeyName::Escape),
        ShortcutKeyName::Insert => Some(ShortcutEditingKeyName::Insert),
        ShortcutKeyName::Return => Some(ShortcutEditingKeyName::Return),
        ShortcutKeyName::Space => Some(ShortcutEditingKeyName::Space),
        ShortcutKeyName::Tab => Some(ShortcutEditingKeyName::Tab),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for narrowing ShortcutKeyName to the TS function-key subset
pub fn shortcut_key_name_to_function_key_name(
    value: ShortcutKeyName,
) -> Option<ShortcutFunctionKeyName> {
    return match value {
        ShortcutKeyName::F1 => Some(ShortcutFunctionKeyName::F1),
        ShortcutKeyName::F2 => Some(ShortcutFunctionKeyName::F2),
        ShortcutKeyName::F3 => Some(ShortcutFunctionKeyName::F3),
        ShortcutKeyName::F4 => Some(ShortcutFunctionKeyName::F4),
        ShortcutKeyName::F5 => Some(ShortcutFunctionKeyName::F5),
        ShortcutKeyName::F6 => Some(ShortcutFunctionKeyName::F6),
        ShortcutKeyName::F7 => Some(ShortcutFunctionKeyName::F7),
        ShortcutKeyName::F8 => Some(ShortcutFunctionKeyName::F8),
        ShortcutKeyName::F9 => Some(ShortcutFunctionKeyName::F9),
        ShortcutKeyName::F10 => Some(ShortcutFunctionKeyName::F10),
        ShortcutKeyName::F11 => Some(ShortcutFunctionKeyName::F11),
        ShortcutKeyName::F12 => Some(ShortcutFunctionKeyName::F12),
        ShortcutKeyName::F13 => Some(ShortcutFunctionKeyName::F13),
        ShortcutKeyName::F14 => Some(ShortcutFunctionKeyName::F14),
        ShortcutKeyName::F15 => Some(ShortcutFunctionKeyName::F15),
        ShortcutKeyName::F16 => Some(ShortcutFunctionKeyName::F16),
        ShortcutKeyName::F17 => Some(ShortcutFunctionKeyName::F17),
        ShortcutKeyName::F18 => Some(ShortcutFunctionKeyName::F18),
        ShortcutKeyName::F19 => Some(ShortcutFunctionKeyName::F19),
        ShortcutKeyName::F20 => Some(ShortcutFunctionKeyName::F20),
        ShortcutKeyName::F21 => Some(ShortcutFunctionKeyName::F21),
        ShortcutKeyName::F22 => Some(ShortcutFunctionKeyName::F22),
        ShortcutKeyName::F23 => Some(ShortcutFunctionKeyName::F23),
        ShortcutKeyName::F24 => Some(ShortcutFunctionKeyName::F24),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for narrowing ShortcutKeyName to the TS letter subset
pub fn shortcut_key_name_to_letter_key_name(
    value: ShortcutKeyName,
) -> Option<ShortcutLetterKeyName> {
    return match value {
        ShortcutKeyName::A => Some(ShortcutLetterKeyName::A),
        ShortcutKeyName::B => Some(ShortcutLetterKeyName::B),
        ShortcutKeyName::C => Some(ShortcutLetterKeyName::C),
        ShortcutKeyName::D => Some(ShortcutLetterKeyName::D),
        ShortcutKeyName::E => Some(ShortcutLetterKeyName::E),
        ShortcutKeyName::F => Some(ShortcutLetterKeyName::F),
        ShortcutKeyName::G => Some(ShortcutLetterKeyName::G),
        ShortcutKeyName::H => Some(ShortcutLetterKeyName::H),
        ShortcutKeyName::I => Some(ShortcutLetterKeyName::I),
        ShortcutKeyName::J => Some(ShortcutLetterKeyName::J),
        ShortcutKeyName::K => Some(ShortcutLetterKeyName::K),
        ShortcutKeyName::L => Some(ShortcutLetterKeyName::L),
        ShortcutKeyName::M => Some(ShortcutLetterKeyName::M),
        ShortcutKeyName::N => Some(ShortcutLetterKeyName::N),
        ShortcutKeyName::O => Some(ShortcutLetterKeyName::O),
        ShortcutKeyName::P => Some(ShortcutLetterKeyName::P),
        ShortcutKeyName::Q => Some(ShortcutLetterKeyName::Q),
        ShortcutKeyName::R => Some(ShortcutLetterKeyName::R),
        ShortcutKeyName::S => Some(ShortcutLetterKeyName::S),
        ShortcutKeyName::T => Some(ShortcutLetterKeyName::T),
        ShortcutKeyName::U => Some(ShortcutLetterKeyName::U),
        ShortcutKeyName::V => Some(ShortcutLetterKeyName::V),
        ShortcutKeyName::W => Some(ShortcutLetterKeyName::W),
        ShortcutKeyName::X => Some(ShortcutLetterKeyName::X),
        ShortcutKeyName::Y => Some(ShortcutLetterKeyName::Y),
        ShortcutKeyName::Z => Some(ShortcutLetterKeyName::Z),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for narrowing ShortcutKeyName to the TS lock subset
pub fn shortcut_key_name_to_lock_key_name(value: ShortcutKeyName) -> Option<ShortcutLockKeyName> {
    return match value {
        ShortcutKeyName::CapsLock => Some(ShortcutLockKeyName::CapsLock),
        ShortcutKeyName::NumLock => Some(ShortcutLockKeyName::NumLock),
        ShortcutKeyName::PrintScreen => Some(ShortcutLockKeyName::PrintScreen),
        ShortcutKeyName::ScrollLock => Some(ShortcutLockKeyName::ScrollLock),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for narrowing ShortcutKeyName to the TS media subset
pub fn shortcut_key_name_to_media_key_name(value: ShortcutKeyName) -> Option<ShortcutMediaKeyName> {
    return match value {
        ShortcutKeyName::MediaNextTrack => Some(ShortcutMediaKeyName::MediaNextTrack),
        ShortcutKeyName::MediaPlayPause => Some(ShortcutMediaKeyName::MediaPlayPause),
        ShortcutKeyName::MediaPreviousTrack => Some(ShortcutMediaKeyName::MediaPreviousTrack),
        ShortcutKeyName::MediaStop => Some(ShortcutMediaKeyName::MediaStop),
        ShortcutKeyName::VolumeDown => Some(ShortcutMediaKeyName::VolumeDown),
        ShortcutKeyName::VolumeMute => Some(ShortcutMediaKeyName::VolumeMute),
        ShortcutKeyName::VolumeUp => Some(ShortcutMediaKeyName::VolumeUp),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for narrowing ShortcutKeyName to the TS navigation subset
pub fn shortcut_key_name_to_navigation_key_name(
    value: ShortcutKeyName,
) -> Option<ShortcutNavigationKeyName> {
    return match value {
        ShortcutKeyName::ArrowDown => Some(ShortcutNavigationKeyName::ArrowDown),
        ShortcutKeyName::ArrowLeft => Some(ShortcutNavigationKeyName::ArrowLeft),
        ShortcutKeyName::ArrowRight => Some(ShortcutNavigationKeyName::ArrowRight),
        ShortcutKeyName::ArrowUp => Some(ShortcutNavigationKeyName::ArrowUp),
        ShortcutKeyName::End => Some(ShortcutNavigationKeyName::End),
        ShortcutKeyName::Home => Some(ShortcutNavigationKeyName::Home),
        ShortcutKeyName::PageDown => Some(ShortcutNavigationKeyName::PageDown),
        ShortcutKeyName::PageUp => Some(ShortcutNavigationKeyName::PageUp),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for narrowing ShortcutKeyName to the TS numpad subset
pub fn shortcut_key_name_to_numpad_key_name(
    value: ShortcutKeyName,
) -> Option<ShortcutNumpadKeyName> {
    return match value {
        ShortcutKeyName::Numpad0 => Some(ShortcutNumpadKeyName::Numpad0),
        ShortcutKeyName::Numpad1 => Some(ShortcutNumpadKeyName::Numpad1),
        ShortcutKeyName::Numpad2 => Some(ShortcutNumpadKeyName::Numpad2),
        ShortcutKeyName::Numpad3 => Some(ShortcutNumpadKeyName::Numpad3),
        ShortcutKeyName::Numpad4 => Some(ShortcutNumpadKeyName::Numpad4),
        ShortcutKeyName::Numpad5 => Some(ShortcutNumpadKeyName::Numpad5),
        ShortcutKeyName::Numpad6 => Some(ShortcutNumpadKeyName::Numpad6),
        ShortcutKeyName::Numpad7 => Some(ShortcutNumpadKeyName::Numpad7),
        ShortcutKeyName::Numpad8 => Some(ShortcutNumpadKeyName::Numpad8),
        ShortcutKeyName::Numpad9 => Some(ShortcutNumpadKeyName::Numpad9),
        ShortcutKeyName::NumpadAdd => Some(ShortcutNumpadKeyName::NumpadAdd),
        ShortcutKeyName::NumpadDecimal => Some(ShortcutNumpadKeyName::NumpadDecimal),
        ShortcutKeyName::NumpadDivide => Some(ShortcutNumpadKeyName::NumpadDivide),
        ShortcutKeyName::NumpadEnter => Some(ShortcutNumpadKeyName::NumpadEnter),
        ShortcutKeyName::NumpadMultiply => Some(ShortcutNumpadKeyName::NumpadMultiply),
        ShortcutKeyName::NumpadSubtract => Some(ShortcutNumpadKeyName::NumpadSubtract),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for narrowing ShortcutKeyName to the TS punctuation subset
pub fn shortcut_key_name_to_punctuation_key_name(
    value: ShortcutKeyName,
) -> Option<ShortcutPunctuationKeyName> {
    return match value {
        ShortcutKeyName::Backquote => Some(ShortcutPunctuationKeyName::Backquote),
        ShortcutKeyName::Backslash => Some(ShortcutPunctuationKeyName::Backslash),
        ShortcutKeyName::BracketLeft => Some(ShortcutPunctuationKeyName::BracketLeft),
        ShortcutKeyName::BracketRight => Some(ShortcutPunctuationKeyName::BracketRight),
        ShortcutKeyName::Comma => Some(ShortcutPunctuationKeyName::Comma),
        ShortcutKeyName::Equal => Some(ShortcutPunctuationKeyName::Equal),
        ShortcutKeyName::Minus => Some(ShortcutPunctuationKeyName::Minus),
        ShortcutKeyName::Period => Some(ShortcutPunctuationKeyName::Period),
        ShortcutKeyName::Plus => Some(ShortcutPunctuationKeyName::Plus),
        ShortcutKeyName::Quote => Some(ShortcutPunctuationKeyName::Quote),
        ShortcutKeyName::Semicolon => Some(ShortcutPunctuationKeyName::Semicolon),
        ShortcutKeyName::Slash => Some(ShortcutPunctuationKeyName::Slash),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for TS union assignment from the letter subset to ShortcutKeyName
pub fn shortcut_letter_key_name_to_key_name(value: ShortcutLetterKeyName) -> ShortcutKeyName {
    return match value {
        ShortcutLetterKeyName::A => ShortcutKeyName::A,
        ShortcutLetterKeyName::B => ShortcutKeyName::B,
        ShortcutLetterKeyName::C => ShortcutKeyName::C,
        ShortcutLetterKeyName::D => ShortcutKeyName::D,
        ShortcutLetterKeyName::E => ShortcutKeyName::E,
        ShortcutLetterKeyName::F => ShortcutKeyName::F,
        ShortcutLetterKeyName::G => ShortcutKeyName::G,
        ShortcutLetterKeyName::H => ShortcutKeyName::H,
        ShortcutLetterKeyName::I => ShortcutKeyName::I,
        ShortcutLetterKeyName::J => ShortcutKeyName::J,
        ShortcutLetterKeyName::K => ShortcutKeyName::K,
        ShortcutLetterKeyName::L => ShortcutKeyName::L,
        ShortcutLetterKeyName::M => ShortcutKeyName::M,
        ShortcutLetterKeyName::N => ShortcutKeyName::N,
        ShortcutLetterKeyName::O => ShortcutKeyName::O,
        ShortcutLetterKeyName::P => ShortcutKeyName::P,
        ShortcutLetterKeyName::Q => ShortcutKeyName::Q,
        ShortcutLetterKeyName::R => ShortcutKeyName::R,
        ShortcutLetterKeyName::S => ShortcutKeyName::S,
        ShortcutLetterKeyName::T => ShortcutKeyName::T,
        ShortcutLetterKeyName::U => ShortcutKeyName::U,
        ShortcutLetterKeyName::V => ShortcutKeyName::V,
        ShortcutLetterKeyName::W => ShortcutKeyName::W,
        ShortcutLetterKeyName::X => ShortcutKeyName::X,
        ShortcutLetterKeyName::Y => ShortcutKeyName::Y,
        ShortcutLetterKeyName::Z => ShortcutKeyName::Z,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for TS union assignment from the lock subset to ShortcutKeyName
pub fn shortcut_lock_key_name_to_key_name(value: ShortcutLockKeyName) -> ShortcutKeyName {
    return match value {
        ShortcutLockKeyName::CapsLock => ShortcutKeyName::CapsLock,
        ShortcutLockKeyName::NumLock => ShortcutKeyName::NumLock,
        ShortcutLockKeyName::PrintScreen => ShortcutKeyName::PrintScreen,
        ShortcutLockKeyName::ScrollLock => ShortcutKeyName::ScrollLock,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for TS union assignment from the media subset to ShortcutKeyName
pub fn shortcut_media_key_name_to_key_name(value: ShortcutMediaKeyName) -> ShortcutKeyName {
    return match value {
        ShortcutMediaKeyName::MediaNextTrack => ShortcutKeyName::MediaNextTrack,
        ShortcutMediaKeyName::MediaPlayPause => ShortcutKeyName::MediaPlayPause,
        ShortcutMediaKeyName::MediaPreviousTrack => ShortcutKeyName::MediaPreviousTrack,
        ShortcutMediaKeyName::MediaStop => ShortcutKeyName::MediaStop,
        ShortcutMediaKeyName::VolumeDown => ShortcutKeyName::VolumeDown,
        ShortcutMediaKeyName::VolumeMute => ShortcutKeyName::VolumeMute,
        ShortcutMediaKeyName::VolumeUp => ShortcutKeyName::VolumeUp,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for TS union assignment from the navigation subset to ShortcutKeyName
pub fn shortcut_navigation_key_name_to_key_name(
    value: ShortcutNavigationKeyName,
) -> ShortcutKeyName {
    return match value {
        ShortcutNavigationKeyName::ArrowDown => ShortcutKeyName::ArrowDown,
        ShortcutNavigationKeyName::ArrowLeft => ShortcutKeyName::ArrowLeft,
        ShortcutNavigationKeyName::ArrowRight => ShortcutKeyName::ArrowRight,
        ShortcutNavigationKeyName::ArrowUp => ShortcutKeyName::ArrowUp,
        ShortcutNavigationKeyName::End => ShortcutKeyName::End,
        ShortcutNavigationKeyName::Home => ShortcutKeyName::Home,
        ShortcutNavigationKeyName::PageDown => ShortcutKeyName::PageDown,
        ShortcutNavigationKeyName::PageUp => ShortcutKeyName::PageUp,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for TS union assignment from the numpad subset to ShortcutKeyName
pub fn shortcut_numpad_key_name_to_key_name(value: ShortcutNumpadKeyName) -> ShortcutKeyName {
    return match value {
        ShortcutNumpadKeyName::Numpad0 => ShortcutKeyName::Numpad0,
        ShortcutNumpadKeyName::Numpad1 => ShortcutKeyName::Numpad1,
        ShortcutNumpadKeyName::Numpad2 => ShortcutKeyName::Numpad2,
        ShortcutNumpadKeyName::Numpad3 => ShortcutKeyName::Numpad3,
        ShortcutNumpadKeyName::Numpad4 => ShortcutKeyName::Numpad4,
        ShortcutNumpadKeyName::Numpad5 => ShortcutKeyName::Numpad5,
        ShortcutNumpadKeyName::Numpad6 => ShortcutKeyName::Numpad6,
        ShortcutNumpadKeyName::Numpad7 => ShortcutKeyName::Numpad7,
        ShortcutNumpadKeyName::Numpad8 => ShortcutKeyName::Numpad8,
        ShortcutNumpadKeyName::Numpad9 => ShortcutKeyName::Numpad9,
        ShortcutNumpadKeyName::NumpadAdd => ShortcutKeyName::NumpadAdd,
        ShortcutNumpadKeyName::NumpadDecimal => ShortcutKeyName::NumpadDecimal,
        ShortcutNumpadKeyName::NumpadDivide => ShortcutKeyName::NumpadDivide,
        ShortcutNumpadKeyName::NumpadEnter => ShortcutKeyName::NumpadEnter,
        ShortcutNumpadKeyName::NumpadMultiply => ShortcutKeyName::NumpadMultiply,
        ShortcutNumpadKeyName::NumpadSubtract => ShortcutKeyName::NumpadSubtract,
    };
}

// flight-lint: allow(conform-extra) D2: Rust bridge for TS union assignment from the punctuation subset to ShortcutKeyName
pub fn shortcut_punctuation_key_name_to_key_name(
    value: ShortcutPunctuationKeyName,
) -> ShortcutKeyName {
    return match value {
        ShortcutPunctuationKeyName::Backquote => ShortcutKeyName::Backquote,
        ShortcutPunctuationKeyName::Backslash => ShortcutKeyName::Backslash,
        ShortcutPunctuationKeyName::BracketLeft => ShortcutKeyName::BracketLeft,
        ShortcutPunctuationKeyName::BracketRight => ShortcutKeyName::BracketRight,
        ShortcutPunctuationKeyName::Comma => ShortcutKeyName::Comma,
        ShortcutPunctuationKeyName::Equal => ShortcutKeyName::Equal,
        ShortcutPunctuationKeyName::Minus => ShortcutKeyName::Minus,
        ShortcutPunctuationKeyName::Period => ShortcutKeyName::Period,
        ShortcutPunctuationKeyName::Plus => ShortcutKeyName::Plus,
        ShortcutPunctuationKeyName::Quote => ShortcutKeyName::Quote,
        ShortcutPunctuationKeyName::Semicolon => ShortcutKeyName::Semicolon,
        ShortcutPunctuationKeyName::Slash => ShortcutKeyName::Slash,
    };
}

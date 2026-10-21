use std::sync::LazyLock;

use flight_entity::{Record, get_record_value, set_record_value};
use flight_platform::PlatformName;

use crate::types::*;

const MODIFIER_ORDER: [ShortcutModifier; 6] = [
    ShortcutModifier::Control,
    ShortcutModifier::Alt,
    ShortcutModifier::Shift,
    ShortcutModifier::Meta,
    ShortcutModifier::Super,
    ShortcutModifier::CommandOrControl,
];

static MODIFIER_ALIASES: LazyLock<Record<ShortcutModifier>> = LazyLock::new(|| {
    let mut aliases = Record::default();
    set_record_value(&mut aliases, "alt".to_string(), ShortcutModifier::Alt);
    set_record_value(&mut aliases, "cmd".to_string(), ShortcutModifier::Meta);
    set_record_value(&mut aliases, "command".to_string(), ShortcutModifier::Meta);
    set_record_value(
        &mut aliases,
        "commandorcontrol".to_string(),
        ShortcutModifier::CommandOrControl,
    );
    set_record_value(
        &mut aliases,
        "control".to_string(),
        ShortcutModifier::Control,
    );
    set_record_value(&mut aliases, "ctrl".to_string(), ShortcutModifier::Control);
    set_record_value(&mut aliases, "meta".to_string(), ShortcutModifier::Meta);
    set_record_value(&mut aliases, "option".to_string(), ShortcutModifier::Alt);
    set_record_value(&mut aliases, "shift".to_string(), ShortcutModifier::Shift);
    set_record_value(&mut aliases, "super".to_string(), ShortcutModifier::Super);
    set_record_value(&mut aliases, "win".to_string(), ShortcutModifier::Super);
    return aliases;
});

static KEY_ALIASES: LazyLock<Record<ShortcutKeyName>> = LazyLock::new(|| {
    let mut aliases = Record::default();
    let values = [
        ("arrowdown", ShortcutKeyName::ArrowDown),
        ("arrowleft", ShortcutKeyName::ArrowLeft),
        ("arrowright", ShortcutKeyName::ArrowRight),
        ("arrowup", ShortcutKeyName::ArrowUp),
        ("down", ShortcutKeyName::ArrowDown),
        ("left", ShortcutKeyName::ArrowLeft),
        ("right", ShortcutKeyName::ArrowRight),
        ("up", ShortcutKeyName::ArrowUp),
        ("end", ShortcutKeyName::End),
        ("home", ShortcutKeyName::Home),
        ("pagedown", ShortcutKeyName::PageDown),
        ("pageup", ShortcutKeyName::PageUp),
        ("pgdn", ShortcutKeyName::PageDown),
        ("pgup", ShortcutKeyName::PageUp),
        ("backspace", ShortcutKeyName::Backspace),
        ("delete", ShortcutKeyName::Delete),
        ("del", ShortcutKeyName::Delete),
        ("escape", ShortcutKeyName::Escape),
        ("esc", ShortcutKeyName::Escape),
        ("enter", ShortcutKeyName::Return),
        ("return", ShortcutKeyName::Return),
        ("insert", ShortcutKeyName::Insert),
        ("ins", ShortcutKeyName::Insert),
        ("space", ShortcutKeyName::Space),
        ("spacebar", ShortcutKeyName::Space),
        (" ", ShortcutKeyName::Space),
        ("tab", ShortcutKeyName::Tab),
        ("numadd", ShortcutKeyName::NumpadAdd),
        ("numdec", ShortcutKeyName::NumpadDecimal),
        ("numdiv", ShortcutKeyName::NumpadDivide),
        ("nummult", ShortcutKeyName::NumpadMultiply),
        ("numsub", ShortcutKeyName::NumpadSubtract),
        ("num0", ShortcutKeyName::Numpad0),
        ("num1", ShortcutKeyName::Numpad1),
        ("num2", ShortcutKeyName::Numpad2),
        ("num3", ShortcutKeyName::Numpad3),
        ("num4", ShortcutKeyName::Numpad4),
        ("num5", ShortcutKeyName::Numpad5),
        ("num6", ShortcutKeyName::Numpad6),
        ("num7", ShortcutKeyName::Numpad7),
        ("num8", ShortcutKeyName::Numpad8),
        ("num9", ShortcutKeyName::Numpad9),
        ("numpad0", ShortcutKeyName::Numpad0),
        ("numpad1", ShortcutKeyName::Numpad1),
        ("numpad2", ShortcutKeyName::Numpad2),
        ("numpad3", ShortcutKeyName::Numpad3),
        ("numpad4", ShortcutKeyName::Numpad4),
        ("numpad5", ShortcutKeyName::Numpad5),
        ("numpad6", ShortcutKeyName::Numpad6),
        ("numpad7", ShortcutKeyName::Numpad7),
        ("numpad8", ShortcutKeyName::Numpad8),
        ("numpad9", ShortcutKeyName::Numpad9),
        ("numpadadd", ShortcutKeyName::NumpadAdd),
        ("numpaddecimal", ShortcutKeyName::NumpadDecimal),
        ("numpaddivide", ShortcutKeyName::NumpadDivide),
        ("numpadenter", ShortcutKeyName::NumpadEnter),
        ("numpadmultiply", ShortcutKeyName::NumpadMultiply),
        ("numpadsubtract", ShortcutKeyName::NumpadSubtract),
        ("'", ShortcutKeyName::Quote),
        ("+", ShortcutKeyName::Plus),
        (",", ShortcutKeyName::Comma),
        ("-", ShortcutKeyName::Minus),
        (".", ShortcutKeyName::Period),
        ("/", ShortcutKeyName::Slash),
        (";", ShortcutKeyName::Semicolon),
        ("=", ShortcutKeyName::Equal),
        ("[", ShortcutKeyName::BracketLeft),
        ("\\", ShortcutKeyName::Backslash),
        ("]", ShortcutKeyName::BracketRight),
        ("`", ShortcutKeyName::Backquote),
        ("backquote", ShortcutKeyName::Backquote),
        ("backslash", ShortcutKeyName::Backslash),
        ("bracketleft", ShortcutKeyName::BracketLeft),
        ("bracketright", ShortcutKeyName::BracketRight),
        ("comma", ShortcutKeyName::Comma),
        ("equal", ShortcutKeyName::Equal),
        ("minus", ShortcutKeyName::Minus),
        ("period", ShortcutKeyName::Period),
        ("plus", ShortcutKeyName::Plus),
        ("quote", ShortcutKeyName::Quote),
        ("semicolon", ShortcutKeyName::Semicolon),
        ("slash", ShortcutKeyName::Slash),
        ("medianexttrack", ShortcutKeyName::MediaNextTrack),
        ("mediaplaypause", ShortcutKeyName::MediaPlayPause),
        ("mediaprevioustrack", ShortcutKeyName::MediaPreviousTrack),
        ("mediastop", ShortcutKeyName::MediaStop),
        ("volumedown", ShortcutKeyName::VolumeDown),
        ("volumemute", ShortcutKeyName::VolumeMute),
        ("volumeup", ShortcutKeyName::VolumeUp),
        ("capslock", ShortcutKeyName::CapsLock),
        ("numlock", ShortcutKeyName::NumLock),
        ("print", ShortcutKeyName::PrintScreen),
        ("printscreen", ShortcutKeyName::PrintScreen),
        ("scrolllock", ShortcutKeyName::ScrollLock),
    ];
    for (alias, key) in values {
        set_record_value(&mut aliases, alias.to_string(), key);
    }
    return aliases;
});

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ParsedInternal {
    pub(crate) key: ShortcutKeyName,
    pub(crate) modifiers: Vec<ShortcutModifier>,
}

/// True only when both strings parse to the same canonical chord.
pub fn equals_accelerator(a: &str, b: &str) -> bool {
    let a = normalize_accelerator(a);
    let b = normalize_accelerator(b);
    if a.is_none() || b.is_none() {
        return false;
    }
    return a == b;
}

/// Returns the first caller-spelled candidate naming the same chord.
pub fn find_accelerator_conflict(accelerator: &str, candidates: &[String]) -> Option<String> {
    let normalized = normalize_accelerator(accelerator)?;
    for candidate in candidates {
        if normalize_accelerator(candidate).as_ref() == Some(&normalized) {
            return Some(candidate.clone());
        }
    }
    return None;
}

/// Formats a chord for the injected platform; malformed input becomes the source empty sentinel.
pub fn format_accelerator_for_display(accelerator: &str, platform: PlatformName) -> String {
    let Ok(parsed) = parse_internal(accelerator) else {
        return String::new();
    };
    let is_mac = platform == PlatformName::MacOs;
    let mut parts = Vec::new();
    for modifier in parsed.modifiers {
        let resolved = if modifier == ShortcutModifier::CommandOrControl {
            resolve_command_or_control_modifier(platform)
        } else {
            modifier
        };
        parts.push(get_resolved_modifier_label(resolved, is_mac).to_string());
    }
    parts.push(get_accelerator_key_label(parsed.key));
    return if is_mac {
        parts.join("")
    } else {
        parts.join("+")
    };
}

/// Returns the canonical key, or `None` for an invalid chord.
pub fn get_accelerator_key(accelerator: &str) -> Option<ShortcutKeyName> {
    return parse_internal(accelerator).ok().map(|parsed| parsed.key);
}

/// Renders the source display label for one canonical key.
pub fn get_accelerator_key_label(key: ShortcutKeyName) -> String {
    return match key {
        ShortcutKeyName::ArrowDown => "↓",
        ShortcutKeyName::ArrowLeft => "←",
        ShortcutKeyName::ArrowRight => "→",
        ShortcutKeyName::ArrowUp => "↑",
        ShortcutKeyName::Backspace => "⌫",
        ShortcutKeyName::CapsLock => "⇪",
        ShortcutKeyName::Delete => "⌦",
        ShortcutKeyName::End => "End",
        ShortcutKeyName::Escape => "Esc",
        ShortcutKeyName::Home => "Home",
        ShortcutKeyName::Insert => "Ins",
        ShortcutKeyName::MediaNextTrack => "⏭",
        ShortcutKeyName::MediaPlayPause => "⏯",
        ShortcutKeyName::MediaPreviousTrack => "⏮",
        ShortcutKeyName::MediaStop => "⏹",
        ShortcutKeyName::NumLock => "NumLk",
        ShortcutKeyName::PageDown => "PgDn",
        ShortcutKeyName::PageUp => "PgUp",
        ShortcutKeyName::PrintScreen => "PrtSc",
        ShortcutKeyName::Return => "↵",
        ShortcutKeyName::ScrollLock => "ScrLk",
        ShortcutKeyName::Space => "Space",
        ShortcutKeyName::Tab => "⇥",
        ShortcutKeyName::VolumeDown => "🔉",
        ShortcutKeyName::VolumeMute => "🔇",
        ShortcutKeyName::VolumeUp => "🔊",
        _ => get_shortcut_key_name_string(key),
    }
    .to_string();
}

/// Renders one modifier after resolving `CommandOrControl` against the injected platform.
pub fn get_accelerator_modifier_label(
    modifier: ShortcutModifier,
    platform: PlatformName,
) -> String {
    let resolved = if modifier == ShortcutModifier::CommandOrControl {
        resolve_command_or_control_modifier(platform)
    } else {
        modifier
    };
    return get_resolved_modifier_label(resolved, platform == PlatformName::MacOs).to_string();
}

/// Writes the canonical modifier list, preserving `out` unchanged on failure.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it/null; Rust takes it first and returns success without chaining
pub fn get_accelerator_modifiers(out: &mut Vec<ShortcutModifier>, accelerator: &str) -> bool {
    let Ok(parsed) = parse_internal(accelerator) else {
        return false;
    };
    out.clear();
    out.extend(parsed.modifiers);
    return true;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AcceleratorParseErrorReason string union
pub fn get_accelerator_parse_error_reason_string(
    value: AcceleratorParseErrorReason,
) -> &'static str {
    return match value {
        AcceleratorParseErrorReason::DuplicateModifier => "duplicate-modifier",
        AcceleratorParseErrorReason::Empty => "empty",
        AcceleratorParseErrorReason::MissingKey => "missing-key",
        AcceleratorParseErrorReason::UnknownKey => "unknown-key",
        AcceleratorParseErrorReason::UnknownModifier => "unknown-modifier",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShortcutKeyName string union
pub fn get_shortcut_key_name_string(value: ShortcutKeyName) -> &'static str {
    return match value {
        ShortcutKeyName::Digit0 => "0",
        ShortcutKeyName::Digit1 => "1",
        ShortcutKeyName::Digit2 => "2",
        ShortcutKeyName::Digit3 => "3",
        ShortcutKeyName::Digit4 => "4",
        ShortcutKeyName::Digit5 => "5",
        ShortcutKeyName::Digit6 => "6",
        ShortcutKeyName::Digit7 => "7",
        ShortcutKeyName::Digit8 => "8",
        ShortcutKeyName::Digit9 => "9",
        ShortcutKeyName::A => "A",
        ShortcutKeyName::B => "B",
        ShortcutKeyName::C => "C",
        ShortcutKeyName::D => "D",
        ShortcutKeyName::E => "E",
        ShortcutKeyName::F => "F",
        ShortcutKeyName::G => "G",
        ShortcutKeyName::H => "H",
        ShortcutKeyName::I => "I",
        ShortcutKeyName::J => "J",
        ShortcutKeyName::K => "K",
        ShortcutKeyName::L => "L",
        ShortcutKeyName::M => "M",
        ShortcutKeyName::N => "N",
        ShortcutKeyName::O => "O",
        ShortcutKeyName::P => "P",
        ShortcutKeyName::Q => "Q",
        ShortcutKeyName::R => "R",
        ShortcutKeyName::S => "S",
        ShortcutKeyName::T => "T",
        ShortcutKeyName::U => "U",
        ShortcutKeyName::V => "V",
        ShortcutKeyName::W => "W",
        ShortcutKeyName::X => "X",
        ShortcutKeyName::Y => "Y",
        ShortcutKeyName::Z => "Z",
        ShortcutKeyName::F1 => "F1",
        ShortcutKeyName::F2 => "F2",
        ShortcutKeyName::F3 => "F3",
        ShortcutKeyName::F4 => "F4",
        ShortcutKeyName::F5 => "F5",
        ShortcutKeyName::F6 => "F6",
        ShortcutKeyName::F7 => "F7",
        ShortcutKeyName::F8 => "F8",
        ShortcutKeyName::F9 => "F9",
        ShortcutKeyName::F10 => "F10",
        ShortcutKeyName::F11 => "F11",
        ShortcutKeyName::F12 => "F12",
        ShortcutKeyName::F13 => "F13",
        ShortcutKeyName::F14 => "F14",
        ShortcutKeyName::F15 => "F15",
        ShortcutKeyName::F16 => "F16",
        ShortcutKeyName::F17 => "F17",
        ShortcutKeyName::F18 => "F18",
        ShortcutKeyName::F19 => "F19",
        ShortcutKeyName::F20 => "F20",
        ShortcutKeyName::F21 => "F21",
        ShortcutKeyName::F22 => "F22",
        ShortcutKeyName::F23 => "F23",
        ShortcutKeyName::F24 => "F24",
        ShortcutKeyName::ArrowDown => "ArrowDown",
        ShortcutKeyName::ArrowLeft => "ArrowLeft",
        ShortcutKeyName::ArrowRight => "ArrowRight",
        ShortcutKeyName::ArrowUp => "ArrowUp",
        ShortcutKeyName::End => "End",
        ShortcutKeyName::Home => "Home",
        ShortcutKeyName::PageDown => "PageDown",
        ShortcutKeyName::PageUp => "PageUp",
        ShortcutKeyName::Backspace => "Backspace",
        ShortcutKeyName::Delete => "Delete",
        ShortcutKeyName::Escape => "Escape",
        ShortcutKeyName::Insert => "Insert",
        ShortcutKeyName::Return => "Return",
        ShortcutKeyName::Space => "Space",
        ShortcutKeyName::Tab => "Tab",
        ShortcutKeyName::Numpad0 => "Numpad0",
        ShortcutKeyName::Numpad1 => "Numpad1",
        ShortcutKeyName::Numpad2 => "Numpad2",
        ShortcutKeyName::Numpad3 => "Numpad3",
        ShortcutKeyName::Numpad4 => "Numpad4",
        ShortcutKeyName::Numpad5 => "Numpad5",
        ShortcutKeyName::Numpad6 => "Numpad6",
        ShortcutKeyName::Numpad7 => "Numpad7",
        ShortcutKeyName::Numpad8 => "Numpad8",
        ShortcutKeyName::Numpad9 => "Numpad9",
        ShortcutKeyName::NumpadAdd => "NumpadAdd",
        ShortcutKeyName::NumpadDecimal => "NumpadDecimal",
        ShortcutKeyName::NumpadDivide => "NumpadDivide",
        ShortcutKeyName::NumpadEnter => "NumpadEnter",
        ShortcutKeyName::NumpadMultiply => "NumpadMultiply",
        ShortcutKeyName::NumpadSubtract => "NumpadSubtract",
        ShortcutKeyName::Backquote => "Backquote",
        ShortcutKeyName::Backslash => "Backslash",
        ShortcutKeyName::BracketLeft => "BracketLeft",
        ShortcutKeyName::BracketRight => "BracketRight",
        ShortcutKeyName::Comma => "Comma",
        ShortcutKeyName::Equal => "Equal",
        ShortcutKeyName::Minus => "Minus",
        ShortcutKeyName::Period => "Period",
        ShortcutKeyName::Plus => "Plus",
        ShortcutKeyName::Quote => "Quote",
        ShortcutKeyName::Semicolon => "Semicolon",
        ShortcutKeyName::Slash => "Slash",
        ShortcutKeyName::MediaNextTrack => "MediaNextTrack",
        ShortcutKeyName::MediaPlayPause => "MediaPlayPause",
        ShortcutKeyName::MediaPreviousTrack => "MediaPreviousTrack",
        ShortcutKeyName::MediaStop => "MediaStop",
        ShortcutKeyName::VolumeDown => "VolumeDown",
        ShortcutKeyName::VolumeMute => "VolumeMute",
        ShortcutKeyName::VolumeUp => "VolumeUp",
        ShortcutKeyName::CapsLock => "CapsLock",
        ShortcutKeyName::NumLock => "NumLock",
        ShortcutKeyName::PrintScreen => "PrintScreen",
        ShortcutKeyName::ScrollLock => "ScrollLock",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShortcutModifier string union
pub fn get_shortcut_modifier_string(value: ShortcutModifier) -> &'static str {
    return match value {
        ShortcutModifier::Alt => "Alt",
        ShortcutModifier::CommandOrControl => "CommandOrControl",
        ShortcutModifier::Control => "Control",
        ShortcutModifier::Meta => "Meta",
        ShortcutModifier::Shift => "Shift",
        ShortcutModifier::Super => "Super",
    };
}

/// True when the input parses without consulting a provider.
pub fn is_accelerator_valid(input: &str) -> bool {
    return parse_internal(input).is_ok();
}

/// Creates the source zero parse record. This is plain data, not an Entity.
pub fn make_parsed_accelerator() -> ParsedAccelerator {
    return ParsedAccelerator {
        key: String::new(),
        modifiers: Vec::new(),
    };
}

/// Returns canonical modifier order and key spelling, or `None` for malformed input.
pub fn normalize_accelerator(input: &str) -> Option<Accelerator> {
    let parsed = parse_internal(input).ok()?;
    return Some(format_internal(&parsed));
}

/// Parses into caller-owned storage, preserving it on failure.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it/null; Rust takes it first and returns success without chaining
pub fn parse_accelerator(out: &mut ParsedAccelerator, input: &str) -> bool {
    let Ok(parsed) = parse_internal(input) else {
        return false;
    };
    copy_parsed(&parsed, out);
    return true;
}

/// Parses into caller-owned storage; `Some(error)` is failure and leaves `out` untouched.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns out/error; Rust takes it first and returns only the diagnostic status
pub fn parse_accelerator_detailed(
    out: &mut ParsedAccelerator,
    input: &str,
) -> Option<AcceleratorParseError> {
    let parsed = match parse_internal(input) {
        Ok(parsed) => parsed,
        Err(error) => return Some(error),
    };
    copy_parsed(&parsed, out);
    return None;
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS AcceleratorParseErrorReason string union
pub fn parse_accelerator_parse_error_reason(value: &str) -> Option<AcceleratorParseErrorReason> {
    return match value {
        "duplicate-modifier" => Some(AcceleratorParseErrorReason::DuplicateModifier),
        "empty" => Some(AcceleratorParseErrorReason::Empty),
        "missing-key" => Some(AcceleratorParseErrorReason::MissingKey),
        "unknown-key" => Some(AcceleratorParseErrorReason::UnknownKey),
        "unknown-modifier" => Some(AcceleratorParseErrorReason::UnknownModifier),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS ShortcutKeyName string union
pub fn parse_shortcut_key_name(value: &str) -> Option<ShortcutKeyName> {
    return match value {
        "0" => Some(ShortcutKeyName::Digit0),
        "1" => Some(ShortcutKeyName::Digit1),
        "2" => Some(ShortcutKeyName::Digit2),
        "3" => Some(ShortcutKeyName::Digit3),
        "4" => Some(ShortcutKeyName::Digit4),
        "5" => Some(ShortcutKeyName::Digit5),
        "6" => Some(ShortcutKeyName::Digit6),
        "7" => Some(ShortcutKeyName::Digit7),
        "8" => Some(ShortcutKeyName::Digit8),
        "9" => Some(ShortcutKeyName::Digit9),
        "A" => Some(ShortcutKeyName::A),
        "B" => Some(ShortcutKeyName::B),
        "C" => Some(ShortcutKeyName::C),
        "D" => Some(ShortcutKeyName::D),
        "E" => Some(ShortcutKeyName::E),
        "F" => Some(ShortcutKeyName::F),
        "G" => Some(ShortcutKeyName::G),
        "H" => Some(ShortcutKeyName::H),
        "I" => Some(ShortcutKeyName::I),
        "J" => Some(ShortcutKeyName::J),
        "K" => Some(ShortcutKeyName::K),
        "L" => Some(ShortcutKeyName::L),
        "M" => Some(ShortcutKeyName::M),
        "N" => Some(ShortcutKeyName::N),
        "O" => Some(ShortcutKeyName::O),
        "P" => Some(ShortcutKeyName::P),
        "Q" => Some(ShortcutKeyName::Q),
        "R" => Some(ShortcutKeyName::R),
        "S" => Some(ShortcutKeyName::S),
        "T" => Some(ShortcutKeyName::T),
        "U" => Some(ShortcutKeyName::U),
        "V" => Some(ShortcutKeyName::V),
        "W" => Some(ShortcutKeyName::W),
        "X" => Some(ShortcutKeyName::X),
        "Y" => Some(ShortcutKeyName::Y),
        "Z" => Some(ShortcutKeyName::Z),
        "F1" => Some(ShortcutKeyName::F1),
        "F2" => Some(ShortcutKeyName::F2),
        "F3" => Some(ShortcutKeyName::F3),
        "F4" => Some(ShortcutKeyName::F4),
        "F5" => Some(ShortcutKeyName::F5),
        "F6" => Some(ShortcutKeyName::F6),
        "F7" => Some(ShortcutKeyName::F7),
        "F8" => Some(ShortcutKeyName::F8),
        "F9" => Some(ShortcutKeyName::F9),
        "F10" => Some(ShortcutKeyName::F10),
        "F11" => Some(ShortcutKeyName::F11),
        "F12" => Some(ShortcutKeyName::F12),
        "F13" => Some(ShortcutKeyName::F13),
        "F14" => Some(ShortcutKeyName::F14),
        "F15" => Some(ShortcutKeyName::F15),
        "F16" => Some(ShortcutKeyName::F16),
        "F17" => Some(ShortcutKeyName::F17),
        "F18" => Some(ShortcutKeyName::F18),
        "F19" => Some(ShortcutKeyName::F19),
        "F20" => Some(ShortcutKeyName::F20),
        "F21" => Some(ShortcutKeyName::F21),
        "F22" => Some(ShortcutKeyName::F22),
        "F23" => Some(ShortcutKeyName::F23),
        "F24" => Some(ShortcutKeyName::F24),
        "ArrowDown" => Some(ShortcutKeyName::ArrowDown),
        "ArrowLeft" => Some(ShortcutKeyName::ArrowLeft),
        "ArrowRight" => Some(ShortcutKeyName::ArrowRight),
        "ArrowUp" => Some(ShortcutKeyName::ArrowUp),
        "End" => Some(ShortcutKeyName::End),
        "Home" => Some(ShortcutKeyName::Home),
        "PageDown" => Some(ShortcutKeyName::PageDown),
        "PageUp" => Some(ShortcutKeyName::PageUp),
        "Backspace" => Some(ShortcutKeyName::Backspace),
        "Delete" => Some(ShortcutKeyName::Delete),
        "Escape" => Some(ShortcutKeyName::Escape),
        "Insert" => Some(ShortcutKeyName::Insert),
        "Return" => Some(ShortcutKeyName::Return),
        "Space" => Some(ShortcutKeyName::Space),
        "Tab" => Some(ShortcutKeyName::Tab),
        "Numpad0" => Some(ShortcutKeyName::Numpad0),
        "Numpad1" => Some(ShortcutKeyName::Numpad1),
        "Numpad2" => Some(ShortcutKeyName::Numpad2),
        "Numpad3" => Some(ShortcutKeyName::Numpad3),
        "Numpad4" => Some(ShortcutKeyName::Numpad4),
        "Numpad5" => Some(ShortcutKeyName::Numpad5),
        "Numpad6" => Some(ShortcutKeyName::Numpad6),
        "Numpad7" => Some(ShortcutKeyName::Numpad7),
        "Numpad8" => Some(ShortcutKeyName::Numpad8),
        "Numpad9" => Some(ShortcutKeyName::Numpad9),
        "NumpadAdd" => Some(ShortcutKeyName::NumpadAdd),
        "NumpadDecimal" => Some(ShortcutKeyName::NumpadDecimal),
        "NumpadDivide" => Some(ShortcutKeyName::NumpadDivide),
        "NumpadEnter" => Some(ShortcutKeyName::NumpadEnter),
        "NumpadMultiply" => Some(ShortcutKeyName::NumpadMultiply),
        "NumpadSubtract" => Some(ShortcutKeyName::NumpadSubtract),
        "Backquote" => Some(ShortcutKeyName::Backquote),
        "Backslash" => Some(ShortcutKeyName::Backslash),
        "BracketLeft" => Some(ShortcutKeyName::BracketLeft),
        "BracketRight" => Some(ShortcutKeyName::BracketRight),
        "Comma" => Some(ShortcutKeyName::Comma),
        "Equal" => Some(ShortcutKeyName::Equal),
        "Minus" => Some(ShortcutKeyName::Minus),
        "Period" => Some(ShortcutKeyName::Period),
        "Plus" => Some(ShortcutKeyName::Plus),
        "Quote" => Some(ShortcutKeyName::Quote),
        "Semicolon" => Some(ShortcutKeyName::Semicolon),
        "Slash" => Some(ShortcutKeyName::Slash),
        "MediaNextTrack" => Some(ShortcutKeyName::MediaNextTrack),
        "MediaPlayPause" => Some(ShortcutKeyName::MediaPlayPause),
        "MediaPreviousTrack" => Some(ShortcutKeyName::MediaPreviousTrack),
        "MediaStop" => Some(ShortcutKeyName::MediaStop),
        "VolumeDown" => Some(ShortcutKeyName::VolumeDown),
        "VolumeMute" => Some(ShortcutKeyName::VolumeMute),
        "VolumeUp" => Some(ShortcutKeyName::VolumeUp),
        "CapsLock" => Some(ShortcutKeyName::CapsLock),
        "NumLock" => Some(ShortcutKeyName::NumLock),
        "PrintScreen" => Some(ShortcutKeyName::PrintScreen),
        "ScrollLock" => Some(ShortcutKeyName::ScrollLock),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS ShortcutModifier string union
pub fn parse_shortcut_modifier(value: &str) -> Option<ShortcutModifier> {
    return match value {
        "Alt" => Some(ShortcutModifier::Alt),
        "CommandOrControl" => Some(ShortcutModifier::CommandOrControl),
        "Control" => Some(ShortcutModifier::Control),
        "Meta" => Some(ShortcutModifier::Meta),
        "Shift" => Some(ShortcutModifier::Shift),
        "Super" => Some(ShortcutModifier::Super),
        _ => None,
    };
}

/// Resolves the platform-relative modifier solely from injected platform truth.
pub fn resolve_command_or_control_modifier(platform: PlatformName) -> ShortcutModifier {
    return if platform == PlatformName::MacOs {
        ShortcutModifier::Meta
    } else {
        ShortcutModifier::Control
    };
}

pub(crate) fn format_parsed_accelerator(parsed: &ParsedAccelerator) -> Accelerator {
    if parsed.modifiers.is_empty() {
        return parsed.key.clone();
    }
    let mut parts: Vec<String> = parsed
        .modifiers
        .iter()
        .map(|modifier| get_shortcut_modifier_string(*modifier).to_string())
        .collect();
    parts.push(parsed.key.clone());
    return parts.join("+");
}

pub(crate) fn parse_internal(input: &str) -> Result<ParsedInternal, AcceleratorParseError> {
    let tokens = split_tokens(input.trim());
    if tokens.is_empty() {
        return Err(AcceleratorParseError {
            token: String::new(),
            reason: AcceleratorParseErrorReason::Empty,
        });
    }
    let mut modifiers = Vec::new();
    let mut key: Option<&str> = None;
    for token in tokens {
        let lower = token.to_lowercase();
        if let Some(modifier) = get_record_value(&MODIFIER_ALIASES, &lower).copied() {
            if modifiers.contains(&modifier) {
                return Err(AcceleratorParseError {
                    token: token.to_string(),
                    reason: AcceleratorParseErrorReason::DuplicateModifier,
                });
            }
            modifiers.push(modifier);
        } else {
            if let Some(previous) = key {
                return Err(AcceleratorParseError {
                    token: previous.to_string(),
                    reason: AcceleratorParseErrorReason::UnknownModifier,
                });
            }
            key = Some(token);
        }
    }
    let Some(key) = key else {
        return Err(AcceleratorParseError {
            token: String::new(),
            reason: AcceleratorParseErrorReason::MissingKey,
        });
    };
    let Some(key_name) = parse_key_alias(key) else {
        return Err(AcceleratorParseError {
            token: key.to_string(),
            reason: AcceleratorParseErrorReason::UnknownKey,
        });
    };
    modifiers.sort_by_key(|modifier| {
        MODIFIER_ORDER
            .iter()
            .position(|candidate| candidate == modifier)
            .unwrap()
    });
    return Ok(ParsedInternal {
        key: key_name,
        modifiers,
    });
}

fn copy_parsed(source: &ParsedInternal, out: &mut ParsedAccelerator) {
    out.key = get_shortcut_key_name_string(source.key).to_string();
    out.modifiers.clear();
    out.modifiers.extend(source.modifiers.iter().copied());
}

fn format_internal(parsed: &ParsedInternal) -> Accelerator {
    if parsed.modifiers.is_empty() {
        return get_shortcut_key_name_string(parsed.key).to_string();
    }
    let mut parts: Vec<String> = parsed
        .modifiers
        .iter()
        .map(|modifier| get_shortcut_modifier_string(*modifier).to_string())
        .collect();
    parts.push(get_shortcut_key_name_string(parsed.key).to_string());
    return parts.join("+");
}

fn get_resolved_modifier_label(modifier: ShortcutModifier, is_mac: bool) -> &'static str {
    return match modifier {
        ShortcutModifier::Alt => {
            if is_mac {
                "⌥"
            } else {
                "Alt"
            }
        }
        ShortcutModifier::Control => {
            if is_mac {
                "⌃"
            } else {
                "Ctrl"
            }
        }
        ShortcutModifier::Meta => {
            if is_mac {
                "⌘"
            } else {
                "Win"
            }
        }
        ShortcutModifier::Shift => {
            if is_mac {
                "⇧"
            } else {
                "Shift"
            }
        }
        ShortcutModifier::Super => {
            if is_mac {
                "⌘"
            } else {
                "Super"
            }
        }
        ShortcutModifier::CommandOrControl => "",
    };
}

fn parse_key_alias(value: &str) -> Option<ShortcutKeyName> {
    let lower = value.to_lowercase();
    if lower.len() == 1 && lower.as_bytes()[0].is_ascii_alphabetic() {
        return parse_shortcut_key_name(&lower.to_ascii_uppercase());
    }
    if lower.len() == 1 && lower.as_bytes()[0].is_ascii_digit() {
        return parse_shortcut_key_name(&lower);
    }
    if let Some(number) = lower.strip_prefix('f')
        && let Ok(number) = number.parse::<u8>()
        && (1..=24).contains(&number)
    {
        return parse_shortcut_key_name(&format!("F{number}"));
    }
    return get_record_value(&KEY_ALIASES, &lower).copied();
}

fn split_tokens(input: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0;
    for (index, character) in input.char_indices() {
        if (character == '+' || character == '-') && index > start {
            out.push(&input[start..index]);
            start = index + character.len_utf8();
        }
    }
    if start < input.len() {
        out.push(&input[start..]);
    }
    return out;
}

impl ParsedAccelerator {
    pub fn new() -> Self {
        return make_parsed_accelerator();
    }

    pub fn parse(&mut self, input: &str) -> bool {
        return parse_accelerator(self, input);
    }

    pub fn parse_detailed(&mut self, input: &str) -> Option<AcceleratorParseError> {
        return parse_accelerator_detailed(self, input);
    }
}

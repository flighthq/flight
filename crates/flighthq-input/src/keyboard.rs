//! Keyboard event dispatch and key-code helpers.

use flighthq_signals::emit_signal;
use flighthq_types::input::key_code;
use flighthq_types::input::key_modifier;
use flighthq_types::input::{InputKeyboardData, KeyCode, KeyModifier};

use crate::manager::InputManager;

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

/// Dispatches a key-down event into `manager`, emitting `signals.on_key_down`.
///
/// Does nothing when `manager.enabled` is `false`.
pub fn dispatch_keyboard_event(manager: &mut InputManager, data: InputKeyboardData, is_down: bool) {
    if !manager.enabled {
        return;
    }
    if is_down {
        emit_signal(&manager.signals.on_key_down, &data);
    } else {
        emit_signal(&manager.signals.on_key_up, &data);
    }
}

// ---------------------------------------------------------------------------
// key-code helpers
// ---------------------------------------------------------------------------

/// Returns the [`KeyCode`] for the given platform key name string (e.g.
/// `"ArrowUp"`, `"Escape"`).
///
/// Returns [`flighthq_types::input::key_code::UNKNOWN`] when the name is not
/// recognized.
pub fn get_key_code_from_key_name(name: &str) -> KeyCode {
    if let Some(code) = key_code_from_named_key(name) {
        return code;
    }
    // A single printable character maps to its lower-case code point, matching
    // the SDL-compatible convention in the web port (`key.toLowerCase()`).
    let mut chars = name.chars();
    if let (Some(c), None) = (chars.next(), chars.next()) {
        return c.to_ascii_lowercase() as u32;
    }
    key_code::UNKNOWN
}

/// Builds a [`KeyModifier`] bitmask from individual modifier flags.
pub fn get_key_modifier_from_flags(
    left_shift: bool,
    right_shift: bool,
    left_ctrl: bool,
    right_ctrl: bool,
    left_alt: bool,
    right_alt: bool,
    left_meta: bool,
    right_meta: bool,
    caps_lock: bool,
    num_lock: bool,
) -> KeyModifier {
    let mut modifier = key_modifier::NONE;
    if left_shift {
        modifier |= key_modifier::LEFT_SHIFT;
    }
    if right_shift {
        modifier |= key_modifier::RIGHT_SHIFT;
    }
    if left_ctrl {
        modifier |= key_modifier::LEFT_CTRL;
    }
    if right_ctrl {
        modifier |= key_modifier::RIGHT_CTRL;
    }
    if left_alt {
        modifier |= key_modifier::LEFT_ALT;
    }
    if right_alt {
        modifier |= key_modifier::RIGHT_ALT;
    }
    if left_meta {
        modifier |= key_modifier::LEFT_META;
    }
    if right_meta {
        modifier |= key_modifier::RIGHT_META;
    }
    if caps_lock {
        modifier |= key_modifier::CAPS_LOCK;
    }
    if num_lock {
        modifier |= key_modifier::NUM_LOCK;
    }
    modifier
}

// ---------------------------------------------------------------------------
// named-key table
// ---------------------------------------------------------------------------

/// Maps a platform key/code name to a [`KeyCode`], covering the named (non
/// single-character) keys handled by the web port's `keyCodesByKey` and
/// `keyCodesByCode` tables.
fn key_code_from_named_key(name: &str) -> Option<KeyCode> {
    let code = match name {
        "Alt" | "AltLeft" => key_code::LEFT_ALT,
        "AltRight" => key_code::RIGHT_ALT,
        "ArrowDown" => key_code::DOWN,
        "ArrowLeft" => key_code::LEFT,
        "ArrowRight" => key_code::RIGHT,
        "ArrowUp" => key_code::UP,
        "Backspace" => key_code::BACKSPACE,
        "CapsLock" => key_code::CAPS_LOCK,
        "Control" | "ControlLeft" => key_code::LEFT_CTRL,
        "ControlRight" => key_code::RIGHT_CTRL,
        "Delete" => key_code::DELETE,
        "End" => key_code::END,
        "Enter" => key_code::RETURN,
        "Escape" => key_code::ESCAPE,
        "F1" => key_code::F1,
        "F2" => key_code::F2,
        "F3" => key_code::F3,
        "F4" => key_code::F4,
        "F5" => key_code::F5,
        "F6" => key_code::F6,
        "F7" => key_code::F7,
        "F8" => key_code::F8,
        "F9" => key_code::F9,
        "F10" => key_code::F10,
        "F11" => key_code::F11,
        "F12" => key_code::F12,
        "Home" => key_code::HOME,
        "Insert" => key_code::INSERT,
        "Meta" | "MetaLeft" => key_code::LEFT_META,
        "MetaRight" => key_code::RIGHT_META,
        "PageDown" => key_code::PAGE_DOWN,
        "PageUp" => key_code::PAGE_UP,
        "Shift" | "ShiftLeft" => key_code::LEFT_SHIFT,
        "ShiftRight" => key_code::RIGHT_SHIFT,
        "Space" => key_code::SPACE,
        "Tab" => key_code::TAB,
        _ => return None,
    };
    Some(code)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU32, Ordering};

    use flighthq_signals::{SignalConnectOptions, connect_signal};
    use flighthq_types::input::key_code;

    use super::*;
    use crate::manager::create_input_manager;

    #[test]
    fn dispatch_keyboard_event_emits_key_down_when_enabled() {
        let mut m = create_input_manager();
        let seen = Arc::new(AtomicU32::new(0));
        let seen2 = Arc::clone(&seen);
        let _g = connect_signal(
            &m.signals.on_key_down,
            Arc::new(move |d: &InputKeyboardData| seen2.store(d.key_code, Ordering::SeqCst)),
            SignalConnectOptions::default(),
        );
        let data = InputKeyboardData { key_code: key_code::A, ..Default::default() };
        dispatch_keyboard_event(&mut m, data, true);
        assert_eq!(seen.load(Ordering::SeqCst), key_code::A);
    }

    #[test]
    fn dispatch_keyboard_event_respects_enabled() {
        let mut m = create_input_manager();
        m.enabled = false;
        let fired = Arc::new(AtomicU32::new(0));
        let fired2 = Arc::clone(&fired);
        let _g = connect_signal(
            &m.signals.on_key_down,
            Arc::new(move |_d: &InputKeyboardData| {
                fired2.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        dispatch_keyboard_event(&mut m, InputKeyboardData::default(), true);
        assert_eq!(fired.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn get_key_code_from_key_name_maps_named_keys() {
        assert_eq!(get_key_code_from_key_name("ArrowLeft"), key_code::LEFT);
        assert_eq!(get_key_code_from_key_name("Escape"), key_code::ESCAPE);
    }

    #[test]
    fn get_key_code_from_key_name_maps_printable_character() {
        assert_eq!(get_key_code_from_key_name("A"), key_code::A);
        assert_eq!(get_key_code_from_key_name("a"), key_code::A);
    }

    #[test]
    fn get_key_code_from_key_name_unknown() {
        assert_eq!(get_key_code_from_key_name("NOT_A_KEY"), key_code::UNKNOWN);
    }

    #[test]
    fn get_key_modifier_from_flags_maps_flags() {
        let modifier = get_key_modifier_from_flags(
            true, false, true, false, false, false, false, false, false, false,
        );
        assert!(modifier & key_modifier::CTRL != 0);
        assert!(modifier & key_modifier::SHIFT != 0);
        assert!(modifier & key_modifier::ALT == 0);
    }
}

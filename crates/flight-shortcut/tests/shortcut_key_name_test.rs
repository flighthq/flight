use flight_shortcut::contract::*;

macro_rules! digit_cases {
    () => {
        [
            (ShortcutDigitKeyName::Digit0, "0"),
            (ShortcutDigitKeyName::Digit1, "1"),
            (ShortcutDigitKeyName::Digit2, "2"),
            (ShortcutDigitKeyName::Digit3, "3"),
            (ShortcutDigitKeyName::Digit4, "4"),
            (ShortcutDigitKeyName::Digit5, "5"),
            (ShortcutDigitKeyName::Digit6, "6"),
            (ShortcutDigitKeyName::Digit7, "7"),
            (ShortcutDigitKeyName::Digit8, "8"),
            (ShortcutDigitKeyName::Digit9, "9"),
        ]
    };
}

macro_rules! editing_cases {
    () => {
        [
            (ShortcutEditingKeyName::Backspace, "Backspace"),
            (ShortcutEditingKeyName::Delete, "Delete"),
            (ShortcutEditingKeyName::Escape, "Escape"),
            (ShortcutEditingKeyName::Insert, "Insert"),
            (ShortcutEditingKeyName::Return, "Return"),
            (ShortcutEditingKeyName::Space, "Space"),
            (ShortcutEditingKeyName::Tab, "Tab"),
        ]
    };
}

macro_rules! function_cases {
    () => {
        [
            (ShortcutFunctionKeyName::F1, "F1"),
            (ShortcutFunctionKeyName::F2, "F2"),
            (ShortcutFunctionKeyName::F3, "F3"),
            (ShortcutFunctionKeyName::F4, "F4"),
            (ShortcutFunctionKeyName::F5, "F5"),
            (ShortcutFunctionKeyName::F6, "F6"),
            (ShortcutFunctionKeyName::F7, "F7"),
            (ShortcutFunctionKeyName::F8, "F8"),
            (ShortcutFunctionKeyName::F9, "F9"),
            (ShortcutFunctionKeyName::F10, "F10"),
            (ShortcutFunctionKeyName::F11, "F11"),
            (ShortcutFunctionKeyName::F12, "F12"),
            (ShortcutFunctionKeyName::F13, "F13"),
            (ShortcutFunctionKeyName::F14, "F14"),
            (ShortcutFunctionKeyName::F15, "F15"),
            (ShortcutFunctionKeyName::F16, "F16"),
            (ShortcutFunctionKeyName::F17, "F17"),
            (ShortcutFunctionKeyName::F18, "F18"),
            (ShortcutFunctionKeyName::F19, "F19"),
            (ShortcutFunctionKeyName::F20, "F20"),
            (ShortcutFunctionKeyName::F21, "F21"),
            (ShortcutFunctionKeyName::F22, "F22"),
            (ShortcutFunctionKeyName::F23, "F23"),
            (ShortcutFunctionKeyName::F24, "F24"),
        ]
    };
}

macro_rules! letter_cases {
    () => {
        [
            (ShortcutLetterKeyName::A, "A"),
            (ShortcutLetterKeyName::B, "B"),
            (ShortcutLetterKeyName::C, "C"),
            (ShortcutLetterKeyName::D, "D"),
            (ShortcutLetterKeyName::E, "E"),
            (ShortcutLetterKeyName::F, "F"),
            (ShortcutLetterKeyName::G, "G"),
            (ShortcutLetterKeyName::H, "H"),
            (ShortcutLetterKeyName::I, "I"),
            (ShortcutLetterKeyName::J, "J"),
            (ShortcutLetterKeyName::K, "K"),
            (ShortcutLetterKeyName::L, "L"),
            (ShortcutLetterKeyName::M, "M"),
            (ShortcutLetterKeyName::N, "N"),
            (ShortcutLetterKeyName::O, "O"),
            (ShortcutLetterKeyName::P, "P"),
            (ShortcutLetterKeyName::Q, "Q"),
            (ShortcutLetterKeyName::R, "R"),
            (ShortcutLetterKeyName::S, "S"),
            (ShortcutLetterKeyName::T, "T"),
            (ShortcutLetterKeyName::U, "U"),
            (ShortcutLetterKeyName::V, "V"),
            (ShortcutLetterKeyName::W, "W"),
            (ShortcutLetterKeyName::X, "X"),
            (ShortcutLetterKeyName::Y, "Y"),
            (ShortcutLetterKeyName::Z, "Z"),
        ]
    };
}

macro_rules! lock_cases {
    () => {
        [
            (ShortcutLockKeyName::CapsLock, "CapsLock"),
            (ShortcutLockKeyName::NumLock, "NumLock"),
            (ShortcutLockKeyName::PrintScreen, "PrintScreen"),
            (ShortcutLockKeyName::ScrollLock, "ScrollLock"),
        ]
    };
}

macro_rules! media_cases {
    () => {
        [
            (ShortcutMediaKeyName::MediaNextTrack, "MediaNextTrack"),
            (ShortcutMediaKeyName::MediaPlayPause, "MediaPlayPause"),
            (
                ShortcutMediaKeyName::MediaPreviousTrack,
                "MediaPreviousTrack",
            ),
            (ShortcutMediaKeyName::MediaStop, "MediaStop"),
            (ShortcutMediaKeyName::VolumeDown, "VolumeDown"),
            (ShortcutMediaKeyName::VolumeMute, "VolumeMute"),
            (ShortcutMediaKeyName::VolumeUp, "VolumeUp"),
        ]
    };
}

macro_rules! navigation_cases {
    () => {
        [
            (ShortcutNavigationKeyName::ArrowDown, "ArrowDown"),
            (ShortcutNavigationKeyName::ArrowLeft, "ArrowLeft"),
            (ShortcutNavigationKeyName::ArrowRight, "ArrowRight"),
            (ShortcutNavigationKeyName::ArrowUp, "ArrowUp"),
            (ShortcutNavigationKeyName::End, "End"),
            (ShortcutNavigationKeyName::Home, "Home"),
            (ShortcutNavigationKeyName::PageDown, "PageDown"),
            (ShortcutNavigationKeyName::PageUp, "PageUp"),
        ]
    };
}

macro_rules! numpad_cases {
    () => {
        [
            (ShortcutNumpadKeyName::Numpad0, "Numpad0"),
            (ShortcutNumpadKeyName::Numpad1, "Numpad1"),
            (ShortcutNumpadKeyName::Numpad2, "Numpad2"),
            (ShortcutNumpadKeyName::Numpad3, "Numpad3"),
            (ShortcutNumpadKeyName::Numpad4, "Numpad4"),
            (ShortcutNumpadKeyName::Numpad5, "Numpad5"),
            (ShortcutNumpadKeyName::Numpad6, "Numpad6"),
            (ShortcutNumpadKeyName::Numpad7, "Numpad7"),
            (ShortcutNumpadKeyName::Numpad8, "Numpad8"),
            (ShortcutNumpadKeyName::Numpad9, "Numpad9"),
            (ShortcutNumpadKeyName::NumpadAdd, "NumpadAdd"),
            (ShortcutNumpadKeyName::NumpadDecimal, "NumpadDecimal"),
            (ShortcutNumpadKeyName::NumpadDivide, "NumpadDivide"),
            (ShortcutNumpadKeyName::NumpadEnter, "NumpadEnter"),
            (ShortcutNumpadKeyName::NumpadMultiply, "NumpadMultiply"),
            (ShortcutNumpadKeyName::NumpadSubtract, "NumpadSubtract"),
        ]
    };
}

macro_rules! punctuation_cases {
    () => {
        [
            (ShortcutPunctuationKeyName::Backquote, "Backquote"),
            (ShortcutPunctuationKeyName::Backslash, "Backslash"),
            (ShortcutPunctuationKeyName::BracketLeft, "BracketLeft"),
            (ShortcutPunctuationKeyName::BracketRight, "BracketRight"),
            (ShortcutPunctuationKeyName::Comma, "Comma"),
            (ShortcutPunctuationKeyName::Equal, "Equal"),
            (ShortcutPunctuationKeyName::Minus, "Minus"),
            (ShortcutPunctuationKeyName::Period, "Period"),
            (ShortcutPunctuationKeyName::Plus, "Plus"),
            (ShortcutPunctuationKeyName::Quote, "Quote"),
            (ShortcutPunctuationKeyName::Semicolon, "Semicolon"),
            (ShortcutPunctuationKeyName::Slash, "Slash"),
        ]
    };
}

mod get_shortcut_digit_key_name_string {
    use super::*;

    #[test]
    fn returns_every_exact_member_and_round_trips() {
        for (value, spelling) in digit_cases!() {
            assert_eq!(get_shortcut_digit_key_name_string(value), spelling);
            assert_eq!(parse_shortcut_digit_key_name(spelling), Some(value));
        }
    }
}

mod get_shortcut_editing_key_name_string {
    use super::*;

    #[test]
    fn returns_every_exact_member_and_round_trips() {
        for (value, spelling) in editing_cases!() {
            assert_eq!(get_shortcut_editing_key_name_string(value), spelling);
            assert_eq!(parse_shortcut_editing_key_name(spelling), Some(value));
        }
    }
}

mod get_shortcut_function_key_name_string {
    use super::*;

    #[test]
    fn returns_every_exact_member_and_round_trips() {
        for (value, spelling) in function_cases!() {
            assert_eq!(get_shortcut_function_key_name_string(value), spelling);
            assert_eq!(parse_shortcut_function_key_name(spelling), Some(value));
        }
    }
}

mod get_shortcut_letter_key_name_string {
    use super::*;

    #[test]
    fn returns_every_exact_member_and_round_trips() {
        for (value, spelling) in letter_cases!() {
            assert_eq!(get_shortcut_letter_key_name_string(value), spelling);
            assert_eq!(parse_shortcut_letter_key_name(spelling), Some(value));
        }
    }
}

mod get_shortcut_lock_key_name_string {
    use super::*;

    #[test]
    fn returns_every_exact_member_and_round_trips() {
        for (value, spelling) in lock_cases!() {
            assert_eq!(get_shortcut_lock_key_name_string(value), spelling);
            assert_eq!(parse_shortcut_lock_key_name(spelling), Some(value));
        }
    }
}

mod get_shortcut_media_key_name_string {
    use super::*;

    #[test]
    fn returns_every_exact_member_and_round_trips() {
        for (value, spelling) in media_cases!() {
            assert_eq!(get_shortcut_media_key_name_string(value), spelling);
            assert_eq!(parse_shortcut_media_key_name(spelling), Some(value));
        }
    }
}

mod get_shortcut_navigation_key_name_string {
    use super::*;

    #[test]
    fn returns_every_exact_member_and_round_trips() {
        for (value, spelling) in navigation_cases!() {
            assert_eq!(get_shortcut_navigation_key_name_string(value), spelling);
            assert_eq!(parse_shortcut_navigation_key_name(spelling), Some(value));
        }
    }
}

mod get_shortcut_numpad_key_name_string {
    use super::*;

    #[test]
    fn returns_every_exact_member_and_round_trips() {
        for (value, spelling) in numpad_cases!() {
            assert_eq!(get_shortcut_numpad_key_name_string(value), spelling);
            assert_eq!(parse_shortcut_numpad_key_name(spelling), Some(value));
        }
    }
}

mod get_shortcut_punctuation_key_name_string {
    use super::*;

    #[test]
    fn returns_every_exact_member_and_round_trips() {
        for (value, spelling) in punctuation_cases!() {
            assert_eq!(get_shortcut_punctuation_key_name_string(value), spelling);
            assert_eq!(parse_shortcut_punctuation_key_name(spelling), Some(value));
        }
    }
}

mod parse_shortcut_digit_key_name {
    use super::*;

    #[test]
    fn rejects_members_outside_the_digit_domain() {
        assert_eq!(parse_shortcut_digit_key_name("A"), None);
    }
}

mod parse_shortcut_editing_key_name {
    use super::*;

    #[test]
    fn rejects_members_outside_the_editing_domain() {
        assert_eq!(parse_shortcut_editing_key_name("0"), None);
    }
}

mod parse_shortcut_function_key_name {
    use super::*;

    #[test]
    fn rejects_members_outside_the_function_domain() {
        assert_eq!(parse_shortcut_function_key_name("A"), None);
    }
}

mod parse_shortcut_letter_key_name {
    use super::*;

    #[test]
    fn rejects_members_outside_the_letter_domain() {
        assert_eq!(parse_shortcut_letter_key_name("F1"), None);
    }
}

mod parse_shortcut_lock_key_name {
    use super::*;

    #[test]
    fn rejects_members_outside_the_lock_domain() {
        assert_eq!(parse_shortcut_lock_key_name("A"), None);
    }
}

mod parse_shortcut_media_key_name {
    use super::*;

    #[test]
    fn rejects_members_outside_the_media_domain() {
        assert_eq!(parse_shortcut_media_key_name("A"), None);
    }
}

mod parse_shortcut_navigation_key_name {
    use super::*;

    #[test]
    fn rejects_members_outside_the_navigation_domain() {
        assert_eq!(parse_shortcut_navigation_key_name("A"), None);
    }
}

mod parse_shortcut_numpad_key_name {
    use super::*;

    #[test]
    fn rejects_members_outside_the_numpad_domain() {
        assert_eq!(parse_shortcut_numpad_key_name("0"), None);
    }
}

mod parse_shortcut_punctuation_key_name {
    use super::*;

    #[test]
    fn rejects_members_outside_the_punctuation_domain() {
        assert_eq!(parse_shortcut_punctuation_key_name("A"), None);
    }
}

mod shortcut_digit_key_name_to_key_name {
    use super::*;

    #[test]
    fn widens_every_digit_without_changing_its_spelling() {
        for (value, spelling) in digit_cases!() {
            let key = shortcut_digit_key_name_to_key_name(value);
            assert_eq!(get_shortcut_key_name_string(key), spelling);
            assert_eq!(shortcut_key_name_to_digit_key_name(key), Some(value));
        }
    }
}

mod shortcut_editing_key_name_to_key_name {
    use super::*;

    #[test]
    fn widens_every_editing_key_without_changing_its_spelling() {
        for (value, spelling) in editing_cases!() {
            let key = shortcut_editing_key_name_to_key_name(value);
            assert_eq!(get_shortcut_key_name_string(key), spelling);
            assert_eq!(shortcut_key_name_to_editing_key_name(key), Some(value));
        }
    }
}

mod shortcut_function_key_name_to_key_name {
    use super::*;

    #[test]
    fn widens_every_function_key_without_changing_its_spelling() {
        for (value, spelling) in function_cases!() {
            let key = shortcut_function_key_name_to_key_name(value);
            assert_eq!(get_shortcut_key_name_string(key), spelling);
            assert_eq!(shortcut_key_name_to_function_key_name(key), Some(value));
        }
    }
}

mod shortcut_key_name_to_digit_key_name {
    use super::*;

    #[test]
    fn narrows_exactly_the_digit_domain() {
        for (value, _) in digit_cases!() {
            assert_eq!(
                shortcut_key_name_to_digit_key_name(shortcut_digit_key_name_to_key_name(value)),
                Some(value)
            );
        }
        assert_eq!(
            shortcut_key_name_to_digit_key_name(ShortcutKeyName::A),
            None
        );
    }
}

mod shortcut_key_name_to_editing_key_name {
    use super::*;

    #[test]
    fn narrows_exactly_the_editing_domain() {
        for (value, _) in editing_cases!() {
            assert_eq!(
                shortcut_key_name_to_editing_key_name(shortcut_editing_key_name_to_key_name(value)),
                Some(value)
            );
        }
        assert_eq!(
            shortcut_key_name_to_editing_key_name(ShortcutKeyName::Digit0),
            None
        );
    }
}

mod shortcut_key_name_to_function_key_name {
    use super::*;

    #[test]
    fn narrows_exactly_the_function_key_domain() {
        for (value, _) in function_cases!() {
            assert_eq!(
                shortcut_key_name_to_function_key_name(shortcut_function_key_name_to_key_name(
                    value
                )),
                Some(value)
            );
        }
        assert_eq!(
            shortcut_key_name_to_function_key_name(ShortcutKeyName::A),
            None
        );
    }
}

mod shortcut_key_name_to_letter_key_name {
    use super::*;

    #[test]
    fn narrows_exactly_the_letter_domain() {
        for (value, _) in letter_cases!() {
            assert_eq!(
                shortcut_key_name_to_letter_key_name(shortcut_letter_key_name_to_key_name(value)),
                Some(value)
            );
        }
        assert_eq!(
            shortcut_key_name_to_letter_key_name(ShortcutKeyName::F1),
            None
        );
    }
}

mod shortcut_key_name_to_lock_key_name {
    use super::*;

    #[test]
    fn narrows_exactly_the_lock_domain() {
        for (value, _) in lock_cases!() {
            assert_eq!(
                shortcut_key_name_to_lock_key_name(shortcut_lock_key_name_to_key_name(value)),
                Some(value)
            );
        }
        assert_eq!(shortcut_key_name_to_lock_key_name(ShortcutKeyName::A), None);
    }
}

mod shortcut_key_name_to_media_key_name {
    use super::*;

    #[test]
    fn narrows_exactly_the_media_domain() {
        for (value, _) in media_cases!() {
            assert_eq!(
                shortcut_key_name_to_media_key_name(shortcut_media_key_name_to_key_name(value)),
                Some(value)
            );
        }
        assert_eq!(
            shortcut_key_name_to_media_key_name(ShortcutKeyName::A),
            None
        );
    }
}

mod shortcut_key_name_to_navigation_key_name {
    use super::*;

    #[test]
    fn narrows_exactly_the_navigation_domain() {
        for (value, _) in navigation_cases!() {
            assert_eq!(
                shortcut_key_name_to_navigation_key_name(shortcut_navigation_key_name_to_key_name(
                    value
                )),
                Some(value)
            );
        }
        assert_eq!(
            shortcut_key_name_to_navigation_key_name(ShortcutKeyName::A),
            None
        );
    }
}

mod shortcut_key_name_to_numpad_key_name {
    use super::*;

    #[test]
    fn narrows_exactly_the_numpad_domain() {
        for (value, _) in numpad_cases!() {
            assert_eq!(
                shortcut_key_name_to_numpad_key_name(shortcut_numpad_key_name_to_key_name(value)),
                Some(value)
            );
        }
        assert_eq!(
            shortcut_key_name_to_numpad_key_name(ShortcutKeyName::Digit0),
            None
        );
    }
}

mod shortcut_key_name_to_punctuation_key_name {
    use super::*;

    #[test]
    fn narrows_exactly_the_punctuation_domain() {
        for (value, _) in punctuation_cases!() {
            assert_eq!(
                shortcut_key_name_to_punctuation_key_name(
                    shortcut_punctuation_key_name_to_key_name(value)
                ),
                Some(value)
            );
        }
        assert_eq!(
            shortcut_key_name_to_punctuation_key_name(ShortcutKeyName::A),
            None
        );
    }
}

mod shortcut_letter_key_name_to_key_name {
    use super::*;

    #[test]
    fn widens_every_letter_without_changing_its_spelling() {
        for (value, spelling) in letter_cases!() {
            let key = shortcut_letter_key_name_to_key_name(value);
            assert_eq!(get_shortcut_key_name_string(key), spelling);
            assert_eq!(shortcut_key_name_to_letter_key_name(key), Some(value));
        }
    }
}

mod shortcut_lock_key_name_to_key_name {
    use super::*;

    #[test]
    fn widens_every_lock_key_without_changing_its_spelling() {
        for (value, spelling) in lock_cases!() {
            let key = shortcut_lock_key_name_to_key_name(value);
            assert_eq!(get_shortcut_key_name_string(key), spelling);
            assert_eq!(shortcut_key_name_to_lock_key_name(key), Some(value));
        }
    }
}

mod shortcut_media_key_name_to_key_name {
    use super::*;

    #[test]
    fn widens_every_media_key_without_changing_its_spelling() {
        for (value, spelling) in media_cases!() {
            let key = shortcut_media_key_name_to_key_name(value);
            assert_eq!(get_shortcut_key_name_string(key), spelling);
            assert_eq!(shortcut_key_name_to_media_key_name(key), Some(value));
        }
    }
}

mod shortcut_navigation_key_name_to_key_name {
    use super::*;

    #[test]
    fn widens_every_navigation_key_without_changing_its_spelling() {
        for (value, spelling) in navigation_cases!() {
            let key = shortcut_navigation_key_name_to_key_name(value);
            assert_eq!(get_shortcut_key_name_string(key), spelling);
            assert_eq!(shortcut_key_name_to_navigation_key_name(key), Some(value));
        }
    }
}

mod shortcut_numpad_key_name_to_key_name {
    use super::*;

    #[test]
    fn widens_every_numpad_key_without_changing_its_spelling() {
        for (value, spelling) in numpad_cases!() {
            let key = shortcut_numpad_key_name_to_key_name(value);
            assert_eq!(get_shortcut_key_name_string(key), spelling);
            assert_eq!(shortcut_key_name_to_numpad_key_name(key), Some(value));
        }
    }
}

mod shortcut_punctuation_key_name_to_key_name {
    use super::*;

    #[test]
    fn widens_every_punctuation_key_without_changing_its_spelling() {
        for (value, spelling) in punctuation_cases!() {
            let key = shortcut_punctuation_key_name_to_key_name(value);
            assert_eq!(get_shortcut_key_name_string(key), spelling);
            assert_eq!(shortcut_key_name_to_punctuation_key_name(key), Some(value));
        }
    }
}

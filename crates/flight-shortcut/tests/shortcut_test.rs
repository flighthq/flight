use flight_platform::PlatformName;
use flight_shortcut::contract::*;

macro_rules! key_cases {
    () => {
        [
            (ShortcutKeyName::Digit0, "0"),
            (ShortcutKeyName::Digit1, "1"),
            (ShortcutKeyName::Digit2, "2"),
            (ShortcutKeyName::Digit3, "3"),
            (ShortcutKeyName::Digit4, "4"),
            (ShortcutKeyName::Digit5, "5"),
            (ShortcutKeyName::Digit6, "6"),
            (ShortcutKeyName::Digit7, "7"),
            (ShortcutKeyName::Digit8, "8"),
            (ShortcutKeyName::Digit9, "9"),
            (ShortcutKeyName::A, "A"),
            (ShortcutKeyName::B, "B"),
            (ShortcutKeyName::C, "C"),
            (ShortcutKeyName::D, "D"),
            (ShortcutKeyName::E, "E"),
            (ShortcutKeyName::F, "F"),
            (ShortcutKeyName::G, "G"),
            (ShortcutKeyName::H, "H"),
            (ShortcutKeyName::I, "I"),
            (ShortcutKeyName::J, "J"),
            (ShortcutKeyName::K, "K"),
            (ShortcutKeyName::L, "L"),
            (ShortcutKeyName::M, "M"),
            (ShortcutKeyName::N, "N"),
            (ShortcutKeyName::O, "O"),
            (ShortcutKeyName::P, "P"),
            (ShortcutKeyName::Q, "Q"),
            (ShortcutKeyName::R, "R"),
            (ShortcutKeyName::S, "S"),
            (ShortcutKeyName::T, "T"),
            (ShortcutKeyName::U, "U"),
            (ShortcutKeyName::V, "V"),
            (ShortcutKeyName::W, "W"),
            (ShortcutKeyName::X, "X"),
            (ShortcutKeyName::Y, "Y"),
            (ShortcutKeyName::Z, "Z"),
            (ShortcutKeyName::F1, "F1"),
            (ShortcutKeyName::F2, "F2"),
            (ShortcutKeyName::F3, "F3"),
            (ShortcutKeyName::F4, "F4"),
            (ShortcutKeyName::F5, "F5"),
            (ShortcutKeyName::F6, "F6"),
            (ShortcutKeyName::F7, "F7"),
            (ShortcutKeyName::F8, "F8"),
            (ShortcutKeyName::F9, "F9"),
            (ShortcutKeyName::F10, "F10"),
            (ShortcutKeyName::F11, "F11"),
            (ShortcutKeyName::F12, "F12"),
            (ShortcutKeyName::F13, "F13"),
            (ShortcutKeyName::F14, "F14"),
            (ShortcutKeyName::F15, "F15"),
            (ShortcutKeyName::F16, "F16"),
            (ShortcutKeyName::F17, "F17"),
            (ShortcutKeyName::F18, "F18"),
            (ShortcutKeyName::F19, "F19"),
            (ShortcutKeyName::F20, "F20"),
            (ShortcutKeyName::F21, "F21"),
            (ShortcutKeyName::F22, "F22"),
            (ShortcutKeyName::F23, "F23"),
            (ShortcutKeyName::F24, "F24"),
            (ShortcutKeyName::ArrowDown, "ArrowDown"),
            (ShortcutKeyName::ArrowLeft, "ArrowLeft"),
            (ShortcutKeyName::ArrowRight, "ArrowRight"),
            (ShortcutKeyName::ArrowUp, "ArrowUp"),
            (ShortcutKeyName::End, "End"),
            (ShortcutKeyName::Home, "Home"),
            (ShortcutKeyName::PageDown, "PageDown"),
            (ShortcutKeyName::PageUp, "PageUp"),
            (ShortcutKeyName::Backspace, "Backspace"),
            (ShortcutKeyName::Delete, "Delete"),
            (ShortcutKeyName::Escape, "Escape"),
            (ShortcutKeyName::Insert, "Insert"),
            (ShortcutKeyName::Return, "Return"),
            (ShortcutKeyName::Space, "Space"),
            (ShortcutKeyName::Tab, "Tab"),
            (ShortcutKeyName::Numpad0, "Numpad0"),
            (ShortcutKeyName::Numpad1, "Numpad1"),
            (ShortcutKeyName::Numpad2, "Numpad2"),
            (ShortcutKeyName::Numpad3, "Numpad3"),
            (ShortcutKeyName::Numpad4, "Numpad4"),
            (ShortcutKeyName::Numpad5, "Numpad5"),
            (ShortcutKeyName::Numpad6, "Numpad6"),
            (ShortcutKeyName::Numpad7, "Numpad7"),
            (ShortcutKeyName::Numpad8, "Numpad8"),
            (ShortcutKeyName::Numpad9, "Numpad9"),
            (ShortcutKeyName::NumpadAdd, "NumpadAdd"),
            (ShortcutKeyName::NumpadDecimal, "NumpadDecimal"),
            (ShortcutKeyName::NumpadDivide, "NumpadDivide"),
            (ShortcutKeyName::NumpadEnter, "NumpadEnter"),
            (ShortcutKeyName::NumpadMultiply, "NumpadMultiply"),
            (ShortcutKeyName::NumpadSubtract, "NumpadSubtract"),
            (ShortcutKeyName::Backquote, "Backquote"),
            (ShortcutKeyName::Backslash, "Backslash"),
            (ShortcutKeyName::BracketLeft, "BracketLeft"),
            (ShortcutKeyName::BracketRight, "BracketRight"),
            (ShortcutKeyName::Comma, "Comma"),
            (ShortcutKeyName::Equal, "Equal"),
            (ShortcutKeyName::Minus, "Minus"),
            (ShortcutKeyName::Period, "Period"),
            (ShortcutKeyName::Plus, "Plus"),
            (ShortcutKeyName::Quote, "Quote"),
            (ShortcutKeyName::Semicolon, "Semicolon"),
            (ShortcutKeyName::Slash, "Slash"),
            (ShortcutKeyName::MediaNextTrack, "MediaNextTrack"),
            (ShortcutKeyName::MediaPlayPause, "MediaPlayPause"),
            (ShortcutKeyName::MediaPreviousTrack, "MediaPreviousTrack"),
            (ShortcutKeyName::MediaStop, "MediaStop"),
            (ShortcutKeyName::VolumeDown, "VolumeDown"),
            (ShortcutKeyName::VolumeMute, "VolumeMute"),
            (ShortcutKeyName::VolumeUp, "VolumeUp"),
            (ShortcutKeyName::CapsLock, "CapsLock"),
            (ShortcutKeyName::NumLock, "NumLock"),
            (ShortcutKeyName::PrintScreen, "PrintScreen"),
            (ShortcutKeyName::ScrollLock, "ScrollLock"),
        ]
    };
}

mod equals_accelerator {
    use super::*;

    #[test]
    fn compares_normalized_identity_and_rejects_malformed_input() {
        assert!(equals_accelerator("shift+ctrl+k", "Control+Shift+K"));
        assert!(!equals_accelerator("Control+K", "Alt+K"));
        assert!(!equals_accelerator("", ""));
    }
}

mod find_accelerator_conflict {
    use super::*;

    #[test]
    fn returns_the_first_caller_spelled_normalized_match() {
        let candidates = vec!["Alt+J".into(), "ctrl-k".into(), "Control-K".into()];
        assert_eq!(
            find_accelerator_conflict("Control+K", &candidates),
            Some("ctrl-k".into())
        );
        assert_eq!(
            find_accelerator_conflict("Control+NotAKey", &["Control+NotAKey".into()]),
            None
        );
    }
}

mod format_accelerator_for_display {
    use super::*;

    #[test]
    fn requires_the_injected_platform() {
        assert_eq!(
            format_accelerator_for_display("CommandOrControl+Shift+K", PlatformName::MacOs),
            "⇧⌘K"
        );
        assert_eq!(
            format_accelerator_for_display("CommandOrControl+Shift+K", PlatformName::Windows),
            "Shift+Ctrl+K"
        );
        assert_eq!(
            format_accelerator_for_display("Control+NotAKey", PlatformName::Linux),
            ""
        );
    }
}

mod get_accelerator_key {
    use super::*;

    #[test]
    fn returns_canonical_keys_only_for_parseable_chords() {
        assert_eq!(
            get_accelerator_key("Ctrl+Esc"),
            Some(ShortcutKeyName::Escape)
        );
        assert_eq!(get_accelerator_key("Control+NotAKey"), None);
    }
}

mod get_accelerator_key_label {
    use super::*;

    #[test]
    fn maps_special_keys_and_preserves_ordinary_keys() {
        assert_eq!(get_accelerator_key_label(ShortcutKeyName::ArrowUp), "↑");
        assert_eq!(get_accelerator_key_label(ShortcutKeyName::K), "K");
    }
}

mod get_accelerator_modifier_label {
    use super::*;

    #[test]
    fn formats_only_against_the_injected_platform() {
        assert_eq!(
            get_accelerator_modifier_label(ShortcutModifier::CommandOrControl, PlatformName::MacOs),
            "⌘"
        );
        assert_eq!(
            get_accelerator_modifier_label(ShortcutModifier::CommandOrControl, PlatformName::Linux),
            "Ctrl"
        );
        assert_eq!(
            get_accelerator_modifier_label(ShortcutModifier::Alt, PlatformName::Windows),
            "Alt"
        );
    }
}

mod get_accelerator_modifiers {
    use super::*;

    #[test]
    fn rewrites_output_and_preserves_it_on_failure() {
        let mut out = vec![ShortcutModifier::Meta];
        assert!(get_accelerator_modifiers(&mut out, "Shift+Ctrl+K"));
        assert_eq!(
            out,
            vec![ShortcutModifier::Control, ShortcutModifier::Shift]
        );
        assert!(!get_accelerator_modifiers(&mut out, "NotAKey"));
        assert_eq!(
            out,
            vec![ShortcutModifier::Control, ShortcutModifier::Shift]
        );
    }
}

mod get_accelerator_parse_error_reason_string {
    use super::*;

    #[test]
    fn returns_every_exact_source_spelling() {
        let values = [
            (
                AcceleratorParseErrorReason::DuplicateModifier,
                "duplicate-modifier",
            ),
            (AcceleratorParseErrorReason::Empty, "empty"),
            (AcceleratorParseErrorReason::MissingKey, "missing-key"),
            (AcceleratorParseErrorReason::UnknownKey, "unknown-key"),
            (
                AcceleratorParseErrorReason::UnknownModifier,
                "unknown-modifier",
            ),
        ];
        for (value, spelling) in values {
            assert_eq!(get_accelerator_parse_error_reason_string(value), spelling);
        }
    }
}

mod get_shortcut_key_name_string {
    use super::*;

    #[test]
    fn returns_every_exact_source_spelling() {
        for (value, spelling) in key_cases!() {
            assert_eq!(get_shortcut_key_name_string(value), spelling);
        }
    }
}

mod get_shortcut_modifier_string {
    use super::*;

    #[test]
    fn returns_every_exact_source_spelling() {
        let values = [
            (ShortcutModifier::Alt, "Alt"),
            (ShortcutModifier::CommandOrControl, "CommandOrControl"),
            (ShortcutModifier::Control, "Control"),
            (ShortcutModifier::Meta, "Meta"),
            (ShortcutModifier::Shift, "Shift"),
            (ShortcutModifier::Super, "Super"),
        ];
        for (value, spelling) in values {
            assert_eq!(get_shortcut_modifier_string(value), spelling);
        }
    }
}

mod is_accelerator_valid {
    use super::*;

    #[test]
    fn reports_parser_validity_without_a_provider() {
        assert!(is_accelerator_valid("CommandOrControl+K"));
        assert!(!is_accelerator_valid("CommandOrControl+NotAKey"));
    }
}

mod make_parsed_accelerator {
    use super::*;

    #[test]
    fn creates_a_zeroed_plain_parse_value() {
        assert_eq!(
            make_parsed_accelerator(),
            ParsedAccelerator {
                key: String::new(),
                modifiers: Vec::new()
            }
        );
    }
}

mod normalize_accelerator {
    use super::*;

    #[test]
    fn canonicalizes_order_aliases_separators_and_special_keys() {
        assert_eq!(
            normalize_accelerator("shift-ctrl-esc"),
            Some("Control+Shift+Escape".into())
        );
        assert_eq!(
            normalize_accelerator("CommandOrControl++"),
            Some("CommandOrControl+Plus".into())
        );
        assert_eq!(normalize_accelerator(""), None);
    }

    #[test]
    fn accepts_every_modifier_alias_with_exact_case_and_separator_rules() {
        let cases = [
            ("alt+k", "Alt+K"),
            ("OPTION-k", "Alt+K"),
            ("cmd+k", "Meta+K"),
            ("Command-K", "Meta+K"),
            ("meta+k", "Meta+K"),
            ("commandorcontrol-k", "CommandOrControl+K"),
            ("control+k", "Control+K"),
            ("CTRL-K", "Control+K"),
            ("shift+k", "Shift+K"),
            ("super+k", "Super+K"),
            ("win-k", "Super+K"),
        ];
        for (input, expected) in cases {
            assert_eq!(normalize_accelerator(input).as_deref(), Some(expected));
        }
        assert_eq!(
            normalize_accelerator(" Control+K"),
            Some("Control+K".into())
        );
        assert_eq!(normalize_accelerator("Control +K"), None);
    }

    #[test]
    fn preserves_literal_plus_and_minus_keys() {
        assert_eq!(normalize_accelerator("+"), Some("Plus".into()));
        assert_eq!(normalize_accelerator("-"), Some("Minus".into()));
        assert_eq!(
            normalize_accelerator("Control+-"),
            Some("Control+Minus".into())
        );
    }
}

mod parse_accelerator {
    use super::*;

    #[test]
    fn fills_caller_owned_value_without_replacing_its_modifier_storage() {
        let mut out = make_parsed_accelerator();
        out.modifiers.reserve(2);
        let pointer = out.modifiers.as_ptr();
        assert!(parse_accelerator(&mut out, "Shift+Ctrl+K"));
        assert_eq!(out.key, "K");
        assert_eq!(
            out.modifiers,
            vec![ShortcutModifier::Control, ShortcutModifier::Shift]
        );
        assert_eq!(out.modifiers.as_ptr(), pointer);
    }
}

mod parse_accelerator_detailed {
    use super::*;

    #[test]
    fn returns_token_specific_errors_and_leaves_output_untouched() {
        let mut out = make_parsed_accelerator();
        assert_eq!(
            parse_accelerator_detailed(&mut out, "Control+NotAKey"),
            Some(AcceleratorParseError {
                token: "NotAKey".into(),
                reason: AcceleratorParseErrorReason::UnknownKey
            })
        );
        assert_eq!(out, make_parsed_accelerator());
    }

    #[test]
    fn distinguishes_every_diagnostic() {
        let cases = [
            ("", "", AcceleratorParseErrorReason::Empty),
            ("Control", "", AcceleratorParseErrorReason::MissingKey),
            (
                "Control+ctrl+K",
                "ctrl",
                AcceleratorParseErrorReason::DuplicateModifier,
            ),
            (
                "Bogus+K",
                "Bogus",
                AcceleratorParseErrorReason::UnknownModifier,
            ),
            (
                "Control+Bogus",
                "Bogus",
                AcceleratorParseErrorReason::UnknownKey,
            ),
        ];
        for (input, token, reason) in cases {
            let mut out = ParsedAccelerator {
                key: "sentinel".into(),
                modifiers: vec![ShortcutModifier::Meta],
            };
            assert_eq!(
                parse_accelerator_detailed(&mut out, input),
                Some(AcceleratorParseError {
                    token: token.into(),
                    reason
                })
            );
            assert_eq!(out.key, "sentinel");
            assert_eq!(out.modifiers, vec![ShortcutModifier::Meta]);
        }
    }
}

mod parse_accelerator_parse_error_reason {
    use super::*;

    #[test]
    fn parses_every_exact_source_spelling_and_rejects_unknown_values() {
        let values = [
            (
                "duplicate-modifier",
                AcceleratorParseErrorReason::DuplicateModifier,
            ),
            ("empty", AcceleratorParseErrorReason::Empty),
            ("missing-key", AcceleratorParseErrorReason::MissingKey),
            ("unknown-key", AcceleratorParseErrorReason::UnknownKey),
            (
                "unknown-modifier",
                AcceleratorParseErrorReason::UnknownModifier,
            ),
        ];
        for (spelling, value) in values {
            assert_eq!(parse_accelerator_parse_error_reason(spelling), Some(value));
        }
        assert_eq!(parse_accelerator_parse_error_reason("unknown"), None);
    }
}

mod parse_shortcut_key_name {
    use super::*;

    #[test]
    fn parses_every_exact_source_spelling_and_rejects_unknown_values() {
        for (value, spelling) in key_cases!() {
            assert_eq!(parse_shortcut_key_name(spelling), Some(value));
        }
        assert_eq!(parse_shortcut_key_name("escape"), None);
        assert_eq!(parse_shortcut_key_name("unknown"), None);
    }
}

mod parse_shortcut_modifier {
    use super::*;

    #[test]
    fn parses_every_exact_source_spelling_and_rejects_unknown_values() {
        let values = [
            ("Alt", ShortcutModifier::Alt),
            ("CommandOrControl", ShortcutModifier::CommandOrControl),
            ("Control", ShortcutModifier::Control),
            ("Meta", ShortcutModifier::Meta),
            ("Shift", ShortcutModifier::Shift),
            ("Super", ShortcutModifier::Super),
        ];
        for (spelling, value) in values {
            assert_eq!(parse_shortcut_modifier(spelling), Some(value));
        }
        assert_eq!(parse_shortcut_modifier("control"), None);
    }
}

mod resolve_command_or_control_modifier {
    use super::*;

    #[test]
    fn resolves_only_from_injected_platform_truth() {
        assert_eq!(
            resolve_command_or_control_modifier(PlatformName::MacOs),
            ShortcutModifier::Meta
        );
        assert_eq!(
            resolve_command_or_control_modifier(PlatformName::Windows),
            ShortcutModifier::Control
        );
        assert_eq!(
            resolve_command_or_control_modifier(PlatformName::Unknown),
            ShortcutModifier::Control
        );
    }
}

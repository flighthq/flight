use std::sync::{Arc, Mutex};

use flight_host_winit::*;
use flight_input::{InputIngressSink, InputTextData, MouseWheelMode, PointerType};
use winit::dpi::PhysicalPosition;
use winit::event::{DeviceId, ElementState, Ime, MouseButton, MouseScrollDelta, Touch, TouchPhase};
use winit::keyboard::{Key, KeyCode, KeyLocation, ModifiersState, NamedKey, PhysicalKey};

fn text_recording_sink(log: &Arc<Mutex<Vec<String>>>) -> InputIngressSink {
    let edit = log.clone();
    let input = log.clone();
    return InputIngressSink {
        gamepad_axis_move: Arc::new(|_| {}),
        gamepad_button_down: Arc::new(|_| {}),
        gamepad_button_up: Arc::new(|_| {}),
        gamepad_connect: Arc::new(|_| {}),
        gamepad_disconnect: Arc::new(|_| {}),
        is_enabled: Arc::new(|| true),
        key_down: Arc::new(|_| {}),
        key_up: Arc::new(|_| {}),
        pointer_cancel: Arc::new(|_| {}),
        pointer_down: Arc::new(|_| {}),
        pointer_move: Arc::new(|_| {}),
        pointer_move_relative: Arc::new(|_| {}),
        pointer_up: Arc::new(|_| {}),
        text_edit: Arc::new(move |data| edit.lock().unwrap().push(format!("edit:{}", data.text))),
        text_input: Arc::new(move |data| {
            input.lock().unwrap().push(format!("input:{}", data.text));
        }),
        wheel: Arc::new(|_| {}),
    };
}

mod build_winit_ime_text_data {
    use super::*;

    #[test]
    fn routes_preedit_as_composing_and_commit_as_committed() {
        assert_eq!(
            build_winit_ime_text_data(&Ime::Preedit("かな".to_string(), Some((0, 3)))),
            Some(InputTextData {
                is_composing: true,
                text: "かな".to_string(),
            })
        );
        assert_eq!(
            build_winit_ime_text_data(&Ime::Commit("仮名".to_string())),
            Some(InputTextData {
                is_composing: false,
                text: "仮名".to_string(),
            })
        );
        assert_eq!(build_winit_ime_text_data(&Ime::Enabled), None);
        assert_eq!(build_winit_ime_text_data(&Ime::Disabled), None);
    }
}

mod build_winit_keyboard_data {
    use super::*;

    #[test]
    fn maps_logical_physical_and_modifier_fields() {
        let data = build_winit_keyboard_data(
            &Key::Character("a".into()),
            PhysicalKey::Code(KeyCode::KeyA),
            KeyLocation::Standard,
            ModifiersState::SHIFT | ModifiersState::CONTROL,
            true,
            12.5,
        );
        assert_eq!(data.key, "a");
        assert_eq!(data.code, "KeyA");
        assert_eq!(data.key_code, flight_input::KEY_CODE_A);
        assert!(data.shift_key && data.ctrl_key && !data.alt_key && !data.meta_key);
        assert!(data.repeat);
        assert_eq!(data.time_stamp, 12.5);
    }

    #[test]
    fn packs_each_modifier_into_its_own_mask_bit() {
        let mask = |modifiers| {
            build_winit_keyboard_data(
                &Key::Character("x".into()),
                PhysicalKey::Code(KeyCode::KeyX),
                KeyLocation::Standard,
                modifiers,
                false,
                0.0,
            )
            .modifier
        };
        assert_eq!(mask(ModifiersState::empty()), 0);
        assert_eq!(mask(ModifiersState::SHIFT), 1);
        assert_eq!(mask(ModifiersState::CONTROL), 2);
        assert_eq!(mask(ModifiersState::ALT), 4);
        assert_eq!(mask(ModifiersState::SUPER), 8);
        assert_eq!(mask(ModifiersState::ALT | ModifiersState::SUPER), 12);
    }

    #[test]
    fn reports_dom_meta_code_and_location() {
        let data = build_winit_keyboard_data(
            &Key::Named(NamedKey::Super),
            PhysicalKey::Code(KeyCode::SuperRight),
            KeyLocation::Right,
            ModifiersState::SUPER,
            false,
            0.0,
        );
        assert_eq!(
            (data.key.as_str(), data.code.as_str(), data.location),
            ("Meta", "MetaRight", 2)
        );
        assert_eq!(data.key_code, flight_input::KEY_CODE_RIGHT_META);
        assert!(data.meta_key && !data.caps_lock && !data.num_lock);
    }
}

mod build_winit_pointer_data {
    use super::*;

    #[test]
    fn carries_position_buttons_and_modifiers() {
        let pointer = build_winit_pointer_data(
            12.0,
            34.0,
            3,
            ModifiersState::ALT | ModifiersState::SUPER,
            9.0,
        );
        assert_eq!((pointer.x, pointer.y, pointer.buttons), (12.0, 34.0, 3));
        assert!(pointer.alt_key && pointer.meta_key && !pointer.shift_key);
        assert_eq!(pointer.pointer_type, PointerType::Mouse);
    }
}

mod build_winit_text_data {
    use super::*;

    #[test]
    fn preserves_text_and_composition_state() {
        assert_eq!(
            build_winit_text_data("flight", true),
            InputTextData {
                is_composing: true,
                text: "flight".to_string(),
            }
        );
    }
}

mod build_winit_touch_data {
    use super::*;

    #[test]
    fn preserves_touch_identity_phase_and_position() {
        let data = build_winit_touch_data(
            &Touch {
                device_id: DeviceId::dummy(),
                phase: TouchPhase::Started,
                location: PhysicalPosition::new(10.0, 20.0),
                force: None,
                id: 7,
            },
            ModifiersState::SHIFT,
            3.0,
        );
        assert_eq!((data.pointer_id, data.x, data.y), (7, 10.0, 20.0));
        assert_eq!(data.pointer_type, PointerType::Touch);
        assert!(data.shift_key);
    }
}

mod build_winit_wheel_data {
    use super::*;

    #[test]
    fn carries_pointer_position_and_dom_signed_fractional_deltas() {
        let data = build_winit_wheel_data(
            30.5,
            35.25,
            2,
            ModifiersState::CONTROL,
            &MouseScrollDelta::LineDelta(0.25, -1.5),
            4.0,
        );
        assert_eq!((data.x, data.y, data.buttons), (30.5, 35.25, 2));
        assert_eq!((data.delta_x, data.delta_y), (-0.25, 1.5));
        assert_eq!(data.wheel_mode, MouseWheelMode::Lines);
        assert!(data.ctrl_key);
    }
}

mod dispatch_winit_text {
    use super::*;

    #[test]
    fn sends_composing_text_to_text_edit_and_committed_text_to_text_input() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let sink = text_recording_sink(&log);
        dispatch_winit_text(&sink, &build_winit_text_data("ka", true));
        dispatch_winit_text(&sink, &build_winit_text_data("か", false));
        assert_eq!(*log.lock().unwrap(), ["edit:ka", "input:か"]);
    }
}

mod get_winit_key_event_modifiers {
    use super::*;

    #[test]
    fn includes_a_modifier_on_its_keydown_and_excludes_it_on_its_keyup() {
        let shift = PhysicalKey::Code(KeyCode::ShiftLeft);
        assert_eq!(
            get_winit_key_event_modifiers(ModifiersState::empty(), shift, true),
            ModifiersState::SHIFT
        );
        assert_eq!(
            get_winit_key_event_modifiers(ModifiersState::SHIFT, shift, false),
            ModifiersState::empty()
        );
        assert_eq!(
            get_winit_key_event_modifiers(
                ModifiersState::ALT,
                PhysicalKey::Code(KeyCode::SuperRight),
                true
            ),
            ModifiersState::ALT | ModifiersState::SUPER
        );
        assert_eq!(
            get_winit_key_event_modifiers(
                ModifiersState::CONTROL,
                PhysicalKey::Code(KeyCode::KeyA),
                true
            ),
            ModifiersState::CONTROL
        );
    }
}

mod is_winit_committed_key_text {
    use super::*;

    #[test]
    fn rejects_shortcuts_and_control_characters() {
        assert!(is_winit_committed_key_text("a", ModifiersState::empty()));
        assert!(is_winit_committed_key_text("A", ModifiersState::SHIFT));
        assert!(is_winit_committed_key_text(
            "@",
            ModifiersState::CONTROL | ModifiersState::ALT
        ));
        assert!(!is_winit_committed_key_text("a", ModifiersState::CONTROL));
        assert!(!is_winit_committed_key_text("v", ModifiersState::SUPER));
        assert!(!is_winit_committed_key_text(
            "\u{1}",
            ModifiersState::empty()
        ));
        assert!(!is_winit_committed_key_text("\r", ModifiersState::empty()));
        assert!(!is_winit_committed_key_text("", ModifiersState::empty()));
    }
}

mod is_winit_press {
    use super::*;

    #[test]
    fn distinguishes_pressed_and_released() {
        assert!(is_winit_press(ElementState::Pressed));
        assert!(!is_winit_press(ElementState::Released));
    }
}

mod translate_winit_key {
    use super::*;

    #[test]
    fn maps_character_named_dead_and_unidentified_keys() {
        assert_eq!(translate_winit_key(&Key::Character("z".into())), "z");
        assert_eq!(translate_winit_key(&Key::Named(NamedKey::Enter)), "Enter");
        assert_eq!(translate_winit_key(&Key::Dead(Some('`'))), "Dead");
        assert_eq!(
            translate_winit_key(&Key::Unidentified(winit::keyboard::NativeKey::Unidentified)),
            "Unidentified"
        );
    }
}

mod translate_winit_key_code {
    use super::*;

    #[test]
    fn matches_the_web_host_for_physical_codes_characters_and_named_keys() {
        let cases: &[(&str, &str, i32, i32)] = &[
            ("KeyA", "A", 0, flight_input::KEY_CODE_A),
            ("Digit1", "!", 0, flight_input::KEY_CODE_EXCLAMATION),
            ("Minus", "-", 0, flight_input::KEY_CODE_MINUS),
            ("Comma", ",", 0, flight_input::KEY_CODE_COMMA),
            ("Backquote", "`", 0, flight_input::KEY_CODE_GRAVE),
            ("IntlBackslash", "\\", 0, flight_input::KEY_CODE_BACKSLASH),
            ("NumLock", "NumLock", 0, flight_input::KEY_CODE_NUM_LOCK),
            (
                "ScrollLock",
                "ScrollLock",
                0,
                flight_input::KEY_CODE_SCROLL_LOCK,
            ),
            (
                "PrintScreen",
                "PrintScreen",
                0,
                flight_input::KEY_CODE_PRINT_SCREEN,
            ),
            ("Pause", "Pause", 0, flight_input::KEY_CODE_PAUSE),
            (
                "ContextMenu",
                "ContextMenu",
                0,
                flight_input::KEY_CODE_APPLICATION,
            ),
            ("F13", "F13", 0, flight_input::KEY_CODE_F13),
            ("F24", "F24", 0, flight_input::KEY_CODE_F24),
            ("MetaLeft", "Meta", 1, flight_input::KEY_CODE_LEFT_META),
            ("NumpadAdd", "+", 3, flight_input::KEY_CODE_NUMPAD_PLUS),
            ("NumpadDivide", "/", 3, flight_input::KEY_CODE_NUMPAD_DIVIDE),
            ("Enter", "Enter", 3, flight_input::KEY_CODE_NUMPAD_ENTER),
            ("Enter", "Enter", 0, flight_input::KEY_CODE_RETURN),
            (
                "BrowserBack",
                "BrowserBack",
                0,
                flight_input::KEY_CODE_APP_CONTROL_BACK,
            ),
            ("Unidentified", "Paste", 0, flight_input::KEY_CODE_PASTE),
            ("Unidentified", "Unidentified", 0, 0),
        ];
        for &(code, key, location, expected) in cases {
            assert_eq!(
                translate_winit_key_code(code, key, location),
                expected,
                "{code} {key:?} location {location}"
            );
        }
    }
}

mod translate_winit_key_location {
    use super::*;

    #[test]
    fn maps_dom_location_indices() {
        assert_eq!(translate_winit_key_location(KeyLocation::Standard), 0);
        assert_eq!(translate_winit_key_location(KeyLocation::Left), 1);
        assert_eq!(translate_winit_key_location(KeyLocation::Right), 2);
        assert_eq!(translate_winit_key_location(KeyLocation::Numpad), 3);
    }
}

mod translate_winit_mouse_button {
    use super::*;

    #[test]
    fn keeps_back_and_forward_buttons() {
        assert_eq!(
            translate_winit_mouse_button(MouseButton::Left),
            WinitPointerButton { button: 0, mask: 1 }
        );
        assert_eq!(
            translate_winit_mouse_button(MouseButton::Right),
            WinitPointerButton { button: 2, mask: 2 }
        );
        assert_eq!(
            translate_winit_mouse_button(MouseButton::Back),
            WinitPointerButton { button: 3, mask: 8 }
        );
        assert_eq!(
            translate_winit_mouse_button(MouseButton::Forward),
            WinitPointerButton {
                button: 4,
                mask: 16,
            }
        );
    }
}

mod translate_winit_named_key {
    use super::*;

    #[test]
    fn uses_dom_key_values_for_the_named_key_set() {
        let cases = [
            (NamedKey::ArrowUp, "ArrowUp"),
            (NamedKey::Escape, "Escape"),
            (NamedKey::NumLock, "NumLock"),
            (NamedKey::ScrollLock, "ScrollLock"),
            (NamedKey::PrintScreen, "PrintScreen"),
            (NamedKey::Pause, "Pause"),
            (NamedKey::ContextMenu, "ContextMenu"),
            (NamedKey::AudioVolumeUp, "AudioVolumeUp"),
            (NamedKey::F24, "F24"),
            (NamedKey::Space, " "),
            (NamedKey::Super, "Meta"),
            (NamedKey::Meta, "Meta"),
        ];
        for (key, expected) in cases {
            assert_eq!(translate_winit_named_key(key), expected);
        }
    }
}

mod translate_winit_physical_key {
    use super::*;

    #[test]
    fn maps_dom_codes_including_meta() {
        assert_eq!(
            translate_winit_physical_key(PhysicalKey::Code(KeyCode::KeyA)),
            "KeyA"
        );
        assert_eq!(
            translate_winit_physical_key(PhysicalKey::Code(KeyCode::Numpad9)),
            "Numpad9"
        );
        assert_eq!(
            translate_winit_physical_key(PhysicalKey::Code(KeyCode::SuperLeft)),
            "MetaLeft"
        );
        assert_eq!(
            translate_winit_physical_key(PhysicalKey::Code(KeyCode::SuperRight)),
            "MetaRight"
        );
        assert_eq!(
            translate_winit_physical_key(PhysicalKey::Unidentified(
                winit::keyboard::NativeKeyCode::Unidentified
            )),
            "Unidentified"
        );
    }
}

mod translate_winit_scroll_delta {
    use super::*;

    #[test]
    fn uses_dom_signs_for_line_and_pixel_units() {
        assert_eq!(
            translate_winit_scroll_delta(&MouseScrollDelta::LineDelta(1.0, -2.0)),
            (-1.0, 2.0, MouseWheelMode::Lines)
        );
        assert_eq!(
            translate_winit_scroll_delta(&MouseScrollDelta::PixelDelta(PhysicalPosition::new(
                3.0, 4.5
            ))),
            (-3.0, -4.5, MouseWheelMode::Pixels)
        );
    }
}

mod update_winit_pointer_buttons {
    use super::*;

    #[test]
    fn keeps_other_held_buttons_across_transitions() {
        let left = translate_winit_mouse_button(MouseButton::Left);
        let right = translate_winit_mouse_button(MouseButton::Right);
        let held = update_winit_pointer_buttons(0, left, true);
        let both = update_winit_pointer_buttons(held, right, true);
        let right_only = update_winit_pointer_buttons(both, left, false);
        let none = update_winit_pointer_buttons(right_only, right, false);
        assert_eq!([held, both, right_only, none], [1, 3, 2, 0]);
    }
}

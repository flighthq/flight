use flight_host_sdl::*;
use flight_input::{GamepadAxisKind, GamepadButtonKind, MouseWheelMode, PointerType};
use sdl3::gamepad::{Axis, Button};
use sdl3::joystick::JoystickId;
use sdl3::keyboard::{Keycode, Mod, Scancode};
use sdl3::mouse::{MouseButton, MouseWheelDirection};

mod build_sdl_gamepad_axis_data {
    use super::*;

    #[test]
    fn normalizes_stick_and_timestamp() {
        let data =
            build_sdl_gamepad_axis_data(2, Axis::LeftX, i16::MIN, 12_500_000).expect("stick axis");
        assert_eq!(data.axis, GamepadAxisKind::StickLeftX as i32);
        assert_eq!(data.gamepad, 2);
        assert_eq!(data.time_stamp, 12.5);
        assert_eq!(data.value, -1.0);
        assert!(build_sdl_gamepad_axis_data(2, Axis::TriggerLeft, 1, 0).is_none());
    }
}

mod build_sdl_gamepad_button_data {
    use super::*;

    #[test]
    fn maps_pressed_and_released_values() {
        let pressed =
            build_sdl_gamepad_button_data(4, Button::South, true, 2_000_000).expect("named button");
        assert_eq!(pressed.button, GamepadButtonKind::ButtonSouth as i32);
        assert_eq!(pressed.gamepad, 4);
        assert_eq!(pressed.time_stamp, 2.0);
        assert_eq!(pressed.value, 1.0);
        assert_eq!(
            build_sdl_gamepad_button_data(4, Button::South, false, 0)
                .expect("named button")
                .value,
            0.0
        );
        assert!(build_sdl_gamepad_button_data(4, Button::Misc1, true, 0).is_none());
    }
}

mod build_sdl_keyboard_data {
    use super::*;

    #[test]
    fn pins_dom_names_physical_codes_modifiers_and_time_units() {
        let data = build_sdl_keyboard_data(
            Some(Keycode::Left),
            Some(Scancode::RShift),
            Mod::LCTRLMOD | Mod::RSHIFTMOD | Mod::CAPSMOD | Mod::NUMMOD,
            true,
            7_250_000,
        );
        assert_eq!(data.key, "ArrowLeft");
        assert_eq!(data.code, "ShiftRight");
        assert_eq!(data.key_code, flight_input::KEY_CODE_RIGHT_SHIFT);
        assert_eq!(data.location, 2);
        assert!(data.ctrl_key && data.shift_key && data.caps_lock && data.num_lock);
        assert_eq!(data.modifier, 3);
        assert!(data.repeat);
        assert_eq!(data.time_stamp, 7.25);
    }
}

mod build_sdl_pointer_data {
    use super::*;

    #[test]
    fn carries_persistent_button_mask_motion_and_modifiers() {
        let data = build_sdl_pointer_data(
            11.0,
            22.0,
            -3.0,
            4.0,
            1 | 2 | 16,
            Mod::LALTMOD | Mod::LGUIMOD,
            5_000_000,
        );
        assert_eq!((data.x, data.y), (11.0, 22.0));
        assert_eq!((data.delta_x, data.delta_y), (-3.0, 4.0));
        assert_eq!(data.buttons, 19);
        assert!(data.alt_key && data.meta_key && data.is_primary);
        assert_eq!(data.pointer_type, PointerType::Mouse);
        assert_eq!(data.time_stamp, 5.0);
    }
}

mod build_sdl_text_data {
    use super::*;

    #[test]
    fn preserves_committed_and_composing_text() {
        let committed = build_sdl_text_data("Flight 🚀", false);
        assert_eq!(committed.text, "Flight 🚀");
        assert!(!committed.is_composing);
        assert!(build_sdl_text_data("せ", true).is_composing);
    }
}

mod build_sdl_touch_data {
    use super::*;

    #[test]
    fn scales_normalized_coordinates_and_clamps_pressure() {
        let data = build_sdl_touch_data(
            9,
            0.25,
            0.5,
            0.1,
            -0.2,
            1.5,
            800.0,
            600.0,
            false,
            true,
            Mod::LSHIFTMOD,
            6_000_000,
        );
        assert_eq!((data.x, data.y), (200.0, 300.0));
        assert!((data.delta_x - 80.0).abs() < 0.000_01);
        assert!((data.delta_y + 120.0).abs() < 0.000_01);
        assert_eq!((data.pointer_id, data.buttons), (9, 1));
        assert_eq!(data.pressure, 1.0);
        assert_eq!(data.pointer_type, PointerType::Touch);
        assert!(!data.is_primary);
        assert!(data.shift_key);
    }
}

mod build_sdl_trigger_data {
    use super::*;

    #[test]
    fn maps_trigger_axes_to_button_values() {
        let data =
            build_sdl_trigger_data(1, Axis::TriggerRight, i16::MAX, 3_000_000).expect("trigger");
        assert_eq!(data.button, GamepadButtonKind::TriggerRight as i32);
        assert_eq!(data.value, 1.0);
        assert_eq!(data.time_stamp, 3.0);
        assert!(build_sdl_trigger_data(1, Axis::LeftX, 1, 0).is_none());
    }
}

mod build_sdl_wheel_data {
    use super::*;

    #[test]
    fn uses_event_coordinates_and_flipped_direction() {
        let data = build_sdl_wheel_data(
            37.0,
            49.0,
            2.0,
            -3.0,
            MouseWheelDirection::Flipped,
            5,
            Mod::LCTRLMOD,
            8_000_000,
        );
        assert_eq!((data.x, data.y), (37.0, 49.0));
        assert_eq!((data.delta_x, data.delta_y), (-2.0, 3.0));
        assert_eq!(data.buttons, 5);
        assert!(data.ctrl_key);
        assert_eq!(data.wheel_mode, MouseWheelMode::Lines);
    }
}

mod connect_sdl_gamepad_id {
    use super::*;

    #[test]
    fn assigns_dense_stable_ids_and_reuses_holes() {
        let mut map = create_sdl_gamepad_id_map();
        assert_eq!(connect_sdl_gamepad_id(&mut map, JoystickId::new(71)), 0);
        assert_eq!(connect_sdl_gamepad_id(&mut map, JoystickId::new(99)), 1);
        assert_eq!(connect_sdl_gamepad_id(&mut map, JoystickId::new(71)), 0);
        assert_eq!(
            disconnect_sdl_gamepad_id(&mut map, JoystickId::new(71)),
            Some(0)
        );
        assert_eq!(connect_sdl_gamepad_id(&mut map, JoystickId::new(123)), 0);
    }
}

mod create_sdl_gamepad_id_map {
    use super::*;

    #[test]
    fn starts_empty() {
        let map = create_sdl_gamepad_id_map();
        assert_eq!(get_sdl_gamepad_id(&map, JoystickId::new(1)), None);
    }
}

mod disconnect_sdl_gamepad_id {
    use super::*;

    #[test]
    fn cleans_up_both_directions() {
        let mut map = create_sdl_gamepad_id_map();
        connect_sdl_gamepad_id(&mut map, JoystickId::new(8));
        assert_eq!(
            disconnect_sdl_gamepad_id(&mut map, JoystickId::new(8)),
            Some(0)
        );
        assert_eq!(get_sdl_gamepad_id(&map, JoystickId::new(8)), None);
        assert_eq!(
            disconnect_sdl_gamepad_id(&mut map, JoystickId::new(8)),
            None
        );
    }
}

mod get_sdl_gamepad_id {
    use super::*;

    #[test]
    fn returns_only_connected_joysticks() {
        let mut map = create_sdl_gamepad_id_map();
        connect_sdl_gamepad_id(&mut map, JoystickId::new(17));
        assert_eq!(get_sdl_gamepad_id(&map, JoystickId::new(17)), Some(0));
        assert_eq!(get_sdl_gamepad_id(&map, JoystickId::new(18)), None);
    }
}

mod normalize_sdl_gamepad_stick {
    use super::*;

    #[test]
    fn covers_asymmetric_signed_range() {
        assert_eq!(normalize_sdl_gamepad_stick(i16::MIN), -1.0);
        assert_eq!(normalize_sdl_gamepad_stick(0), 0.0);
        assert_eq!(normalize_sdl_gamepad_stick(i16::MAX), 1.0);
    }
}

mod normalize_sdl_gamepad_trigger {
    use super::*;

    #[test]
    fn clamps_negative_values_to_zero() {
        assert_eq!(normalize_sdl_gamepad_trigger(i16::MIN), 0.0);
        assert_eq!(normalize_sdl_gamepad_trigger(0), 0.0);
        assert_eq!(normalize_sdl_gamepad_trigger(i16::MAX), 1.0);
    }
}

mod sdl_timestamp_milliseconds {
    use super::*;

    #[test]
    fn converts_nanoseconds_without_truncating_fractional_milliseconds() {
        assert_eq!(sdl_timestamp_milliseconds(12_345_678), 12.345_678);
    }
}

mod translate_sdl_gamepad_axis {
    use super::*;

    #[test]
    fn maps_sticks_and_reserves_triggers_for_buttons() {
        assert_eq!(
            translate_sdl_gamepad_axis(Axis::LeftX),
            Some(GamepadAxisKind::StickLeftX)
        );
        assert_eq!(
            translate_sdl_gamepad_axis(Axis::LeftY),
            Some(GamepadAxisKind::StickLeftY)
        );
        assert_eq!(
            translate_sdl_gamepad_axis(Axis::RightX),
            Some(GamepadAxisKind::StickRightX)
        );
        assert_eq!(
            translate_sdl_gamepad_axis(Axis::RightY),
            Some(GamepadAxisKind::StickRightY)
        );
        assert_eq!(translate_sdl_gamepad_axis(Axis::TriggerLeft), None);
        assert_eq!(translate_sdl_gamepad_axis(Axis::TriggerRight), None);
    }
}

mod translate_sdl_gamepad_button {
    use super::*;

    #[test]
    fn maps_the_complete_flight_button_vocabulary() {
        let cases = [
            (Button::South, GamepadButtonKind::ButtonSouth),
            (Button::East, GamepadButtonKind::ButtonEast),
            (Button::West, GamepadButtonKind::ButtonWest),
            (Button::North, GamepadButtonKind::ButtonNorth),
            (Button::Back, GamepadButtonKind::Select),
            (Button::Guide, GamepadButtonKind::Home),
            (Button::Start, GamepadButtonKind::Start),
            (Button::LeftStick, GamepadButtonKind::StickLeft),
            (Button::RightStick, GamepadButtonKind::StickRight),
            (Button::LeftShoulder, GamepadButtonKind::ShoulderLeft),
            (Button::RightShoulder, GamepadButtonKind::ShoulderRight),
            (Button::DPadUp, GamepadButtonKind::DpadUp),
            (Button::DPadDown, GamepadButtonKind::DpadDown),
            (Button::DPadLeft, GamepadButtonKind::DpadLeft),
            (Button::DPadRight, GamepadButtonKind::DpadRight),
            (Button::Touchpad, GamepadButtonKind::Touchpad),
        ];
        for (button, expected) in cases {
            assert_eq!(translate_sdl_gamepad_button(button), Some(expected));
        }
        assert_eq!(translate_sdl_gamepad_button(Button::Misc6), None);
        assert_eq!(translate_sdl_gamepad_button(Button::LeftPaddle2), None);
    }
}

mod translate_sdl_key {
    use super::*;

    #[test]
    fn uses_dom_names_instead_of_sdl_display_names() {
        assert_eq!(
            translate_sdl_key(Some(Keycode::Left), Mod::NOMOD),
            "ArrowLeft"
        );
        assert_eq!(
            translate_sdl_key(Some(Keycode::LCtrl), Mod::NOMOD),
            "Control"
        );
        assert_eq!(
            translate_sdl_key(Some(Keycode::KpEnter), Mod::NOMOD),
            "Enter"
        );
        assert_eq!(translate_sdl_key(Some(Keycode::F24), Mod::NOMOD), "F24");
        assert_eq!(translate_sdl_key(Some(Keycode::A), Mod::NOMOD), "a");
        assert_eq!(translate_sdl_key(Some(Keycode::A), Mod::LSHIFTMOD), "A");
        assert_eq!(translate_sdl_key(None, Mod::NOMOD), "Unidentified");
    }
}

mod translate_sdl_modifiers {
    use super::*;

    #[test]
    fn preserves_sides_locks_and_stable_mask_bits() {
        let modifiers = translate_sdl_modifiers(
            Mod::RSHIFTMOD
                | Mod::LCTRLMOD
                | Mod::RALTMOD
                | Mod::LGUIMOD
                | Mod::CAPSMOD
                | Mod::NUMMOD,
        );
        assert!(modifiers.shift_key);
        assert!(modifiers.ctrl_key);
        assert!(modifiers.alt_key);
        assert!(modifiers.meta_key);
        assert!(modifiers.caps_lock);
        assert!(modifiers.num_lock);
        assert_eq!(modifiers.modifier, 15);
    }
}

mod translate_sdl_mouse_button {
    use super::*;

    #[test]
    fn maps_dom_button_numbers_and_mask_bits() {
        assert_eq!(
            translate_sdl_mouse_button(MouseButton::Left),
            SdlPointerButton { button: 0, mask: 1 }
        );
        assert_eq!(
            translate_sdl_mouse_button(MouseButton::Middle),
            SdlPointerButton { button: 1, mask: 4 }
        );
        assert_eq!(
            translate_sdl_mouse_button(MouseButton::Right),
            SdlPointerButton { button: 2, mask: 2 }
        );
        assert_eq!(
            translate_sdl_mouse_button(MouseButton::X1),
            SdlPointerButton { button: 3, mask: 8 }
        );
        assert_eq!(
            translate_sdl_mouse_button(MouseButton::X2),
            SdlPointerButton {
                button: 4,
                mask: 16
            }
        );
        assert_eq!(
            translate_sdl_mouse_button(MouseButton::Unknown),
            SdlPointerButton {
                button: -1,
                mask: 0
            }
        );
    }
}

mod translate_sdl_scancode {
    use super::*;

    #[test]
    fn maps_letters_digits_function_keys_and_locations() {
        assert_eq!(
            translate_sdl_scancode(Some(Scancode::A)),
            SdlPhysicalKey {
                code: "KeyA".to_string(),
                key_code: flight_input::KEY_CODE_A,
                location: 0
            }
        );
        assert_eq!(translate_sdl_scancode(Some(Scancode::_0)).code, "Digit0");
        assert_eq!(translate_sdl_scancode(Some(Scancode::F24)).code, "F24");
        assert_eq!(translate_sdl_scancode(Some(Scancode::Kp0)).location, 3);
        assert_eq!(translate_sdl_scancode(Some(Scancode::LCtrl)).location, 1);
        assert_eq!(translate_sdl_scancode(Some(Scancode::RGui)).location, 2);
        assert_eq!(translate_sdl_scancode(None).code, "Unidentified");
    }
}

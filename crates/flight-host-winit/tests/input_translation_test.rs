use flight_host_winit::*;
use flight_input::{InputTextData, MouseWheelMode, PointerType};
use winit::dpi::PhysicalPosition;
use winit::event::{DeviceId, ElementState, MouseButton, MouseScrollDelta, Touch, TouchPhase};
use winit::keyboard::{Key, KeyCode, KeyLocation, ModifiersState, NamedKey, PhysicalKey};

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
        assert!(data.shift_key && data.ctrl_key && data.repeat);
        assert_eq!(data.time_stamp, 12.5);
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
        assert!(pointer.alt_key && pointer.meta_key);
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
    fn maps_character_and_named_keys() {
        assert_eq!(translate_winit_key(&Key::Character("z".into())), "z");
        assert_eq!(translate_winit_key(&Key::Named(NamedKey::Enter)), "Enter");
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
    fn maps_common_named_keys() {
        assert_eq!(translate_winit_named_key(NamedKey::ArrowUp), "ArrowUp");
        assert_eq!(translate_winit_named_key(NamedKey::Escape), "Escape");
    }
}

mod translate_winit_physical_key {
    use super::*;

    #[test]
    fn maps_letters_and_numpad_edges() {
        assert_eq!(
            translate_winit_physical_key(PhysicalKey::Code(KeyCode::KeyA)),
            ("KeyA".to_string(), flight_input::KEY_CODE_A)
        );
        assert_eq!(
            translate_winit_physical_key(PhysicalKey::Code(KeyCode::Numpad0)).1,
            flight_input::KEY_CODE_NUMPAD_0
        );
        assert_eq!(
            translate_winit_physical_key(PhysicalKey::Code(KeyCode::Numpad9)).1,
            flight_input::KEY_CODE_NUMPAD_9
        );
    }
}

mod translate_winit_scroll_delta {
    use super::*;

    #[test]
    fn maps_line_and_pixel_units() {
        assert_eq!(
            translate_winit_scroll_delta(&MouseScrollDelta::LineDelta(1.0, -2.0)),
            (1.0, -2.0, MouseWheelMode::Lines)
        );
        assert_eq!(
            translate_winit_scroll_delta(&MouseScrollDelta::PixelDelta(PhysicalPosition::new(
                3.0, 4.0
            ))),
            (3.0, 4.0, MouseWheelMode::Pixels)
        );
    }
}

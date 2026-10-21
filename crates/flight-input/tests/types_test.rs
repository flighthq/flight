use flight_input::contract::*;

mod get_gamepad_axis_kind_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_value() {
        let cases = [
            (GamepadAxisKind::StickLeftX, "StickLeftX"),
            (GamepadAxisKind::StickLeftY, "StickLeftY"),
            (GamepadAxisKind::StickRightX, "StickRightX"),
            (GamepadAxisKind::StickRightY, "StickRightY"),
        ];
        for (value, string) in cases {
            assert_eq!(get_gamepad_axis_kind_string(value), string);
        }
    }
}

mod get_gamepad_button_kind_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_value() {
        let cases = [
            (GamepadButtonKind::ButtonEast, "ButtonEast"),
            (GamepadButtonKind::ButtonNorth, "ButtonNorth"),
            (GamepadButtonKind::ButtonSouth, "ButtonSouth"),
            (GamepadButtonKind::ButtonWest, "ButtonWest"),
            (GamepadButtonKind::DpadDown, "DpadDown"),
            (GamepadButtonKind::DpadLeft, "DpadLeft"),
            (GamepadButtonKind::DpadRight, "DpadRight"),
            (GamepadButtonKind::DpadUp, "DpadUp"),
            (GamepadButtonKind::Home, "Home"),
            (GamepadButtonKind::Select, "Select"),
            (GamepadButtonKind::ShoulderLeft, "ShoulderLeft"),
            (GamepadButtonKind::ShoulderRight, "ShoulderRight"),
            (GamepadButtonKind::Start, "Start"),
            (GamepadButtonKind::StickLeft, "StickLeft"),
            (GamepadButtonKind::StickRight, "StickRight"),
            (GamepadButtonKind::Touchpad, "Touchpad"),
            (GamepadButtonKind::TriggerLeft, "TriggerLeft"),
            (GamepadButtonKind::TriggerRight, "TriggerRight"),
        ];
        for (value, string) in cases {
            assert_eq!(get_gamepad_button_kind_string(value), string);
        }
    }
}

mod get_gamepad_mapping_kind_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_mapping_strings_including_the_empty_one() {
        assert_eq!(
            get_gamepad_mapping_kind_string(GamepadMappingKind::Standard),
            "standard"
        );
        assert_eq!(
            get_gamepad_mapping_kind_string(GamepadMappingKind::Raw),
            "raw"
        );
        assert_eq!(
            get_gamepad_mapping_kind_string(GamepadMappingKind::Unspecified),
            ""
        );
    }
}

mod get_input_pointer_lock_exit_reason_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_reason() {
        assert_eq!(
            get_input_pointer_lock_exit_reason_string(InputPointerLockExitReason::Ok),
            "ok"
        );
        assert_eq!(
            get_input_pointer_lock_exit_reason_string(InputPointerLockExitReason::ApiUnavailable),
            "api-unavailable"
        );
        assert_eq!(
            get_input_pointer_lock_exit_reason_string(InputPointerLockExitReason::OperationFailed),
            "operation-failed"
        );
    }
}

mod get_input_pointer_lock_request_reason_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_reason() {
        assert_eq!(
            get_input_pointer_lock_request_reason_string(InputPointerLockRequestReason::Ok),
            "ok"
        );
        assert_eq!(
            get_input_pointer_lock_request_reason_string(
                InputPointerLockRequestReason::ApiUnavailable
            ),
            "api-unavailable"
        );
        assert_eq!(
            get_input_pointer_lock_request_reason_string(InputPointerLockRequestReason::Denied),
            "denied"
        );
        assert_eq!(
            get_input_pointer_lock_request_reason_string(
                InputPointerLockRequestReason::OperationFailed
            ),
            "operation-failed"
        );
        assert_eq!(
            get_input_pointer_lock_request_reason_string(
                InputPointerLockRequestReason::TargetNotFound
            ),
            "target-not-found"
        );
    }
}

mod get_mouse_wheel_mode_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_value() {
        let cases = [
            (MouseWheelMode::Lines, "lines"),
            (MouseWheelMode::Pages, "pages"),
            (MouseWheelMode::Pixels, "pixels"),
            (MouseWheelMode::Unknown, "unknown"),
        ];
        for (value, string) in cases {
            assert_eq!(get_mouse_wheel_mode_string(value), string);
        }
    }
}

mod get_pointer_type_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_value() {
        let cases = [
            (PointerType::Mouse, "mouse"),
            (PointerType::Pen, "pen"),
            (PointerType::Touch, "touch"),
            (PointerType::Unknown, "unknown"),
        ];
        for (value, string) in cases {
            assert_eq!(get_pointer_type_string(value), string);
        }
    }
}

mod parse_gamepad_axis_kind {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_others() {
        let values = [
            GamepadAxisKind::StickLeftX,
            GamepadAxisKind::StickLeftY,
            GamepadAxisKind::StickRightX,
            GamepadAxisKind::StickRightY,
        ];
        for value in values {
            assert_eq!(
                parse_gamepad_axis_kind(get_gamepad_axis_kind_string(value)),
                Some(value)
            );
        }
        assert_eq!(parse_gamepad_axis_kind("stickleftx"), None);
    }
}

mod parse_gamepad_button_kind {
    use super::*;

    #[test]
    fn round_trips_every_exact_string_and_rejects_others() {
        let values = [
            GamepadButtonKind::ButtonEast,
            GamepadButtonKind::ButtonNorth,
            GamepadButtonKind::ButtonSouth,
            GamepadButtonKind::ButtonWest,
            GamepadButtonKind::DpadDown,
            GamepadButtonKind::DpadLeft,
            GamepadButtonKind::DpadRight,
            GamepadButtonKind::DpadUp,
            GamepadButtonKind::Home,
            GamepadButtonKind::Select,
            GamepadButtonKind::ShoulderLeft,
            GamepadButtonKind::ShoulderRight,
            GamepadButtonKind::Start,
            GamepadButtonKind::StickLeft,
            GamepadButtonKind::StickRight,
            GamepadButtonKind::Touchpad,
            GamepadButtonKind::TriggerLeft,
            GamepadButtonKind::TriggerRight,
        ];
        for value in values {
            assert_eq!(
                parse_gamepad_button_kind(get_gamepad_button_kind_string(value)),
                Some(value)
            );
        }
        assert_eq!(parse_gamepad_button_kind("Button"), None);
    }
}

mod parse_gamepad_mapping_kind {
    use super::*;

    #[test]
    fn round_trips_standard_raw_and_empty_and_rejects_others() {
        assert_eq!(
            parse_gamepad_mapping_kind("standard"),
            Some(GamepadMappingKind::Standard)
        );
        assert_eq!(
            parse_gamepad_mapping_kind("raw"),
            Some(GamepadMappingKind::Raw)
        );
        assert_eq!(
            parse_gamepad_mapping_kind(""),
            Some(GamepadMappingKind::Unspecified)
        );
        assert_eq!(parse_gamepad_mapping_kind("other"), None);
    }
}

mod parse_input_pointer_lock_exit_reason {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_others() {
        let values = [
            InputPointerLockExitReason::Ok,
            InputPointerLockExitReason::ApiUnavailable,
            InputPointerLockExitReason::OperationFailed,
        ];
        for value in values {
            assert_eq!(
                parse_input_pointer_lock_exit_reason(get_input_pointer_lock_exit_reason_string(
                    value
                )),
                Some(value)
            );
        }
        assert_eq!(parse_input_pointer_lock_exit_reason("denied"), None);
    }
}

mod parse_input_pointer_lock_request_reason {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_others() {
        let values = [
            InputPointerLockRequestReason::Ok,
            InputPointerLockRequestReason::ApiUnavailable,
            InputPointerLockRequestReason::Denied,
            InputPointerLockRequestReason::OperationFailed,
            InputPointerLockRequestReason::TargetNotFound,
        ];
        for value in values {
            assert_eq!(
                parse_input_pointer_lock_request_reason(
                    get_input_pointer_lock_request_reason_string(value)
                ),
                Some(value)
            );
        }
        assert_eq!(parse_input_pointer_lock_request_reason("missing"), None);
    }
}

mod parse_mouse_wheel_mode {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_others() {
        let values = [
            MouseWheelMode::Lines,
            MouseWheelMode::Pages,
            MouseWheelMode::Pixels,
            MouseWheelMode::Unknown,
        ];
        for value in values {
            assert_eq!(
                parse_mouse_wheel_mode(get_mouse_wheel_mode_string(value)),
                Some(value)
            );
        }
        assert_eq!(parse_mouse_wheel_mode("delta"), None);
    }
}

mod parse_pointer_type {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_others() {
        let values = [
            PointerType::Mouse,
            PointerType::Pen,
            PointerType::Touch,
            PointerType::Unknown,
        ];
        for value in values {
            assert_eq!(
                parse_pointer_type(get_pointer_type_string(value)),
                Some(value)
            );
        }
        assert_eq!(parse_pointer_type("stylus"), None);
    }
}

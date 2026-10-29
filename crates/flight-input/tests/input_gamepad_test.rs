use flight_input::contract::*;

fn close(actual: f32, expected: f32) {
    assert!(
        (actual - expected).abs() < 1e-4,
        "expected {expected}, got {actual}"
    );
}

mod apply_gamepad_axis_dead_zone {
    use super::*;

    #[test]
    fn returns_zero_inside_the_dead_zone() {
        close(apply_gamepad_axis_dead_zone(0.1, 0.2), 0.0);
        close(apply_gamepad_axis_dead_zone(-0.1, 0.2), 0.0);
    }

    #[test]
    fn rescales_positive_and_negative_values_outside_the_dead_zone() {
        close(apply_gamepad_axis_dead_zone(1.0, 0.2), 1.0);
        close(apply_gamepad_axis_dead_zone(-1.0, 0.2), -1.0);
        let mid = apply_gamepad_axis_dead_zone(0.6, 0.2);
        assert!(mid > 0.0 && mid < 1.0);
    }

    #[test]
    fn returns_the_raw_value_when_the_dead_zone_is_zero() {
        close(apply_gamepad_axis_dead_zone(0.5, 0.0), 0.5);
    }
}

mod apply_gamepad_stick_dead_zone {
    use super::*;

    #[test]
    fn outputs_zero_inside_the_radial_dead_zone() {
        let mut out = GamepadStickOutput { x: 0.0, y: 0.0 };
        apply_gamepad_stick_dead_zone(&mut out, 0.1, 0.1, 0.2);
        close(out.x, 0.0);
        close(out.y, 0.0);
    }

    #[test]
    fn preserves_direction_and_rescales_full_deflection_to_one() {
        let mut out = GamepadStickOutput { x: 0.0, y: 0.0 };
        apply_gamepad_stick_dead_zone(&mut out, 1.0, 0.0, 0.2);
        close(out.x, 1.0);
        close(out.y, 0.0);
    }

    #[test]
    fn is_alias_safe_when_coordinates_come_from_the_out_record() {
        let mut out = GamepadStickOutput { x: 0.8, y: 0.0 };
        apply_gamepad_stick_dead_zone(&mut out, 0.8, 0.0, 0.2);
        assert!(out.x > 0.0);
        close(out.y, 0.0);
    }

    #[test]
    fn passes_through_when_the_dead_zone_is_zero() {
        let mut out = GamepadStickOutput { x: 0.0, y: 0.0 };
        apply_gamepad_stick_dead_zone(&mut out, 0.3, 0.4, 0.0);
        close(out.x, 0.3);
        close(out.y, 0.4);
    }
}

mod get_gamepad_axis_name {
    use super::*;

    #[test]
    fn maps_standard_indices_to_the_exact_kinds() {
        assert_eq!(
            get_gamepad_axis_name(GamepadMapping::Standard, 0),
            Some(GamepadAxisKind::StickLeftX)
        );
        assert_eq!(
            get_gamepad_axis_name(GamepadMapping::Standard, 1),
            Some(GamepadAxisKind::StickLeftY)
        );
        assert_eq!(
            get_gamepad_axis_name(GamepadMapping::Standard, 2),
            Some(GamepadAxisKind::StickRightX)
        );
        assert_eq!(
            get_gamepad_axis_name(GamepadMapping::Standard, 3),
            Some(GamepadAxisKind::StickRightY)
        );
        assert_eq!(get_gamepad_axis_name(GamepadMapping::Standard, 4), None);
    }

    #[test]
    fn returns_none_for_non_standard_mapping() {
        assert_eq!(get_gamepad_axis_name(GamepadMapping::Raw, 0), None);
        assert_eq!(
            get_gamepad_axis_name(GamepadMapping::Unspecified, 0),
            None
        );
    }
}

mod get_gamepad_button_name {
    use super::*;

    #[test]
    fn maps_standard_indices_to_the_exact_kinds() {
        assert_eq!(
            get_gamepad_button_name(GamepadMapping::Standard, 0),
            Some(GamepadButtonKind::ButtonSouth)
        );
        assert_eq!(
            get_gamepad_button_name(GamepadMapping::Standard, 12),
            Some(GamepadButtonKind::DpadUp)
        );
        assert_eq!(
            get_gamepad_button_name(GamepadMapping::Standard, 16),
            Some(GamepadButtonKind::Home)
        );
    }

    #[test]
    fn returns_none_for_non_standard_mapping_or_out_of_range_indices() {
        assert_eq!(get_gamepad_button_name(GamepadMapping::Raw, 0), None);
        assert_eq!(
            get_gamepad_button_name(GamepadMapping::Unspecified, 0),
            None
        );
        assert_eq!(
            get_gamepad_button_name(GamepadMapping::Standard, 99),
            None
        );
        assert_eq!(
            get_gamepad_button_name(GamepadMapping::Standard, -1),
            None
        );
    }
}

use crate::types::*;

const STANDARD_BUTTON_NAMES: [Option<GamepadButtonKind>; 18] = [
    Some(GamepadButtonKind::ButtonSouth),
    Some(GamepadButtonKind::ButtonEast),
    Some(GamepadButtonKind::ButtonWest),
    Some(GamepadButtonKind::ButtonNorth),
    Some(GamepadButtonKind::ShoulderLeft),
    Some(GamepadButtonKind::ShoulderRight),
    Some(GamepadButtonKind::TriggerLeft),
    Some(GamepadButtonKind::TriggerRight),
    Some(GamepadButtonKind::Select),
    Some(GamepadButtonKind::Start),
    Some(GamepadButtonKind::StickLeft),
    Some(GamepadButtonKind::StickRight),
    Some(GamepadButtonKind::DpadUp),
    Some(GamepadButtonKind::DpadDown),
    Some(GamepadButtonKind::DpadLeft),
    Some(GamepadButtonKind::DpadRight),
    Some(GamepadButtonKind::Home),
    Some(GamepadButtonKind::Touchpad),
];

const STANDARD_AXIS_NAMES: [Option<GamepadAxisKind>; 4] = [
    Some(GamepadAxisKind::StickLeftX),
    Some(GamepadAxisKind::StickLeftY),
    Some(GamepadAxisKind::StickRightX),
    Some(GamepadAxisKind::StickRightY),
];

/// Filters one gamepad axis through a simple dead zone (TS `applyGamepadAxisDeadZone`).
pub fn apply_gamepad_axis_dead_zone(value: f32, dead_zone: f32) -> f32 {
    if dead_zone <= 0.0 {
        return value;
    }
    let abs = if value < 0.0 { -value } else { value };
    if abs <= dead_zone {
        return 0.0;
    }
    let sign = if value < 0.0 { -1.0 } else { 1.0 };
    return sign * ((abs - dead_zone) / (1.0 - dead_zone));
}

/// Filters a two-dimensional stick through a radial dead zone (TS
/// `applyGamepadStickDeadZone`). Direction is preserved and the magnitude is rescaled to [0, 1].
/// Alias-safe: the coordinates are captured before `out` is written.
pub fn apply_gamepad_stick_dead_zone(out: &mut GamepadStickOutput, x: f32, y: f32, dead_zone: f32) {
    if dead_zone <= 0.0 {
        out.x = x;
        out.y = y;
        return;
    }
    let magnitude = (x * x + y * y).sqrt();
    if magnitude <= dead_zone {
        out.x = 0.0;
        out.y = 0.0;
        return;
    }
    let scale = (magnitude - dead_zone) / ((1.0 - dead_zone) * magnitude);
    out.x = x * scale;
    out.y = y * scale;
}

/// Returns the semantic axis name for a standard-mapping index (TS `getGamepadAxisName`).
pub fn get_gamepad_axis_name(mapping: GamepadMapping, index: i32) -> Option<GamepadAxisKind> {
    if mapping != GamepadMapping::Standard {
        return None;
    }
    if index < 0 || index as usize >= STANDARD_AXIS_NAMES.len() {
        return None;
    }
    return STANDARD_AXIS_NAMES[index as usize];
}

/// Returns the semantic button name for a standard-mapping index (TS `getGamepadButtonName`).
pub fn get_gamepad_button_name(mapping: GamepadMapping, index: i32) -> Option<GamepadButtonKind> {
    if mapping != GamepadMapping::Standard {
        return None;
    }
    if index < 0 || index as usize >= STANDARD_BUTTON_NAMES.len() {
        return None;
    }
    return STANDARD_BUTTON_NAMES[index as usize];
}

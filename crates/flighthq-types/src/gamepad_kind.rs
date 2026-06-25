//! Gamepad axis and button kind identifiers.
//!
//! Semantic names for the standard gamepad mapping. Each kind is a plain
//! string (the kind identity model), used both as the serialized form and the
//! intent vocabulary. `flighthq-input` maps a raw axis/button index to one of
//! these names via `get_gamepad_axis_name` / `get_gamepad_button_name`.

/// Semantic name for a gamepad button in the standard mapping.
///
/// A `GamepadButtonKind` is a plain string constant; compare or store the
/// string directly.
pub mod gamepad_button_kind {
    pub const BUTTON_SOUTH: &str = "BUTTON_SOUTH";
    pub const BUTTON_EAST: &str = "BUTTON_EAST";
    pub const BUTTON_WEST: &str = "BUTTON_WEST";
    pub const BUTTON_NORTH: &str = "BUTTON_NORTH";
    pub const SHOULDER_LEFT: &str = "SHOULDER_LEFT";
    pub const SHOULDER_RIGHT: &str = "SHOULDER_RIGHT";
    pub const TRIGGER_LEFT: &str = "TRIGGER_LEFT";
    pub const TRIGGER_RIGHT: &str = "TRIGGER_RIGHT";
    pub const SELECT: &str = "SELECT";
    pub const START: &str = "START";
    pub const STICK_LEFT: &str = "STICK_LEFT";
    pub const STICK_RIGHT: &str = "STICK_RIGHT";
    pub const DPAD_UP: &str = "DPAD_UP";
    pub const DPAD_DOWN: &str = "DPAD_DOWN";
    pub const DPAD_LEFT: &str = "DPAD_LEFT";
    pub const DPAD_RIGHT: &str = "DPAD_RIGHT";
    pub const HOME: &str = "HOME";
    pub const TOUCHPAD: &str = "TOUCHPAD";
}

/// Semantic name for a gamepad axis in the standard mapping.
///
/// A `GamepadAxisKind` is a plain string constant; compare or store the
/// string directly.
pub mod gamepad_axis_kind {
    pub const STICK_LEFT_X: &str = "STICK_LEFT_X";
    pub const STICK_LEFT_Y: &str = "STICK_LEFT_Y";
    pub const STICK_RIGHT_X: &str = "STICK_RIGHT_X";
    pub const STICK_RIGHT_Y: &str = "STICK_RIGHT_Y";
}

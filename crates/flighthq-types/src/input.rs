use flighthq_signals::Signal;

// ---------------------------------------------------------------------------
// KeyCode
// ---------------------------------------------------------------------------

/// Key code constants (SDL2 / USB HID scan codes).
pub mod key_code {
    pub const UNKNOWN: u32 = 0x00;
    pub const A: u32 = 0x61;
    pub const B: u32 = 0x62;
    pub const C: u32 = 0x63;
    pub const D: u32 = 0x64;
    pub const E: u32 = 0x65;
    pub const F: u32 = 0x66;
    pub const G: u32 = 0x67;
    pub const H: u32 = 0x68;
    pub const I: u32 = 0x69;
    pub const J: u32 = 0x6a;
    pub const K: u32 = 0x6b;
    pub const L: u32 = 0x6c;
    pub const M: u32 = 0x6d;
    pub const N: u32 = 0x6e;
    pub const O: u32 = 0x6f;
    pub const P: u32 = 0x70;
    pub const Q: u32 = 0x71;
    pub const R: u32 = 0x72;
    pub const S: u32 = 0x73;
    pub const T: u32 = 0x74;
    pub const U: u32 = 0x75;
    pub const V: u32 = 0x76;
    pub const W: u32 = 0x77;
    pub const X: u32 = 0x78;
    pub const Y: u32 = 0x79;
    pub const Z: u32 = 0x7a;

    pub const NUMBER_0: u32 = 0x30;
    pub const NUMBER_1: u32 = 0x31;
    pub const NUMBER_2: u32 = 0x32;
    pub const NUMBER_3: u32 = 0x33;
    pub const NUMBER_4: u32 = 0x34;
    pub const NUMBER_5: u32 = 0x35;
    pub const NUMBER_6: u32 = 0x36;
    pub const NUMBER_7: u32 = 0x37;
    pub const NUMBER_8: u32 = 0x38;
    pub const NUMBER_9: u32 = 0x39;

    pub const BACKSPACE: u32 = 0x08;
    pub const TAB: u32 = 0x09;
    pub const RETURN: u32 = 0x0d;
    pub const ESCAPE: u32 = 0x1b;
    pub const SPACE: u32 = 0x20;
    pub const DELETE: u32 = 0x7f;

    pub const F1: u32 = 0x4000003a;
    pub const F2: u32 = 0x4000003b;
    pub const F3: u32 = 0x4000003c;
    pub const F4: u32 = 0x4000003d;
    pub const F5: u32 = 0x4000003e;
    pub const F6: u32 = 0x4000003f;
    pub const F7: u32 = 0x40000040;
    pub const F8: u32 = 0x40000041;
    pub const F9: u32 = 0x40000042;
    pub const F10: u32 = 0x40000043;
    pub const F11: u32 = 0x40000044;
    pub const F12: u32 = 0x40000045;

    pub const LEFT: u32 = 0x40000050;
    pub const RIGHT: u32 = 0x4000004f;
    pub const UP: u32 = 0x40000052;
    pub const DOWN: u32 = 0x40000051;

    pub const HOME: u32 = 0x4000004a;
    pub const END: u32 = 0x4000004d;
    pub const PAGE_UP: u32 = 0x4000004b;
    pub const PAGE_DOWN: u32 = 0x4000004e;
    pub const INSERT: u32 = 0x40000049;

    pub const LEFT_SHIFT: u32 = 0x400000e1;
    pub const RIGHT_SHIFT: u32 = 0x400000e5;
    pub const LEFT_CTRL: u32 = 0x400000e0;
    pub const RIGHT_CTRL: u32 = 0x400000e4;
    pub const LEFT_ALT: u32 = 0x400000e2;
    pub const RIGHT_ALT: u32 = 0x400000e6;
    pub const LEFT_META: u32 = 0x400000e3;
    pub const RIGHT_META: u32 = 0x400000e7;

    pub const CAPS_LOCK: u32 = 0x40000039;
    pub const NUM_LOCK: u32 = 0x40000053;
    pub const SCROLL_LOCK: u32 = 0x40000047;

    pub const AGAIN: u32 = 0x40000079;
    pub const APPLICATION: u32 = 0x40000065;
    pub const PAUSE: u32 = 0x40000048;
    pub const PRINT_SCREEN: u32 = 0x40000046;
    pub const POWER: u32 = 0x40000066;
    pub const SLEEP: u32 = 0x4000011a;
}

/// Key code type alias for use in APIs.
pub type KeyCode = u32;

// ---------------------------------------------------------------------------
// KeyModifier
// ---------------------------------------------------------------------------

pub mod key_modifier {
    pub const NONE: u32 = 0x0000;
    pub const LEFT_SHIFT: u32 = 0x0001;
    pub const RIGHT_SHIFT: u32 = 0x0002;
    pub const SHIFT: u32 = LEFT_SHIFT | RIGHT_SHIFT;
    pub const LEFT_CTRL: u32 = 0x0040;
    pub const RIGHT_CTRL: u32 = 0x0080;
    pub const CTRL: u32 = LEFT_CTRL | RIGHT_CTRL;
    pub const LEFT_ALT: u32 = 0x0100;
    pub const RIGHT_ALT: u32 = 0x0200;
    pub const ALT: u32 = LEFT_ALT | RIGHT_ALT;
    pub const LEFT_META: u32 = 0x0400;
    pub const RIGHT_META: u32 = 0x0800;
    pub const META: u32 = LEFT_META | RIGHT_META;
    pub const NUM_LOCK: u32 = 0x1000;
    pub const CAPS_LOCK: u32 = 0x2000;
    pub const MODE: u32 = 0x4000;
}

/// Key modifier bitmask type alias.
pub type KeyModifier = u32;

// ---------------------------------------------------------------------------
// MouseButton
// ---------------------------------------------------------------------------

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum MouseButton {
    #[default]
    Left = 0,
    Middle = 1,
    Right = 2,
}

// ---------------------------------------------------------------------------
// MouseWheelMode
// ---------------------------------------------------------------------------

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum MouseWheelMode {
    Lines,
    Pages,
    Pixels,
    #[default]
    Unknown,
}

// ---------------------------------------------------------------------------
// Pointer type
// ---------------------------------------------------------------------------

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum PointerType {
    Mouse,
    Pen,
    Touch,
    #[default]
    Unknown,
}

// ---------------------------------------------------------------------------
// InputPointerData
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct InputPointerData {
    pub alt_key: bool,
    pub button: i32,
    pub buttons: u32,
    pub ctrl_key: bool,
    pub delta_x: f32,
    pub delta_y: f32,
    /// Contact geometry height in CSS pixels (pen/touch); 1 for mouse.
    pub height: f32,
    pub is_primary: bool,
    pub meta_key: bool,
    pub pointer_id: i32,
    pub pointer_type: PointerType,
    /// Normalized pressure in [0, 1]; 0.5 for an active mouse button, 0 otherwise.
    pub pressure: f32,
    pub shift_key: bool,
    /// Pen tilt around the X axis in degrees, in [-90, 90].
    pub tilt_x: f32,
    /// Pen tilt around the Y axis in degrees, in [-90, 90].
    pub tilt_y: f32,
    /// Host event timestamp in milliseconds.
    pub time_stamp: f64,
    /// Pen barrel rotation (twist) in degrees, in [0, 359].
    pub twist: f32,
    pub wheel_mode: MouseWheelMode,
    /// Contact geometry width in CSS pixels (pen/touch); 1 for mouse.
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

// ---------------------------------------------------------------------------
// InputKeyboardData
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct InputKeyboardData {
    pub alt_key: bool,
    pub caps_lock: bool,
    pub code: String,
    pub ctrl_key: bool,
    pub key: String,
    pub key_code: u32,
    pub location: u32,
    pub meta_key: bool,
    pub modifier: u32,
    pub num_lock: bool,
    pub repeat: bool,
    pub shift_key: bool,
    /// Host event timestamp in milliseconds.
    pub time_stamp: f64,
}

// ---------------------------------------------------------------------------
// InputGamepadData
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct InputGamepadAxisData {
    pub axis: u32,
    pub gamepad: u32,
    /// Host event timestamp in milliseconds.
    pub time_stamp: f64,
    pub value: f32,
}

#[derive(Clone, Debug, Default)]
pub struct InputGamepadButtonData {
    pub button: u32,
    pub gamepad: u32,
    /// Host event timestamp in milliseconds.
    pub time_stamp: f64,
    pub value: f32,
}

#[derive(Clone, Debug, Default)]
pub struct InputGamepadConnectData {
    pub gamepad: u32,
    pub id: String,
    pub mapping: GamepadMapping,
}

/// The standardization of a gamepad's button/axis mapping. `Standard` is the W3C
/// standard layout, `Raw` an unmapped device, `Unknown` the unspecified `''` case.
/// Mirrors the TS `GamepadMapping = 'standard' | 'raw' | ''`.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum GamepadMapping {
    Standard,
    Raw,
    /// The empty-string (`''`) case: the host did not specify a mapping.
    #[default]
    Unknown,
}

// ---------------------------------------------------------------------------
// TextSelectionRange (re-exported for signals)
// ---------------------------------------------------------------------------

use crate::text::TextSelectionRange;

// ---------------------------------------------------------------------------
// InputSignals
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
pub struct InputSignals {
    pub on_gamepad_axis_move: Signal<InputGamepadAxisData>,
    pub on_gamepad_button_down: Signal<InputGamepadButtonData>,
    pub on_gamepad_button_up: Signal<InputGamepadButtonData>,
    pub on_gamepad_connect: Signal<InputGamepadConnectData>,
    pub on_gamepad_disconnect: Signal<InputGamepadConnectData>,
    pub on_key_down: Signal<InputKeyboardData>,
    pub on_key_up: Signal<InputKeyboardData>,
    pub on_pointer_cancel: Signal<InputPointerData>,
    pub on_pointer_down: Signal<InputPointerData>,
    pub on_pointer_move: Signal<InputPointerData>,
    pub on_pointer_move_relative: Signal<InputPointerData>,
    pub on_pointer_up: Signal<InputPointerData>,
    pub on_text_edit: Signal<TextSelectionRange>,
    pub on_text_input: Signal<TextSelectionRange>,
    pub on_wheel: Signal<InputPointerData>,
}

// ---------------------------------------------------------------------------
// InputManager
// ---------------------------------------------------------------------------

/// Manages input event delivery.
#[derive(Debug, Default)]
pub struct InputManager {
    pub enabled: bool,
    pub signals: InputSignals,
}

// ---------------------------------------------------------------------------
// AttachInputOptions
// ---------------------------------------------------------------------------

/// Options for attaching an input source to a manager.
#[derive(Clone, Debug, Default)]
pub struct AttachInputOptions {
    pub prevent_default: bool,
}

// ---------------------------------------------------------------------------
// PointerEventData / KeyboardEventData
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct PointerEventData {
    pub alt_key: bool,
    pub button: i32,
    pub buttons: u32,
    pub ctrl_key: bool,
    pub delta_x: f32,
    pub delta_y: f32,
    pub local_x: f32,
    pub local_y: f32,
    pub meta_key: bool,
    pub pointer_id: i32,
    pub pointer_type: PointerType,
    pub shift_key: bool,
    pub world_x: f32,
    pub world_y: f32,
    pub x: f32,
    pub y: f32,
    // target / currentTarget stored as opaque node ids.
    pub target_id: Option<u64>,
    pub current_target_id: Option<u64>,
}

#[derive(Clone, Debug, Default)]
pub struct KeyboardEventData {
    pub alt_key: bool,
    pub ctrl_key: bool,
    pub key: String,
    pub key_code: u32,
    pub meta_key: bool,
    pub shift_key: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gamepad_mapping_default_is_unknown() {
        // Mirrors the TS GamepadMapping `''` (unspecified) default.
        assert_eq!(GamepadMapping::default(), GamepadMapping::Unknown);
    }

    #[test]
    fn input_gamepad_connect_data_default_has_unknown_mapping() {
        let data = InputGamepadConnectData::default();
        assert_eq!(data.mapping, GamepadMapping::Unknown);
        assert_eq!(data.id, "");
    }

    #[test]
    fn input_pointer_data_default_zeroes_the_new_geometry_fields() {
        let data = InputPointerData::default();
        assert_eq!(data.width, 0.0);
        assert_eq!(data.height, 0.0);
        assert_eq!(data.pressure, 0.0);
        assert_eq!(data.tilt_x, 0.0);
        assert_eq!(data.tilt_y, 0.0);
        assert_eq!(data.twist, 0.0);
        assert_eq!(data.time_stamp, 0.0);
    }

    #[test]
    fn input_keyboard_data_default_has_zero_time_stamp() {
        assert_eq!(InputKeyboardData::default().time_stamp, 0.0);
    }
}

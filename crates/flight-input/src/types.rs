use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_host::ProviderRef;
use flight_signals::Signal;

/// The gamepad axis semantic name (TS `GamepadAxisKind`), a closed string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GamepadAxisKind {
    StickLeftX,
    StickLeftY,
    StickRightX,
    StickRightY,
}

/// The gamepad button semantic name (TS `GamepadButtonKind`), a closed string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GamepadButtonKind {
    ButtonEast,
    ButtonNorth,
    ButtonSouth,
    ButtonWest,
    DpadDown,
    DpadLeft,
    DpadRight,
    DpadUp,
    Home,
    Select,
    ShoulderLeft,
    ShoulderRight,
    Start,
    StickLeft,
    StickRight,
    Touchpad,
    TriggerLeft,
    TriggerRight,
}

/// The gamepad layout convention (TS `GamepadMappingKind`). `Unspecified` is the source's empty
/// string. TS also declares an identical `GamepadMapping` alias for connect data; the same string
/// set is reused here.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum GamepadMappingKind {
    Standard,
    Raw,
    #[default]
    Unspecified,
}

/// How a wheel delta is expressed (TS `MouseWheelMode`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum MouseWheelMode {
    Lines,
    Pages,
    Pixels,
    #[default]
    Unknown,
}

/// The pointer device family (TS `PointerType`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PointerType {
    Mouse,
    Pen,
    Touch,
    #[default]
    Unknown,
}

/// One normalized gamepad axis event (TS `InputGamepadAxisData`).
#[derive(Clone, Copy, Debug, PartialEq, Default)]
// flight-lint: allow(f64) D1: event timestamps are millisecond values whose fractional precision f32 loses after a few hours of uptime
pub struct InputGamepadAxisData {
    pub axis: i32,
    pub gamepad: i32,
    pub time_stamp: f64,
    pub value: f32,
}

/// One normalized gamepad button event (TS `InputGamepadButtonData`).
#[derive(Clone, Copy, Debug, PartialEq, Default)]
// flight-lint: allow(f64) D1: event timestamps are millisecond values whose fractional precision f32 loses after a few hours of uptime
pub struct InputGamepadButtonData {
    pub button: i32,
    pub gamepad: i32,
    pub time_stamp: f64,
    pub value: f32,
}

/// One gamepad connect/disconnect event (TS `InputGamepadConnectData`).
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct InputGamepadConnectData {
    pub gamepad: i32,
    pub id: String,
    pub mapping: GamepadMappingKind,
}

/// One normalized keyboard event (TS `InputKeyboardData`).
#[derive(Clone, Debug, PartialEq, Default)]
// flight-lint: allow(f64) D1: event timestamps are millisecond values whose fractional precision f32 loses after a few hours of uptime
pub struct InputKeyboardData {
    pub alt_key: bool,
    pub caps_lock: bool,
    pub code: String,
    pub ctrl_key: bool,
    pub key: String,
    pub key_code: i32,
    pub location: i32,
    pub meta_key: bool,
    pub modifier: i32,
    pub num_lock: bool,
    pub repeat: bool,
    pub shift_key: bool,
    pub time_stamp: f64,
}

/// One normalized pointer/wheel event (TS `InputPointerData`).
#[derive(Clone, Debug, PartialEq, Default)]
// flight-lint: allow(f64) D1: event timestamps are millisecond values whose fractional precision f32 loses after a few hours of uptime
pub struct InputPointerData {
    pub alt_key: bool,
    pub button: i32,
    pub buttons: u32,
    pub ctrl_key: bool,
    pub delta_x: f32,
    pub delta_y: f32,
    pub height: f32,
    pub is_primary: bool,
    pub meta_key: bool,
    pub pointer_id: i32,
    pub pointer_type: PointerType,
    pub pressure: f32,
    pub shift_key: bool,
    pub tilt_x: f32,
    pub tilt_y: f32,
    pub time_stamp: f64,
    pub twist: f32,
    pub wheel_mode: MouseWheelMode,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

/// One normalized text event (TS `InputTextData`).
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct InputTextData {
    pub is_composing: bool,
    pub text: String,
}

/// Per-attachment ingress options (TS `AttachInputOptions`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct AttachInputOptions {
    pub prevent_default: Option<bool>,
}

/// Key-repeat timing options (TS `InputKeyRepeatOptions`), in milliseconds.
// flight-lint: allow(f64) D1: repeat delays and intervals are millisecond durations; f32 loses fractional precision for long delays
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct InputKeyRepeatOptions {
    pub delay: f64,
    pub interval: f64,
}

/// The caller-owned output of a radial stick dead zone (TS out object `{ x, y }`).
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct GamepadStickOutput {
    pub x: f32,
    pub y: f32,
}

/// The reason arm of a pointer-lock exit outcome (TS `InputPointerLockExitOutcome['reason']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputPointerLockExitReason {
    Ok,
    ApiUnavailable,
    OperationFailed,
}

/// The pointer-lock exit outcome (TS `InputPointerLockExitOutcome`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InputPointerLockExitOutcome {
    pub reason: InputPointerLockExitReason,
}

/// The reason arm of a pointer-lock request outcome (TS `InputPointerLockRequestOutcome['reason']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputPointerLockRequestReason {
    Ok,
    ApiUnavailable,
    Denied,
    OperationFailed,
    TargetNotFound,
}

/// The pointer-lock request outcome (TS `InputPointerLockRequestOutcome`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InputPointerLockRequestOutcome {
    pub reason: InputPointerLockRequestReason,
}

/// The opaque host-neutral identity of one input source (TS `InputIngressSource`, `object`).
/// Shared by identity through `Ref`; portable callers never depend on host members.
#[derive(Default)]
pub struct InputIngressSource {}

/// One subscription release callback (TS `() => void`).
pub type InputIngressRelease = Arc<dyn Fn() + Send + Sync>;

/// One disposer returned by connecting a state to a manager (TS `() => void`).
pub type InputDisposer = Arc<dyn Fn() + Send + Sync>;

/// One key-repeat tick callback.
pub type InputRepeatCallback = Arc<dyn Fn() + Send + Sync>;

/// Boxed Send future for a pointer-lock exit command (D15).
pub type InputPointerLockExitFuture =
    Pin<Box<dyn Future<Output = InputPointerLockExitOutcome> + Send>>;

/// Boxed Send future for a pointer-lock request command (D15).
pub type InputPointerLockRequestFuture =
    Pin<Box<dyn Future<Output = InputPointerLockRequestOutcome> + Send>>;

/// Synchronous borrowed normalized-event delivery owned by one manager attachment (TS
/// `InputIngressSink`). Every field is a stored callback (D9d).
#[derive(Clone)]
pub struct InputIngressSink {
    pub gamepad_axis_move: Arc<dyn Fn(&InputGamepadAxisData) + Send + Sync>,
    pub gamepad_button_down: Arc<dyn Fn(&InputGamepadButtonData) + Send + Sync>,
    pub gamepad_button_up: Arc<dyn Fn(&InputGamepadButtonData) + Send + Sync>,
    pub gamepad_connect: Arc<dyn Fn(&InputGamepadConnectData) + Send + Sync>,
    pub gamepad_disconnect: Arc<dyn Fn(&InputGamepadConnectData) + Send + Sync>,
    pub is_enabled: Arc<dyn Fn() -> bool + Send + Sync>,
    pub key_down: Arc<dyn Fn(&InputKeyboardData) + Send + Sync>,
    pub key_up: Arc<dyn Fn(&InputKeyboardData) + Send + Sync>,
    pub pointer_cancel: Arc<dyn Fn(&InputPointerData) + Send + Sync>,
    pub pointer_down: Arc<dyn Fn(&InputPointerData) + Send + Sync>,
    pub pointer_move: Arc<dyn Fn(&InputPointerData) + Send + Sync>,
    pub pointer_move_relative: Arc<dyn Fn(&InputPointerData) + Send + Sync>,
    pub pointer_up: Arc<dyn Fn(&InputPointerData) + Send + Sync>,
    pub text_edit: Arc<dyn Fn(&InputTextData) + Send + Sync>,
    pub text_input: Arc<dyn Fn(&InputTextData) + Send + Sync>,
    pub wheel: Arc<dyn Fn(&InputPointerData) + Send + Sync>,
}

/// One attachment method of the input ingress provider (TS `HostInputIngressCapability` member).
pub type InputIngressAttach = Arc<
    dyn Fn(
            &Ref<InputIngressSource>,
            InputIngressSink,
            Option<&AttachInputOptions>,
        ) -> InputIngressRelease
        + Send
        + Sync,
>;

/// The process-wide input ingress provider (TS `HostInputIngressCapability`).
#[derive(Clone)]
pub struct HostInputIngressCapability {
    pub provider: ProviderRef,
    pub attach_gamepad: InputIngressAttach,
    pub attach_keyboard: InputIngressAttach,
    pub attach_pointer: InputIngressAttach,
    pub attach_relative_pointer: InputIngressAttach,
    pub attach_text: InputIngressAttach,
    pub attach_wheel: InputIngressAttach,
}

/// One-time host preparation of an input target (TS `HostInputTargetCapability`).
#[derive(Clone)]
pub struct HostInputTargetCapability {
    pub provider: ProviderRef,
    pub prepare: Arc<dyn Fn(&InputTargetHandle) + Send + Sync>,
}

/// Host file-drop events (TS `HostInputDropFileCapability`).
#[derive(Clone)]
pub struct HostInputDropFileCapability {
    pub provider: ProviderRef,
    pub subscribe: Arc<
        dyn Fn(&InputTargetHandle, Arc<dyn Fn(&str) + Send + Sync>) -> InputIngressRelease
            + Send
            + Sync,
    >,
}

/// Host target focus/blur events (TS `HostInputFocusCapability`).
#[derive(Clone)]
pub struct HostInputFocusCapability {
    pub provider: ProviderRef,
    pub subscribe: Arc<
        dyn Fn(
                &InputTargetHandle,
                Arc<dyn Fn() + Send + Sync>,
                Arc<dyn Fn() + Send + Sync>,
            ) -> InputIngressRelease
            + Send
            + Sync,
    >,
}

/// Pointer-lock commands (TS `HostInputPointerLockCapability`).
#[derive(Clone)]
pub struct HostInputPointerLockCapability {
    pub provider: ProviderRef,
    pub exit: Arc<dyn Fn() -> InputPointerLockExitFuture + Send + Sync>,
    pub request: Arc<dyn Fn(&InputTargetHandle) -> InputPointerLockRequestFuture + Send + Sync>,
}

/// The input capability group (TS `HostInputCapabilities`). An omitted slot is capability absence.
#[derive(Clone, Default)]
pub struct HostInputCapabilities {
    pub drop_file: Option<HostInputDropFileCapability>,
    pub focus: Option<HostInputFocusCapability>,
    pub ingress: Option<HostInputIngressCapability>,
    pub pointer_lock: Option<HostInputPointerLockCapability>,
    pub target: Option<HostInputTargetCapability>,
}

/// Provider-bound input target identity (TS `InputTargetHandle`, an Entity). The TS `__brand`
/// literal is carried by the Rust nominal type instead of a field.
#[derive(Default)]
pub struct InputTargetHandle {
    runtime: EntityRuntimeSlot,
}

/// The manager event group (TS `InputSignals`, an Entity).
#[derive(Default)]
pub struct InputSignals {
    runtime: EntityRuntimeSlot,
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
    pub on_text_edit: Signal<InputTextData>,
    pub on_text_input: Signal<InputTextData>,
    pub on_wheel: Signal<InputPointerData>,
}

/// The input manager (TS `InputManager`, an Entity extending its signals). `enabled` gates every
/// emission delivered through an attached ingress sink.
#[derive(Default)]
pub struct InputManager {
    runtime: EntityRuntimeSlot,
    pub enabled: bool,
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
    pub on_text_edit: Signal<InputTextData>,
    pub on_text_input: Signal<InputTextData>,
    pub on_wheel: Signal<InputPointerData>,
}

/// The held-state snapshot and per-frame edge sets (TS `InputState`, an Entity). Maps are
/// lookup-only (D3); the sets are membership-only. Gamepad keys are encoded as
/// `gamepad * MAX_GAMEPAD_BUTTONS + button` (buttons) and `gamepad * MAX_GAMEPAD_AXES + axis`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct InputState {
    runtime: EntityRuntimeSlot,
    pub axis_values: HashMap<i32, f32>,
    pub gamepad_buttons_down: HashSet<i32>,
    pub just_pressed_gamepad_buttons: HashSet<i32>,
    pub just_pressed_keys: HashSet<i32>,
    pub just_released_gamepad_buttons: HashSet<i32>,
    pub just_released_keys: HashSet<i32>,
    pub keys_down: HashSet<i32>,
    pub pointer_buttons_down: HashMap<i32, u32>,
}

/// A reusable key-repeat timer (TS `InputKeyRepeatTimer`, an Entity). Timing is driven by the
/// caller's explicit clock through `advance_input_key_repeat_timer`; no real timer is used.
#[derive(Default)]
// flight-lint: allow(f64) D1: repeat delays, intervals and injected clock values are millisecond durations
pub struct InputKeyRepeatTimer {
    runtime: EntityRuntimeSlot,
    pub(crate) callback: Option<InputRepeatCallback>,
    pub(crate) delay_ms: f64,
    pub(crate) interval_ms: f64,
    pub(crate) next_fire_ms: f64,
    pub(crate) repeating: bool,
    pub(crate) started: bool,
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS GamepadAxisKind const/union; TS exports no get_/parse_ free functions
pub fn get_gamepad_axis_kind_string(value: GamepadAxisKind) -> &'static str {
    return match value {
        GamepadAxisKind::StickLeftX => "StickLeftX",
        GamepadAxisKind::StickLeftY => "StickLeftY",
        GamepadAxisKind::StickRightX => "StickRightX",
        GamepadAxisKind::StickRightY => "StickRightY",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS GamepadButtonKind const/union; TS exports no get_/parse_ free functions
pub fn get_gamepad_button_kind_string(value: GamepadButtonKind) -> &'static str {
    return match value {
        GamepadButtonKind::ButtonEast => "ButtonEast",
        GamepadButtonKind::ButtonNorth => "ButtonNorth",
        GamepadButtonKind::ButtonSouth => "ButtonSouth",
        GamepadButtonKind::ButtonWest => "ButtonWest",
        GamepadButtonKind::DpadDown => "DpadDown",
        GamepadButtonKind::DpadLeft => "DpadLeft",
        GamepadButtonKind::DpadRight => "DpadRight",
        GamepadButtonKind::DpadUp => "DpadUp",
        GamepadButtonKind::Home => "Home",
        GamepadButtonKind::Select => "Select",
        GamepadButtonKind::ShoulderLeft => "ShoulderLeft",
        GamepadButtonKind::ShoulderRight => "ShoulderRight",
        GamepadButtonKind::Start => "Start",
        GamepadButtonKind::StickLeft => "StickLeft",
        GamepadButtonKind::StickRight => "StickRight",
        GamepadButtonKind::Touchpad => "Touchpad",
        GamepadButtonKind::TriggerLeft => "TriggerLeft",
        GamepadButtonKind::TriggerRight => "TriggerRight",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS GamepadMappingKind union; TS exports no get_/parse_ free functions
pub fn get_gamepad_mapping_kind_string(value: GamepadMappingKind) -> &'static str {
    return match value {
        GamepadMappingKind::Standard => "standard",
        GamepadMappingKind::Raw => "raw",
        GamepadMappingKind::Unspecified => "",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS InputPointerLockExitOutcome reason union; TS exports no get_/parse_ free functions
pub fn get_input_pointer_lock_exit_reason_string(
    value: InputPointerLockExitReason,
) -> &'static str {
    return match value {
        InputPointerLockExitReason::Ok => "ok",
        InputPointerLockExitReason::ApiUnavailable => "api-unavailable",
        InputPointerLockExitReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS InputPointerLockRequestOutcome reason union; TS exports no get_/parse_ free functions
pub fn get_input_pointer_lock_request_reason_string(
    value: InputPointerLockRequestReason,
) -> &'static str {
    return match value {
        InputPointerLockRequestReason::Ok => "ok",
        InputPointerLockRequestReason::ApiUnavailable => "api-unavailable",
        InputPointerLockRequestReason::Denied => "denied",
        InputPointerLockRequestReason::OperationFailed => "operation-failed",
        InputPointerLockRequestReason::TargetNotFound => "target-not-found",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MouseWheelMode union; TS exports no get_/parse_ free functions
pub fn get_mouse_wheel_mode_string(value: MouseWheelMode) -> &'static str {
    return match value {
        MouseWheelMode::Lines => "lines",
        MouseWheelMode::Pages => "pages",
        MouseWheelMode::Pixels => "pixels",
        MouseWheelMode::Unknown => "unknown",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PointerType union; TS exports no get_/parse_ free functions
pub fn get_pointer_type_string(value: PointerType) -> &'static str {
    return match value {
        PointerType::Mouse => "mouse",
        PointerType::Pen => "pen",
        PointerType::Touch => "touch",
        PointerType::Unknown => "unknown",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS GamepadAxisKind const/union; TS exports no get_/parse_ free functions
pub fn parse_gamepad_axis_kind(value: &str) -> Option<GamepadAxisKind> {
    return match value {
        "StickLeftX" => Some(GamepadAxisKind::StickLeftX),
        "StickLeftY" => Some(GamepadAxisKind::StickLeftY),
        "StickRightX" => Some(GamepadAxisKind::StickRightX),
        "StickRightY" => Some(GamepadAxisKind::StickRightY),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS GamepadButtonKind const/union; TS exports no get_/parse_ free functions
pub fn parse_gamepad_button_kind(value: &str) -> Option<GamepadButtonKind> {
    return match value {
        "ButtonEast" => Some(GamepadButtonKind::ButtonEast),
        "ButtonNorth" => Some(GamepadButtonKind::ButtonNorth),
        "ButtonSouth" => Some(GamepadButtonKind::ButtonSouth),
        "ButtonWest" => Some(GamepadButtonKind::ButtonWest),
        "DpadDown" => Some(GamepadButtonKind::DpadDown),
        "DpadLeft" => Some(GamepadButtonKind::DpadLeft),
        "DpadRight" => Some(GamepadButtonKind::DpadRight),
        "DpadUp" => Some(GamepadButtonKind::DpadUp),
        "Home" => Some(GamepadButtonKind::Home),
        "Select" => Some(GamepadButtonKind::Select),
        "ShoulderLeft" => Some(GamepadButtonKind::ShoulderLeft),
        "ShoulderRight" => Some(GamepadButtonKind::ShoulderRight),
        "Start" => Some(GamepadButtonKind::Start),
        "StickLeft" => Some(GamepadButtonKind::StickLeft),
        "StickRight" => Some(GamepadButtonKind::StickRight),
        "Touchpad" => Some(GamepadButtonKind::Touchpad),
        "TriggerLeft" => Some(GamepadButtonKind::TriggerLeft),
        "TriggerRight" => Some(GamepadButtonKind::TriggerRight),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS GamepadMappingKind union; TS exports no get_/parse_ free functions
pub fn parse_gamepad_mapping_kind(value: &str) -> Option<GamepadMappingKind> {
    return match value {
        "standard" => Some(GamepadMappingKind::Standard),
        "raw" => Some(GamepadMappingKind::Raw),
        "" => Some(GamepadMappingKind::Unspecified),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS InputPointerLockExitOutcome reason union; TS exports no get_/parse_ free functions
pub fn parse_input_pointer_lock_exit_reason(value: &str) -> Option<InputPointerLockExitReason> {
    return match value {
        "ok" => Some(InputPointerLockExitReason::Ok),
        "api-unavailable" => Some(InputPointerLockExitReason::ApiUnavailable),
        "operation-failed" => Some(InputPointerLockExitReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS InputPointerLockRequestOutcome reason union; TS exports no get_/parse_ free functions
pub fn parse_input_pointer_lock_request_reason(
    value: &str,
) -> Option<InputPointerLockRequestReason> {
    return match value {
        "ok" => Some(InputPointerLockRequestReason::Ok),
        "api-unavailable" => Some(InputPointerLockRequestReason::ApiUnavailable),
        "denied" => Some(InputPointerLockRequestReason::Denied),
        "operation-failed" => Some(InputPointerLockRequestReason::OperationFailed),
        "target-not-found" => Some(InputPointerLockRequestReason::TargetNotFound),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MouseWheelMode union; TS exports no get_/parse_ free functions
pub fn parse_mouse_wheel_mode(value: &str) -> Option<MouseWheelMode> {
    return match value {
        "lines" => Some(MouseWheelMode::Lines),
        "pages" => Some(MouseWheelMode::Pages),
        "pixels" => Some(MouseWheelMode::Pixels),
        "unknown" => Some(MouseWheelMode::Unknown),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PointerType union; TS exports no get_/parse_ free functions
pub fn parse_pointer_type(value: &str) -> Option<PointerType> {
    return match value {
        "mouse" => Some(PointerType::Mouse),
        "pen" => Some(PointerType::Pen),
        "touch" => Some(PointerType::Touch),
        "unknown" => Some(PointerType::Unknown),
        _ => None,
    };
}

flight_entity::impl_entity!(InputTargetHandle);
flight_entity::impl_entity!(InputSignals);
flight_entity::impl_entity!(InputManager);
flight_entity::impl_entity!(InputState);
flight_entity::impl_entity!(InputKeyRepeatTimer);

//! `flighthq-input` — portable input normalization.
//!
//! Maps raw system input events to a normalized internal representation.
//! Covers pointer (mouse/touch/pen), keyboard, mouse wheel, text composition,
//! and gamepad inputs.  The crate is platform-agnostic: callers dispatch
//! events produced by their native event loop into an [`InputManager`] whose
//! [`InputSignals`] fields forward the data to any connected listeners.
//!
//! # Quick start
//!
//! ```rust,no_run
//! use flighthq_input::create_input_manager;
//!
//! let manager = create_input_manager();
//! assert!(manager.enabled);
//! ```

pub mod gamepad;
pub mod keyboard;
pub mod manager;
pub mod pointer;
pub mod signals;
pub mod state;

// Re-export public surface at crate root.

// signals
pub use signals::{InputSignals, create_input_signals};

// manager
pub use manager::{InputManager, create_input_manager, dispose_input_manager};

// keyboard
pub use keyboard::{
    dispatch_keyboard_event, get_key_code_from_key_name, get_key_modifier_from_flags,
};

// pointer
pub use pointer::{
    dispatch_pointer_cancel_event, dispatch_pointer_down_event, dispatch_pointer_move_event,
    dispatch_pointer_move_relative_event, dispatch_pointer_up_event, dispatch_wheel_event,
};

// gamepad
pub use gamepad::{
    GamepadButtonSnapshot, GamepadPollState, GamepadSnapshot, apply_gamepad_axis_dead_zone,
    apply_gamepad_stick_dead_zone, dispatch_gamepad_axis_event, dispatch_gamepad_button_down_event,
    dispatch_gamepad_button_up_event, dispatch_gamepad_connect_event,
    dispatch_gamepad_disconnect_event, get_gamepad_axis_name, get_gamepad_button_name,
    poll_gamepad_input, poll_gamepad_snapshots,
};

// state
pub use state::{
    InputState, InputStateConnection, connect_input_state_to_input_manager, create_input_state,
    end_input_state_frame, get_input_gamepad_axis, is_input_gamepad_button_down, is_input_key_down,
    is_input_pointer_button_down, was_input_gamepad_button_pressed,
    was_input_gamepad_button_released, was_input_key_pressed, was_input_key_released,
};
